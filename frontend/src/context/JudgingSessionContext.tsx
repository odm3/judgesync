import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { socketService } from '@/services/socket'
import { approveJoinOtp } from '@/services/sharing'
import { getDeviceId } from '@/lib/device'

export type JudgingRole =
  | 'viewer'
  | 'judge'
  | 'judge_advisor'
  | 'head_referee'
  | 'field_staff'
  | 'event_partner'

interface JudgingSessionContextValue {
  role: JudgingRole
  sessionCode: string | null
  sessionInfo: SharingSessionInfo | null
  participants: SharingParticipant[]
  pendingJoinRequests: PendingJoinRequest[]
  fieldNotes: SharingFieldNote[]
  socketConnected: boolean
  isJudge: boolean
  isJudgeAdvisor: boolean
  hasJudgeAccess: boolean
  canManageFieldNotes: boolean
  // Judging System
  judgeTeams: JudgeTeam[]
  teamAssignments: TeamAssignment[]
  conflicts: ConflictOfInterest[]
  notebookScores: NotebookScore[]
  interviewScores: InterviewScore[]
  nominations: TeamNomination[]
  timer: TimerSettings | null
  teamPhotos: TeamPhoto[]
  judgingNotes: TeamJudgingNote[]
  setRole: (role: JudgingRole) => void
  setSessionCode: (code: string | null) => void
  setSessionInfo: (info: SharingSessionInfo | null) => void
  approveJoinRequest: (otp: string) => Promise<void>
  resetSession: () => void
}

const JudgingSessionContext = createContext<JudgingSessionContextValue | undefined>(undefined)

const STORAGE_KEY = 'judgesync:judging-session'

export interface SharingSessionInfo {
  sessionId: string
  sessionCode: string
  eventSku: string
  createdAt?: number
  judgeAdvisorDeviceId: string | null
  participants: SharingParticipant[]
  pendingOtps: PendingJoinRequest[]
  fieldNotes: SharingFieldNote[]
}

export interface SharingParticipant {
  id: string
  deviceId: string
  displayName: string
  role: JudgingRole
  connected: boolean
  joinedAt: number
  lastSeen: number
}

export interface PendingJoinRequest {
  otp: string
  deviceId: string
  displayName: string
  requestedRole: 'judge' | 'viewer'
  createdAt: number
  expiresAt: number
}

export interface SharingFieldNote {
  id: number
  sessionId: string
  eventSku: string
  reporterDeviceId: string
  reporterName: string
  reporterRole: JudgingRole
  division: string
  fieldLocation: string
  matchIdentifier: string
  teamsInvolved: string
  issueSummary: string
  priority: 'normal' | 'urgent'
  sentiment: 'positive' | 'negative'
  resolved: boolean
  createdAt: number
  updatedAt: number
}

// Judging System Types
export interface JudgeTeam {
  id: string
  sessionId: string
  name: string
  judgeDeviceIds: string[]
  createdAt: number
  updatedAt: number
}

export interface TeamAssignment {
  id: string
  sessionId: string
  judgeTeamId: string
  teamNumber: string
  createdAt: number
}

export interface ConflictOfInterest {
  id: string
  sessionId: string
  judgeDeviceId: string
  teamNumber: string
  reason?: string
  createdBy: 'judge' | 'judge_advisor'
  createdAt: number
}

