import type {
  SharingSessionInfo,
  SharingParticipant,
  PendingJoinRequest,
  SharingFieldNote,
  JudgingRole,
} from '@/context/JudgingSessionContext'

const API_BASE = import.meta.env.VITE_SHARING_API ?? 'http://localhost:8787'

interface SessionEnvelope {
  session: SharingSessionInfo
  participant?: SharingParticipant
}

interface OtpResponse {
  otp: string
  expiresAt: number
  sessionCode: string
}

export interface CreateFieldNotePayload {
  reporterName: string
  division: string
  fieldLocation: string
  matchIdentifier: string
  teamsInvolved: string
  issueSummary: string
  priority: 'normal' | 'urgent'
  sentiment: 'positive' | 'negative'
}

function mapParticipant(participant: any): SharingParticipant {
  return {
    id: participant.id,
    deviceId: participant.deviceId,
    displayName: participant.displayName,
    role: participant.role,
    connected: participant.connected,
    joinedAt: participant.joinedAt,
    lastSeen: participant.lastSeen,
  }
}

function mapPending(pending: any): PendingJoinRequest {
  return {
    otp: pending.otp,
    deviceId: pending.deviceId,
    displayName: pending.displayName,
    requestedRole: pending.requestedRole,
    createdAt: pending.createdAt,
    expiresAt: pending.expiresAt,
  }
}

function mapSession(session: any): SharingSessionInfo {
  return {
    sessionId: session.sessionId,
    sessionCode: session.sessionCode,
    eventSku: session.eventSku,
    createdAt: session.createdAt,
    judgeAdvisorDeviceId: session.judgeAdvisorDeviceId ?? null,
    participants: Array.isArray(session.participants) ? session.participants.map(mapParticipant) : [],
    pendingOtps: Array.isArray(session.pendingOtps) ? session.pendingOtps.map(mapPending) : [],
    fieldNotes: Array.isArray(session.fieldNotes) ? session.fieldNotes.map(mapFieldNote) : [],
  }
}

function mapFieldNote(note: any): SharingFieldNote {
  return {
    id: note.id,
    sessionId: note.sessionId,
    eventSku: note.eventSku,
    reporterDeviceId: note.reporterDeviceId,
    reporterName: note.reporterName,
    reporterRole: note.reporterRole,
    division: note.division ?? '',
    fieldLocation: note.fieldLocation ?? '',
    matchIdentifier: note.matchIdentifier ?? '',
    teamsInvolved: note.teamsInvolved ?? '',
    issueSummary: note.issueSummary ?? '',
    priority: note.priority === 'urgent' ? 'urgent' : 'normal',
    sentiment: note.sentiment === 'positive' ? 'positive' : 'negative',
    resolved: Boolean(note.resolved),
    createdAt: note.createdAt ?? 0,
    updatedAt: note.updatedAt ?? note.createdAt ?? 0,
  }
}

async function toApiError(res: Response) {
  try {
    const payload = await res.json()
    if (payload?.error?.message) {
      return new Error(payload.error.message)
    }
  } catch (_) {
    /* ignore */
  }
  return new Error(`Request failed with status ${res.status}`)
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init)
  if (!res.ok) {
    throw await toApiError(res)
  }
  return (await res.json()) as T
}

export async function createOrGetSession(eventSku: string, deviceId: string, displayName: string, role: 'judge_advisor' | 'judge' | 'viewer'): Promise<SessionEnvelope> {
  const body = JSON.stringify({ deviceId, displayName, role })
  const data = await request<{ session: any; participant?: any }>(
    `${API_BASE}/api/sessions/by-sku/${encodeURIComponent(eventSku)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  )

  return {
    session: mapSession(data.session),
    participant: data.participant ? mapParticipant(data.participant) : undefined,
  }
}

export async function requestJoinOtpByEventSku(eventSku: string, deviceId: string, displayName: string, requestedRole: 'judge' | 'viewer' = 'judge'): Promise<OtpResponse> {
  return request<OtpResponse>(
    `${API_BASE}/api/sessions/by-sku/${encodeURIComponent(eventSku)}/otp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, displayName, requestedRole }),
    },
  )
}

export async function requestJoinOtp(sessionCode: string, deviceId: string, displayName: string, requestedRole: 'judge' | 'viewer' = 'judge'): Promise<OtpResponse> {
  return request<OtpResponse>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/otp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, displayName, requestedRole }),
    },
  )
}

export async function approveJoinOtp(sessionCode: string, otp: string, advisorDeviceId: string): Promise<SessionEnvelope> {
  const data = await request<{ participant: any; session: any }>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, advisorDeviceId }),
    },
  )

  return {
    participant: mapParticipant(data.participant),
    session: mapSession(data.session),
  }
}

export async function fetchSessionStateByCode(sessionCode: string): Promise<SharingSessionInfo> {
  const data = await request<{ session: any }>(`${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}`)
  return mapSession(data.session)
}

export async function fetchSessionStateBySku(eventSku: string): Promise<SharingSessionInfo> {
  const data = await request<{ session: any }>(`${API_BASE}/api/sessions/by-sku/${encodeURIComponent(eventSku)}`)
  return mapSession(data.session)
}

export async function createFieldNote(
  sessionCode: string,
  deviceId: string,
  payload: CreateFieldNotePayload,
): Promise<{ fieldNote: SharingFieldNote; session: SharingSessionInfo }> {
  const data = await request<{ fieldNote: any; session: any }>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/field-notes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...payload }),
    },
  )

  return {
    fieldNote: mapFieldNote(data.fieldNote),
    session: mapSession(data.session),
  }
}

export async function updateFieldNoteResolution(
  sessionCode: string,
  noteId: number,
  deviceId: string,
  resolved: boolean,
): Promise<{ fieldNote: SharingFieldNote; session: SharingSessionInfo }> {
  const data = await request<{ fieldNote: any; session: any }>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/field-notes/${noteId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, resolved }),
    },
  )
  return {
    fieldNote: mapFieldNote(data.fieldNote),
    session: mapSession(data.session),
  }
}

export async function updateParticipantRole(
  sessionCode: string,
  participantDeviceId: string,
  advisorDeviceId: string,
  role: JudgingRole,
): Promise<{ participant: SharingParticipant; session: SharingSessionInfo }> {
  const data = await request<{ participant: any; session: any }>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/participants/${encodeURIComponent(participantDeviceId)}/role`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorDeviceId, role }),
    },
  )

  return {
    participant: mapParticipant(data.participant),
    session: mapSession(data.session),
  }
}

export async function removeParticipant(
  sessionCode: string,
  participantDeviceId: string,
  advisorDeviceId: string,
): Promise<SharingSessionInfo> {
  const data = await request<{ session: any }>(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/participants/${encodeURIComponent(participantDeviceId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorDeviceId }),
    },
  )

  return mapSession(data.session)
}
