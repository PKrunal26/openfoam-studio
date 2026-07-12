// Legacy ASCII VTK parser for foamToVTK output (OpenFOAM Foundation writes
// "# vtk DataFile Version 2.0" legacy files; vtk.js v35 ships no reader for
// legacy UNSTRUCTURED_GRID, so we parse it ourselves).
//
// Pure TypeScript — no vtk.js / DOM imports, so it is unit-testable in node.

export interface VtkDataArray {
  name: string
  numComponents: number
  numTuples: number
  data: Float32Array | Int32Array
}

export interface VtkCells {
  connectivity: Uint32Array
  /** numCells + 1 entries; cell i spans connectivity[offsets[i] .. offsets[i+1]) */
  offsets: Uint32Array
  /** VTK cell type per cell (10 tet, 12 hex, 13 wedge, 14 pyramid, ...) */
  types: Uint8Array
}

export interface ParsedVtkDataset {
  type: 'polydata' | 'unstructuredGrid'
  numPoints: number
  /** xyz interleaved */
  points: Float32Array
  /** POLYDATA only — vtk cell-array layout [n, id0..idn-1, n, ...] */
  polys?: Uint32Array
  /** UNSTRUCTURED_GRID only */
  cells?: VtkCells
  numCells: number
  pointData: Record<string, VtkDataArray>
  cellData: Record<string, VtkDataArray>
}

const INT_TYPES = new Set([
  'bit', 'char', 'unsigned_char', 'short', 'unsigned_short',
  'int', 'unsigned_int', 'long', 'unsigned_long', 'vtkidtype',
])

class TokenStream {
  private tokens: string[]
  private pos = 0

  constructor(text: string) {
    this.tokens = text.split(/\s+/).filter((t) => t.length > 0)
  }

  next(): string {
    const t = this.tokens[this.pos++]
    if (t === undefined) throw new Error('Unexpected end of VTK file')
    return t
  }

  peek(): string | undefined {
    return this.tokens[this.pos]
  }

  nextInt(): number {
    const v = parseInt(this.next(), 10)
    if (Number.isNaN(v)) throw new Error(`Expected integer, got "${this.tokens[this.pos - 1]}"`)
    return v
  }

  readFloats(count: number, out: Float32Array): void {
    for (let i = 0; i < count; i++) out[i] = Number(this.next())
  }

  readInts(count: number, out: Int32Array | Uint32Array | Uint8Array): void {
    for (let i = 0; i < count; i++) out[i] = parseInt(this.next(), 10)
  }

  skip(count: number): void {
    this.pos = Math.min(this.pos + count, this.tokens.length)
  }
}

function readDataArray(
  ts: TokenStream,
  name: string,
  numComponents: number,
  numTuples: number,
  dataType: string,
): VtkDataArray {
  const count = numComponents * numTuples
  if (INT_TYPES.has(dataType.toLowerCase())) {
    const data = new Int32Array(count)
    ts.readInts(count, data)
    return { name, numComponents, numTuples, data }
  }
  const data = new Float32Array(count)
  ts.readFloats(count, data)
  return { name, numComponents, numTuples, data }
}

/** Reads `FIELD <name> <numArrays>` (the FIELD token is already consumed). */
function readFieldBlock(ts: TokenStream, into: Record<string, VtkDataArray>): void {
  ts.next() // field data name, unused
  const numArrays = ts.nextInt()
  for (let i = 0; i < numArrays; i++) {
    const name = ts.next()
    const numComponents = ts.nextInt()
    const numTuples = ts.nextInt()
    const dataType = ts.next()
    into[name] = readDataArray(ts, name, numComponents, numTuples, dataType)
  }
}

