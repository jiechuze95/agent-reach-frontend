import { create } from 'zustand'
import { api } from './api/client'

export const useStore = create((set) => ({
  // Global state
  status: null,
  doctorResult: null,
  loading: false,
  error: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  fetchStatus: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api.getStatus()
      set({ status: data, error: null, loading: false })
      return data
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  fetchDoctor: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api.runDoctor()
      set({ doctorResult: data, loading: false, error: null })
      return data
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },
}))
