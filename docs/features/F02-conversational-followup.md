# F02 — Conversational Follow-up (Second Prompt Refines Simulation)

**ICE Score:** 6.7 (Impact 5 · Confidence 4 · Effort 3)  
**Status:** `done`  
**Depends on:** F04 (Stage 5 test must be written first; test drives implementation)  
**Blocks:** F05 (error recovery loop assumes a working conversation model)

---

## Problem

After clicking "Run Simulation" the user is done. They cannot say "now try Re=400",
"reduce the end time to 0.1 s", or "why did it diverge?". The prompt input is a one-shot
form, not a conversation. The entire product differentiation — iterative AI-assisted
simulation — is not present. This is the single highest-impact gap.

---

## User Story

> As a CFD engineer using OpenFOAM Studio, I want to refine a running simulation by
> describing what I want to change in plain English, so I don't have to re-describe the
> entire setup from scratch every time I change one parameter.

---

## Success Criteria

| # | Criterion | Measure |
|---|-----------|---------|
| SC1 | Second prompt only rewrites changed files | Stage 5 test: `nu` changed, other 7 files unchanged |
| SC2 | Conversation history persists across page refresh | Reload project → history still visible |
| SC3 | Prompt input re-enables after every run (never permanently locked) | Manual + test |
| SC4 | Third and subsequent prompts work the same way | Stage 5 test: 3-turn conversation |
| SC5 | Claude receives the full conversation history, not just the latest message | Verified by inspecting Claude API call in FileGenerator |

---

## Subtasks

- [ ] **S1** Extend `ProjectMeta` in `demo/server.ts` to store conversation history
  ```ts
  interface Message { role: 'user' | 'assistant'; content: string; timestamp: string }
  interface ProjectMeta {
    // existing fields…
    messages: Message[]
  }
  ```

- [ ] **S2** Update `POST /api/projects/:id/generate` to accept and persist conversation
  - Accept `{ prompt, messages }` in request body
  - Append user message to `meta.messages` before generating
  - Append assistant summary to `meta.messages` after generating (list of files written)

- [ ] **S3** Update `FileGenerator.ts` to accept conversation history
  ```ts
  generate(prompt: string, history: Message[], onProgress?: (msg: string) => void): Promise<Record<string, string>>
  ```
  - Pass `history` as Claude `messages` array (previous turns)
  - System prompt must instruct Claude: "Only return files that need to change.
    If a file is unchanged, omit it from the response."

- [ ] **S4** Update `demo/index.html` chat panel
  - On project open: fetch `GET /api/projects/:id` and render existing `meta.messages`
  - After run completes: keep prompt input enabled (don't disable it)
  - Second submit: send `{ prompt, messages: currentHistory }` to `/generate`
  - Show user messages right-aligned, assistant messages left-aligned (already styled)

- [ ] **S5** Update `GET /api/projects/:id` to return `messages` field
  - Needed so project reload restores conversation

- [ ] **S6** Delta-write: on second+ generate, only overwrite files present in Claude's response
  - Do NOT `fs.rmSync(caseDir, { recursive: true })` on subsequent generates
  - Merge returned files into existing case dir

---

## Tests Required

| Test | Type | File | Pass condition |
|------|------|------|----------------|
| Stage 5: Re=100 → Re=400 changes only `nu` | Integration | `tests/stage5/conversational-loop.test.ts` | physicalProperties updated, 7 other files untouched |
| FileGenerator passes history to Claude API | Unit | `tests/stage1/file-generator.test.ts` | Spy on Anthropic SDK `messages.create` — assert `messages` array length > 1 on second call |
| Messages persisted in meta.json | Unit | `tests/stage5/conversational-loop.test.ts` | After generate, `readMeta(id).messages.length === 2` |
| Prompt input re-enables after run | E2E | (Playwright) | `run-btn` not disabled 2 s after run completes |

---

## Anti-Goals

- Do NOT implement a general Claude chat — this is simulation-scoped conversation only
- Do NOT stream Claude's intermediate reasoning to the chat panel in this feature (that is F05's job for error recovery)
- Do NOT support branching conversation history (linear only in v1)

---

## Implementation Notes

- The system prompt in `FileGenerator.ts` must explicitly say:
  "Return only the files that differ from the previous run. Omit unchanged files entirely."
  Without this instruction, Claude will regenerate all 8 files every time.
- Conversation history grows unboundedly. For v1, cap at last 10 messages before sending
  to Claude (to stay within token budget). Persist the full history in `meta.json`.
- `meta.messages` on a fresh project should be `[]` — handle missing field gracefully.