export function parseLegacyVtk(text: string): ParsedVtkDataset {
  // Header is line-oriented: comment, free-text title (may contain keywords),
  // encoding, then "DATASET <type>". Tokenize only after the title line.
  const firstNl = text.indexOf('\n')
  const secondNl = text.indexOf('\n', firstNl + 1)
  if (firstNl < 0 || secondNl < 0) throw new Error('Not a legacy VTK file: missing header')

  const ts = new TokenStream(text.slice(secondNl + 1))
  const encoding = ts.next().toUpperCase()
  if (encoding === 'BINARY') {
    throw new Error('Binary legacy VTK is not supported — run foamToVTK with -ascii')
  }
  if (encoding !== 'ASCII') throw new Error(`Unknown VTK encoding "${encoding}"`)
  if (ts.next().toUpperCase() !== 'DATASET') throw new Error('Expected DATASET in VTK header')
  const datasetType = ts.next().toUpperCase()
  if (datasetType !== 'POLYDATA' && datasetType !== 'UNSTRUCTURED_GRID') {
    throw new Error(`Unsupported VTK dataset type ${datasetType}`)
  }

  const ds: ParsedVtkDataset = {
    type: datasetType === 'POLYDATA' ? 'polydata' : 'unstructuredGrid',
    numPoints: 0,
    points: new Float32Array(0),
    numCells: 0,
    pointData: {},
    cellData: {},
  }

  // null until a CELL_DATA / POINT_DATA section starts.
  let active: Record<string, VtkDataArray> | null = null
  let activeCount = 0
  let rawCells: { data: Uint32Array; numCells: number } | null = null

  for (let kw = ts.peek(); kw !== undefined; kw = ts.peek()) {
    const keyword = kw.toUpperCase()
    switch (keyword) {
      case 'POINTS': {
        ts.next()
        ds.numPoints = ts.nextInt()
        ts.next() // data type
        ds.points = new Float32Array(ds.numPoints * 3)
        ts.readFloats(ds.numPoints * 3, ds.points)
        break
      }
      case 'POLYGONS': {
        ts.next()
        const n = ts.nextInt()
        const size = ts.nextInt()
        ds.polys = new Uint32Array(size)
        ts.readInts(size, ds.polys)
        ds.numCells = n
        break
      }
      case 'VERTICES':
      case 'LINES':
      case 'TRIANGLE_STRIPS': {
        ts.next()
        ts.nextInt() // n
        const size = ts.nextInt()
        ts.skip(size)
        break
      }
      case 'CELLS': {
        ts.next()
        const numCells = ts.nextInt()
        const size = ts.nextInt()
        const data = new Uint32Array(size)
        ts.readInts(size, data)
        rawCells = { data, numCells }
        ds.numCells = numCells
        break
      }
      case 'CELL_TYPES': {
        ts.next()
        const n = ts.nextInt()
        const types = new Uint8Array(n)
        ts.readInts(n, types)
        if (!rawCells) throw new Error('CELL_TYPES before CELLS')
        // Re-shape [n, ids..., n, ids...] into connectivity + offsets.
        const offsets = new Uint32Array(n + 1)
        const connectivity = new Uint32Array(rawCells.data.length - n)
        let src = 0
        let dst = 0
        for (let c = 0; c < n; c++) {
          const npts = rawCells.data[src++]!
          offsets[c] = dst
          for (let i = 0; i < npts; i++) connectivity[dst++] = rawCells.data[src++]!
        }
        offsets[n] = dst
        ds.cells = { connectivity, offsets, types }
        break
      }
      case 'CELL_DATA': {
        ts.next()
        activeCount = ts.nextInt()
        active = ds.cellData
        break
      }
      case 'POINT_DATA': {
        ts.next()
        activeCount = ts.nextInt()
        active = ds.pointData
        break
      }
      case 'FIELD': {
        ts.next()
        readFieldBlock(ts, active ?? {})
        break
      }
      case 'SCALARS': {
        ts.next()
        const name = ts.next()
        const dataType = ts.next()
        // Optional component count (1 when omitted); next token is LOOKUP_TABLE.
        let numComponents = 1
        if (ts.peek()?.toUpperCase() !== 'LOOKUP_TABLE') numComponents = ts.nextInt()
        if (ts.peek()?.toUpperCase() === 'LOOKUP_TABLE') {
          ts.next()
          ts.next() // table name
        }
        if (active) {
          active[name] = readDataArray(ts, name, numComponents, activeCount, dataType)
        } else {
          ts.skip(numComponents * activeCount)
        }
        break
      }
      case 'VECTORS':
      case 'NORMALS': {
        ts.next()
        const name = ts.next()
        const dataType = ts.next()
        if (active) {
          active[name] = readDataArray(ts, name, 3, activeCount, dataType)
        } else {
          ts.skip(3 * activeCount)
        }
        break
      }
      case 'TEXTURE_COORDINATES': {
        ts.next()
        ts.next() // name
        const dim = ts.nextInt()
        ts.next() // data type
        ts.skip(dim * activeCount)
        break
      }
      case 'LOOKUP_TABLE': {
        // Standalone table definition: LOOKUP_TABLE <name> <size> + 4*size rgba.
        ts.next()
        ts.next() // name
        const size = ts.nextInt()
        ts.skip(4 * size)
        break
      }
      default:
        // Unknown section — cannot infer how many tokens to skip safely.
        throw new Error(`Unsupported legacy VTK section "${kw}"`)
    }
  }

  return ds
}