export interface NotebookScore {
  id: string
  sessionId: string
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number>
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  digitalNotebookUrl?: string
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface InterviewScore {
  id: string
  sessionId: string
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number>
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  specialAttributes?: string
  interviewDuration?: number
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface TeamNomination {
  id: string
  sessionId: string
  judgeTeamId: string
  teamNumber: string
  awardCategory: string
  notes?: string
  createdAt: number
  createdBy: string
}

export interface TimerSettings {
  sessionId: string
  defaultDuration: number
  currentDuration: number
  isRunning: boolean
  isPaused: boolean
  startedAt?: number
  pausedAt?: number
  updatedAt: number
  updatedBy: string
}

export interface TeamPhoto {
  id: string
  sessionId: string
  teamNumber: string
  judgeTeamId?: string
  url: string
  caption?: string
  createdAt: number
  createdBy: string
}

export interface TeamJudgingNote {
  id: string
  sessionId: string
  judgeTeamId: string
  teamNumber: string
  content: string
  createdAt: number
  updatedAt: number
  createdBy: string
}

export function normalizeSharingSession(session: SharingSessionInfo): SharingSessionInfo {
  const participantMap = new Map<string, SharingParticipant>()
  for (const participant of session.participants ?? []) {
    participantMap.set(participant.deviceId, participant)
  }
  const participants = Array.from(participantMap.values()).sort((a, b) => {
    const rolePriority: Record<JudgingRole, number> = {
      judge_advisor: 0,
      judge: 1,
      head_referee: 2,
      field_staff: 3,
      event_partner: 4,
      viewer: 5,
    }
    const priorityDiff = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
    if (priorityDiff !== 0) return priorityDiff
    return (a.displayName || '').localeCompare(b.displayName || '')
  })

  const pendingMap = new Map<string, PendingJoinRequest>()
  for (const pending of session.pendingOtps ?? []) {
    pendingMap.set(pending.otp, pending)
  }
  const pendingOtps = Array.from(pendingMap.values()).sort((a, b) => a.createdAt - b.createdAt)

  const noteMap = new Map<number, SharingFieldNote>()
  for (const note of session.fieldNotes ?? []) {
    noteMap.set(note.id, note)
  }
  const fieldNotes = Array.from(noteMap.values()).sort((a, b) => b.createdAt - a.createdAt)

  return {
    ...session,
    participants,
    pendingOtps,
    fieldNotes,
  }
}

export function JudgingSessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<JudgingRole>('viewer')
  const [sessionCode, setSessionCodeState] = useState<string | null>(null)
  const [sessionInfo, setSessionInfoState] = useState<SharingSessionInfo | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const deviceId = useMemo(() => getDeviceId(), [])

  // Judging System State
  const [judgeTeams, setJudgeTeams] = useState<JudgeTeam[]>([])
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([])
  const [conflicts, setConflicts] = useState<ConflictOfInterest[]>([])
  const [notebookScores, setNotebookScores] = useState<NotebookScore[]>([])
  const [interviewScores, setInterviewScores] = useState<InterviewScore[]>([])
  const [nominations, setNominations] = useState<TeamNomination[]>([])
  const [timer, setTimer] = useState<TimerSettings | null>(null)
  const [teamPhotos, setTeamPhotos] = useState<TeamPhoto[]>([])
  const [judgingNotes, setJudgingNotes] = useState<TeamJudgingNote[]>([])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as {
          role?: JudgingRole
          sessionCode?: string
          sessionInfo?: SharingSessionInfo | null
        }
        if (parsed.role) setRoleState(parsed.role)
        if (parsed.sessionCode) setSessionCodeState(parsed.sessionCode)
        if (parsed.sessionInfo) setSessionInfoState(normalizeSharingSession(parsed.sessionInfo))
      }
    } catch (error) {
      console.error('Failed to restore judging session', error)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ role, sessionCode, sessionInfo }),
      )
    } catch (error) {
      console.error('Failed to persist judging session', error)
    }
  }, [role, sessionCode, sessionInfo])

  const setRole = (nextRole: JudgingRole) => {
    setRoleState(nextRole)
  }

  const setSessionCode = (code: string | null) => {
    setSessionCodeState(code)
  }

  const setSessionInfo = (info: SharingSessionInfo | null) => {
    setSessionInfoState(info ? normalizeSharingSession(info) : null)
  }

  const resetSession = () => {
    setRoleState('viewer')
    setSessionCodeState(null)
    setSessionInfoState(null)
    socketService.leaveSession()
    setSocketConnected(false)
  }

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SHARING_API ?? 'http://localhost:8787'

    if (!sessionCode) {
      socketService.leaveSession()
      setSocketConnected(false)
      return
    }

    setSessionInfoState((prev) => (prev && prev.sessionCode === sessionCode ? prev : null))
    socketService.connect(serverUrl, deviceId)

    const mergeParticipant = (participant: SharingParticipant) => {
      setSessionInfoState((prev) => {
        if (!prev || prev.sessionCode !== sessionCode) return prev
        const exists = prev.participants.some((p) => p.deviceId === participant.deviceId)
        const participants = exists
          ? prev.participants.map((p) => (p.deviceId === participant.deviceId ? participant : p))
          : [...prev.participants, participant]
        return normalizeSharingSession({
          ...prev,
          participants,
        })
      })
    }

    const handleConnect = () => {
      setSocketConnected(true)
      socketService.joinSession(sessionCode, deviceId)
      socketService.requestSnapshot(sessionCode)
    }

    const handleDisconnect = () => {
      setSocketConnected(false)
    }

    const handleSessionState = (payload: SharingSessionInfo) => {
      setSessionInfoState(normalizeSharingSession(payload))
    }

    const handleJoinPending = (payload: { otp: PendingJoinRequest }) => {
      setSessionInfoState((prev) => {
        if (!prev || prev.sessionCode !== sessionCode) return prev
        const existing = prev.pendingOtps.filter((item) => item.otp !== payload.otp.otp)
        return normalizeSharingSession({
          ...prev,
          pendingOtps: [...existing, payload.otp],
        })
      })
    }

    const upsertFieldNote = (note: SharingFieldNote) => {
      setSessionInfoState((prev) => {
        if (!prev || prev.sessionCode !== sessionCode) return prev
        const remaining = prev.fieldNotes.filter((item) => item.id !== note.id)
        return normalizeSharingSession({
          ...prev,
          fieldNotes: [note, ...remaining],
        })
      })
    }

    const handleFieldNoteCreated = (payload: { fieldNote: SharingFieldNote }) => {
      upsertFieldNote(payload.fieldNote)
    }

    const handleFieldNoteUpdated = (payload: { fieldNote: SharingFieldNote }) => {
      upsertFieldNote(payload.fieldNote)
    }

    // Judging System Event Handlers
    const handleJudgeTeamCreated = (payload: { judgeTeam: JudgeTeam }) => {
      setJudgeTeams((prev) => [payload.judgeTeam, ...prev.filter((t) => t.id !== payload.judgeTeam.id)])
    }

    const handleJudgeTeamUpdated = (payload: { judgeTeam: JudgeTeam }) => {
      setJudgeTeams((prev) => prev.map((t) => (t.id === payload.judgeTeam.id ? payload.judgeTeam : t)))
    }

    const handleJudgeTeamDeleted = (payload: { teamId: string }) => {
      setJudgeTeams((prev) => prev.filter((t) => t.id !== payload.teamId))
    }

    const handleTeamAssignmentCreated = (payload: { assignment: TeamAssignment }) => {
      setTeamAssignments((prev) => [payload.assignment, ...prev.filter((a) => a.id !== payload.assignment.id)])
    }

    const handleTeamAssignmentDeleted = (payload: { assignmentId: string }) => {
      setTeamAssignments((prev) => prev.filter((a) => a.id !== payload.assignmentId))
    }

    const handleConflictCreated = (payload: { conflict: ConflictOfInterest }) => {
      setConflicts((prev) => [payload.conflict, ...prev.filter((c) => c.id !== payload.conflict.id)])
    }

    const handleConflictDeleted = (payload: { conflictId: string }) => {
      setConflicts((prev) => prev.filter((c) => c.id !== payload.conflictId))
    }

    const handleNotebookScoreCreated = (payload: { score: NotebookScore }) => {
      setNotebookScores((prev) => [payload.score, ...prev.filter((s) => s.id !== payload.score.id)])
    }

    const handleNotebookScoreUpdated = (payload: { score: NotebookScore }) => {
      setNotebookScores((prev) => prev.map((s) => (s.id === payload.score.id ? payload.score : s)))
    }

    const handleNotebookScoreDeleted = (payload: { scoreId: string }) => {
      setNotebookScores((prev) => prev.filter((s) => s.id !== payload.scoreId))
    }

    const handleInterviewScoreCreated = (payload: { score: InterviewScore }) => {
      setInterviewScores((prev) => [payload.score, ...prev.filter((s) => s.id !== payload.score.id)])
    }

    const handleInterviewScoreUpdated = (payload: { score: InterviewScore }) => {
      setInterviewScores((prev) => prev.map((s) => (s.id === payload.score.id ? payload.score : s)))
    }

    const handleInterviewScoreDeleted = (payload: { scoreId: string }) => {
      setInterviewScores((prev) => prev.filter((s) => s.id !== payload.scoreId))
    }

    const handleNominationCreated = (payload: { nomination: TeamNomination }) => {
      setNominations((prev) => [payload.nomination, ...prev.filter((n) => n.id !== payload.nomination.id)])
    }

    const handleNominationDeleted = (payload: { nominationId: string }) => {
      setNominations((prev) => prev.filter((n) => n.id !== payload.nominationId))
    }

    const handleTimerUpdated = (payload: { timer: TimerSettings }) => {
      setTimer(payload.timer)
    }

    const handleTeamPhotoCreated = (payload: { photo: TeamPhoto }) => {
      setTeamPhotos((prev) => [payload.photo, ...prev.filter((p) => p.id !== payload.photo.id)])
    }

    const handleTeamPhotoDeleted = (payload: { photoId: string }) => {
      setTeamPhotos((prev) => prev.filter((p) => p.id !== payload.photoId))
    }

    const handleJudgingNoteCreated = (payload: { note: TeamJudgingNote }) => {
      setJudgingNotes((prev) => [payload.note, ...prev.filter((n) => n.id !== payload.note.id)])
    }

    const handleJudgingNoteUpdated = (payload: { note: TeamJudgingNote }) => {
      setJudgingNotes((prev) => prev.map((n) => (n.id === payload.note.id ? payload.note : n)))
    }

    const handleJudgingNoteDeleted = (payload: { noteId: string }) => {
      setJudgingNotes((prev) => prev.filter((n) => n.id !== payload.noteId))
    }

    const handleParticipantRole = (payload: { participant: SharingParticipant; session: SharingSessionInfo }) => {
      mergeParticipant(payload.participant)
      setSessionInfoState(normalizeSharingSession(payload.session))
    }

    const handleParticipantRemoved = (payload: { deviceId: string; session: SharingSessionInfo }) => {
      setSessionInfoState((prev) => {
        if (!prev || prev.sessionCode !== sessionCode) return prev
        if (payload.deviceId === deviceId) {
          resetSession()
          return null
        }
        return normalizeSharingSession(payload.session)
      })
    }

    const handleOtpRejected = (payload: { deviceId: string; reason: string; otp: string }) => {
      // Remove rejected OTP from pending list
      setSessionInfoState((prev) => {
        if (!prev || prev.sessionCode !== sessionCode) return prev
        const remaining = prev.pendingOtps.filter((item) => item.otp !== payload.otp)
        return normalizeSharingSession({
          ...prev,
          pendingOtps: remaining,
        })
      })
    }

    socketService.on('session:state', handleSessionState)
    socketService.on('join_request_pending', handleJoinPending)
    const connectedHandler = (data: { participant: SharingParticipant }) => mergeParticipant(data.participant)
    const joinedHandler = (payload: { participant: SharingParticipant; session: SharingSessionInfo }) => {
      setSessionInfoState(normalizeSharingSession(payload.session))
    }
    const disconnectedHandler = (payload: { deviceId: string; participant?: SharingParticipant }) => {
      if (!payload.participant) return
      mergeParticipant(payload.participant)
    }

    socketService.on('participant:connected', connectedHandler)
    socketService.on('participant:joined', joinedHandler)
    socketService.on('participant:disconnected', disconnectedHandler)
    socketService.on('participant:role', handleParticipantRole)
    socketService.on('participant:removed', handleParticipantRemoved)
    socketService.on('otp:rejected', handleOtpRejected)
    socketService.on('field_note:created', handleFieldNoteCreated)
    socketService.on('field_note:updated', handleFieldNoteUpdated)

    // Judging System Events
    socketService.on('judge_team:created', handleJudgeTeamCreated)
    socketService.on('judge_team:updated', handleJudgeTeamUpdated)
    socketService.on('judge_team:deleted', handleJudgeTeamDeleted)
    socketService.on('team_assignment:created', handleTeamAssignmentCreated)
    socketService.on('team_assignment:deleted', handleTeamAssignmentDeleted)
    socketService.on('conflict:created', handleConflictCreated)
    socketService.on('conflict:deleted', handleConflictDeleted)
    socketService.on('notebook_score:created', handleNotebookScoreCreated)
    socketService.on('notebook_score:updated', handleNotebookScoreUpdated)
    socketService.on('notebook_score:deleted', handleNotebookScoreDeleted)
    socketService.on('interview_score:created', handleInterviewScoreCreated)
    socketService.on('interview_score:updated', handleInterviewScoreUpdated)
    socketService.on('interview_score:deleted', handleInterviewScoreDeleted)
    socketService.on('nomination:created', handleNominationCreated)
    socketService.on('nomination:deleted', handleNominationDeleted)
    socketService.on('timer:updated', handleTimerUpdated)
    socketService.on('team_photo:created', handleTeamPhotoCreated)
    socketService.on('team_photo:deleted', handleTeamPhotoDeleted)
    socketService.on('judging_note:created', handleJudgingNoteCreated)
    socketService.on('judging_note:updated', handleJudgingNoteUpdated)
    socketService.on('judging_note:deleted', handleJudgingNoteDeleted)

    socketService.onConnect(handleConnect)
    socketService.onDisconnect(handleDisconnect)

    // join immediately if already connected
    if (socketService) {
      socketService.joinSession(sessionCode, deviceId)
    }

    return () => {
      socketService.off('session:state', handleSessionState)
      socketService.off('join_request_pending', handleJoinPending)
      socketService.off('participant:connected', connectedHandler)
      socketService.off('participant:joined', joinedHandler)
      socketService.off('participant:disconnected', disconnectedHandler)
      socketService.off('participant:role', handleParticipantRole)
      socketService.off('participant:removed', handleParticipantRemoved)
      socketService.off('otp:rejected', handleOtpRejected)
      socketService.off('field_note:created', handleFieldNoteCreated)
      socketService.off('field_note:updated', handleFieldNoteUpdated)

      // Judging System Events Cleanup
      socketService.off('judge_team:created', handleJudgeTeamCreated)
      socketService.off('judge_team:updated', handleJudgeTeamUpdated)
      socketService.off('judge_team:deleted', handleJudgeTeamDeleted)
      socketService.off('team_assignment:created', handleTeamAssignmentCreated)
      socketService.off('team_assignment:deleted', handleTeamAssignmentDeleted)
      socketService.off('conflict:created', handleConflictCreated)
      socketService.off('conflict:deleted', handleConflictDeleted)
      socketService.off('notebook_score:created', handleNotebookScoreCreated)
      socketService.off('notebook_score:updated', handleNotebookScoreUpdated)
      socketService.off('notebook_score:deleted', handleNotebookScoreDeleted)
      socketService.off('interview_score:created', handleInterviewScoreCreated)
      socketService.off('interview_score:updated', handleInterviewScoreUpdated)
      socketService.off('interview_score:deleted', handleInterviewScoreDeleted)
      socketService.off('nomination:created', handleNominationCreated)
      socketService.off('nomination:deleted', handleNominationDeleted)
      socketService.off('timer:updated', handleTimerUpdated)
      socketService.off('team_photo:created', handleTeamPhotoCreated)
      socketService.off('team_photo:deleted', handleTeamPhotoDeleted)
      socketService.off('judging_note:created', handleJudgingNoteCreated)
      socketService.off('judging_note:updated', handleJudgingNoteUpdated)
      socketService.off('judging_note:deleted', handleJudgingNoteDeleted)

      socketService.offConnect(handleConnect)
      socketService.offDisconnect(handleDisconnect)
    }
  }, [sessionCode, deviceId])

  useEffect(() => {
    if (!sessionInfo) return
    const participant = sessionInfo.participants.find((p) => p.deviceId === deviceId)
    if (participant) {
      setRoleState(participant.role)
    } else if (role !== 'viewer') {
      setRoleState('viewer')
    }
  }, [sessionInfo, deviceId, role])

  const approveJoinRequest = async (otp: string) => {
    if (!sessionCode) return
    const result = await approveJoinOtp(sessionCode, otp)
    setSessionInfoState(normalizeSharingSession(result.session))
  }

  const value = useMemo<JudgingSessionContextValue>(() => {
    const isJudgeAdvisor = role === 'judge_advisor'
    const isJudge = role === 'judge' || isJudgeAdvisor
    const canManageFieldNotes =
      isJudge ||
      role === 'head_referee' ||
      role === 'field_staff' ||
      role === 'event_partner'
    const participants = sessionInfo?.participants ?? []
    const pendingJoinRequests = sessionInfo?.pendingOtps ?? []
    const fieldNotes = sessionInfo?.fieldNotes ?? []
    return {
      role,
      sessionCode,
      sessionInfo,
      participants,
      pendingJoinRequests,
      fieldNotes,
      socketConnected,
      isJudge,
      isJudgeAdvisor,
      hasJudgeAccess: isJudge,
      canManageFieldNotes,
      // Judging System
      judgeTeams,
      teamAssignments,
      conflicts,
      notebookScores,
      interviewScores,
      nominations,
      timer,
      teamPhotos,
      judgingNotes,
      setRole,
      setSessionCode,
      setSessionInfo,
      approveJoinRequest,
      resetSession,
    }
  }, [
    role,
    sessionCode,
    sessionInfo,
    socketConnected,
    judgeTeams,
    teamAssignments,
    conflicts,
    notebookScores,
    interviewScores,
    nominations,
    timer,
    teamPhotos,
    judgingNotes,
  ])

  return (
    <JudgingSessionContext.Provider value={value}>
      {children}
    </JudgingSessionContext.Provider>
  )
}

export function useJudgingSession() {
  const context = useContext(JudgingSessionContext)
  if (!context) {
    throw new Error('useJudgingSession must be used within a JudgingSessionProvider')
  }
  return context
}
