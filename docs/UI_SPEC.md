# UI Spec — OpenFOAM Studio

> Read this before working on `renderer/`.
> After changes, update this doc and `wiki/project-log.md`.

## Layout

Four-panel Cursor-style layout. Built on the t3code fork (React 19 + Vite + Tailwind CSS 4 + Electron).

```
┌──────────────┬──────────────────────────┬───────────────────────┐
│ File Tree    │ Monaco Editor            │ Claude Chat           │
│ ~200px       │ flex-1                   │ ~380px                │
│              │                          │                       │
│ react-       │ Displays selected file   │ t3code chat panel —   │
│ arborist     │ with syntax highlight.   │ unchanged from fork.  │
│              │ Editable inline.         │                       │
│ Updates live │ Opens automatically      │ Streams tool use,     │
│ as agent     │ when agent writes a      │ RCA, approvals, and   │
│ writes files │ new file.                │ results inline.       │
├──────────────┴──────────────────────────┴───────────────────────┤
│ Terminal — xterm.js                              ~200px height  │
│ Shows every Docker command run by the agent with live output.   │
│ Read-only. Scrollable.                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Panel Breakdown

### Left — File Tree (`renderer/components/FileTree/`)

**Library:** `react-arborist` (MIT)  
**Data source:** Watches the active case directory on disk via IPC → `core/session/caseDir`  
**Behaviour:**
- Updates in real time as agent writes files (no refresh needed)
- Click any file → opens in Monaco Editor (center panel)
- Directories are non-collapsible in v1 (collapse is a nice-to-have)
- Highlights the most recently written file

**State (Zustand):**
```ts
caseFiles: FileNode[]       // tree structure
selectedFile: string | null // path of file open in Monaco
```

### Center — Monaco Editor (`renderer/components/Editor/`)

**Library:** Monaco Editor (MIT) — same editor as VS Code and Cursor  
**Language:** OpenFOAM dict files use a custom language config (closest: C++ highlighting as fallback)  
**Behaviour:**
- Opens automatically when agent writes a new file (auto-select latest written)
- Engineer can edit the file inline — edits are saved to disk immediately via `write_case_file` IPC call
- Read/write. Not read-only.
- Shows file path in a breadcrumb above the editor

**State (Zustand):**
```ts
editorContent: string       // current file content
editorDirty: boolean        // unsaved changes flag
```

### Right — Claude Chat (`renderer/components/Chat/`)

**Source:** t3code chat panel — **unchanged from fork**  
**Behaviour:**
- Primary input: engineer types plain-English simulation prompts here
- Streams Claude's responses including tool use annotations
- RCA and fix list appear as normal chat messages
- Approval gate: Claude asks "Shall I proceed?" — engineer types "yes"
- Residual plot renders inline as a recharts component injected into the chat message
- Results image (ParaView PNG) renders inline

### Bottom — Terminal (`renderer/components/Terminal/`)

**Library:** xterm.js — **already in t3code, wire to Docker stream**  
**Data source:** Docker log stream from `run_docker_command` via IPC  
**Behaviour:**
- Streams live output of every Docker command the agent runs
- Read-only (engineer cannot type commands here)
- Shows command header before each run: `> blockMesh -case /tmp/cavity`
- Color-coded: green for exit 0, red for non-zero exit

## State Shape (Zustand store)

```ts
interface SimulationStore {
  // Session
  sessionId: string
  caseDir: string

  // File tree
  caseFiles: FileNode[]
  selectedFile: string | null

  // Editor
  editorContent: string
  editorDirty: boolean

  // Agent
  agentStatus: 'idle' | 'generating' | 'running' | 'reviewing' | 'done' | 'error'
  lastWrittenFile: string | null

  // Results
  residuals: { field: string; residuals: number[] }[]
  resultImageUrl: string | null
}
```

## Component List

| Component | Path | Status | Notes |
|-----------|------|--------|-------|
| `AppLayout` | `renderer/components/AppLayout.tsx` | To build | Four-panel grid |
| `FileTree` | `renderer/components/FileTree/` | To build | react-arborist |
| `Editor` | `renderer/components/Editor/` | To build | Monaco |
| `ChatPanel` | (t3code) | Exists | Unchanged |
| `Terminal` | (t3code) | Exists | Rewire to Docker stream |
| `ResidualChart` | `renderer/components/ResidualChart.tsx` | To build | recharts line chart |
| `ResultImage` | `renderer/components/ResultImage.tsx` | To build | Inline PNG display |

## Libraries to Add

```bash
# In the t3code renderer package
npm install react-arborist monaco-editor @monaco-editor/react recharts
```

## IPC Calls (renderer → main → core)

| IPC Channel | Direction | Purpose |
|-------------|-----------|---------|
| `case:listFiles` | renderer → core | Get current file tree |
| `case:readFile` | renderer → core | Read a file for Monaco |
| `case:writeFile` | renderer → core | Save inline Monaco edit |
| `case:watchDir` | renderer → core | Subscribe to file tree changes |
| `docker:logStream` | core → renderer | Push Docker output to xterm.js |
