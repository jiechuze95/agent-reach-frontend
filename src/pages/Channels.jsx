import { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, Filter, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, XCircle, Activity, Loader2,
  ArrowLeft, Settings, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'
import EmptyState from '../components/EmptyState'

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'ok', label: '正常' },
  { key: 'warn', label: '警告' },
  { key: 'error', label: '异常' },
  { key: 'unknown', label: '未知' },
]

const TIER_LABELS = {
  0: { label: '免费', color: 'badge-ok' },
  1: { label: '需配置', color: 'badge-warn' },
  2: { label: '高级', color: 'badge-info' },
}

// StatusIcon defined outside Channels to avoid re-creation on every render
function StatusIcon({ status }) {
  if (status === 'ok') return <CheckCircle size={18} className="text-emerald-400" />
  if (status === 'warn' || status === 'warning') return <AlertTriangle size={18} className="text-amber-400" />
  if (status === 'error' || status === 'broken') return <XCircle size={18} className="text-red-400" />
  return <Activity size={18} className="text-dark-400" />
}

export default function Channels() {
  const { name: selectedName } = useParams()
  const navigate = useNavigate()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState(null)

  // Config dialog state
  const [configKey, setConfigKey] = useState('')
  const [configValue, setConfigValue] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [configMsg, setConfigMsg] = useState(null)

  // Debounced search using useDeferredValue (React 18)
  const deferredSearch = useDeferredValue(search)
  const isStale = search !== deferredSearch

  useEffect(() => {
    loadChannels()
  }, [])

  useEffect(() => {
    if (selectedName) {
      loadDetail(selectedName)
      setExpanded(selectedName)
    }
  }, [selectedName])

  // Escape key listener for detail panel
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && expanded) {
        setExpanded(null)
        setDetail(null)
        if (selectedName) navigate('/channels')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded, selectedName, navigate])

  // Auto-dismiss config messages after 3 seconds
  useEffect(() => {
    if (!configMsg) return
    const timer = setTimeout(() => setConfigMsg(null), 3000)
    return () => clearTimeout(timer)
  }, [configMsg])

  async function loadChannels() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getChannels()
      setChannels(data.channels || [])
    } catch (e) {
      console.error('Failed to load channels:', e)
      setError('加载渠道列表失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(name) {
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await api.getChannel(name)
      setDetail(data)
    } catch (e) {
      console.error('Failed to load detail:', e)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleConfigure() {
    if (!configKey || !configValue) return
    setConfigLoading(true)
    setConfigMsg(null)
    try {
      const result = await api.configure({ key: configKey, value: configValue })
      if (result.success) {
        setConfigMsg({ type: 'ok', text: '配置成功' })
        setConfigKey('')
        setConfigValue('')
      } else {
        setConfigMsg({ type: 'error', text: result.error || '配置失败' })
      }
    } catch (e) {
      setConfigMsg({ type: 'error', text: e.message })
    } finally {
      setConfigLoading(false)
    }
  }

  function toggleExpand(name) {
    if (expanded === name) {
      setExpanded(null)
      setDetail(null)
      if (selectedName) navigate('/channels')
    } else {
      setExpanded(name)
      loadDetail(name)
      navigate(`/channels/${name}`)
    }
  }

  // Filter channels using deferredSearch for debounced filtering
  const filtered = useMemo(() => channels.filter(ch => {
    if (filter !== 'all') {
      const s = ch.status
      if (filter === 'ok' && s !== 'ok') return false
      if (filter === 'warn' && s !== 'warn' && s !== 'warning') return false
      if (filter === 'error' && s !== 'error' && s !== 'broken') return false
      if (filter === 'unknown' && s !== 'unknown') return false
    }
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase()
      return ch.name.toLowerCase().includes(q) || ch.description.toLowerCase().includes(q)
    }
    return true
  }), [channels, filter, deferredSearch])

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索渠道..."
            className="input w-full pl-9"
            aria-label="搜索渠道"
          />
        </div>
        <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1 border border-dark-700">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
              aria-label={`筛选: ${f.label}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={loadChannels} disabled={loading} className="btn-secondary flex items-center gap-2" aria-label="刷新渠道列表">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="card border-red-600/20">
          <div className="card-body text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={loadChannels} className="btn-secondary text-sm">重试</button>
          </div>
        </div>
      )}

      {/* Channel List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-dark-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> 加载渠道列表...
        </div>
      ) : !error && filtered.length === 0 ? (
        <EmptyState icon={Filter} message="没有匹配的渠道" description="尝试调整筛选条件或搜索关键词" />
      ) : !error ? (
        <div className={`space-y-2 ${isStale ? 'opacity-60' : ''}`}>
          {filtered.map(ch => (
            <div key={ch.name} className="card">
              {/* Channel Header */}
              <div
                className="card-body flex items-center gap-4 cursor-pointer hover:bg-dark-700/30 transition-colors"
                onClick={() => toggleExpand(ch.name)}
              >
                <span className="text-2xl">{ch.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ch.description}</span>
                    <span className={`badge ${TIER_LABELS[ch.tier]?.color || 'badge-info'} text-[10px]`}>
                      {TIER_LABELS[ch.tier]?.label || `Tier ${ch.tier}`}
                    </span>
                  </div>
                  <div className="text-xs text-dark-500 mt-0.5">
                    {ch.name} &middot; 后端: {ch.backends?.join(', ')}
                  </div>
                </div>
                <StatusIcon status={ch.status} />
                {expanded === ch.name ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
              </div>

              {/* Expanded Detail */}
              {expanded === ch.name && (
                <div className="border-t border-dark-700 p-5 bg-dark-900/50 animate-slide-in">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-6 text-dark-400 gap-2">
                      <Loader2 size={18} className="animate-spin" /> 加载详情...
                    </div>
                  ) : detail ? (
                    <div className="grid grid-cols-2 gap-6">
                      {/* Left: Info */}
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-dark-500 mb-1">渠道名称</div>
                          <div className="text-sm font-medium">{detail.description} ({detail.name})</div>
                        </div>
                        <div>
                          <div className="text-xs text-dark-500 mb-1">状态</div>
                          <div className="flex items-center gap-2">
                            <StatusIcon status={detail.status} />
                            <span className="text-sm">{detail.status}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-dark-500 mb-1">后端引擎</div>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.backends?.map(b => (
                              <span key={b} className="badge badge-info">{b}</span>
                            ))}
                          </div>
                        </div>
                        {detail.detail && (
                          <div>
                            <div className="text-xs text-dark-500 mb-1">详情</div>
                            <div className="text-sm text-dark-300">{detail.detail}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-dark-500 mb-1">需要配置</div>
                          <div className="text-sm">{detail.config_needed ? '是' : '否'}</div>
                        </div>
                      </div>

                      {/* Right: Config form (if needed) */}
                      {detail.config_needed && (
                        <div className="space-y-3">
                          <div className="text-sm font-medium flex items-center gap-2">
                            <Settings size={16} /> 配置渠道
                          </div>
                          <input
                            type="text"
                            value={configKey}
                            onChange={e => setConfigKey(e.target.value)}
                            placeholder="配置键 (如 twitter_token)"
                            className="input w-full"
                          />
                          <input
                            type="text"
                            value={configValue}
                            onChange={e => setConfigValue(e.target.value)}
                            placeholder="配置值"
                            className="input w-full"
                          />
                          <button
                            onClick={handleConfigure}
                            disabled={configLoading || !configKey || !configValue}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                          >
                            {configLoading && <Loader2 size={14} className="animate-spin" />}
                            保存配置
                          </button>
                          {configMsg && (
                            <div className={`text-xs ${configMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {configMsg.text}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-dark-500 text-sm">加载失败</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Summary */}
      {!loading && !error && (
        <div className="text-xs text-dark-500 text-center py-2">
          显示 {filtered.length} / {channels.length} 个渠道
        </div>
      )}
    </div>
  )
}
