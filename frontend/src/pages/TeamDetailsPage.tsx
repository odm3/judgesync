import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useParams, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import type { EventData, EventMatch, SkillRun } from '@/types/robotevents'
import { MatchScheduleList } from '@/components/MatchScheduleList'
import { useTeamImages } from '@/hooks/useTeamImages'
import { useJudgingSession } from '@/context/JudgingSessionContext'
import { ArrowLeft, ClipboardList, CalendarClock, ImageIcon, Camera, Trash2, Loader, Trophy } from 'lucide-react'

interface TeamDetailsPageProps {
  event: EventData
}

export function TeamDetailsPage({ event }: TeamDetailsPageProps) {
  const navigate = useNavigate()
  const { teamNumber: rawTeamNumber } = useParams<{ teamNumber: string }>()
  const teamNumber = decodeURIComponent(rawTeamNumber ?? '').toUpperCase()
  const { hasJudgeAccess } = useJudgingSession()

  const team = useMemo(
    () => event.teams.find((t) => t.number.toUpperCase() === teamNumber),
    [event.teams, teamNumber]
  )

  const teamMatches = useMemo<EventMatch[]>(() => {
    const target = teamNumber.toLowerCase()
    return event.matches.filter((match) =>
      match.alliances.some((alliance) =>
        alliance.teams.some((teamEntry) => (teamEntry.number || '').toLowerCase() === target)
      )
    )
  }, [event.matches, teamNumber])

  const teamSkills = useMemo<SkillRun[]>(() => {
    const target = teamNumber.toLowerCase()
    return (event.skills || []).filter(
      (skill) => (skill.team.number || '').toLowerCase() === target
    )
  }, [event.skills, teamNumber])

  const eventLocation = useMemo(() => {
    const parts = [
      event.location.city,
      event.location.region,
      event.location.country,
    ].filter(Boolean)
    return parts.join(', ')
  }, [event.location.city, event.location.region, event.location.country])

  const tabs = [
    hasJudgeAccess && {
      label: 'Judging Information',
      path: `/${event.sku}/team/${encodeURIComponent(teamNumber)}/judging`,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      label: 'Schedule',
      path: `/${event.sku}/team/${encodeURIComponent(teamNumber)}/schedule`,
      icon: <CalendarClock className="h-4 w-4" />,
    },
    {
      label: 'Skills',
      path: `/${event.sku}/team/${encodeURIComponent(teamNumber)}/skills`,
      icon: <Trophy className="h-4 w-4" />,
    },
    hasJudgeAccess && {
      label: 'Images',
      path: `/${event.sku}/team/${encodeURIComponent(teamNumber)}/images`,
      icon: <ImageIcon className="h-4 w-4" />,
    },
  ].filter(Boolean) as {
    label: string
    path: string
    icon: ReactNode
  }[]

  if (!team) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
        <p>No team data found for {teamNumber}.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-foreground transition hover:border-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to teams
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Header */}
          <section className="space-y-4 rounded-2xl border border-white/5 bg-card/85 px-6 py-5 shadow-xl shadow-black/30 backdrop-blur">
            <button
              type="button"
              onClick={() => navigate(`/${event.sku}/teams`)}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Teams
            </button>
            <div className="space-y-2">
              <p className="font-mono text-sm font-semibold uppercase tracking-wide text-[#33b8ff]">
                {team.number}
              </p>
              {team.team_name && (
                <h2 className="text-xl font-semibold text-foreground">
                  {team.team_name}
                </h2>
              )}
              {team.organization && (
                <p className="text-sm text-muted-foreground">{team.organization}</p>
              )}
              {eventLocation && (
                <p className="text-xs text-muted-foreground/70">{eventLocation}</p>
              )}
            </div>
          </section>

          {/* Local Tabs */}
          <nav className="flex gap-2 overflow-x-auto rounded-xl border border-white/5 bg-black/40 p-1 shadow-inner shadow-black/40">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  [
                    'flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition',
                    isActive
                      ? 'bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 text-black shadow-[0_0_12px_rgba(94,234,212,0.6)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                  ].join(' ')
                }
              >
                {tab.icon}
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Nested Routes */}
          <div className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-lg shadow-black/30 backdrop-blur">
            <Routes>
              <Route
                index
                element={
                  hasJudgeAccess ? (
                    <Navigate to="judging" replace />
                  ) : (
                    <Navigate to="skills" replace />
                  )
                }
              />
              <Route
                path="judging"
                element={
                  hasJudgeAccess ? (
                    <JudgingInformation team={team} />
                  ) : (
                    <RestrictedNotice />
                  )
                }
              />
              <Route
                path="schedule"
                element={
                  <ScheduleInfo
                    team={team}
                    matches={teamMatches}
                    highlightTeam={team.number}
                  />
                }
              />
              <Route
                path="skills"
                element={<TeamSkillsInfo team={team} skills={teamSkills} />}
              />
              <Route
                path="images"
                element={
                  hasJudgeAccess ? (
                    <ImagesGallery team={team} eventSku={event.sku} />
                  ) : (
                    <RestrictedNotice />
                  )
                }
              />
              <Route
                path="*"
                element={
                  hasJudgeAccess ? (
                    <Navigate to="judging" replace />
                  ) : (
                    <Navigate to="skills" replace />
                  )
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TeamInfoProps {
  team: EventData['teams'][number]
}

interface TeamScheduleProps extends TeamInfoProps {
  matches: EventMatch[]
  highlightTeam: string
}

interface TeamImagesProps extends TeamInfoProps {
  eventSku: string
}

interface TeamSkillsProps extends TeamInfoProps {
  skills: SkillRun[]
}

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-6 text-sm text-muted-foreground">
      Access to this section is limited to Judges and Judge Advisors. Join the judging session to
      continue.
    </div>
  )
}

