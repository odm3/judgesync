import type { EventMatch } from '@/types/robotevents'
import { cn } from '@/lib/utils'

interface MatchScheduleListProps {
  matches: EventMatch[]
  highlightTeam?: string
  emptyMessage?: string
  currentMatchId?: number | null
}

export function MatchScheduleList({
  matches,
  highlightTeam,
  emptyMessage = 'No matches scheduled yet.',
  currentMatchId = null,
}: MatchScheduleListProps) {
  const sortedMatches = [...matches].sort((a, b) => {
    const aTime = a.scheduled ? new Date(a.scheduled).getTime() : Infinity
    const bTime = b.scheduled ? new Date(b.scheduled).getTime() : Infinity
    if (aTime === bTime) {
      return a.matchnum - b.matchnum
    }
    return aTime - bTime
  })

  if (sortedMatches.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/70 px-6 py-10 text-center text-sm text-muted-foreground shadow-lg shadow-black/30">
        {emptyMessage}
      </div>
    )
  }

  const normalizedHighlight = highlightTeam?.toLowerCase()

  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/70 shadow-xl shadow-black/30">
      {sortedMatches.map((match, index) => {
        const scheduledDate = match.scheduled ? new Date(match.scheduled) : null
        const timeLabel = scheduledDate
          ? scheduledDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'TBD'

        const isLast = index === sortedMatches.length - 1

        const isCurrent = currentMatchId === match.id

        return (
          <div
            key={`${match.id}-${match.matchnum}-${match.instance}`}
            className={cn(
              'relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-card/90 md:flex-row md:items-center md:gap-6',
              !isLast && 'border-b border-white/5',
              isCurrent && 'bg-card/95 ring-1 ring-emerald-400/30 shadow-[0_0_18px_rgba(94,234,212,0.25)]'
            )}
          >
            {isCurrent && (
              <span className="absolute inset-y-0 left-0 w-1 rounded-bl-xl rounded-tl-xl bg-gradient-to-b from-emerald-400 via-emerald-300 to-emerald-400" />
            )}
            <div className="flex w-full items-start justify-between gap-2 md:w-40 md:flex-col md:gap-1">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-[#34d39a]">
                  {match.shortName || match.name}
                </p>
                <p className="text-xs text-muted-foreground">{timeLabel}</p>
              </div>
              {match.division?.name && (
                <p className="text-xs text-muted-foreground/70 md:mt-auto">
                  {match.division.name}
                </p>
              )}
            </div>

            <div className="flex flex-1 flex-wrap items-stretch justify-end gap-2 md:flex-nowrap">
              {renderAlliance(match, 'red', normalizedHighlight)}
              {renderScore(match, 'red')}
              {renderScore(match, 'blue')}
              {renderAlliance(match, 'blue', normalizedHighlight, true)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function renderAlliance(
  match: EventMatch,
  color: 'red' | 'blue',
  highlightTeam?: string,
  alignRight = false
) {
  const alliance = match.alliances.find((a) => a.color === color)
  const baseClasses =
    color === 'red'
      ? 'border-red-400/40 bg-red-500/15 text-red-100'
      : 'border-sky-400/40 bg-sky-500/15 text-sky-100'

  if (!alliance) {
    return <div className={cn('flex min-w-[100px] flex-col rounded-xl border px-3 py-2', baseClasses)} />
  }

  return (
    <div
      className={cn(
        'flex min-w-[110px] flex-1 flex-col justify-center rounded-xl border px-3 py-2 text-xs font-medium uppercase tracking-wide sm:flex-none',
        baseClasses,
        alignRight ? 'items-end text-right' : 'items-start text-left'
      )}
    >
      {alliance.teams.map((team, index) => {
        const teamNumber = team.number || 'TBD'
        const isHighlighted = highlightTeam && teamNumber.toLowerCase() === highlightTeam

        return (
          <span
            key={`${team.id ?? teamNumber}-${index}`}
            className={cn(
              'font-mono text-sm leading-tight',
              isHighlighted && 'text-white drop-shadow-[0_0_6px_rgba(94,234,212,0.7)]'
            )}
          >
            {teamNumber}
          </span>
        )
      })}
    </div>
  )
}

function renderScore(match: EventMatch, color: 'red' | 'blue') {
  const alliance = match.alliances.find((a) => a.color === color)
  const score = alliance?.score ?? 0
  const scoreClasses =
    color === 'red'
      ? 'border-red-400/40 bg-red-500/20 text-red-100'
      : 'border-sky-400/40 bg-sky-500/20 text-sky-100'

  return (
    <div
      className={cn(
        'flex h-full min-w-[50px] items-center justify-center rounded-xl border px-3 text-base font-semibold',
        scoreClasses
      )}
    >
      {score}
    </div>
  )
}
