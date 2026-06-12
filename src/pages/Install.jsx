import React, { useState, useRef, useEffect } from 'react'
import {
  ChevronRight, ChevronLeft, Check, Loader2, AlertCircle,
  Download, Server, Globe, Shield, Play, RotateCcw
} from 'lucide-react'
import { api } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'

const STEPS = [
  { id: 'env', label: '环境选择', icon: Server },
  { id: 'channels', label: '渠道选择', icon: Globe },
  { id: 'advanced', label: '高级选项', icon: Shield },
  { id: 'execute', label: '执行安装', icon: Play },
]

const ENV_OPTIONS = [
  { value: 'auto', label: '自动检测', desc: '根据当前环境自动选择最佳安装方式' },
  { value: 'local', label: '本地安装', desc: '安装到本地用户目录 (~/.agent-reach)' },
  { value: 'server', label: '服务器安装', desc: '安装为系统服务，适合服务器部署' },
]

const CHANNEL_OPTIONS = [
  { name: 'web', label: 'Web 网页', icon: '🌐', tier: 0 },
  { name: 'youtube', label: 'YouTube', icon: '📺', tier: 0 },
  { name: 'rss', label: 'RSS 源', icon: '📡', tier: 0 },
  { name: 'exa_search', label: 'Exa 搜索', icon: '🔍', tier: 0 },
  { name: 'github', label: 'GitHub', icon: '📦', tier: 0 },
  { name: 'twitter', label: 'Twitter/X', icon: '🐦', tier: 1 },
  { name: 'bilibili', label: 'Bilibili', icon: '📺', tier: 1 },
  { name: 'reddit', label: 'Reddit', icon: '📖', tier: 1 },
  { name: 'xiaohongshu', label: '小红书', icon: '📕', tier: 1 },
  { name: 'linkedin', label: 'LinkedIn', icon: '💼', tier: 1 },
  { name: 'v2ex', label: 'V2EX', icon: '💻', tier: 0 },
  { name: 'xueqiu', label: '雪球', icon: '📈', tier: 1 },
  { name: 'xiaoyuzhou', label: '小宇宙', icon: '🎙️', tier: 2 },
]

