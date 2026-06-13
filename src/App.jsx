import React, { useState } from 'react'
import { Routes, Route, NavLink, useLocation, Link } from 'react-router-dom'
import { LayoutDashboard, Layers, Download, Settings, Terminal, Menu, X } from 'lucide-react'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import Install from './pages/Install'
import SettingsPage from './pages/Settings'
import TerminalPage from './pages/Terminal'
import { useStore } from './store'

const NAV_ITEMS = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/channels', label: '渠道管理', icon: Layers },
  { path: '/install', label: '安装向导', icon: Download },
  { path: '/settings', label: '设置', icon: Settings },
  { path: '/terminal', label: '终端', icon: Terminal },
]

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-6xl font-bold text-dark-600">404</div>
      <p className="text-dark-400">页面未找到</p>
      <Link to="/" className="btn-primary">返回首页</Link>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const status = useStore(s => s.status)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const version = status?.version || '1.5.0'

  const currentTitle = (() => {
    const item = NAV_ITEMS.find(n =>
      n.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(n.path)
    )
    return item?.label || 'Agent Reach'
  })()

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`w-60 bg-dark-900 border-r border-dark-700 flex flex-col fixed top-0 left-0 bottom-0 z-50 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}>
          <div className="h-16 flex items-center gap-3 px-5 border-b border-dark-700">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-lg">
              &#x1F441;&#xFE0F;
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm">Agent Reach</div>
              <div className="text-xs text-dark-400">Manager</div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-dark-400 hover:text-dark-200"
              aria-label="关闭侧边栏"
            >
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                isActive={(_, loc) =>
                  item.path === '/'
                    ? loc.pathname === '/'
                    : loc.pathname.startsWith(item.path)
                }
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
            <div>Agent Reach v{version}</div>
            <div className="mt-1">Frontend Manager v1.0</div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-60">
          {/* Top bar */}
          <header className="h-16 bg-dark-900/80 backdrop-blur border-b border-dark-700 flex items-center px-6 sticky top-0 z-40 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-dark-400 hover:text-dark-200"
              aria-label="打开侧边栏"
            >
              <Menu size={20} />
            </button>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}
