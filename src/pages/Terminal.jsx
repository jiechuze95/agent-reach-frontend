import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Play, Square, Trash2, Wifi, WifiOff, Clock,
  ChevronDown, Copy, Check, Loader2
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { api } from '../api/client'

const QUICK_COMMANDS = [
  { label: '状态检查', cmd: 'agent-reach --version' },
  { label: '健康诊断', cmd: 'agent-reach doctor' },
  { label: '查看帮助', cmd: 'agent-reach --help' },
  { label: '检查更新', cmd: 'agent-reach check-update' },
]

export default function TerminalPage() {
  const { output, connected, running, send, interrupt, clear } = useWebSocket()
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [cmdHistory, setCmdHistory] = useState([])
  const [copied, setCopied] = useState(false)

  const terminalRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [output])

  // Load command history
  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      const data = await api.getHistory()
      setCmdHistory(data.history || [])
    } catch (e) {
      // ignore
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const cmd = input.trim()
    if (!cmd || running) return
    send(cmd)
    setHistory(prev => [cmd, ...prev].slice(0, 100))
    setHistoryIndex(-1)
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const newIdx = Math.min(historyIndex + 1, history.length - 1)
        setHistoryIndex(newIdx)
        setInput(history[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1
        setHistoryIndex(newIdx)
        setInput(history[newIdx])
      } else {
        setHistoryIndex(-1)
        setInput('')
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (running) interrupt()
    }
  }

  function handleQuickCommand(cmd) {
    if (running) return
    send(cmd)
    setHistory(prev => [cmd, ...prev].slice(0, 100))
  }

  async function handleCopyOutput() {
    const text = output.map(l => l.text).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // ignore
    }
  }

  function getLineClass(type) {
    switch (type) {
      case 'command': return 'text-primary-400 font-medium'
      case 'error': return 'line-error'
      case 'success': return 'line-success'
      default: return 'text-dark-200'
    }
  }

  return (
    <div className="space-y-4 animate-slide-in h-[calc(100vh-140px)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Connection Status */}
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full ${
          connected
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? '已连接' : '未连接'}
        </div>

        {/* Quick Commands */}
        <div className="flex gap-1.5">
          {QUICK_COMMANDS.map(qc => (
            <button
              key={qc.cmd}
              onClick={() => handleQuickCommand(qc.cmd)}
              disabled={running || !connected}
              className="btn-secondary text-xs !px-2.5 !py-1.5"
            >
              {qc.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleCopyOutput}
          disabled={output.length === 0}
          className="btn-secondary text-xs !px-2.5 !py-1.5 flex items-center gap-1.5"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? '已复制' : '复制输出'}
        </button>
        <button
          onClick={clear}
          disabled={output.length === 0}
          className="btn-secondary text-xs !px-2.5 !py-1.5 flex items-center gap-1.5"
        >
          <Trash2 size={12} /> 清空
        </button>
        {running && (
          <button
            onClick={interrupt}
            className="btn-danger text-xs !px-2.5 !py-1.5 flex items-center gap-1.5"
          >
            <Square size={12} /> 中断
          </button>
        )}
      </div>

      {/* Terminal */}
      <div
        className="flex-1 bg-dark-950 rounded-xl border border-dark-700 flex flex-col overflow-hidden cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Terminal Header */}
        <div className="px-4 py-2 bg-dark-800/80 border-b border-dark-700 flex items-center gap-2 text-xs text-dark-400 shrink-0">
          <div className="flex gap-1.5 mr-2">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          </div>
          Agent Reach Terminal
          {running && (
            <span className="ml-auto flex items-center gap-1.5 text-amber-400">
              <Loader2 size={10} className="animate-spin" /> 运行中
            </span>
          )}
        </div>

        {/* Output */}
        <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 terminal-output">
          {output.length === 0 && (
            <div className="text-dark-500 text-sm">
              <div className="mb-2">Agent Reach 终端已就绪。</div>
              <div>输入命令并按回车执行，或使用上方的快捷按钮。</div>
              <div className="mt-1 text-dark-600">提示: 使用 Ctrl+C 中断正在运行的命令</div>
            </div>
          )}
          {output.map((line, i) => (
            <div key={i} className={getLineClass(line.type)}>
              {line.text}
            </div>
          ))}
          {running && (
            <div className="text-dark-500 flex items-center gap-1 mt-1">
              <span className="animate-pulse-dot">█</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-dark-700 px-4 py-2 flex items-center gap-2 shrink-0 bg-dark-900/50">
          <span className="text-primary-400 font-mono text-sm shrink-0">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected}
            placeholder={connected ? '输入命令...' : '等待连接...'}
            className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-dark-100 placeholder-dark-500"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!connected || running || !input.trim()}
            className="text-primary-400 hover:text-primary-300 disabled:text-dark-600 transition-colors"
          >
            <Play size={16} />
          </button>
        </form>
      </div>

      {/* Recent History */}
      {cmdHistory.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-dark-500">
          <Clock size={12} />
          <span>最近:</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {cmdHistory.slice(0, 5).map((h, i) => (
              <button
                key={i}
                onClick={() => handleQuickCommand(h.command)}
                disabled={running || !connected}
                className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-dark-200 whitespace-nowrap transition-colors truncate max-w-[200px]"
                title={h.command}
              >
                {h.command}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
