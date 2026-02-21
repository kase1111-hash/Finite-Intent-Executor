import React from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'
import { NETWORKS } from '../contracts/config'
import {
  LayoutDashboard,
  FileText,
  Zap,
  Coins,
  Activity,
  Sunset,
  BookOpen,
  Wallet,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/intent', label: 'Intent Capture', icon: FileText },
  { path: '/triggers', label: 'Triggers', icon: Zap },
  { path: '/tokens', label: 'IP Tokens', icon: Coins },
  { path: '/lexicon', label: 'Lexicon', icon: BookOpen },
  { path: '/execution', label: 'Execution', icon: Activity },
  { path: '/sunset', label: 'Sunset', icon: Sunset },
]

function Layout() {
  const { account, chainId, isConnected, isConnecting, connect, disconnect } = useWeb3()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const location = useLocation()

  const network = NETWORKS[chainId] || { name: 'Unknown Network', symbol: '?' }

  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-linear-to-br from-primary-500 to-sunset-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FIE</span>
            </div>
            <span className="font-semibold text-gray-900">Finite Intent</span>
          </div>
          <button
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? 'nav-link-active' : 'nav-link'
              }
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Connection status */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-gray-600">{network.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-gray-500" />
                  <span className="text-sm font-medium">{formatAddress(account)}</span>
                </div>
                <button
                  onClick={disconnect}
                  className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Disconnect"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Wallet size={18} />
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            <button
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>

            <div className="flex-1 lg:flex-none">
              <h1 className="text-lg font-semibold text-gray-900 lg:hidden">
                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {isConnected && chainId && NETWORKS[chainId]?.explorer && (
                <a
                  href={`${NETWORKS[chainId].explorer}/address/${account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600"
                >
                  <span>View on Explorer</span>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
