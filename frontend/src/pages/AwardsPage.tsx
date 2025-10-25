import type { EventData } from '@/types/robotevents'
import { Award, Users, User, CheckCircle2 } from 'lucide-react'

interface AwardsPageProps {
  event: EventData
}

export function AwardsPage({ event }: AwardsPageProps) {
  const awards = (event.awards ?? []).slice().sort((a, b) => {
    const aEx = a.title?.toLowerCase().includes('excellence')
    const bEx = b.title?.toLowerCase().includes('excellence')
    if (aEx && !bEx) return -1
    if (!aEx && bEx) return 1
    return a.title.localeCompare(b.title)
  })
  const awardsFinalized = event.awardsFinalized ?? false

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {awardsFinalized && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Awards have been finalized for this event.
            </div>
          )}

          {awards.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-white/5 bg-card/70 px-6 py-12 text-sm text-muted-foreground shadow-lg shadow-black/30">
              <Award className="h-5 w-5 text-muted-foreground" />
              <p>No awards are listed for this event yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/70 shadow-xl shadow-black/30">
              {awards.map((award) => (
                <div
                  key={award.id}
                  className="flex gap-3 border-b border-white/5 px-5 py-5 last:border-b-0 hover:bg-card/90"
                >
                  <Award className="mt-1 h-4 w-4 flex-none text-primary" />
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{award.title}</p>
                      {(award.designation || award.classification) && (
                        <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                          {[award.designation, award.classification].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    {(award.teamWinners?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/70">
                          <Users className="h-3.5 w-3.5" /> Team Winners
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {award.teamWinners.map((winner, index) => (
                            <span
                              key={`${winner.teamNumber}-${index}`}
                              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground"
                            >
                              <span className="font-mono font-semibold text-[#33b8ff]">
                                {winner.teamNumber}
                              </span>
                              {winner.teamName && (
                                <span className="ml-2 text-muted-foreground">{winner.teamName}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(award.individualWinners?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/70">
                          <User className="h-3.5 w-3.5" /> Individual Winners
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {award.individualWinners.map((winner, index) => (
                            <span
                              key={`${winner}-${index}`}
                              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground"
                            >
                              {winner}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {award.qualifies?.length ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wide text-muted-foreground/80">
                          Qualifies:
                        </span>
                        {award.qualifies.map((destination, index) => (
                          <span
                            key={`${award.id}-${destination}-${index}`}
                            className="rounded-full border border-white/10 bg-black/30 px-2 py-1"
                          >
                            {destination}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
