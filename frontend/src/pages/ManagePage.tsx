import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react'
import type { EventData, Team } from '@/types/robotevents'
import { ArrowRight, CheckCircle2, CircleAlert, X, Smile, Frown, Check } from 'lucide-react'
import {
  useJudgingSession,
  type JudgingRole,
  type SharingSessionInfo,
  normalizeSharingSession,
} from '@/context/JudgingSessionContext'
import { useFieldNotes } from '@/hooks/useFieldNotes'
import { useToast } from '@/context/ToastContext'
import type { FieldNoteRecord } from '@/storage/fieldNotes'
import {
  createOrGetSession,
  requestJoinOtpByEventSku,
  approveJoinOtp,
  fetchSessionStateByCode,
  fetchSessionStateBySku,
  updateParticipantRole,
  removeParticipant,
} from '@/services/sharing'
import { createConflict } from '@/services/judging'
import { getDeviceId } from '@/lib/device'

interface ManagePageProps {
  event: EventData
}

interface FieldNoteDraft {
  division: string
  fieldLocation: string
  matchIdentifier: string
  teamsInvolved: string
  issueSummary: string
  priority: 'normal' | 'urgent'
  sentiment: 'positive' | 'negative'
  reporterName: string
}

const ROLE_OPTIONS: Array<{ value: JudgingRole; label: string }> = [
  { value: 'judge_advisor', label: 'Judge Advisor' },
  { value: 'judge', label: 'Judge' },
  { value: 'head_referee', label: 'Head Referee / Division Manager' },
  { value: 'field_staff', label: 'Field Staff' },
  { value: 'event_partner', label: 'Event Partner' },
  { value: 'viewer', label: 'Guest' },
]

const JOINABLE_ROLES: Array<{ value: JudgingRole; label: string }> = [
  { value: 'judge', label: 'Judge' },
  { value: 'viewer', label: 'Guest' },
]