function JudgingInformation({ team }: TeamInfoProps) {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p className="text-base font-semibold text-foreground">Judging Notes</p>
      <p>
        Keep track of notebooks, interview scores, and key observations for {team.team_name || team.number}.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Notebook submitted: <span className="font-medium text-foreground">Pending</span></li>
        <li>Interview scheduled: <span className="font-medium text-foreground">TBD</span></li>
        <li>Judging comments will appear here.</li>
      </ul>
    </div>
  )
}

function ScheduleInfo({ team, matches, highlightTeam }: TeamScheduleProps) {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p className="text-base font-semibold text-foreground">Match Schedule</p>
      <p>
        Upcoming qualification and elimination matches for {team.team_name || team.number}.
      </p>
      <MatchScheduleList
        matches={matches}
        highlightTeam={highlightTeam}
        emptyMessage="No matches scheduled for this team yet."
      />
    </div>
  )
}

function formatSkillType(type: string) {
  switch (type) {
    case 'driver':
      return 'Driver'
    case 'programming':
      return 'Programming'
    case 'package_delivery_time':
      return 'Delivery'
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

function TeamSkillsInfo({ skills, team }: TeamSkillsProps) {
  const sortedRuns = useMemo(() => {
    return [...skills].sort((a, b) => {
      const aTime = a.created ? new Date(a.created).getTime() : 0
      const bTime = b.created ? new Date(b.created).getTime() : 0
      return bTime - aTime
    })
  }, [skills])

  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-foreground">Skills Runs</p>
        <p>
          Tracking driver and programming skills attempts for {team.team_name || team.number}.
        </p>
      </div>

      {sortedRuns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">No skills runs</p>
          <p className="mt-2 text-sm">
            This team has not recorded any skills attempts at this event.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/70 shadow-lg shadow-black/30">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedRuns.map((run) => (
                  <tr key={run.id} className="transition-colors hover:bg-card/90">
                    <td className="px-4 py-3 text-foreground font-medium">
                      {formatSkillType(run.type || 'driver')}
                    </td>
                    <td className="px-4 py-3 text-foreground">{run.score ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground">{run.attempts ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ImagesGallery({ team, eventSku }: TeamImagesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { images, isLoading, addImage, removeImage } = useTeamImages(eventSku, team.number)

  const handleCaptureClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsSaving(true)
    try {
      await addImage(file)
    } finally {
      setIsSaving(false)
      event.target.value = ''
    }
  }

  const handleRemove = async (id: number) => {
    await removeImage(id)
  }

  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-foreground">Team Images</p>
          <p>Capture inspection photos or pit documentation for {team.team_name || team.number}.</p>
        </div>
        <button
          type="button"
          onClick={handleCaptureClick}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary/90 disabled:opacity-70"
          disabled={isSaving}
        >
          {isSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {isSaving ? 'Saving…' : 'Capture Image'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelection}
        className="hidden"
      />

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm">
          <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
          Loading images…
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">No images yet</p>
          <p className="mt-2 text-sm">
            Use the capture button to add the first image for {team.team_name || team.number}.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <figure
              key={image.id}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-lg shadow-black/30"
            >
              <img
                src={image.objectUrl}
                alt={`${team.number} captured on ${new Date(image.createdAt).toLocaleString()}`}
                className="h-40 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
              <figcaption className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground">{team.number}</p>
                  <p>{new Date(image.createdAt).toLocaleString()}</p>
                </div>
                {image.id && (
                  <button
                    type="button"
                    onClick={() => handleRemove(image.id!)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-red-400/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
