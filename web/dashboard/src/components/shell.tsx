import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isAdmin = location.pathname === '/admin'

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-nominal animate-pulse" />
            <Link
              to="/"
              className="text-sm font-bold tracking-wide uppercase text-gray-300 hover:text-white transition-colors"
            >
              Streaming Agents
            </Link>
            <span className="hidden text-xs text-gray-600 sm:inline">Fleet Dashboard</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              to="/"
              className={`text-xs transition-colors ${
                !isAdmin ? 'text-gray-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Fleet
            </Link>
            <Link
              to="/admin"
              className={`text-xs transition-colors ${
                isAdmin ? 'text-gray-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  )
}
