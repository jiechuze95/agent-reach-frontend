import { useState, useEffect, useRef, useCallback } from 'react'
import { connectTerminal } from '../api/client'

const MAX_OUTPUT_LINES = 3000

export function useWebSocket() {
  const [output, setOutput] = useState([])
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    try {
      const ws = connectTerminal()
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
        reconnectAttemptRef.current = 0
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        setRunning(false)
        scheduleReconnect()
      }

      ws.onerror = () => {
        if (!mountedRef.current) return
        setConnected(false)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        let data
        try {
          data = JSON.parse(event.data)
        } catch {
          setOutput(prev => {
            const next = [...prev, { text: event.data, type: 'output' }]
            return next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next
          })
          return
        }

        if (data.type === 'output') {
          setOutput(prev => {
            const next = [...prev, { text: data.text, type: 'output' }]
            return next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next
          })
        } else if (data.type === 'done') {
          setOutput(prev => {
            const next = [...prev, { text: `\n[完成 - 退出码: ${data.returncode}]`, type: data.returncode === 0 ? 'success' : 'error' }]
            return next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next
          })
          setRunning(false)
        } else if (data.type === 'error') {
          setOutput(prev => {
            const next = [...prev, { text: data.text, type: 'error' }]
            return next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next
          })
          setRunning(false)
        }
      }
    } catch {
      scheduleReconnect()
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return
    const attempt = reconnectAttemptRef.current
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000) // 1s, 2s, 4s, 8s, ... max 30s
    reconnectAttemptRef.current = attempt + 1
    reconnectTimeoutRef.current = setTimeout(() => {
      connect()
    }, delay)
  }, [connect])

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectAttemptRef.current = 0
    if (wsRef.current) {
      wsRef.current.close()
    }
    connect()
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const send = useCallback((command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setOutput(prev => {
        const next = [...prev, { text: `$ ${command}`, type: 'command' }]
        return next.length > MAX_OUTPUT_LINES ? next.slice(-MAX_OUTPUT_LINES) : next
      })
      setRunning(true)
      wsRef.current.send(JSON.stringify({ type: 'command', command }))
    }
  }, [])

  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }))
    }
  }, [])

  const clear = useCallback(() => setOutput([]), [])

  return { output, connected, running, send, interrupt, clear, reconnect }
}
