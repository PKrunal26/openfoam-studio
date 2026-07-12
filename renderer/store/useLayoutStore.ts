import { create } from 'zustand'

export type SidebarSection = 'files' | 'commands' | 'runs'

interface LayoutState {
  activeSection: SidebarSection
  sidebarCollapsed: boolean
  aiPanelCollapsed: boolean
  setActiveSection: (section: SidebarSection) => void
  toggleSidebar: () => void
  toggleAIPanel: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeSection: 'files',
  sidebarCollapsed: false,
  aiPanelCollapsed: false,
  setActiveSection: (activeSection) =>
    set((s) => ({
      activeSection,
      sidebarCollapsed: s.activeSection === activeSection ? !s.sidebarCollapsed : false,
    })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleAIPanel: () => set((s) => ({ aiPanelCollapsed: !s.aiPanelCollapsed })),
}))
