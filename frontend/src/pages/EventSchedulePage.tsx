import { useEffect, useMemo, useState } from 'react'
import type { EventData, EventMatch } from '@/types/robotevents'
import { MatchScheduleList } from '@/components/MatchScheduleList'
import { Clock } from 'lucide-react'

interface EventSchedulePageProps {
  event: EventData
}

export function EventSchedulePage({ event }: EventSchedulePageProps) {
  const matches = useMemo(() => [...event.matches], [event.matches])
  const [countdown, setCountdown] = useState<string>('')
  const [upcomingMatch, setUpcomingMatch] = useState<EventMatch | null>(null)
  const [upcomingDate, setUpcomingDate] = useState<Date | null>(null)

  useEffect(() => {
    function updateCountdown() {
      const next = findUpcomingMatch(matches)
      setUpcomingMatch(next?.match ?? null)
      setUpcomingDate(next?.date ?? null)
      setCountdown(formatCountdown(next?.date ?? null))
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [matches])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-1">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <MatchScheduleList
            matches={matches}
            emptyMessage="Match schedule will appear here once the event publishes matches."
            currentMatchId={upcomingMatch?.id ?? null}
          />
        </div>
      </div>

      <CountdownFloatingPanel
        countdown={countdown}
        match={upcomingMatch}
        scheduledDate={upcomingDate}
      />
    </div>
  )
}

function findUpcomingMatch(matches: EventMatch[]) {
  const now = Date.now()
  const upcoming = matches
    .filter((match) => match.scheduled)
    .map((match) => ({ match, date: new Date(match.scheduled as string) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]

  return upcoming ?? null
}

function formatCountdown(target: Date | null): string {
  if (!target) return '--:--:--'

  const now = Date.now()
  const diff = target.getTime() - now

  if (diff <= 0) {
    return '00:00:00'
  }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

interface CountdownFloatingPanelProps {
  countdown: string
  match: EventMatch | null
  scheduledDate: Date | null
}

function CountdownFloatingPanel({ countdown, match, scheduledDate }: CountdownFloatingPanelProps) {
  const hasMatch = Boolean(match && scheduledDate)
  const timeLabel = scheduledDate
    ? scheduledDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 w-[min(92vw,320px)] -translate-x-1/2 sm:bottom-24 sm:left-auto sm:right-6 sm:w-80 sm:translate-x-0">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-xs shadow-lg shadow-black/40 backdrop-blur">
        <div className="flex flex-col gap-1 text-left">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            {hasMatch ? 'Next Match' : 'Upcoming Match'}
          </span>
          <span className="text-sm font-semibold text-emerald-200">
            {match?.shortName || match?.name || 'Waiting'}
          </span>
          {timeLabel && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {timeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-emerald-200">
          <Clock className="h-4 w-4" />
          <span className="font-mono text-lg font-semibold text-white">{countdown}</span>
        </div>
      </div>
    </div>
  )
}
