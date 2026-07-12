export type CaseFiles = Record<string, string>

/** Compact record of one agent tool call, persisted with the assistant message
 *  so the activity trail survives after the response (and across reloads). */
export interface PersistedAgentStep {
  tool: string
  /** Human-readable argument summary, e.g. a file path or search query. */
  summary?: string
  ok: boolean
  durationMs?: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  filesChanged?: string[]
  agentSteps?: PersistedAgentStep[]
}
