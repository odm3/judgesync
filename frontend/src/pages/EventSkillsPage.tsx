import type { EventData, SkillRun } from '@/types/robotevents'
import { useMemo } from 'react'

interface EventSkillsPageProps {
  event: EventData
}

interface SkillsLeaderboardRow {
  teamNumber: string
  driverAttempts: number
  driverHigh: number
  codingAttempts: number
  codingHigh: number
  totalHigh: number
}

function buildLeaderboard(skills: SkillRun[]): SkillsLeaderboardRow[] {
  const map = new Map<string, SkillsLeaderboardRow>()

  for (const run of skills) {
    const key = run.team.number
    const entry =
      map.get(key) ?? {
        teamNumber: key,
        driverAttempts: 0,
        driverHigh: 0,
        codingAttempts: 0,
        codingHigh: 0,
        totalHigh: 0,
      }

    const isDriver = (run.type || 'driver') === 'driver'
    const attempts = run.attempts ?? 0
    const score = run.score ?? 0

    if (isDriver) {
      entry.driverAttempts += attempts
      entry.driverHigh = Math.max(entry.driverHigh, score)
    } else {
      entry.codingAttempts += attempts
      entry.codingHigh = Math.max(entry.codingHigh, score)
    }

    entry.totalHigh = entry.driverHigh + entry.codingHigh
    map.set(key, entry)
  }

  return Array.from(map.values()).sort((a, b) => b.totalHigh - a.totalHigh)
}

export function EventSkillsPage({ event }: EventSkillsPageProps) {
  const leaderboard = useMemo(() => buildLeaderboard(event.skills || []), [event.skills])

  const { driverAttempts, codingAttempts } = useMemo(() => {
    const summary = { driverAttempts: 0, codingAttempts: 0 }
    for (const run of event.skills || []) {
      if ((run.type || 'driver') === 'driver') {
        summary.driverAttempts += run.attempts ?? 0
      } else {
        summary.codingAttempts += run.attempts ?? 0
      }
    }
    return summary
  }, [event.skills])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <section className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-xl shadow-black/30 backdrop-blur">
            <div className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <p className="uppercase tracking-wide text-muted-foreground/70">Driving Skills Attempts</p>
                <p className="text-base font-semibold text-foreground">{driverAttempts}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-muted-foreground/70">Autonomous Coding Attempts</p>
                <p className="text-base font-semibold text-foreground">{codingAttempts}</p>
              </div>
            </div>

            <header className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Skills Leaderboard</p>
              <h2 className="text-lg font-semibold text-foreground">
                Top Skills Runs for {event.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Totals combine the best driving and autonomous coding scores for each team.
              </p>
            </header>

            {leaderboard.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-6 text-sm text-muted-foreground">
                No skills runs have been reported for this event yet.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                      <th className="py-3 pr-4 font-medium">Team</th>
                      <th className="px-3 py-3 font-medium">Driver Attempts</th>
                      <th className="px-3 py-3 font-medium">Driver Highscore</th>
                      <th className="px-3 py-3 font-medium">Autonomous Coding Attempts</th>
                      <th className="px-3 py-3 font-medium">Autonomous Coding Highscore</th>
                      <th className="px-3 py-3 font-medium">Total Highscore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {leaderboard.map((entry, index) => (
                      <tr
                        key={entry.teamNumber}
                        className="transition-colors hover:bg-white/5"
                      >
                        <td className="py-3 pr-4 text-foreground">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground/70">#{index + 1}</span>
                            <span className="font-mono text-sm font-semibold text-[#33b8ff]">
                              {entry.teamNumber}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{entry.driverAttempts}</td>
                        <td className="px-3 py-3 text-foreground font-semibold">{entry.driverHigh}</td>
                        <td className="px-3 py-3 text-muted-foreground">{entry.codingAttempts}</td>
                        <td className="px-3 py-3 text-foreground font-semibold">{entry.codingHigh}</td>
                        <td className="px-3 py-3 text-foreground font-semibold">{entry.totalHigh}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
