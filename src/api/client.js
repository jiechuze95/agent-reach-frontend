const BASE_URL = '/api'
const DEFAULT_TIMEOUT = 30000
const TOKEN_FETCH_TIMEOUT = 10000

// ---------------------------------------------------------------------------
// Token management - auto-fetch from /api/token on first use, then cache
// ---------------------------------------------------------------------------
let _token = null
let _tokenPromise = null

async function getToken() {
  if (_token) return _token
  if (_tokenPromise) return _tokenPromise

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT)

  _tokenPromise = fetch(`${BASE_URL}/token`, { signal: controller.signal })
    .then(res => {
      if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status}`)
      return res.json()
    })
    .then(data => {
      _token = data.token
      _tokenPromise = null
      return _token
    })
    .catch(err => {
      _tokenPromise = null
      if (err.name === 'AbortError') {
        throw new Error('Token fetch timed out')
      }
      throw err
    })
    .finally(() => {
      clearTimeout(timeoutId)
    })

  return _tokenPromise
}

async function request(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  // Fetch the token first (with its own timeout)
  const token = await getToken()

  // Start the request AbortController AFTER token is obtained
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...fetchOptions.headers,
  }

  let _retried = false

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      // On 401, clear cached token and retry once
      if (res.status === 401 && !_retried) {
        _token = null
        _retried = true
        const newToken = await getToken()
        const retryHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` }
        const retryRes = await fetch(`${BASE_URL}${path}`, {
          ...fetchOptions,
          headers: retryHeaders,
          signal: controller.signal,
        })
        if (!retryRes.ok) {
          const err = await retryRes.json().catch(() => ({ detail: '请求失败' }))
          throw new Error(err.detail || `HTTP ${retryRes.status}`)
        }
        if (retryRes.status === 204) return null
        return await retryRes.json()
      }

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

// ---------------------------------------------------------------------------
// WebSocket terminal connection - token passed as query parameter
// ---------------------------------------------------------------------------

/**
 * Open a WebSocket connection to the terminal backend.
 * @param {string} [token] - Bearer token; if omitted the caller must
 *   have already obtained one via getToken().
 */
export async function connectTerminal(token) {
  // If no token supplied, fetch it (uses cache after first call)
  if (!token) {
    token = await getToken()
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(
    `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`
  )
}
