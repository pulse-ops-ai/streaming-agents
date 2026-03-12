import { create } from 'zustand'

interface UIState {
  historyMinutes: number
  setHistoryMinutes: (minutes: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  historyMinutes: 5,
  setHistoryMinutes: (minutes) => set({ historyMinutes: minutes }),
}))
