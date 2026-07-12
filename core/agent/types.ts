export type CaseFiles = Record<string, string>

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  filesChanged?: string[]
}
