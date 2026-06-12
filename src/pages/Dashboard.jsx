import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Layers, Wrench, ArrowRight, Wifi, WifiOff, Loader2
} from 'lucide-react'
import { api } from '../api/client'
import { useStore } from '../store'

export default function Dashboard() {
  const navigate = useNavigate()
  const { status, doctorResult, loading, fetchStatus, fetchDoctor } = useStore()
  const [channels, setChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(false)

  useEffect(() => {
    fetchStatus()
    loadChannels()
  }, [])

  async function loadChannels() {
    setChannelsLoading(true)
    try {
      const data = await api.getChannels()
      setChannels(data.channels || [])
    } catch (e) {
      console.error('Failed to load channels:', e)
    } finally {
      setChannelsLoading(false)
    }
  }

  async function handleRunDoctor() {
    await fetchDoctor()
    loadChannels()
  }

  // Stats
  const totalChannels = channels.length
  const okChannels = channels.filter(c => c.status === 'ok').length
  const warnChannels = channels.filter(c => c.status === 'warn' || c.status === 'warning').length
  const errChannels = channels.filter(c => c.status === 'error' || c.status === 'broken').length

  const stats = [
    { label: '渠道总数', value: totalChannels, icon: Layers, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '正常运行', value: okChannels, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '需要关注', value: warnChannels, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: '不可用', value: errChannels, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  ]

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Status Banner */}
      <div className="card">
        <div className="card-body flex items-center gap-4">
          {status?.installed ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Wifi size={24} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-emerald-400">Agent Reach 已安装</div>
                <div className="text-sm text-dark-400 mt-0.5">
                  {status.version || '版本未知'} · 路径: {status.path}
                </div>
              </div>
              <span className="badge badge-ok">在线</span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                <WifiOff size={24} className="text-red-400" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-red-400">Agent Reach 未安装</div>
                <div className="text-sm text-dark-400 mt-0.5">请先通过安装向导安装 Agent Reach</div>
              </div>
              <button onClick={() => navigate('/install')} className="btn-primary flex items-center gap-2">
                前往安装 <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card">
            <div className="card-body flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon size={22} className={s.color} />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-dark-400 mt-0.5">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions + Doctor */}
      <div className="grid grid-cols-2 gap-4">
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <span className="font-medium text-sm">快速操作</span>
          </div>
          <div className="card-body space-y-2">
            <button
              onClick={handleRunDoctor}
              disabled={loading}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
              运行健康检查
            </button>
            <button onClick={() => navigate('/channels')} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Layers size={16} /> 渠道管理
            </button>
            <button onClick={() => navigate('/install')} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Wrench size={16} /> 安装 / 修复
            </button>
            <button onClick={() => navigate('/terminal')} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Activity size={16} /> 打开终端
            </button>
          </div>
        </div>

        {/* Doctor Report */}
        <div className="card">
          <div className="card-header">
            <span className="font-medium text-sm">健康检查报告</span>
            <button
              onClick={handleRunDoctor}
              disabled={loading}
              className="text-dark-400 hover:text-dark-200 transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="card-body">
            {loading && (
              <div className="flex items-center justify-center py-6 text-dark-400 text-sm gap-2">
                <Loader2 size={18} className="animate-spin" /> 正在检查...
              </div>
            )}
            {!loading && !doctorResult && (
              <div className="text-center py-6 text-dark-500 text-sm">
                点击"运行健康检查"查看渠道状态
              </div>
            )}
            {!loading && doctorResult && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {doctorResult.channels?.map((ch, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-lg hover:bg-dark-700/50">
                    {ch.status === 'ok' && <CheckCircle size={16} className="text-emerald-400 shrink-0" />}
                    {(ch.status === 'warn' || ch.status === 'warning') && <AlertTriangle size={16} className="text-amber-400 shrink-0" />}
                    {(ch.status === 'error' || ch.status === 'broken') && <XCircle size={16} className="text-red-400 shrink-0" />}
                    {!['ok', 'warn', 'warning', 'error', 'broken'].includes(ch.status) && <Activity size={16} className="text-dark-400 shrink-0" />}
                    <span className="font-medium min-w-[80px]">{ch.name || '-'}</span>
                    <span className="text-dark-400 truncate">{ch.detail}</span>
                  </div>
                ))}
                {!doctorResult.channels?.length && doctorResult.raw && (
                  <pre className="text-xs text-dark-400 whitespace-pre-wrap">{doctorResult.raw}</pre>
                )}
                {!doctorResult.channels?.length && !doctorResult.raw && (
                  <div className="text-center text-dark-500 text-sm py-2">无检查结果</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel Overview Grid */}
      <div className="card">
        <div className="card-header">
          <span className="font-medium text-sm">渠道概览</span>
          <button onClick={loadChannels} disabled={channelsLoading} className="text-dark-400 hover:text-dark-200 transition-colors">
            <RefreshCw size={16} className={channelsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="card-body">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-8 text-dark-400 text-sm gap-2">
              <Loader2 size={18} className="animate-spin" /> 加载中...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {channels.map(ch => (
                <div
                  key={ch.name}
                  onClick={() => navigate(`/channels/${ch.name}`)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-dark-900/50 border border-dark-700 hover:border-dark-500 cursor-pointer transition-colors"
                >
                  <span className="text-xl">{ch.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ch.description}</div>
                    <div className="text-xs text-dark-500">{ch.name}</div>
                  </div>
                  {ch.status === 'ok' && <span className="badge badge-ok text-[10px]">OK</span>}
                  {(ch.status === 'warn' || ch.status === 'warning') && <span className="badge badge-warn text-[10px]">!</span>}
                  {(ch.status === 'error' || ch.status === 'broken') && <span className="badge badge-error text-[10px]">ERR</span>}
                  {ch.status === 'unknown' && <span className="badge badge-info text-[10px]">?</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
