const BASE_URL = '/api'
const DEFAULT_TIMEOUT = 30000

async function request(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const headers = { 'Content-Type': 'application/json', ...fetchOptions.headers }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '请求失败' }))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }

    // 204 No Content - don't try to parse JSON
    if (res.status === 204) {
      return null
    }

    return await res.json()
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

export function requestWithTimeout(path, options = {}, timeout) {
  return request(path, { ...options, timeout })
}

export const api = {
  getStatus: (timeout) => request('/status', { timeout }),
  runDoctor: (timeout) => request('/doctor', { timeout }),
  getChannels: (timeout) => request('/channels', { timeout }),
  getChannel: (name, timeout) => request(`/channels/${encodeURIComponent(name)}`, { timeout }),
  install: (data, timeout) => request('/install', { method: 'POST', body: JSON.stringify(data), timeout }),
  configure: (data, timeout) => request('/configure', { method: 'POST', body: JSON.stringify(data), timeout }),
  getConfig: (timeout) => request('/config', { timeout }),
  uninstall: (data, timeout) => request('/uninstall', { method: 'POST', body: JSON.stringify(data), timeout }),
  manageSkill: (data, timeout) => request('/skill', { method: 'POST', body: JSON.stringify(data), timeout }),
  transcribe: (data, timeout) => request('/transcribe', { method: 'POST', body: JSON.stringify(data), timeout }),
  checkUpdate: (timeout) => request('/check-update', { timeout }),
  watch: (timeout) => request('/watch', { timeout }),
  getHistory: (timeout) => request('/history', { timeout }),
}

export function connectTerminal() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${protocol}//${window.location.host}/ws/terminal`)
}
