import React from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Layers, Download, Settings, Terminal } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import Install from './pages/Install'
import SettingsPage from './pages/Settings'
import TerminalPage from './pages/Terminal'

const NAV_ITEMS = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/channels', label: '渠道管理', icon: Layers },
  { path: '/install', label: '安装向导', icon: Download },
  { path: '/settings', label: '设置', icon: Settings },
  { path: '/terminal', label: '终端', icon: Terminal },
]

export default function App() {
  const location = useLocation()
  const currentTitle = NAV_ITEMS.find(n => n.path === location.pathname)?.label || 'Agent Reach'

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-dark-900 border-r border-dark-700 flex flex-col fixed top-0 left-0 bottom-0 z-50">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-dark-700">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-lg">
            👁️
          </div>
          <div>
            <div className="font-bold text-sm">Agent Reach</div>
            <div className="text-xs text-dark-400">Manager</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600/15 text-primary-400 font-medium'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-dark-700 text-xs text-dark-500">
          <div>Agent Reach v1.5.0</div>
          <div className="mt-1">Frontend Manager v1.0</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60">
        {/* Top bar */}
        <header className="h-16 bg-dark-900/80 backdrop-blur border-b border-dark-700 flex items-center px-6 sticky top-0 z-40">
          <h1 className="text-lg font-semibold">{currentTitle}</h1>
        </header>
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/:name" element={<Channels />} />
            <Route path="/install" element={<Install />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/terminal" element={<TerminalPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
