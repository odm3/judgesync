import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface TabsProps {
  tabs: {
    label: string
    path: string
    icon?: React.ReactNode
    external?: boolean
    matchPaths?: string[]
  }[]
}

export function Tabs({ tabs }: TabsProps) {
  const location = useLocation()

  return (
    <div className="w-full border-t border-white/5 bg-black/80 backdrop-blur supports-[backdrop-filter]:bg-black/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-around px-4">
        {tabs.map((tab) => {
          const isActive = tab.external
            ? false
            : tab.matchPaths?.some((match) => location.pathname.startsWith(match)) ??
              (location.pathname === tab.path)

          if (tab.external) {
            return (
              <a
                key={tab.path}
                href={tab.path}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </a>
            )
          }

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                isActive
                  ? 'text-emerald-200 drop-shadow-[0_0_6px_rgba(94,234,212,0.6)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute inset-x-7 bottom-1 h-1 rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-400 shadow-[0_0_18px_rgba(94,234,212,0.75)]" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
