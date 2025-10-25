import { useState, useMemo } from 'react'
import type { EventData } from '@/types/robotevents'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface TeamsPageProps {
  event: EventData
}

export function TeamsPage({ event }: TeamsPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return event.teams

    const query = searchQuery.toLowerCase()
    return event.teams.filter(
      (team) =>
        team.number.toLowerCase().includes(query) ||
        team.team_name.toLowerCase().includes(query) ||
        team.organization.toLowerCase().includes(query)
    )
  }, [event.teams, searchQuery])

  return (
    <div className="flex h-full flex-col">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background/95 px-4 pt-1 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-3xl">
          <div className="relative h-12">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-full w-full rounded-full border border-white/10 bg-card/80 pl-11 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none ring-0 transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* Teams List */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filteredTeams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
            No teams found
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl">
            <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/70 shadow-xl shadow-black/30">
              {filteredTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => navigate(`/${event.sku}/team/${encodeURIComponent(team.number)}`)}
                  className="flex w-full items-start justify-between gap-4 border-b border-white/5 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-card/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="space-y-1">
                    <span className="block font-mono text-sm font-semibold uppercase tracking-wide text-[#33b8ff]">
                      {team.number}
                    </span>
                    {team.team_name && (
                      <span className="block text-sm font-medium text-foreground">
                        {team.team_name}
                      </span>
                    )}
                    {team.organization && (
                      <span className="block text-xs text-muted-foreground">
                        {team.organization}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
