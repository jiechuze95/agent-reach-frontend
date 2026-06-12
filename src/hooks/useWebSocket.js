import { useState, useEffect, useRef, useCallback } from 'react'
import { connectTerminal } from '../api/client'

export function useWebSocket() {
  const [output, setOutput] = useState([])
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = connectTerminal()
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setRunning(false) }
    ws.onerror = () => setConnected(false)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'output') {
        setOutput(prev => [...prev, { text: data.text, type: 'output' }])
      } else if (data.type === 'done') {
        setOutput(prev => [...prev, { text: `\n[完成 - 退出码: ${data.returncode}]`, type: data.returncode === 0 ? 'success' : 'error' }])
        setRunning(false)
      } else if (data.type === 'error') {
        setOutput(prev => [...prev, { text: data.text, type: 'error' }])
        setRunning(false)
      }
    }

    return () => ws.close()
  }, [])

  const send = useCallback((command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setOutput(prev => [...prev, { text: `$ ${command}`, type: 'command' }])
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

  return { output, connected, running, send, interrupt, clear }
}
