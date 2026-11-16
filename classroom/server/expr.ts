/**
 * Tiny arithmetic expression evaluator for tutorial templates.
 *
 * Tutorial authors write `{{ U * L / nu }}` in case files and `expr` strings in
 * tutorial.json. Student input never reaches this as source text: students
 * only supply *values* for declared parameters, which enter through `scope`.
 * There is no member access, no assignment and no host function lookup, so an
 * expression can only ever compute a number from numbers.
 */

export type Value = number | string
export type Scope = Record<string, Value>

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; value: string }
  | { kind: 'op'; value: string }

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  pow: Math.pow,
  exp: Math.exp,
  log: Math.log,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atan: Math.atan,
  /** if(condition, whenTrue, whenFalse) */
  if: (c, a, b) => (c ? a : b)!,
  /** Round to the nearest even integer ≥ 2 (handy for symmetric meshes). */
  even: (x) => Math.max(2, Math.round(x / 2) * 2),
}

const CONSTANTS: Record<string, number> = { pi: Math.PI }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (/\s/.test(ch)) { i++; continue }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i))
    if (num) { tokens.push({ kind: 'num', value: Number(num[0]) }); i += num[0].length; continue }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))
    if (id) { tokens.push({ kind: 'id', value: id[0] }); i += id[0].length; continue }
    const two = source.slice(i, i + 2)
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { tokens.push({ kind: 'op', value: two }); i += 2; continue }
    if ('+-*/^(),<>'.includes(ch)) { tokens.push({ kind: 'op', value: ch }); i++; continue }
    throw new Error(`Unexpected character "${ch}" in expression: ${source}`)
  }
  return tokens
}

const BINARY: Record<string, { prec: number; right?: boolean; fn: (a: number, b: number) => number }> = {
  '||': { prec: 1, fn: (a, b) => (a || b ? 1 : 0) },
  '&&': { prec: 2, fn: (a, b) => (a && b ? 1 : 0) },
  '==': { prec: 3, fn: (a, b) => (a === b ? 1 : 0) },
  '!=': { prec: 3, fn: (a, b) => (a !== b ? 1 : 0) },
  '<': { prec: 4, fn: (a, b) => (a < b ? 1 : 0) },
  '<=': { prec: 4, fn: (a, b) => (a <= b ? 1 : 0) },
  '>': { prec: 4, fn: (a, b) => (a > b ? 1 : 0) },
  '>=': { prec: 4, fn: (a, b) => (a >= b ? 1 : 0) },
  '+': { prec: 5, fn: (a, b) => a + b },
  '-': { prec: 5, fn: (a, b) => a - b },
  '*': { prec: 6, fn: (a, b) => a * b },
  '/': { prec: 6, fn: (a, b) => a / b },
  '^': { prec: 8, right: true, fn: (a, b) => Math.pow(a, b) },
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[], private readonly scope: Scope, private readonly source: string) {}

  private peek(): Token | undefined { return this.tokens[this.pos] }
  private isOp(value: string): boolean {
    const token = this.peek()
    return token?.kind === 'op' && token.value === value
  }
  private expectOp(value: string): void {
    if (!this.isOp(value)) throw new Error(`Expected "${value}" in expression: ${this.source}`)
    this.pos++
  }

  parse(): Value {
    // A bare identifier may resolve to a string parameter (e.g. a scheme name).
    if (this.tokens.length === 1 && this.tokens[0]!.kind === 'id') {
      const name = this.tokens[0]!.value as string
      if (Object.hasOwn(this.scope, name)) return this.scope[name]!
    }
    const value = this.expression(0)
    if (this.pos < this.tokens.length) throw new Error(`Unexpected trailing input in expression: ${this.source}`)
    return value
  }

  private expression(minPrec: number): number {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op') break
      const op = BINARY[token.value]
      if (!op || op.prec < minPrec) break
      this.pos++
      const right = this.expression(op.right ? op.prec : op.prec + 1)
      left = op.fn(left, right)
    }
    return left
  }

  private unary(): number {
    if (this.isOp('-')) { this.pos++; return -this.unary() }
    if (this.isOp('+')) { this.pos++; return this.unary() }
    return this.power()
  }

  private power(): number {
    const base = this.primary()
    if (this.isOp('^')) { this.pos++; return Math.pow(base, this.unary()) }
    return base
  }

  private primary(): number {
    const token = this.peek()
    if (!token) throw new Error(`Unexpected end of expression: ${this.source}`)
    this.pos++
    if (token.kind === 'num') return token.value
    if (token.kind === 'op' && token.value === '(') {
      const value = this.expression(0)
      this.expectOp(')')
      return value
    }
    if (token.kind === 'id') {
      if (this.isOp('(')) {
        const fn = Object.hasOwn(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : undefined
        if (!fn) throw new Error(`Unknown function "${token.value}" in expression: ${this.source}`)
        this.pos++
        const args: number[] = []
        if (!this.isOp(')')) {
          do { args.push(this.expression(0)) } while (this.isOp(',') && ++this.pos)
        }
        this.expectOp(')')
        return fn(...args)
      }
      if (Object.hasOwn(this.scope, token.value)) {
        const value = this.scope[token.value]!
        if (typeof value !== 'number') throw new Error(`"${token.value}" is not numeric in expression: ${this.source}`)
        return value
      }
      if (Object.hasOwn(CONSTANTS, token.value)) return CONSTANTS[token.value]!
      throw new Error(`Unknown name "${token.value}" in expression: ${this.source}`)
    }
    throw new Error(`Unexpected "${token.value}" in expression: ${this.source}`)
  }
}

export function evaluate(source: string, scope: Scope): Value {
  return new Parser(tokenize(source), scope, source).parse()
}

export function evaluateNumber(source: string, scope: Scope): number {
  const value = evaluate(source, scope)
  if (typeof value !== 'number') throw new Error(`Expression is not numeric: ${source}`)
  return value
}

/** OpenFOAM-friendly number text: integers stay integers, reals keep 7 significant digits. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Template produced a non-finite number')
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  return String(Number(value.toPrecision(7)))
}

/** Replace every `{{ expression }}` in a case-file template. */
export function renderTemplate(template: string, scope: Scope, file = 'template'): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_match, source: string) => {
    let value: Value
    try { value = evaluate(source.trim(), scope) } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`)
    }
    return typeof value === 'number' ? formatNumber(value) : value
  })
}
