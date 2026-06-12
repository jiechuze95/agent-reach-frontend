const BASE_URL = '/api'

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '请求失败' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getStatus: () => request('/status'),
  runDoctor: () => request('/doctor'),
  getChannels: () => request('/channels'),
  getChannel: (name) => request(`/channels/${name}`),
  install: (data) => request('/install', { method: 'POST', body: JSON.stringify(data) }),
  configure: (data) => request('/configure', { method: 'POST', body: JSON.stringify(data) }),
  getConfig: () => request('/config'),
  uninstall: (data) => request('/uninstall', { method: 'POST', body: JSON.stringify(data) }),
  manageSkill: (data) => request('/skill', { method: 'POST', body: JSON.stringify(data) }),
  transcribe: (data) => request('/transcribe', { method: 'POST', body: JSON.stringify(data) }),
  checkUpdate: () => request('/check-update'),
  watch: () => request('/watch'),
  getHistory: () => request('/history'),
}

export function connectTerminal() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${protocol}//${window.location.host}/ws/terminal`)
}