export default function Install() {
  const [step, setStep] = useState(0)
  const [env, setEnv] = useState('auto')
  const [selectedChannels, setSelectedChannels] = useState([])
  const [safe, setSafe] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [proxy, setProxy] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState(null)

  const { output, connected, running, send, clear } = useWebSocket()
  const terminalRef = useRef(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [output])

  function toggleChannel(name) {
    setSelectedChannels(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  function selectAll() {
    setSelectedChannels(CHANNEL_OPTIONS.map(c => c.name))
  }

  function deselectAll() {
    setSelectedChannels([])
  }

  async function executeInstall() {
    setInstalling(true)
    setInstallResult(null)
    clear()

    // Send command via WebSocket terminal
    let cmd = `agent-reach install --env=${env}`
    if (safe) cmd += ' --safe'
    if (dryRun) cmd += ' --dry-run'
    if (proxy) cmd += ` --proxy=${proxy}`
    if (selectedChannels.length > 0) cmd += ` --channels=${selectedChannels.join(',')}`

    if (connected) {
      send(cmd)
    } else {
      // Fallback to REST API
      try {
        const result = await api.install({
          env,
          channels: selectedChannels,
          safe,
          dry_run: dryRun,
          proxy,
        })
        setInstallResult(result)
      } catch (e) {
        setInstallResult({ success: false, error: e.message })
      }
    }
    setInstalling(false)
  }

  function canNext() {
    if (step === 0) return true
    if (step === 1) return true // channels are optional
    if (step === 2) return true
    return true
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                i === step
                  ? 'bg-primary-600/20 text-primary-400 font-medium'
                  : i < step
                  ? 'text-emerald-400 hover:bg-dark-800 cursor-pointer'
                  : 'text-dark-500 cursor-default'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                i === step
                  ? 'bg-primary-600 text-white'
                  : i < step
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-dark-700 text-dark-500'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight size={16} className="text-dark-600" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="card">
        <div className="card-header">
          <span className="font-medium text-sm flex items-center gap-2">
            {React.createElement(STEPS[step].icon, { size: 18 })}
            {STEPS[step].label}
          </span>
          <span className="text-xs text-dark-500">步骤 {step + 1} / {STEPS.length}</span>
        </div>
        <div className="card-body">
          {/* Step 1: Environment */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-dark-400 mb-4">选择 Agent Reach 的安装环境：</p>
              {ENV_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                    env === opt.value
                      ? 'border-primary-500 bg-primary-600/5'
                      : 'border-dark-700 hover:border-dark-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="env"
                    value={opt.value}
                    checked={env === opt.value}
                    onChange={() => setEnv(opt.value)}
                    className="mt-1 accent-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-dark-400 mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Step 2: Channels */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-dark-400">选择需要安装的渠道（可选，留空则安装全部）：</p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-primary-400 hover:text-primary-300">全选</button>
                  <button onClick={deselectAll} className="text-xs text-dark-400 hover:text-dark-300">取消全选</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_OPTIONS.map(ch => (
                  <button
                    key={ch.name}
                    onClick={() => toggleChannel(ch.name)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selectedChannels.includes(ch.name)
                        ? 'border-primary-500 bg-primary-600/10'
                        : 'border-dark-700 hover:border-dark-500'
                    }`}
                  >
                    <span className="text-lg">{ch.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ch.label}</div>
                      <div className="text-[10px] text-dark-500">
                        {ch.tier === 0 ? '免费' : ch.tier === 1 ? '需配置' : '高级'}
                      </div>
                    </div>
                    {selectedChannels.includes(ch.name) && (
                      <Check size={16} className="text-primary-400" />
                    )}
                  </button>
                ))}
              </div>
              <div className="text-xs text-dark-500">
                已选择 {selectedChannels.length} 个渠道
              </div>
            </div>
          )}

          {/* Step 3: Advanced */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-dark-400 mb-4">高级安装选项：</p>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-dark-700 cursor-pointer hover:border-dark-500">
                <input
                  type="checkbox"
                  checked={safe}
                  onChange={e => setSafe(e.target.checked)}
                  className="accent-primary-500"
                />
                <div>
                  <div className="text-sm font-medium">安全模式</div>
                  <div className="text-xs text-dark-400">仅安装核心组件，跳过可选依赖</div>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-dark-700 cursor-pointer hover:border-dark-500">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={e => setDryRun(e.target.checked)}
                  className="accent-primary-500"
                />
                <div>
                  <div className="text-sm font-medium">模拟运行</div>
                  <div className="text-xs text-dark-400">显示安装计划但不实际执行</div>
                </div>
              </label>
              <div>
                <div className="text-sm font-medium mb-2">代理设置（可选）</div>
                <input
                  type="text"
                  value={proxy}
                  onChange={e => setProxy(e.target.value)}
                  placeholder="如: http://127.0.0.1:7890"
                  className="input w-full max-w-md"
                />
              </div>
            </div>
          )}

          {/* Step 4: Execute */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-dark-900 rounded-lg p-4 space-y-2 text-sm">
                <div className="font-medium mb-3">安装摘要</div>
                <div className="flex gap-2">
                  <span className="text-dark-400 w-24">环境:</span>
                  <span>{ENV_OPTIONS.find(e => e.value === env)?.label}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-dark-400 w-24">渠道:</span>
                  <span>{selectedChannels.length === 0 ? '全部' : `${selectedChannels.length} 个`}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-dark-400 w-24">安全模式:</span>
                  <span>{safe ? '是' : '否'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-dark-400 w-24">模拟运行:</span>
                  <span>{dryRun ? '是' : '否'}</span>
                </div>
                {proxy && (
                  <div className="flex gap-2">
                    <span className="text-dark-400 w-24">代理:</span>
                    <span>{proxy}</span>
                  </div>
                )}
              </div>

              {/* Terminal Output */}
              {(output.length > 0 || installResult) && (
                <div className="bg-dark-950 rounded-lg border border-dark-700 overflow-hidden">
                  <div className="px-4 py-2 bg-dark-800 border-b border-dark-700 flex items-center gap-2 text-xs text-dark-400">
                    <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    安装输出
                  </div>
                  <div ref={terminalRef} className="terminal-output p-4 max-h-80 overflow-y-auto">
                    {output.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === 'command' ? 'text-primary-400' :
                          line.type === 'error' ? 'line-error' :
                          line.type === 'success' ? 'line-success' :
                          ''
                        }
                      >
                        {line.text}
                      </div>
                    ))}
                    {installResult && !connected && (
                      <div className={installResult.success ? 'line-success' : 'line-error'}>
                        {installResult.success ? '安装成功!' : `安装失败: ${installResult.error}`}
                      </div>
                    )}
                    {running && (
                      <div className="text-dark-400 flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" /> 执行中...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={executeInstall}
                disabled={installing || running}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3"
              >
                {(installing || running) ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 安装中...
                  </>
                ) : (
                  <>
                    <Download size={18} /> 开始安装
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="btn-secondary flex items-center gap-2"
        >
          <ChevronLeft size={16} /> 上一步
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="btn-primary flex items-center gap-2"
          >
            下一步 <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={() => { setStep(0); setInstallResult(null); clear() }}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw size={16} /> 重新开始
          </button>
        )}
      </div>
    </div>
  )
}
