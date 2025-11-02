import type { EventData } from '@/types/robotevents'
import { useJudgingSession } from '@/context/JudgingSessionContext'
import { Shield, Users, UserCheck, AlertTriangle, Plus, Edit2, Trash2, X, Clock } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { InterviewTimer } from '@/components/InterviewTimer'

interface JudgeAdminPageProps {
  event: EventData
}

export function JudgeAdminPage({ event }: JudgeAdminPageProps) {
  const {
    isJudgeAdvisor,
    judgeTeams,
    teamAssignments,
    conflicts,
    participants,
  } = useJudgingSession()
  const { pushToast } = useToast()

  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [showTimer, setShowTimer] = useState(false)

  // Redirect if not judge advisor
  if (!isJudgeAdvisor) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md space-y-4 rounded-xl border border-red-500/40 bg-red-900/15 p-6 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            Only judge advisors can access the Judge Admin page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto pb-6">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-card/80 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Judge Admin</h1>
            <p className="text-sm text-muted-foreground">Manage judge teams and assignments</p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-2xl font-bold text-foreground">{judgeTeams.length}</p>
              <p className="text-xs text-muted-foreground">Judge Teams</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-green-400" />
            <div>
              <p className="text-2xl font-bold text-foreground">{teamAssignments.length}</p>
              <p className="text-xs text-muted-foreground">Team Assignments</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-card/80 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-2xl font-bold text-foreground">{conflicts.length}</p>
              <p className="text-xs text-muted-foreground">Conflicts of Interest</p>
            </div>
          </div>
        </div>
      </div>

      {/* Interview Timer Section */}
      <div className="rounded-xl border border-white/10 bg-card/80 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-foreground">Interview Timer</h2>
          </div>
          <button
            onClick={() => setShowTimer(!showTimer)}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-foreground hover:border-white/20"
          >
            {showTimer ? 'Hide' : 'Show'} Timer
          </button>
        </div>
        {showTimer && (
          <div className="mt-4">
            <InterviewTimer />
          </div>
        )}
      </div>

      {/* Judge Teams Section */}
      <div className="rounded-xl border border-white/10 bg-card/80 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Judge Teams</h2>
          <button
            onClick={() => setCreateTeamModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Team
          </button>
        </div>

        {judgeTeams.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-muted-foreground">
            No judge teams created yet. Create a team to get started.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {judgeTeams.map((team) => {
              const teamMembers = participants.filter((p) => team.judgeDeviceIds.includes(p.deviceId))
              const assignedTeams = teamAssignments.filter((a) => a.judgeTeamId === team.id)

              return (
                <div
                  key={team.id}
                  className="rounded-xl border border-white/10 bg-background/50 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{team.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {teamMembers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No judges assigned</span>
                        ) : (
                          teamMembers.map((judge) => (
                            <span
                              key={judge.deviceId}
                              className="rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-300"
                            >
                              {judge.displayName}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {assignedTeams.length} team{assignedTeams.length !== 1 ? 's' : ''} assigned
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingTeamId(team.id)
                          setCreateTeamModalOpen(true)
                        }}
                        className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-white/20 hover:text-foreground"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete judge team "${team.name}"?`)) {
                            pushToast({ title: 'Delete functionality coming soon', variant: 'info' })
                          }
                        }}
                        className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-red-400/40 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Team Assignments Section */}
      <div className="rounded-xl border border-white/10 bg-card/80 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Team Assignments</h2>
          <button
            onClick={() => setAssignmentModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Assign Team
          </button>
        </div>

        {teamAssignments.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-muted-foreground">
            No teams assigned yet. Assign competition teams to judge teams.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {teamAssignments.map((assignment) => {
              const judgeTeam = judgeTeams.find((jt) => jt.id === assignment.judgeTeamId)
              const team = event.teams.find((t) => t.number === assignment.teamNumber)
              const teamConflicts = conflicts.filter((c) => c.teamNumber === assignment.teamNumber)

              return (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-background/50 p-3"
                >
                  <div className="flex-1">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {assignment.teamNumber}
                      {team?.team_name && (
                        <span className="ml-2 font-sans text-xs text-muted-foreground">
                          {team.team_name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Assigned to:{' '}
                      <span className="text-foreground">{judgeTeam?.name || 'Unknown'}</span>
                    </p>
                    {teamConflicts.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-400">
                        {teamConflicts.length} conflict{teamConflicts.length !== 1 ? 's' : ''} of interest
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Remove assignment for ${assignment.teamNumber}?`)) {
                        pushToast({ title: 'Delete functionality coming soon', variant: 'info' })
                      }
                    }}
                    className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-red-400/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Conflicts of Interest Section */}
      <div className="rounded-xl border border-white/10 bg-card/80 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Conflicts of Interest</h2>
          <button
            onClick={() => setConflictModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-700"
          >
            <Plus className="h-4 w-4" />
            Add Conflict
          </button>
        </div>

        {conflicts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-muted-foreground">
            No conflicts of interest recorded.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {conflicts.map((conflict) => {
              const judge = participants.find((p) => p.deviceId === conflict.judgeDeviceId)
              const team = event.teams.find((t) => t.number === conflict.teamNumber)

              return (
                <div
                  key={conflict.id}
                  className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{judge?.displayName || 'Unknown Judge'}</span>
                      {' → '}
                      <span className="font-mono">{conflict.teamNumber}</span>
                      {team?.team_name && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {team.team_name}
                        </span>
                      )}
                    </p>
                    {conflict.reason && (
                      <p className="mt-1 text-xs text-muted-foreground">{conflict.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Remove this conflict of interest?')) {
                        pushToast({ title: 'Delete functionality coming soon', variant: 'info' })
                      }
                    }}
                    className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:border-red-400/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals placeholders - would be implemented next */}
      {createTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {editingTeamId ? 'Edit' : 'Create'} Judge Team
              </h3>
              <button
                onClick={() => {
                  setCreateTeamModalOpen(false)
                  setEditingTeamId(null)
                }}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Full team creation/editing UI coming soon. Will include name, description, and judge selection.
            </p>
          </div>
        </div>
      )}

      {assignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Assign Team</h3>
              <button
                onClick={() => setAssignmentModalOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Full assignment UI coming soon. Will include team selection, judge team selection, and conflict warnings.
            </p>
          </div>
        </div>
      )}

      {conflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Add Conflict of Interest</h3>
              <button
                onClick={() => setConflictModalOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Full conflict creation UI coming soon. Will include judge selection, team selection, and reason input.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
