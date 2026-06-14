import { useEffect, useState, useRef } from 'react'
import {
  Settings, Save, Loader2, AlertTriangle, Trash2, RefreshCw,
  CheckCircle, XCircle, Shield, Download, FileText, Wrench, Eye, EyeOff
} from 'lucide-react'
import { api } from '../api/client'

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'api_key', 'apikey', 'key', 'credential', 'auth']

function isSensitiveKey(key) {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some(s => lower.includes(s))
}

export default function SettingsPage() {
  const [config, setConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configKey, setConfigKey] = useState('')
  const [configValue, setConfigValue] = useState('')
  const [configMsg, setConfigMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  // Visibility toggle for sensitive config values
  const [visibleKeys, setVisibleKeys] = useState({})

  // Skill management
  const [skillAction, setSkillAction] = useState(null)
  const [skillMsg, setSkillMsg] = useState(null)

  // Update check
  const [updateResult, setUpdateResult] = useState(null)
  const [checking, setChecking] = useState(false)

  // Uninstall
  const [showUninstall, setShowUninstall] = useState(false)
  const [uninstallOpts, setUninstallOpts] = useState({ dry_run: false, keep_config: true })
  const [uninstallResult, setUninstallResult] = useState(null)
  const [uninstalling, setUninstalling] = useState(false)

  const uninstallResultRef = useRef(null)

  useEffect(() => {
    loadConfig()
  }, [])

  // Auto-dismiss config messages after 3 seconds
  useEffect(() => {
    if (!configMsg) return
    const timer = setTimeout(() => setConfigMsg(null), 3000)
    return () => clearTimeout(timer)
  }, [configMsg])

  // Auto-dismiss skill messages after 3 seconds
  useEffect(() => {
    if (!skillMsg) return
    const timer = setTimeout(() => setSkillMsg(null), 3000)
    return () => clearTimeout(timer)
  }, [skillMsg])

  // Focus on uninstall result after operation
  useEffect(() => {
    if (uninstallResult && uninstallResultRef.current) {
      uninstallResultRef.current.focus()
    }
  }, [uninstallResult])

  async function loadConfig() {
    setConfigLoading(true)
    try {
      const data = await api.getConfig()
      setConfig(data)
    } catch (e) {
      console.error('Failed to load config:', e)
    } finally {
      setConfigLoading(false)
    }
  }

  async function handleSaveConfig() {
    if (!configKey || !configValue) return
    setSaving(true)
    setConfigMsg(null)
    try {
      const result = await api.configure({ key: configKey, value: configValue })
      if (result.success) {
        setConfigMsg({ type: 'ok', text: '配置已保存' })
        setConfigKey('')
        setConfigValue('')
        loadConfig()
      } else {
        setConfigMsg({ type: 'error', text: result.error || '保存失败' })
      }
    } catch (e) {
      setConfigMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSkill(action) {
    setSkillAction(action)
    setSkillMsg(null)
    try {
      const result = await api.manageSkill({ action })
      if (result.success) {
        setSkillMsg({ type: 'ok', text: `Skill ${action === 'install' ? '安装' : '卸载'}成功` })
      } else {
        setSkillMsg({ type: 'error', text: result.error || '操作失败' })
      }
    } catch (e) {
      setSkillMsg({ type: 'error', text: e.message })
    } finally {
      setSkillAction(null)
    }
  }

  async function handleCheckUpdate() {
    setChecking(true)
    setUpdateResult(null)
    try {
      const result = await api.checkUpdate()
      setUpdateResult(result)
    } catch (e) {
      setUpdateResult({ success: false, error: e.message })
    } finally {
      setChecking(false)
    }
  }

  async function handleUninstall() {
    setUninstalling(true)
    setUninstallResult(null)
    try {
      const result = await api.uninstall(uninstallOpts)
      setUninstallResult(result)
    } catch (e) {
      setUninstallResult({ success: false, error: e.message })
    } finally {
      setUninstalling(false)
    }
  }

  function toggleKeyVisibility(key) {
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-6 animate-slide-in max-w-3xl">
      {/* Configuration Section */}
      <div className="card">
        <div className="card-header">
          <span className="font-medium text-sm flex items-center gap-2">
            <Settings size={18} /> 配置管理
          </span>
          <button onClick={loadConfig} disabled={configLoading} className="text-dark-400 hover:text-dark-200" aria-label="刷新配置">
            <RefreshCw size={16} className={configLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="card-body space-y-4">
          {/* Current Config */}
          <div>
            <div className="text-xs text-dark-500 mb-2">当前配置文件</div>
            {configLoading ? (
              <div className="flex items-center gap-2 text-dark-400 text-sm py-3">
                <Loader2 size={16} className="animate-spin" /> 加载中...
              </div>
            ) : config?._exists ? (
              <div className="bg-dark-900 rounded-lg p-4">
                <div className="text-xs text-dark-500 mb-2 flex items-center gap-2">
                  <FileText size={12} /> {config._path}
                </div>
                {config.data && Object.keys(config.data).length > 0 ? (
                  <div className="space-y-1.5">
                    {Object.entries(config.data).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-3 text-sm">
                        <span className="text-primary-400 font-mono text-xs min-w-[120px]">{k}</span>
                        {isSensitiveKey(k) ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-dark-300 truncate font-mono">
                              {visibleKeys[k] ? String(v) : '\u2022'.repeat(Math.min(String(v).length, 20))}
                            </span>
                            <button
                              onClick={() => toggleKeyVisibility(k)}
                              className="text-dark-500 hover:text-dark-300 shrink-0"
                              aria-label={visibleKeys[k] ? '隐藏值' : '显示值'}
                            >
                              {visibleKeys[k] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-dark-300 truncate">{String(v)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : config._raw ? (
                  <pre className="text-xs text-dark-400 whitespace-pre-wrap font-mono">{config._raw}</pre>
                ) : (
                  <div className="text-sm text-dark-500">配置文件为空</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-dark-500 py-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                配置文件不存在 ({config?._path || '~/.agent-reach/config.yaml'})
              </div>
            )}
          </div>

          {/* Add Config */}
          <div className="border-t border-dark-700 pt-4">
            <div className="text-xs text-dark-500 mb-3">添加 / 修改配置项</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={configKey}
                onChange={e => setConfigKey(e.target.value)}
                placeholder="配置键"
                className="input flex-1"
                autoComplete="off"
                spellCheck={false}
              />
              <input
                type="text"
                value={configValue}
                onChange={e => setConfigValue(e.target.value)}
                placeholder="配置值"
                className="input flex-1"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={handleSaveConfig}
                disabled={saving || !configKey || !configValue}
                className="btn-primary flex items-center gap-2 shrink-0"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                保存
              </button>
            </div>
            {configMsg && (
              <div className={`text-xs mt-2 ${configMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                {configMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Skill Management */}
      <div className="card">
        <div className="card-header">
          <span className="font-medium text-sm flex items-center gap-2">
            <Wrench size={18} /> Skill 管理
          </span>
        </div>
        <div className="card-body">
          <p className="text-sm text-dark-400 mb-4">
            安装 Skill 后，Agent Reach 可作为 AI Agent 的技能被调用。
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleSkill('install')}
              disabled={skillAction !== null}
              className="btn-primary flex items-center gap-2"
            >
              {skillAction === 'install' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              安装 Skill
            </button>
            <button
              onClick={() => handleSkill('uninstall')}
              disabled={skillAction !== null}
              className="btn-secondary flex items-center gap-2"
            >
              {skillAction === 'uninstall' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              卸载 Skill
            </button>
          </div>
          {skillMsg && (
            <div className={`text-xs mt-3 ${skillMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {skillMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Update Check */}
      <div className="card">
        <div className="card-header">
          <span className="font-medium text-sm flex items-center gap-2">
            <RefreshCw size={18} /> 版本更新
          </span>
        </div>
        <div className="card-body">
          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            className="btn-secondary flex items-center gap-2"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            检查更新
          </button>
          {updateResult && (
            <div className={`mt-3 text-sm ${updateResult.success ? 'text-dark-300' : 'text-red-400'}`}>
              {updateResult.success ? (
                <pre className="whitespace-pre-wrap text-xs bg-dark-900 rounded-lg p-3">{updateResult.output}</pre>
              ) : (
                <div>检查失败: {updateResult.error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-600/20">
        <div className="card-header border-red-600/10">
          <span className="font-medium text-sm flex items-center gap-2 text-red-400">
            <Shield size={18} /> 危险操作
          </span>
        </div>
        <div className="card-body space-y-4">
          {!showUninstall ? (
            <button onClick={() => setShowUninstall(true)} className="btn-danger flex items-center gap-2">
              <Trash2 size={14} /> 卸载 Agent Reach
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle size={16} />
                确认要卸载 Agent Reach 吗？此操作不可撤销。
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={uninstallOpts.dry_run}
                  onChange={e => setUninstallOpts(prev => ({ ...prev, dry_run: e.target.checked }))}
                  className="accent-primary-500"
                />
                模拟运行（仅预览不执行）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={uninstallOpts.keep_config}
                  onChange={e => setUninstallOpts(prev => ({ ...prev, keep_config: e.target.checked }))}
                  className="accent-primary-500"
                />
                保留配置文件
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (window.confirm('确认要卸载 Agent Reach 吗？此操作不可撤销。')) {
                      handleUninstall()
                    }
                  }}
                  disabled={uninstalling}
                  className="btn-danger flex items-center gap-2"
                >
                  {uninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  确认卸载
                </button>
                <button onClick={() => setShowUninstall(false)} className="btn-secondary">
                  取消
                </button>
              </div>
              {uninstallResult && (
                <div
                  ref={uninstallResultRef}
                  tabIndex={-1}
                  className={`text-xs mt-2 outline-none ${uninstallResult.success ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {uninstallResult.success ? '卸载完成' : `卸载失败: ${uninstallResult.error}`}
                  {uninstallResult.output && (
                    <pre className="mt-2 whitespace-pre-wrap bg-dark-900 rounded-lg p-3 text-dark-300">
                      {uninstallResult.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
