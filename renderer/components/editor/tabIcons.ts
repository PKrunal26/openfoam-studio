import { FileText, Sliders, Terminal, Box, BarChart3 } from 'lucide-react'
import type { TabKind } from '@/store/useEditorStore'

export const tabIcon: Record<TabKind, React.ComponentType<{ className?: string }>> = {
  case: FileText,
  parameters: Sliders,
  logs: Terminal,
  geometry: Box,
  visualization: BarChart3,
}
