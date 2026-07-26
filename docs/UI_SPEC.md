# UI Spec — OpenFOAM Studio

> Read this before working on `renderer/`.
> After changes, update this doc and `wiki/project-log.md`.

## Layout

VS Code-style shell: top bar, activity bar, collapsible sidebar, tabbed editor
area, and a collapsible AI panel on the right. React 19 + Vite + Tailwind CSS 4 +
Electron. Panels are resized with `react-resizable-panels`; widths persist in
`useLayoutStore`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TopBar — project name, run/cancel, settings, health status              │
├────┬──────────────┬───────────────────────────────┬─────────────────────┤
│ A  │ Sidebar      │ Editor tabs                   │ AI panel            │
│ c  │              │                               │                     │
│ t  │ Files        │ Case file · Parameters ·      │ Chat: plain-English │
│ i  │ Commands     │ Logs · Geometry · Results     │ prompts, streamed   │
│ v  │ Runs         │                               │ replies, tool use,  │
│ i  │              │ Monaco for case files,        │ diagnosis diffs,    │
│ t  │ (collapsible)│ vtk.js for Geometry/Results   │ files written       │
│ y  │              │                               │ (collapsible)       │
└────┴──────────────┴───────────────────────────────┴─────────────────────┘
```

There is **no IPC layer and no terminal emulator.** The renderer talks to
`demo/server.ts` over HTTP + SSE on `127.0.0.1:3456` (`renderer/lib/api.ts`,
`backendUrl.ts`). Command output is rendered by the Logs tab, not xterm.

## Panel breakdown

### TopBar (`renderer/components/topbar/TopBar.tsx`)

Project name, Run / Cancel, settings entry, health indicator. Routing is a tiny
hash router (`renderer/lib/router.ts`): `#/` is the project grid,
`#/project/<id>` a project.

### ActivityBar (`renderer/components/activity/ActivityBar.tsx`)

Sidebar switcher — Files, Commands, Runs — plus direct openers for the
Parameters, Geometry, and Results tabs and the AI-panel toggle.

### Sidebar (`renderer/components/sidebar/`)

| Panel | File | Shows |
|-------|------|-------|
| Files | `FilesPanel.tsx` | Case tree with `system`/`constant`/`0` pinned and expanded, numeric time-step dirs collapsed into one group; click opens a Monaco tab |
| Commands | `CommandsPanel.tsx` | Every Docker command run, from `GET /api/projects/:id/commands` |
| Runs | `RunsPanel.tsx` | Run history from `GET /api/projects/:id/runs`, newest first |

### Editor tabs (`renderer/components/editor/`)

`EditorTabs.tsx` hosts one tab per open case file plus four special tabs:

| Tab | File | Notes |
|-----|------|-------|
| Case file | `tabs/CaseFileTab.tsx` | Monaco, editable, saves back to the case dir |
| Parameters | `tabs/ParametersTab.tsx` | Structured editor for common case values |
| Logs | `tabs/LogsTab.tsx` | Live SSE run output + `ResidualChart` inline |
| Geometry | `tabs/GeometryTab.tsx` | vtk.js mesh view |
| Results | `tabs/results/` | `ResultsTab` + `PipelineTree`, `PropertiesPanel`, `TimeTransport` |

`tabs/ResidualChart.tsx` is a hand-rolled SVG chart with a per-field colour map —
no charting library. All vtk.js use is confined to `renderer/lib/vtk/`; React
components never import vtk.js directly.

### AI panel (`renderer/components/ai/`)

`AIPanel.tsx` + `ChatInput.tsx`, with `Markdown.tsx` for assistant prose. Messages
render as typed blocks in `ai/blocks/`: `MessageBlock`, `ThinkingBlock`,
`AgentStepsBlock`, `FilesWrittenBlock`, `DiagnosisDiffBlock`. Generation streams
from `POST /api/projects/:id/generate` (SSE).

### Modals

`setup/SetupModal.tsx` gates the app whenever health checks fail — Docker daemon,
OpenFOAM image, Claude CLI, provider auth — with an auto-fix stream.
`settings/SettingsModal.tsx` is the BYOK provider/model/key editor.

## State (Zustand, `renderer/store/`)

| Store | Owns |
|-------|------|
| `useProjectStore` | Active project meta, load/clear |
| `useEditorStore` | Open tabs, active tab, dirty state, special tabs |
| `useChatStore` | Message history, streaming flag |
| `useRunsStore` | Run status, live log lines, residual points, cancel |
| `useResultsStore` | VTK manifest, time step, field/colormap selection |
| `useLayoutStore` | Sidebar + AI panel collapse, panel sizes |

Per-project state is reset on route change so switching projects never leaks the
previous project's tabs, chat, or run state.

## Shared UI (`renderer/components/ui/`)

`resizable.tsx` (panel primitives), `select.tsx` (custom listbox — native
`<select>` popups cannot be themed, so there are zero native selects in the DOM),
`ViewerErrorBoundary.tsx` (keeps a lost WebGL context from blanking the app).

## Conventions

- Path alias `@/` → `renderer/`
- Tailwind v4 CSS-first tokens; style through semantic tokens, not raw colours
- `lucide-react` for icons
- Anything the renderer needs from disk goes through the HTTP API — the renderer
  never touches the filesystem or Docker directly