export function ManagePage({ event }: ManagePageProps) {
  const {
    role,
    sessionCode,
    setSessionCode,
    sessionInfo,
    setSessionInfo,
    canManageFieldNotes,
    resetSession,
    isJudgeAdvisor,
  } = useJudgingSession()
  const { pushToast } = useToast()
  const { notes, isLoading, createNote, setResolved } = useFieldNotes(event.sku)

  const deviceId = getDeviceId()

  const [advisorName, setAdvisorName] = useState('')
  const [joinRole, setJoinRole] = useState<JudgingRole>('judge')
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [joinPanelOpen, setJoinPanelOpen] = useState(false)
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [otpInfo, setOtpInfo] = useState<{ otp: string; expiresAt: number } | null>(null)
  const [joinConflicts, setJoinConflicts] = useState<string[]>([])
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteOtp, setInviteOtp] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [updatingParticipantRoleFor, setUpdatingParticipantRoleFor] = useState<string | null>(null)
  const [removingParticipantId, setRemovingParticipantId] = useState<string | null>(null)
  const [approvingOtp, setApprovingOtp] = useState<string | null>(null)

  const trimmedAdvisorName = advisorName.trim()
  const isAdvisorNameValid = trimmedAdvisorName.length >= 3

  const currentDisplayName = useMemo(() => {
    const participant = sessionInfo?.participants.find((p) => p.deviceId === deviceId)
    return participant?.displayName ?? joinDisplayName ?? advisorName
  }, [sessionInfo, deviceId, joinDisplayName, advisorName])
  const hasJoinedSession = useMemo(
    () => (sessionInfo?.participants ?? []).some((participant) => participant.deviceId === deviceId),
    [sessionInfo, deviceId],
  )

  useEffect(() => {
    if (role === 'judge_advisor') {
      setJoinPanelOpen(false)
    } else if (!hasJoinedSession) {
      setJoinPanelOpen(true)
    }
  }, [role, hasJoinedSession])

  const sessionCodeRef = useRef<string | null>(sessionCode)

  useEffect(() => {
    sessionCodeRef.current = sessionCode
  }, [sessionCode])

  useEffect(() => {
    if (!sessionCode) {
      setSessionInfo(null)
      return
    }

    let cancelled = false
    if (sessionInfo && sessionInfo.sessionCode === sessionCode) {
      return
    }

    fetchSessionStateByCode(sessionCode)
      .then((state) => {
        if (!cancelled && sessionCodeRef.current === sessionCode) {
          setSessionInfo(normalizeSharingSession(state))
        }
      })
      .catch((error: any) => {
        if (cancelled) return
        console.error('Failed to load session state', error)
        if (typeof error?.message === 'string' && error.message.toUpperCase().includes('SESSION NOT FOUND')) {
          if (sessionCodeRef.current === sessionCode) {
            setSessionInfo(null)
            setSessionCode(null)
            setJoinPanelOpen(true)
          }
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionCode, sessionInfo, setSessionInfo, setSessionCode])

  const [noteDraft, setNoteDraft] = useState<FieldNoteDraft>(() => ({
    division: '',
    fieldLocation: '',
    matchIdentifier: '',
    teamsInvolved: event.teams[0]?.number ?? '',
    issueSummary: '',
    priority: 'normal',
    sentiment: 'negative',
    reporterName: '',
  }))
  const [isFieldNoteOpen, setFieldNoteOpen] = useState(false)

  useEffect(() => {
    if (role === 'judge_advisor' && !noteDraft.reporterName) {
      setNoteDraft((prev) => ({ ...prev, reporterName: trimmedAdvisorName }))
    }
  }, [role, trimmedAdvisorName, noteDraft.reporterName])

  useEffect(() => {
    if (!noteDraft.teamsInvolved && event.teams.length > 0) {
      setNoteDraft((prev) => ({ ...prev, teamsInvolved: event.teams[0].number }))
    }
  }, [event.teams, noteDraft.teamsInvolved])

  const handleBeginJudging = async () => {
    if (!isAdvisorNameValid) {
      alert('Please enter your name (3+ characters)')
      return
    }

    setIsCreatingSession(true)
    try {
      const result = await createOrGetSession(event.sku, deviceId, trimmedAdvisorName, 'judge_advisor')
      setSessionCode(result.session.sessionCode)
      setSessionInfo(normalizeSharingSession(result.session))
      pushToast({
        title: 'Judging Session Created',
        description: 'Session is ready. Approve join requests as they appear.',
        variant: 'success',
        duration: 6000,
      })
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Failed to create session')
    } finally {
      setIsCreatingSession(false)
    }
  }

  const handleRequestOtp = async () => {
    if (!joinDisplayName.trim()) {
      alert('Enter your name before requesting a code.')
      return
    }
    setJoinLoading(true)
    try {
      const res = await requestJoinOtpByEventSku(event.sku, deviceId, joinDisplayName.trim(), joinRole === 'viewer' ? 'viewer' : 'judge')
      setOtpInfo({ otp: res.otp, expiresAt: res.expiresAt })
      if (!sessionInfo || sessionInfo.sessionCode !== res.sessionCode) {
        setSessionCode(res.sessionCode)
        try {
          const state = await fetchSessionStateByCode(res.sessionCode)
          setSessionInfo(normalizeSharingSession(state))
        } catch (stateError) {
          console.warn('Unable to prefetch session state', stateError)
        }
      } else {
        setSessionCode(res.sessionCode)
      }
      pushToast({
        title: 'Join Code Generated',
        description: `Share code ${res.otp} with the Judge Advisor.`,
        variant: 'info',
        duration: 8000,
      })
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Failed to generate code')
    } finally {
      setJoinLoading(false)
    }
  }

  const handleApproveOtp = async () => {
    if (!sessionCode || !inviteOtp.trim()) {
      setInviteError('Enter the code supplied by the device.')
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    try {
      const res = await approveJoinOtp(sessionCode, inviteOtp.trim())
      setSessionCode(res.session.sessionCode)
      setSessionInfo(normalizeSharingSession(res.session))
      pushToast({
        title: 'Participant Added',
        description: `${res.participant?.displayName ?? 'Participant'} has been added to the session.`,
        variant: 'success',
      })
      setInviteModalOpen(false)
      setInviteOtp('')
    } catch (error: any) {
      console.error(error)
      setInviteError(error?.message || 'Failed to approve code')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleQuickApprove = async (otp: string) => {
    if (!sessionCode) return
    setApprovingOtp(otp)
    try {
      const res = await approveJoinOtp(sessionCode, otp)
      setSessionCode(res.session.sessionCode)
      setSessionInfo(normalizeSharingSession(res.session))
      pushToast({
        title: 'Participant Added',
        description: `${res.participant?.displayName ?? 'Participant'} joined the session`,
        variant: 'success',
      })
    } catch (error: any) {
      console.error(error)
      pushToast({
        title: 'Approval Failed',
        description: error?.message || 'Failed to approve join request',
        variant: 'destructive',
      })
    } finally {
      setApprovingOtp(null)
    }
  }

  const handleParticipantRoleChange = async (participantDeviceId: string, nextRole: JudgingRole) => {
    if (!sessionInfo || participantDeviceId === deviceId && nextRole === role) return
    setUpdatingParticipantRoleFor(participantDeviceId)
    try {
      const result = await updateParticipantRole(
        sessionInfo.sessionCode,
        participantDeviceId,
        nextRole,
      )
      setSessionInfo(normalizeSharingSession(result.session))
      pushToast({
        title: 'Role Updated',
        description: `${result.participant.displayName || participantDeviceId.slice(-6)} is now ${displayRoleFor(result.participant.role)}.`,
        variant: 'success',
      })
    } catch (error: any) {
      console.error(error)
      pushToast({
        title: 'Unable to update role',
        description: error?.message ?? 'Try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingParticipantRoleFor(null)
    }
  }

  const handleRemoveParticipant = async (participantDeviceId: string) => {
    if (!sessionInfo) return
    if (!window.confirm('Remove this device from the judging session?')) return
    setRemovingParticipantId(participantDeviceId)
    try {
      const updatedSession = await removeParticipant(sessionInfo.sessionCode, participantDeviceId)
      setSessionInfo(normalizeSharingSession(updatedSession))
      pushToast({
        title: 'Participant Removed',
        description: 'The device no longer has access to this session.',
        variant: 'success',
      })
    } catch (error: any) {
      console.error(error)
      pushToast({
        title: 'Unable to remove participant',
        description: error?.message ?? 'Try again shortly.',
        variant: 'destructive',
      })
    } finally {
      setRemovingParticipantId(null)
    }
  }

  const handleCheckStatus = async () => {
    try {
      const state = sessionCode
        ? await fetchSessionStateByCode(sessionCode)
        : await fetchSessionStateBySku(event.sku)
      const normalized = normalizeSharingSession(state)
      const participant = normalized.participants.find((p) => p.deviceId === deviceId)
      if (participant) {
        setSessionCode(normalized.sessionCode)
        setSessionInfo(normalized)
        setJoinDisplayName(participant.displayName)
        setJoinRole(participant.role)

        // Create conflicts of interest if any were selected
        if (joinConflicts.length > 0 && normalized.sessionCode) {
          for (const teamNumber of joinConflicts) {
            try {
              await createConflict(normalized.sessionCode, {
                judgeDeviceId: deviceId,
                teamNumber,
                reason: 'Self-reported during join',
              })
            } catch (conflictError) {
              console.error('Failed to create conflict:', conflictError)
            }
          }
          // Clear conflicts after creating them
          setJoinConflicts([])
        }

        pushToast({
          title: 'Connected',
          description: `You are now part of the session as ${displayRoleFor(participant.role)}.`,
          variant: 'success',
        })
      } else {
        pushToast({
          title: 'Pending Approval',
          description: 'No approval yet—check with the Judge Advisor.',
          variant: 'info',
        })
      }
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Unable to check status')
    }
  }

  const handleLeaveSession = () => {
    resetSession()
    setSessionInfo(null)
    setInviteOtp('')
    setOtpInfo(null)
    setJoinDisplayName('')
    setJoinPanelOpen(false)
    setInviteModalOpen(false)
    pushToast({
      title: 'Left Session',
      description: 'This device is no longer connected to the shared workspace.',
      variant: 'info',
    })
  }

  const handleCreateNote = async () => {
    if (!noteDraft.reporterName.trim()) {
      alert('Please provide your name before submitting the field note.')
      return
    }
    if (!noteDraft.issueSummary.trim()) {
      alert('Describe the issue so the Judge Advisor can take action.')
      return
    }

    await createNote({
      reporterName: noteDraft.reporterName.trim(),
      reporterRole: role,
      division: noteDraft.division.trim(),
      fieldLocation: noteDraft.fieldLocation.trim(),
      matchIdentifier: noteDraft.matchIdentifier.trim(),
      teamsInvolved: noteDraft.teamsInvolved.trim(),
      issueSummary: noteDraft.issueSummary.trim(),
      priority: noteDraft.priority,
      sentiment: noteDraft.sentiment,
      resolved: false,
    })

    pushToast({
      title: 'Field Note Submitted',
      description: 'Judge Advisor has been notified of the new field note.',
      variant: 'info',
      duration: 6000,
    })

    setNoteDraft((prev) => ({
      division: '',
      fieldLocation: '',
      matchIdentifier: '',
      teamsInvolved: prev.teamsInvolved,
      issueSummary: '',
      priority: 'normal',
      sentiment: prev.sentiment,
      reporterName: prev.reporterName,
    }))
    setFieldNoteOpen(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-10">
        {!sessionInfo && !sessionCode && (
          <SessionSetupCard
            event={event}
            advisorName={advisorName}
            setAdvisorName={setAdvisorName}
            isAdvisorNameValid={isAdvisorNameValid}
            onBeginJudging={handleBeginJudging}
            isCreatingSession={isCreatingSession}
          />
        )}

        {sessionInfo && (
          <SharingSessionPanel
            session={sessionInfo}
            role={role}
            isJudgeAdvisor={isJudgeAdvisor}
            currentDeviceId={deviceId}
            onInvite={() => {
              setInviteError(null)
              setInviteOtp('')
              setInviteModalOpen(true)
            }}
            onLeave={handleLeaveSession}
            onChangeParticipantRole={handleParticipantRoleChange}
            onRemoveParticipant={handleRemoveParticipant}
            updatingParticipantRoleFor={updatingParticipantRoleFor}
            removingParticipantId={removingParticipantId}
            onQuickApprove={handleQuickApprove}
            approvingOtp={approvingOtp}
          />
        )}

        <JoinSessionCard
          role={role}
          isOpen={joinPanelOpen}
          onToggle={() => setJoinPanelOpen((open) => !open)}
          joinDisplayName={joinDisplayName}
          setJoinDisplayName={setJoinDisplayName}
          joinRole={joinRole}
          setJoinRole={setJoinRole}
          onRequestOtp={handleRequestOtp}
          otpInfo={otpInfo}
          joinLoading={joinLoading}
          onCheckStatus={handleCheckStatus}
          eventName={event.name}
          hasJoined={hasJoinedSession}
          teams={event.teams}
          conflicts={joinConflicts}
          setConflicts={setJoinConflicts}
        />

        <FieldNotesSection
          notes={notes}
          isLoading={isLoading}
          canManageFieldNotes={canManageFieldNotes}
          currentRole={role}
          onResolveNote={setResolved}
          onOpenModal={() => {
            setNoteDraft((prev) => ({
              division: '',
              fieldLocation: '',
              matchIdentifier: '',
              teamsInvolved: prev.teamsInvolved || (event.teams[0]?.number ?? ''),
              issueSummary: '',
              priority: 'normal',
              sentiment: prev.sentiment,
              reporterName: prev.reporterName || currentDisplayName || trimmedAdvisorName,
            }))
            setFieldNoteOpen(true)
          }}
        />

        {isFieldNoteOpen && (
          <FieldNoteFormModal
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            currentRole={role}
            onClose={() => setFieldNoteOpen(false)}
            onSubmit={handleCreateNote}
            teams={event.teams}
          />
        )}

        {inviteModalOpen && sessionCode && (
          <InviteModal
            sessionCode={sessionCode}
            otp={inviteOtp}
            setOtp={setInviteOtp}
            loading={inviteLoading}
            error={inviteError}
            onClose={() => setInviteModalOpen(false)}
            onSubmit={handleApproveOtp}
          />
        )}
      </div>
    </div>
  )
}

interface CircularTimerProps {
  expiresAt: number
  size?: number
}

function CircularTimer({ expiresAt, size = 48 }: CircularTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setRemainingSeconds(seconds)
      if (seconds <= 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt])

  if (remainingSeconds <= 0) {
    return null
  }

  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const progress = remainingSeconds / 60 // Assuming 60s total
  const strokeDashoffset = circumference * (1 - progress)
  const isUrgent = remainingSeconds <= 10

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-1000 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}
          strokeLinecap="round"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-xs font-semibold ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
        {remainingSeconds}s
      </div>
    </div>
  )
}

interface SessionSetupCardProps {
  event: EventData
  advisorName: string
  setAdvisorName: (value: string) => void
  isAdvisorNameValid: boolean
  onBeginJudging: () => void
  isCreatingSession: boolean
}

function SessionSetupCard({
  event,
  advisorName,
  setAdvisorName,
  isAdvisorNameValid,
  onBeginJudging,
  isCreatingSession,
}: SessionSetupCardProps) {
  return (
    <section className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-xl shadow-black/40 backdrop-blur">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Judging Session</p>
        <h2 className="text-lg font-semibold text-foreground">
          Coordinate judging teams for {event.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Start a shared judging workspace for this event and distribute the generated session code
          to collaborators.
        </p>
        <p className="text-xs text-muted-foreground/70">
          A session code is auto-generated for each event. Share the join code provided by other
          devices to approve them.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="advisorName"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Judge Advisor Name
          </label>
          <input
            id="advisorName"
            type="text"
            placeholder="Enter your name"
            value={advisorName}
            onChange={(e) => setAdvisorName(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-card/80 px-4 text-sm text-foreground placeholder-muted-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-muted-foreground/70">
            This device will act as <span className="text-foreground font-semibold">Judge Advisor</span> for
            the session.
          </p>
        </div>

        <button
          onClick={onBeginJudging}
          className={`h-12 w-full rounded-xl text-sm font-semibold shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed ${
            isAdvisorNameValid
              ? 'bg-emerald-500 text-emerald-950 shadow-emerald-500/30 hover:bg-emerald-400'
              : 'bg-emerald-500/20 text-emerald-100/70 shadow-black/20'
          }`}
          disabled={!isAdvisorNameValid || isCreatingSession}
        >
          {isCreatingSession ? 'Creating…' : 'Begin Judging'}
        </button>
      </div>
    </section>
  )
}

interface JoinSessionCardProps {
  role: JudgingRole
  isOpen: boolean
  onToggle: () => void
  joinDisplayName: string
  setJoinDisplayName: (value: string) => void
  joinRole: JudgingRole
  setJoinRole: (value: JudgingRole) => void
  onRequestOtp: () => void
  otpInfo: { otp: string; expiresAt: number } | null
  joinLoading: boolean
  onCheckStatus: () => void
  eventName: string
  hasJoined: boolean
  teams: Team[]
  conflicts: string[]
  setConflicts: (conflicts: string[]) => void
}

function JoinSessionCard({
  role,
  isOpen,
  onToggle,
  joinDisplayName,
  setJoinDisplayName,
  joinRole,
  setJoinRole,
  onRequestOtp,
  otpInfo,
  joinLoading,
  onCheckStatus,
  eventName,
  hasJoined,
  teams,
  conflicts,
  setConflicts,
}: JoinSessionCardProps) {
  if (role === 'judge_advisor' || hasJoined) {
    return null
  }

  const trimmedName = joinDisplayName.trim()
  const canRequestOtp = trimmedName.length > 0 && !joinLoading
  const requestButtonClass = canRequestOtp
    ? 'inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400'
    : 'inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100/60 shadow-inner shadow-black/20 transition'

  return (
    <section className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
            Join Existing Session
          </p>
          <p className="text-sm text-muted-foreground">
            Request a one-time code and share it with the Judge Advisor to join their workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-xl border border-white/10 px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-white/30 hover:text-foreground"
        >
          {isOpen ? 'Hide' : 'Join Session'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-6 space-y-5">
          <p className="text-xs text-muted-foreground/80">
            Request a six-digit code to join <span className="font-semibold text-foreground">{eventName}</span> as a{' '}
            {displayRoleFor(joinRole)} and share it with the Judge Advisor in person.
          </p>

          <FieldInput
            label="Your Name"
            value={joinDisplayName}
            onChange={setJoinDisplayName}
            placeholder="Display name"
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Desired Role
            </p>
            <select
              value={joinRole}
              onChange={(e) => setJoinRole(e.target.value as JudgingRole)}
              className="h-12 w-full rounded-xl border border-white/10 bg-card/80 px-4 text-sm text-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {JOINABLE_ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {joinRole === 'judge' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conflicts of Interest (Optional)
              </p>
              <p className="text-xs text-muted-foreground/70">
                Select any teams you are affiliated with (coach, mentor, parent, etc.)
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-card/80 p-2">
                {teams.map((team) => {
                  const isSelected = conflicts.includes(team.number)
                  return (
                    <label
                      key={team.number}
                      className={[
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                        isSelected
                          ? 'bg-red-500/20 text-foreground'
                          : 'hover:bg-white/5 text-muted-foreground',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConflicts([...conflicts, team.number])
                          } else {
                            setConflicts(conflicts.filter((t) => t !== team.number))
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-card text-primary"
                      />
                      <span className="flex-1">
                        <span className="font-mono font-semibold">{team.number}</span>
                        {team.team_name && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {team.team_name}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
              {conflicts.length > 0 && (
                <p className="text-xs text-red-400">
                  {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRequestOtp}
              disabled={!trimmedName || joinLoading}
              className={`${requestButtonClass} disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {joinLoading ? 'Generating…' : 'Request Join Code'}
            </button>
            <button
              type="button"
              onClick={onCheckStatus}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-foreground transition hover:border-white/20"
            >
              Check Status
            </button>
          </div>

          {otpInfo && (
            <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Your Code</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.5em]">{otpInfo.otp}</p>
              <p className="text-xs text-primary/80">
                Expires at {new Date(otpInfo.expiresAt).toLocaleTimeString()}.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

interface SharingSessionPanelProps {
  session: SharingSessionInfo
  role: JudgingRole
  isJudgeAdvisor: boolean
  currentDeviceId: string
  onInvite: () => void
  onLeave: () => void
  onChangeParticipantRole: (deviceId: string, role: JudgingRole) => void
  onRemoveParticipant: (deviceId: string) => void
  updatingParticipantRoleFor: string | null
  removingParticipantId: string | null
  onQuickApprove: (otp: string) => void
  approvingOtp: string | null
}

function SharingSessionPanel({
  session,
  role,
  isJudgeAdvisor,
  currentDeviceId,
  onInvite,
  onLeave,
  onChangeParticipantRole,
  onRemoveParticipant,
  updatingParticipantRoleFor,
  removingParticipantId,
  onQuickApprove,
  approvingOtp,
}: SharingSessionPanelProps) {
  const sortedParticipants = [...session.participants].sort((a, b) =>
    (a.displayName || '').localeCompare(b.displayName || '', undefined, { sensitivity: 'base' }),
  )

  return (
    <section className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-xl shadow-black/30 backdrop-blur">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Sharing</p>
          <p className="text-sm text-muted-foreground">
            Session Code:{' '}
            <span className="font-mono text-sm text-foreground">{session.sessionCode}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isJudgeAdvisor && (
            <button
              onClick={onInvite}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Invite
            </button>
          )}
          {role !== 'viewer' && (
            <button
              onClick={onLeave}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Leave
            </button>
          )}
        </div>
      </header>

      {isJudgeAdvisor && session.pendingOtps.filter((p) => p.expiresAt > Date.now()).length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Pending Approvals</p>
            <p className="text-[10px] text-amber-200/70">Codes expire in 60 seconds</p>
          </div>
          {session.pendingOtps
            .filter((p) => p.expiresAt > Date.now())
            .map((pending) => (
              <div
                key={pending.otp}
                className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
              >
                <CircularTimer expiresAt={pending.expiresAt} size={48} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-100">
                    {pending.displayName || `Device ${pending.deviceId.slice(-6)}`}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        pending.requestedRole === 'judge'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'bg-slate-500/20 text-slate-200'
                      }`}
                    >
                      {displayRoleFor(pending.requestedRole)}
                    </span>
                    <span className="font-mono text-xs text-amber-200/70">{pending.otp}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onQuickApprove(pending.otp)}
                  disabled={approvingOtp === pending.otp}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {approvingOtp === pending.otp ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-950 border-t-transparent" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                </button>
              </div>
            ))}
        </div>
      )}

      {sortedParticipants.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No devices have connected yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedParticipants.map((participant) => {
            const isCurrentDevice = participant.deviceId === currentDeviceId
            const isBusy =
              updatingParticipantRoleFor === participant.deviceId || removingParticipantId === participant.deviceId
            return (
              <div
                key={participant.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {participant.deviceId.slice(-6)}
                    {isCurrentDevice ? ' • This device' : ''}
                  </span>
                  <span className="text-sm font-semibold">
                    {participant.displayName || 'Unnamed Device'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {isJudgeAdvisor ? (
                    <select
                      value={participant.role}
                      onChange={(event) => {
                        const nextRole = event.target.value as JudgingRole
                        if (nextRole !== participant.role) {
                          onChangeParticipantRole(participant.deviceId, nextRole)
                        }
                      }}
                      disabled={isBusy || isCurrentDevice}
                      className="h-10 min-w-[10rem] rounded-lg border border-white/10 bg-card/80 px-3 text-xs font-semibold uppercase tracking-wide text-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        participant.role === 'judge_advisor'
                          ? 'bg-purple-600/20 text-purple-200'
                          : participant.role === 'judge'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-slate-500/20 text-slate-200'
                      }`}
                    >
                      {displayRoleFor(participant.role)}
                    </span>
                  )}
                  {isJudgeAdvisor && (
                    <button
                      type="button"
                      onClick={() => onRemoveParticipant(participant.deviceId)}
                      disabled={isBusy || isCurrentDevice}
                      className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-red-300 transition hover:border-red-500 hover:text-red-200 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface FieldNotesSectionProps {
  notes: FieldNoteRecord[]
  isLoading: boolean
  canManageFieldNotes: boolean
  currentRole: JudgingRole
  onResolveNote: (id: number, resolved: boolean) => Promise<void>
  onOpenModal: () => void
}

function FieldNotesSection({
  notes,
  isLoading,
  canManageFieldNotes,
  currentRole,
  onResolveNote,
  onOpenModal,
}: FieldNotesSectionProps) {
  return (
    <section className="rounded-2xl border border-white/5 bg-card/80 px-6 py-6 shadow-xl shadow-black/30 backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
            Field Notes to Judge Advisor
          </p>
          <h3 className="text-sm font-medium text-foreground">
            Centralize observations and action items across the event.
          </h3>
        </div>
        {canManageFieldNotes && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-muted-foreground">
            <CircleAlert className="h-3.5 w-3.5 text-amber-400" />
            Share the session code with field teams to submit notes in real time.
          </div>
        )}
      </div>

      {!canManageFieldNotes ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
          Field Notes are restricted to Judges, Judge Advisors, Event Partners, Head Referees, and
          Field Staff. Join the session with the appropriate role to create or manage notes.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground/70">
              Use the standard field note form when communicating issues to the Judge Advisor.
            </p>
            <button
              onClick={onOpenModal}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400"
            >
              New Field Note
            </button>
          </div>

          <FieldNotesList
            notes={notes}
            isLoading={isLoading}
            canResolve={currentRole === 'judge_advisor'}
            onResolve={onResolveNote}
          />
        </div>
      )}
    </section>
  )
}

interface FieldNotesListProps {
  notes: FieldNoteRecord[]
  isLoading: boolean
  canResolve: boolean
  onResolve: (id: number, resolved: boolean) => Promise<void>
}

function FieldNotesList({ notes, isLoading, canResolve, onResolve }: FieldNotesListProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted-foreground">
        Loading field notes…
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-muted-foreground">
        No field notes submitted yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const sentiment = note.sentiment ?? 'negative'
        return (
          <article
            key={note.id}
            className={`rounded-2xl border px-4 py-4 text-sm shadow-lg shadow-black/30 transition ${
              note.priority === 'urgent'
                ? 'border-rose-500/60 bg-rose-500/10'
                : 'border-white/10 bg-card/80'
            }`}
          >
          <header className="flex flex-wrap items-start gap-3">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                {note.division || 'Division N/A'} · {note.fieldLocation || 'Field N/A'}
              </p>
              <h4 className="text-base font-semibold text-foreground">
                {note.matchIdentifier || 'Unscheduled Match'}
              </h4>
              <p className="text-xs text-muted-foreground/70">
                Submitted by {note.reporterName || 'Unknown'} ({displayRoleFor(note.reporterRole)})
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                sentiment === 'positive'
                  ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                  : 'border border-rose-400/40 bg-rose-600/10 text-rose-200'
              }`}
            >
              {sentiment === 'positive' ? <Smile className="h-3.5 w-3.5" /> : <Frown className="h-3.5 w-3.5" />}
              {sentiment === 'positive' ? 'Positive' : 'Negative'}
            </div>
            {canResolve && note.id && (
              <button
                onClick={() => onResolve(note.id!, !note.resolved)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  note.resolved
                    ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border border-white/15 bg-black/30 text-muted-foreground hover:border-emerald-300/60 hover:text-emerald-200'
                }`}
              >
                {note.resolved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                  </>
                ) : (
                  'Mark Resolved'
                )}
              </button>
            )}
          </header>

          <div className="mt-3 space-y-2 text-muted-foreground">
            {note.teamsInvolved && (
              <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                Teams Involved:{' '}
                <span className="text-sm text-foreground">{note.teamsInvolved}</span>
              </p>
            )}
            <p className="text-sm text-foreground">
              <span className="font-semibold">Issue:</span> {note.issueSummary || '—'}
            </p>
          </div>

          <footer className="mt-3 flex flex-wrap items-center justify-between text-xs text-muted-foreground/70">
            <span>
              {new Date(note.createdAt).toLocaleString()}
            </span>
            {note.priority === 'urgent' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-rose-100">
                <CircleAlert className="h-3.5 w-3.5" /> Urgent
              </span>
            )}
          </footer>
        </article>
        )
      })}
    </div>
  )
}

interface FieldNoteFormModalProps {
  noteDraft: FieldNoteDraft
  setNoteDraft: Dispatch<SetStateAction<FieldNoteDraft>>
  currentRole: JudgingRole
  onClose: () => void
  onSubmit: () => Promise<void>
  teams: Team[]
}

function FieldNoteFormModal({
  noteDraft,
  setNoteDraft,
  currentRole,
  onClose,
  onSubmit,
  teams,
}: FieldNoteFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  useEffect(() => {
    if (!noteDraft.teamsInvolved && teams.length > 0) {
      setNoteDraft((prev) => ({ ...prev, teamsInvolved: teams[0].number }))
    }
  }, [noteDraft.teamsInvolved, setNoteDraft, teams])

  const canSubmit =
    noteDraft.reporterName.trim().length >= 3 && noteDraft.issueSummary.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmit()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl shadow-black/60">
        <header className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-background/95 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
            Field Note To Judge Advisor
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-muted-foreground transition hover:border-white/30 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-6 py-6 text-sm text-muted-foreground">
          <div className="grid gap-4 text-xs uppercase tracking-wide text-muted-foreground/70">
            <div className="grid gap-4 sm:grid-cols-4">
              <FieldInput
                label="Reporter Name"
                value={noteDraft.reporterName}
                onChange={(value) => setNoteDraft({ ...noteDraft, reporterName: value })}
              />
              <FieldDisplay label="Role" value={displayRoleFor(currentRole)} />
              <FieldDisplay label="Submitted" value={new Date().toLocaleString()} />
              <FieldInput
                label="Division"
                value={noteDraft.division}
                onChange={(value) => setNoteDraft({ ...noteDraft, division: value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <FieldInput
                label="Field"
                value={noteDraft.fieldLocation}
                onChange={(value) => setNoteDraft({ ...noteDraft, fieldLocation: value })}
              />
              <FieldInput
                label="Match"
                value={noteDraft.matchIdentifier}
                onChange={(value) => setNoteDraft({ ...noteDraft, matchIdentifier: value })}
              />
              <FieldSelect
                label="Teams Involved"
                value={noteDraft.teamsInvolved}
                onChange={(value) => setNoteDraft({ ...noteDraft, teamsInvolved: value })}
                options={teams}
                className="sm:col-span-2"
              />
            </div>
          </div>

          <FieldTextArea
            label="Issue / Observation"
            value={noteDraft.issueSummary}
            onChange={(value) => setNoteDraft({ ...noteDraft, issueSummary: value })}
            placeholder="Describe the situation for the Judge Advisor"
          />

          <div className="flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-black/15 px-4 py-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Priority
              </p>
              <div className="flex gap-2">
                {(['normal', 'urgent'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setNoteDraft({ ...noteDraft, priority: level })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      noteDraft.priority === level
                        ? level === 'urgent'
                          ? 'bg-rose-500 text-rose-950 shadow shadow-rose-400/40'
                          : 'bg-emerald-500 text-emerald-950 shadow shadow-emerald-400/40'
                        : 'border border-white/15 bg-black/20 text-muted-foreground hover:border-white/30 hover:text-foreground'
                    }`}
                  >
                    {level === 'normal' ? 'Normal' : 'Urgent'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sentiment
              </p>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'positive' as const, label: 'Positive', icon: Smile },
                    { value: 'negative' as const, label: 'Negative', icon: Frown },
                  ]
                ).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNoteDraft({ ...noteDraft, sentiment: value })}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      noteDraft.sentiment === value
                        ? value === 'positive'
                          ? 'bg-emerald-500 text-emerald-950 shadow shadow-emerald-400/40'
                          : 'bg-rose-500 text-rose-950 shadow shadow-rose-400/40'
                        : 'border border-white/15 bg-black/20 text-muted-foreground hover:border-white/30 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground/70">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl border border-white/15 px-4 font-semibold text-muted-foreground transition hover:border-white/30 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 font-semibold text-emerald-950 shadow-lg shadow-emerald-400/40 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Submit Field Note
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FieldInputProps {
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

function FieldInput({ label, value, onChange, placeholder, className = '' }: FieldInputProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-white/10 bg-card/80 px-4 text-sm text-foreground placeholder-muted-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}

interface FieldDisplayProps {
  label: string
  value: string
  className?: string
}

function FieldDisplay({ label, value, className = '' }: FieldDisplayProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex h-11 w-full items-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-foreground">
        {value || '—'}
      </div>
    </div>
  )
}

interface FieldTextAreaProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function FieldTextArea({ label, value, onChange, placeholder }: FieldTextAreaProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-card/80 px-4 py-3 text-sm text-foreground placeholder-muted-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}

interface InviteModalProps {
  sessionCode: string
  otp: string
  setOtp: (value: string) => void
  loading: boolean
  error: string | null
  onClose: () => void
  onSubmit: () => Promise<void>
}

function InviteModal({ sessionCode, otp, setOtp, loading, error, onClose, onSubmit }: InviteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-background shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Invite Device</p>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code provided by the device requesting access.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-muted-foreground transition hover:border-white/30 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-4 px-6 py-6">
          <FieldDisplay label="Session Code" value={sessionCode} />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              One-Time Code
            </p>
            <OtpCodeInput value={otp} onChange={setOtp} length={6} autoFocus />
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex justify-end gap-2 text-xs text-muted-foreground/70">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-white/15 px-4 font-semibold text-muted-foreground transition hover:border-white/30 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || otp.length !== 6}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Adding…' : 'Add Participant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FieldSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Team[]
  className?: string
}

function FieldSelect({ label, value, onChange, options, className = '' }: FieldSelectProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-white/10 bg-card/80 px-4 text-sm text-foreground transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Select team</option>
        {options.map((team) => (
          <option key={team.id ?? team.number} value={team.number}>
            {team.number} {team.team_name ? `· ${team.team_name}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

interface OtpCodeInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

function OtpCodeInput({ length = 6, value, onChange, autoFocus = false }: OtpCodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (autoFocus) {
      refs.current[0]?.focus()
    }
  }, [autoFocus])

  const handleChange = (index: number, next: string) => {
    const digit = next.replace(/\D/g, '').slice(-1)
    const chars = value.padEnd(length, ' ').split('')
    chars[index] = digit || ' '
    const nextValue = chars.join('').replace(/\s/g, '')
    onChange(nextValue.slice(0, length))
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const currentChar = value[index] ?? ''
    if (event.key === 'Backspace' && currentChar === '' && index > 0) {
      refs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
      event.preventDefault()
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
      event.preventDefault()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const clipboard = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!clipboard) return
    onChange(clipboard)
    const focusIndex = Math.min(clipboard.length, length) - 1
    if (focusIndex >= 0) {
      refs.current[focusIndex]?.focus()
    }
  }

  const characters = value.padEnd(length, ' ').split('')

  return (
    <div className="flex items-center justify-center gap-2">
      {characters.map((char, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element
          }}
          className="h-12 w-12 rounded-xl border border-white/15 bg-card/80 text-center text-lg font-semibold text-foreground shadow-inner shadow-black/30 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          value={char.trim()}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  )
}

function displayRoleFor(role: JudgingRole) {
  switch (role) {
    case 'judge_advisor':
      return 'Judge Advisor'
    case 'judge':
      return 'Judge'
    case 'head_referee':
      return 'Head Referee / Division Manager'
    case 'field_staff':
      return 'Field Staff'
    case 'event_partner':
      return 'Event Partner'
    case 'viewer':
      return 'Guest'
    default:
      return 'Guest'
  }
}
