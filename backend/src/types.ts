export type JudgingRole =
  | 'viewer'
  | 'judge'
  | 'judge_advisor'
  | 'head_referee'
  | 'field_staff'
  | 'event_partner'

export interface Participant {
  id: string
  deviceId: string
  displayName: string
  role: JudgingRole
  connected: boolean
  joinedAt: number
  lastSeen: number
}

export interface Session {
  id: string
  sessionCode: string
  eventSku: string
  createdAt: number
  judgeAdvisorDeviceId: string | null
}

export interface PendingOtp {
  otp: string
  sessionId: string
  deviceId: string
  displayName: string
  requestedRole: 'judge' | 'viewer'
  createdAt: number
  expiresAt: number
}

export interface FieldNote {
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

export interface SerializedParticipant {
  id: string
  deviceId: string
  displayName: string
  role: JudgingRole
  connected: boolean
  joinedAt: number
  lastSeen: number
}

export interface SerializedPendingOtp {
  otp: string
  deviceId: string
  displayName: string
  requestedRole: 'judge' | 'viewer'
  createdAt: number
  expiresAt: number
}

export interface SerializedFieldNote {
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

export interface SerializedSession {
  sessionId: string
  sessionCode: string
  eventSku: string
  createdAt: number
  judgeAdvisorDeviceId: string | null
  participants: SerializedParticipant[]
  pendingOtps: SerializedPendingOtp[]
  fieldNotes: SerializedFieldNote[]
}

export interface ApiErrorPayload {
  error: {
    code: string
    message: string
  }
}
