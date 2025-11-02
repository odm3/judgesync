import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useParams, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import type { EventData, EventMatch, SkillRun } from '@/types/robotevents'
import { MatchScheduleList } from '@/components/MatchScheduleList'
import { useTeamImages } from '@/hooks/useTeamImages'
import { useJudgingSession } from '@/context/JudgingSessionContext'
import { ArrowLeft, ClipboardList, CalendarClock, ImageIcon, Camera, Trash2, Loader, Trophy, Plus, Edit2, FileText, Award, MessageSquare } from 'lucide-react'
import { NotebookScoringModal } from '@/components/NotebookScoringModal'
import { InterviewScoringModal } from '@/components/InterviewScoringModal'
import {
  createNotebookScore,
  updateNotebookScore,
  createInterviewScore,
  updateInterviewScore,
  createJudgingNote,
  deleteJudgingNote,
  createNomination,
  deleteNomination,
} from '@/services/judging'
import { useToast } from '@/context/ToastContext'

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
  const {
    sessionCode,
    notebookScores,
    interviewScores,
    judgingNotes,
    nominations,
    judgeTeams,
    teamAssignments,
  } = useJudgingSession()
  const { pushToast } = useToast()

  const [notebookModalOpen, setNotebookModalOpen] = useState(false)
  const [interviewModalOpen, setInterviewModalOpen] = useState(false)
  const [editingNotebookScore, setEditingNotebookScore] = useState<string | null>(null)
  const [editingInterviewScore, setEditingInterviewScore] = useState<string | null>(null)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [isCreatingNote, setIsCreatingNote] = useState(false)

  // Get scores for this team
  const teamNotebookScores = notebookScores.filter((s) => s.teamNumber === team.number)
  const teamInterviewScore = interviewScores.find((s) => s.teamNumber === team.number)
  const teamNotes = judgingNotes.filter((n) => n.teamNumber === team.number)
  const teamNominations = nominations.filter((n) => n.teamNumber === team.number)

  // Get judge team assignments for this team
  const assignedJudgeTeam = teamAssignments.find((a) => a.teamNumber === team.number)
  const judgeTeamInfo = assignedJudgeTeam
    ? judgeTeams.find((jt) => jt.id === assignedJudgeTeam.judgeTeamId)
    : null

  // Award categories
  const AWARD_CATEGORIES = [
    'Excellence',
    'Design',
    'Judges',
    'Innovate',
    'Think',
    'Build',
    'Create',
    'Amaze',
    'Inspire',
  ]

  const handleSaveNotebookScore = async (data: any) => {
    if (!sessionCode) return

    try {
      if (editingNotebookScore) {
        await updateNotebookScore(sessionCode, editingNotebookScore, data)
        pushToast({ title: 'Notebook score updated', variant: 'success' })
      } else {
        await createNotebookScore(sessionCode, {
          ...data,
          judgeTeamId: judgeTeamInfo?.id || 'unknown',
          teamNumber: team.number,
        })
        pushToast({ title: 'Notebook score saved', variant: 'success' })
      }
      setNotebookModalOpen(false)
      setEditingNotebookScore(null)
    } catch (error: any) {
      pushToast({ title: 'Failed to save notebook score', description: error.message, variant: 'destructive' })
      throw error
    }
  }

  const handleSaveInterviewScore = async (data: any) => {
    if (!sessionCode) return

    try {
      if (editingInterviewScore) {
        await updateInterviewScore(sessionCode, editingInterviewScore, data)
        pushToast({ title: 'Interview score updated', variant: 'success' })
      } else {
        await createInterviewScore(sessionCode, {
          ...data,
          judgeTeamId: judgeTeamInfo?.id || 'unknown',
          teamNumber: team.number,
        })
        pushToast({ title: 'Interview score saved', variant: 'success' })
      }
      setInterviewModalOpen(false)
      setEditingInterviewScore(null)
    } catch (error: any) {
      pushToast({ title: 'Failed to save interview score', description: error.message, variant: 'destructive' })
      throw error
    }
  }

  const handleCreateNote = async () => {
    if (!sessionCode || !newNoteContent.trim()) return

    setIsCreatingNote(true)
    try {
      await createJudgingNote(sessionCode, {
        teamNumber: team.number,
        content: newNoteContent.trim(),
        category: 'general',
      })
      setNewNoteContent('')
      pushToast({ title: 'Note added', variant: 'success' })
    } catch (error: any) {
      pushToast({ title: 'Failed to create note', description: error.message, variant: 'destructive' })
    } finally {
      setIsCreatingNote(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!sessionCode) return

    try {
      await deleteJudgingNote(sessionCode, noteId)
      pushToast({ title: 'Note deleted', variant: 'success' })
    } catch (error: any) {
      pushToast({ title: 'Failed to delete note', description: error.message, variant: 'destructive' })
    }
  }

  const handleToggleNomination = async (awardCategory: string) => {
    if (!sessionCode) return

    const existing = teamNominations.find((n) => n.awardCategory === awardCategory)

    try {
      if (existing) {
        await deleteNomination(sessionCode, existing.id)
        pushToast({ title: `${awardCategory} nomination removed`, variant: 'success' })
      } else {
        await createNomination(sessionCode, {
          teamNumber: team.number,
          awardCategory,
        })
        pushToast({ title: `${awardCategory} nomination added`, variant: 'success' })
      }
    } catch (error: any) {
      pushToast({ title: 'Failed to update nomination', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Team Assignment Info */}
      {judgeTeamInfo && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Assigned to Judge Team: <span className="text-blue-400">{judgeTeamInfo.name}</span>
          </p>
        </div>
      )}

      {/* Notebook Scores */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Engineering Notebook</h3>
          </div>
          <button
            onClick={() => {
              setEditingNotebookScore(null)
              setNotebookModalOpen(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Score
          </button>
        </div>

        {teamNotebookScores.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-sm text-muted-foreground">
            No notebook scores yet
          </div>
        ) : (
          <div className="space-y-2">
            {teamNotebookScores.map((score) => (
              <div
                key={score.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-card/50 p-4"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {score.totalScore.toFixed(2)} / 55
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {score.judgeName || 'Anonymous'} • {score.gradeLevel || 'No grade level'}
                  </p>
                  {score.digitalNotebookUrl && (
                    <a
                      href={score.digitalNotebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline"
                    >
                      View Digital Notebook
                    </a>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingNotebookScore(score.id)
                    setNotebookModalOpen(true)
                  }}
                  className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-white/20 hover:text-foreground"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Interview Score */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-400" />
            <h3 className="text-lg font-semibold text-foreground">Team Interview</h3>
          </div>
          {!teamInterviewScore ? (
            <button
              onClick={() => {
                setEditingInterviewScore(null)
                setInterviewModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Add Score
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingInterviewScore(teamInterviewScore.id)
                setInterviewModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-foreground hover:border-white/20"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>

        {teamInterviewScore ? (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-2xl font-bold text-foreground">
              {teamInterviewScore.totalScore.toFixed(2)} / 45
            </p>
            <p className="text-sm text-muted-foreground">
              {teamInterviewScore.judgeName || 'Anonymous'} •{' '}
              {teamInterviewScore.gradeLevel || 'No grade level'}
            </p>
            {teamInterviewScore.specialAttributes && (
              <p className="mt-2 text-sm text-foreground">
                <span className="font-medium">Special Attributes:</span>{' '}
                {teamInterviewScore.specialAttributes}
              </p>
            )}
            {teamInterviewScore.notes && (
              <p className="mt-2 text-sm text-muted-foreground">{teamInterviewScore.notes}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-sm text-muted-foreground">
            No interview score yet
          </div>
        )}
      </section>

      {/* Judging Notes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-yellow-400" />
          <h3 className="text-lg font-semibold text-foreground">Judging Notes</h3>
        </div>

        <div className="space-y-2">
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Add observation or note..."
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={handleCreateNote}
            disabled={!newNoteContent.trim() || isCreatingNote}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isCreatingNote ? 'Adding...' : 'Add Note'}
          </button>
        </div>

        {teamNotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-sm text-muted-foreground">
            No notes yet
          </div>
        ) : (
          <div className="space-y-2">
            {teamNotes.map((note) => (
              <div
                key={note.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-card/50 p-3"
              >
                <div className="flex-1">
                  <p className="text-sm text-foreground">{note.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="rounded-lg border border-white/10 p-1.5 text-muted-foreground hover:border-red-400/40 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Award Nominations */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-foreground">Award Nominations</h3>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AWARD_CATEGORIES.map((award) => {
            const isNominated = teamNominations.some((n) => n.awardCategory === award)
            return (
              <button
                key={award}
                onClick={() => handleToggleNomination(award)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  isNominated
                    ? 'border-purple-500/50 bg-purple-500/20 text-purple-300'
                    : 'border-white/10 bg-card/50 text-muted-foreground hover:border-white/20 hover:text-foreground',
                ].join(' ')}
              >
                {award}
              </button>
            )
          })}
        </div>
      </section>

      {/* Modals */}
      <NotebookScoringModal
        isOpen={notebookModalOpen}
        onClose={() => {
          setNotebookModalOpen(false)
          setEditingNotebookScore(null)
        }}
        teamNumber={team.number}
        judgeTeamId={judgeTeamInfo?.id || 'unknown'}
        existingScore={
          editingNotebookScore
            ? teamNotebookScores.find((s) => s.id === editingNotebookScore)
            : undefined
        }
        onSave={handleSaveNotebookScore}
      />

      <InterviewScoringModal
        isOpen={interviewModalOpen}
        onClose={() => {
          setInterviewModalOpen(false)
          setEditingInterviewScore(null)
        }}
        teamNumber={team.number}
        judgeTeamId={judgeTeamInfo?.id || 'unknown'}
        existingScore={editingInterviewScore ? teamInterviewScore : undefined}
        onSave={handleSaveInterviewScore}
      />
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
