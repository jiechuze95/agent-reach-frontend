import { create } from 'zustand'

export const useStore = create((set) => ({
  // 全局状态
  status: null,        // agent-reach 安装状态
  doctorResult: null,   // doctor 检查结果
  loading: false,
  error: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  fetchStatus: async () => {
    try {
      const { api } = await import('./api/client')
      const data = await api.getStatus()
      set({ status: data, error: null })
      return data
    } catch (e) {
      set({ error: e.message })
    }
  },

  fetchDoctor: async () => {
    set({ loading: true })
    try {
      const { api } = await import('./api/client')
      const data = await api.runDoctor()
      set({ doctorResult: data, loading: false, error: null })
      return data
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },
}))
