# Agent Pipeline — OpenFOAM Studio

> Read this before working on `core/agent/` or the system prompt.
> After changes, update this doc and `wiki/project-log.md`.

## Overview

Claude handles the entire CFD pipeline through its natural conversation + tool-use loop. No custom multi-agent orchestration. The system prompt defines four roles that Claude follows sequentially within a single conversation thread.

**Provider:** t3code's existing Claude provider (unchanged)  
**Model:** `claude-sonnet-4-6`  
**Transport:** WebSocket (t3code's existing transport)

---

## The 4-Role Pipeline

```
User prompt
    │
    ▼
Role 1: ARCHITECT
Classifies simulation, identifies required files,
builds dependency order DAG
    │
    ▼
Role 2: INPUT WRITER
Generates files in dependency order.
Each file written with full context of prior files.
write_case_file called per file → UI updates live.
    │
    ▼
Role 3: RUNNER
blockMesh → checkMesh → solver
All via run_docker_command allowlist.
Terminal streams live output.
    │
    ▼
    ├── EXIT 0 ──► Role resolved. Parse results. Show plot + image.
    │
    └── FOAM FATAL ERROR ──► Role 4
                                  │
                              Role 4: REVIEWER
                              read_solver_log → RCA → fix list
                              → user approval → write_case_file fixes
                              → back to Role 3 (max 3 loops)
```

---

## System Prompt Structure

Location: `core/agent/systemPrompt.ts`

```
[ROLE DEFINITION]
You are an OpenFOAM CFD simulation agent. You operate in four sequential roles:
Architect, Input Writer, Runner, and Reviewer.

[ROLE 1 — ARCHITECT]
When the user describes a simulation:
1. Classify: solver type, dimensionality, flow regime, turbulence model
2. List all required files in dependency order:
   system/controlDict → constant/physicalProperties → constant/momentumTransport
   → system/blockMeshDict → 0/<fields> (order depends on turbulence model)
3. State the dependency order explicitly before generating any file.

[ROLE 2 — INPUT WRITER]
Generate files in the order listed by the Architect.
For each file:
- Use write_case_file with the full file path and complete content
- LF line endings are enforced by the tool — do not add \r
- Reference patch names from blockMeshDict exactly in all 0/ files
- After writing each file, briefly confirm: "Written: system/controlDict"

[ROLE 3 — RUNNER]
After all files are written:
- Run: blockMesh, then checkMesh, then the appropriate solver
- Use run_docker_command for each
- Do not ask for permission — run automatically
- If checkMesh reports critical errors, stop and report before running the solver

[ROLE 4 — REVIEWER]
On FOAM FATAL ERROR:
1. Call read_solver_log and read the full log
2. Identify the root cause in plain English (1-3 sentences)
3. List each fix as: File | Key | Old value | New value
4. Ask: "These are the changes I will make. Shall I proceed?"
5. Wait for user confirmation before calling write_case_file
6. After fixes, re-run from Role 3
7. Maximum 3 review loops. If unresolved after 3, explain and ask engineer to intervene.

[RESULTS]
After a successful solver run:
1. Call parse_residuals and display convergence as a chart
2. Attempt ParaView batch rendering (pvpython script inside Docker)
3. If rendering fails, run paraFoam in the terminal

[CONSTRAINTS]
- Never use shell commands outside the provided tools
- Never concatenate paths — tools handle paths correctly
- Never generate Windows-style paths
- The wiki/ directory contains reference material you can read_case_file from
```

---

## Tool Registration

Tools are registered in `core/agent/tools.ts` and passed to the Claude API call.

```ts
const CFD_TOOLS = [
  {
    name: 'write_case_file',
    description: 'Write a file to the OpenFOAM case directory. Enforces LF endings.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within case dir, e.g. system/controlDict' },
        content: { type: 'string', description: 'Full file content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_case_file',
    description: 'Read a file from the case directory or wiki.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_case_files',
    description: 'List the current case directory structure.',
    input_schema: {
      type: 'object',
      properties: {
        caseDir: { type: 'string' }
      },
      required: ['caseDir']
    }
  },
  {
    name: 'run_docker_command',
    description: 'Run an OpenFOAM command in the Docker container.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['blockMesh', 'checkMesh', 'foamRun', 'simpleFoam', 'pimpleFoam', 'foamToVTK', 'paraFoam', 'pvpython', 'foamInfo']
        },
        args: { type: 'array', items: { type: 'string' } }
      },
      required: ['command']
    }
  },
  {
    name: 'read_solver_log',
    description: 'Read the solver log file for RCA.',
    input_schema: {
      type: 'object',
      properties: {
        logPath: { type: 'string' }
      },
      required: ['logPath']
    }
  },
  {
    name: 'parse_residuals',
    description: 'Extract convergence residuals from a solver log.',
    input_schema: {
      type: 'object',
      properties: {
        logPath: { type: 'string' }
      },
      required: ['logPath']
    }
  }
]
```

---

## RCA Flow (Role 4 in detail)

```
FOAM FATAL ERROR detected in run_docker_command output
              │
              ▼
read_solver_log called
              │
              ▼
Claude identifies error class:
  - BAD_BOUNDARY: patch name mismatch between blockMeshDict and 0/
  - COURANT: deltaT too large, Courant number > 1
  - DIVERGENCE: solver diverging, residuals growing
  - MISSING_FILE: required dictionary file not found
  - DIMENSION_ERROR: physical dimension mismatch
  - SYNTAX_ERROR: malformed OpenFOAM dictionary
              │
              ▼
Claude outputs RCA + fix list in chat
(natural language, no JSON required)
              │
              ▼
Claude asks: "These are the changes I will make. Shall I proceed?"
              │
    ┌─────────┴──────────┐
   yes                   no
    │                    │
write fixes          Claude asks what
re-run solver        engineer wants to do
```

---

## File Dependency DAG

The Input Writer must generate files in this order. Patch names flow downward.

```
system/controlDict          (solver type, time params)
         │
constant/physicalProperties    (kinematic viscosity ν)
         │
constant/momentumTransport     (laminar | kEpsilon | kOmegaSST)
         │
system/blockMeshDict           (geometry, patch names)
         │
system/fvSchemes               (discretisation)
system/fvSolution              (solver tolerances)
         │
0/U  0/p  [0/k  0/epsilon  0/nut  0/omega  — if turbulent]
```

Patch names (e.g. "movingWall", "fixedWalls", "frontAndBack") are defined in `blockMeshDict` and must be referenced exactly in every `0/` file.

---

## Session Persistence

t3code's SQLite backend persists:
- Conversation history per session
- Case directory path
- Agent status at last checkpoint

On resume, Claude receives the conversation history and can continue from where it left off.
