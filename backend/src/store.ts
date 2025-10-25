import { randomBytes, randomUUID } from 'node:crypto'
import type { Server as SocketIOServer } from 'socket.io'
import { redisRest } from './redis.js'
import {
  type Session,
  type Participant,
  type PendingOtp,
  type SerializedSession,
  type SerializedParticipant,
  type SerializedPendingOtp,
  type JudgingRole,
  type FieldNote,
  type SerializedFieldNote,
} from './types.js'

const SESSION_TTL_SECONDS = Number.parseInt(process.env.SESSION_TTL_SECONDS ?? '604800', 10) // default 7 days
const SESSIONS_SET_KEY = 'sessions:codes'
const SESSION_ID_MAP_KEY = 'sessions:id-map'

let ioInstance: SocketIOServer | null = null

function requireHashField(source: Record<string, string>, field: string, context: string): string {
  const value = source[field]
  if (value === undefined) {
    throw new Error(`Missing "${field}" while hydrating ${context} from Redis`)
  }
  return value
}

function requireNumberField(source: Record<string, string>, field: string, context: string): number {
  const value = requireHashField(source, field, context)
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    throw new Error(`Field "${field}" on ${context} was expected to be numeric but received "${value}"`)
  }
  return parsed
}

function hydrateParticipant(source: Record<string, string>): Participant {
  return {
    id: requireHashField(source, 'id', 'participant'),
    deviceId: requireHashField(source, 'deviceId', 'participant'),
    displayName: requireHashField(source, 'displayName', 'participant'),
    role: requireHashField(source, 'role', 'participant') as JudgingRole,
    connected: requireHashField(source, 'connected', 'participant') === 'true',
    joinedAt: requireNumberField(source, 'joinedAt', 'participant'),
    lastSeen: requireNumberField(source, 'lastSeen', 'participant'),
  }
}

function hydrateFieldNote(source: Record<string, string>): FieldNote {
  return {
    id: requireNumberField(source, 'id', 'field note'),
    sessionId: requireHashField(source, 'sessionId', 'field note'),
    eventSku: requireHashField(source, 'eventSku', 'field note'),
    reporterDeviceId: requireHashField(source, 'reporterDeviceId', 'field note'),
    reporterName: requireHashField(source, 'reporterName', 'field note'),
    reporterRole: requireHashField(source, 'reporterRole', 'field note') as JudgingRole,
    division: requireHashField(source, 'division', 'field note'),
    fieldLocation: requireHashField(source, 'fieldLocation', 'field note'),
    matchIdentifier: requireHashField(source, 'matchIdentifier', 'field note'),
    teamsInvolved: requireHashField(source, 'teamsInvolved', 'field note'),
    issueSummary: requireHashField(source, 'issueSummary', 'field note'),
    priority: requireHashField(source, 'priority', 'field note') as 'normal' | 'urgent',
    sentiment: requireHashField(source, 'sentiment', 'field note') as 'positive' | 'negative',
    resolved: requireHashField(source, 'resolved', 'field note') === 'true',
    createdAt: requireNumberField(source, 'createdAt', 'field note'),
    updatedAt: requireNumberField(source, 'updatedAt', 'field note'),
  }
}

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io
}

export function getSocketIO() {
  return ioInstance
}

function generateSessionCode(eventSku: string) {
  const sanitized = eventSku.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const prefix = sanitized.slice(0, 2) || 'EV'
  const randomNumber = Number.parseInt(randomBytes(4).toString('hex'), 16)
  const encoded = randomNumber.toString(36).toUpperCase().padStart(6, '0').slice(-6)
  return `${prefix}${encoded}`
}

function sessionEventKey(eventSku: string) {
  return `session:event:${eventSku.toUpperCase()}`
}

function sessionMetaKey(sessionCode: string) {
  return `session:${sessionCode}:meta`
}

function participantsSetKey(sessionCode: string) {
  return `session:${sessionCode}:participants`
}

function participantKey(sessionCode: string, deviceId: string) {
  return `session:${sessionCode}:participant:${deviceId}`
}

function otpHashKey(sessionCode: string) {
  return `session:${sessionCode}:otps`
}

function fieldNoteSequenceKey(sessionCode: string) {
  return `session:${sessionCode}:fieldnotes:seq`
}

function fieldNoteListKey(sessionCode: string) {
  return `session:${sessionCode}:fieldnotes`
}

function fieldNoteItemKey(sessionCode: string, noteId: number) {
  return `session:${sessionCode}:fieldnote:${noteId}`
}

async function touchSession(sessionCode: string) {
  await Promise.all([
    redisRest.expire(sessionMetaKey(sessionCode), SESSION_TTL_SECONDS),
    redisRest.expire(participantsSetKey(sessionCode), SESSION_TTL_SECONDS),
    redisRest.expire(otpHashKey(sessionCode), SESSION_TTL_SECONDS),
    redisRest.expire(fieldNoteListKey(sessionCode), SESSION_TTL_SECONDS),
    redisRest.expire(fieldNoteSequenceKey(sessionCode), SESSION_TTL_SECONDS),
  ])
}

async function persistSession(session: Session) {
  const metaKey = sessionMetaKey(session.sessionCode)
  await redisRest.hset(metaKey, {
    id: session.id,
    sessionCode: session.sessionCode,
    eventSku: session.eventSku,
    createdAt: session.createdAt,
    judgeAdvisorDeviceId: session.judgeAdvisorDeviceId ?? '',
  })
  await redisRest.set(sessionEventKey(session.eventSku), session.sessionCode, { ex: SESSION_TTL_SECONDS })
  await redisRest.hset(SESSION_ID_MAP_KEY, { [session.id]: session.sessionCode })
  await redisRest.sadd(SESSIONS_SET_KEY, session.sessionCode)
  await touchSession(session.sessionCode)
}

async function readSessionMeta(sessionCode: string): Promise<Session | null> {
  const meta = await redisRest.hgetall<Record<string, string>>(sessionMetaKey(sessionCode))
  if (!meta || Object.keys(meta).length === 0) {
    return null
  }
  return {
    id: requireHashField(meta, 'id', 'session'),
    sessionCode: requireHashField(meta, 'sessionCode', 'session'),
    eventSku: requireHashField(meta, 'eventSku', 'session'),
    createdAt: requireNumberField(meta, 'createdAt', 'session'),
    judgeAdvisorDeviceId: meta.judgeAdvisorDeviceId ?? null,
  }
}

export async function ensureSession(eventSku: string): Promise<Session> {
  const key = eventSku.toUpperCase()
  const existingCode = await redisRest.get<string | null>(sessionEventKey(key))
  if (existingCode) {
    const existingSession = await readSessionMeta(existingCode)
    if (existingSession) {
      await touchSession(existingCode)
      return existingSession
    }
  }

  const session: Session = {
    id: randomUUID(),
    sessionCode: generateSessionCode(key),
    eventSku: key,
    createdAt: Date.now(),
    judgeAdvisorDeviceId: null,
  }

  await persistSession(session)
  return session
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  return readSessionMeta(code.toUpperCase())
}

export async function getSessionById(id: string): Promise<Session | null> {
  const code = await redisRest.hget<string | null>(SESSION_ID_MAP_KEY, id)
  if (!code) return null
  return readSessionMeta(code)
}

export async function getSessionBySku(eventSku: string): Promise<Session | null> {
  const code = await redisRest.get<string | null>(sessionEventKey(eventSku))
  if (!code) return null
  return readSessionMeta(code)
}

async function findParticipantData(sessionCode: string, deviceId: string) {
  const data = await redisRest.hgetall<Record<string, string>>(participantKey(sessionCode, deviceId))
  if (!data || Object.keys(data).length === 0) {
    return null
  }
  return hydrateParticipant(data)
}

export async function getParticipantByDevice(session: Session, deviceId: string) {
  return findParticipantData(session.sessionCode, deviceId)
}

async function saveParticipant(session: Session, participant: Participant) {
  await redisRest.hset(participantKey(session.sessionCode, participant.deviceId), {
    id: participant.id,
    deviceId: participant.deviceId,
    displayName: participant.displayName,
    role: participant.role,
    connected: String(participant.connected),
    joinedAt: participant.joinedAt,
    lastSeen: participant.lastSeen,
  })
  await redisRest.sadd(participantsSetKey(session.sessionCode), participant.deviceId)
  await touchSession(session.sessionCode)
}

export async function assignJudgeAdvisor(eventSku: string, deviceId: string, displayName: string): Promise<{ session: Session; participant: Participant }> {
  const session = await ensureSession(eventSku)
  session.judgeAdvisorDeviceId = deviceId
  await redisRest.hset(sessionMetaKey(session.sessionCode), { judgeAdvisorDeviceId: deviceId })

  let participant = await findParticipantData(session.sessionCode, deviceId)
  if (participant) {
    participant = {
      ...participant,
      displayName,
      role: 'judge_advisor',
      connected: true,
      lastSeen: Date.now(),
    }
  } else {
    const now = Date.now()
    participant = {
      id: randomUUID(),
      deviceId,
      displayName,
      role: 'judge_advisor',
      connected: true,
      joinedAt: now,
      lastSeen: now,
    }
  }

  await saveParticipant(session, participant)
  return { session, participant }
}

export async function addParticipant(session: Session, deviceId: string, displayName: string, role: JudgingRole, connected = true): Promise<Participant> {
  const existing = await findParticipantData(session.sessionCode, deviceId)
  const now = Date.now()
  const participant: Participant = existing
    ? {
        ...existing,
        displayName,
        role,
        connected,
        lastSeen: now,
      }
    : {
        id: randomUUID(),
        deviceId,
        displayName,
        role,
        connected,
        joinedAt: now,
        lastSeen: now,
      }

  await saveParticipant(session, participant)
  return participant
}

export async function listParticipants(session: Session): Promise<Participant[]> {
  const deviceIds = await redisRest.smembers<string[]>(participantsSetKey(session.sessionCode))
  if (!deviceIds || deviceIds.length === 0) return []
  const participants = await Promise.all(deviceIds.map((deviceId) => findParticipantData(session.sessionCode, deviceId)))
  return participants.filter((p): p is Participant => Boolean(p))
}

export async function setParticipantRole(session: Session, deviceId: string, role: JudgingRole): Promise<Participant | null> {
  const existing = await findParticipantData(session.sessionCode, deviceId)
  if (!existing) return null
  const updated: Participant = {
    ...existing,
    role,
    lastSeen: Date.now(),
  }
  await saveParticipant(session, updated)
  return updated
}

export async function updateJudgeAdvisor(session: Session, deviceId: string | null) {
  session.judgeAdvisorDeviceId = deviceId
  await redisRest.hset(sessionMetaKey(session.sessionCode), { judgeAdvisorDeviceId: deviceId ?? '' })
  await touchSession(session.sessionCode)
}

const OTP_HASH_FIELD = 'otp'

export async function createOtpForSession(session: Session, deviceId: string, displayName: string, requestedRole: 'judge' | 'viewer'): Promise<PendingOtp> {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const now = Date.now()
  const pending: PendingOtp = {
    otp,
    sessionId: session.id,
    deviceId,
    displayName,
    requestedRole,
    createdAt: now,
    expiresAt: now + 15 * 60 * 1000,
  }

  await redisRest.hset(otpHashKey(session.sessionCode), {
    [otp]: JSON.stringify(pending),
  })
  await touchSession(session.sessionCode)
  return pending
}

export async function listPendingOtps(sessionId: string): Promise<PendingOtp[]> {
  const session = await getSessionById(sessionId)
  if (!session) return []
  const raw = await redisRest.hgetall<Record<string, string>>(otpHashKey(session.sessionCode))
  if (!raw || Object.keys(raw).length === 0) return []
  const now = Date.now()
  const results: PendingOtp[] = []
  for (const [otp, payload] of Object.entries(raw)) {
    if (!payload) continue
    const parsed = JSON.parse(payload) as PendingOtp
    if (parsed.expiresAt < now) {
      await redisRest.hdel(otpHashKey(session.sessionCode), otp)
      continue
    }
    results.push(parsed)
  }
  return results
}

export async function consumeOtp(code: string): Promise<PendingOtp | null> {
  const sessions = await redisRest.smembers<string[]>(SESSIONS_SET_KEY)
  if (!sessions) return null
  for (const sessionCode of sessions) {
    const payload = await redisRest.hget<string | null>(otpHashKey(sessionCode), code)
    if (payload) {
      const parsed = JSON.parse(payload) as PendingOtp
      await redisRest.hdel(otpHashKey(sessionCode), code)
      return parsed
    }
  }
  return null
}

export async function clearExpiredOtps(): Promise<void> {
  const sessions = await redisRest.smembers<string[]>(SESSIONS_SET_KEY)
  if (!sessions || sessions.length === 0) return
  const now = Date.now()
  await Promise.all(sessions.map(async (sessionCode) => {
    const raw = await redisRest.hgetall<Record<string, string>>(otpHashKey(sessionCode))
    if (!raw) return
    const expired: string[] = []
    for (const [otp, payload] of Object.entries(raw)) {
      if (!payload) continue
      const parsed = JSON.parse(payload) as PendingOtp
      if (parsed.expiresAt < now) {
        expired.push(otp)
      }
    }
    if (expired.length > 0) {
      await redisRest.hdel(otpHashKey(sessionCode), ...expired)
    }
  }))
}

async function nextFieldNoteId(sessionCode: string) {
  return Number(await redisRest.incr(fieldNoteSequenceKey(sessionCode)))
}

export async function addFieldNoteToSession(
  session: Session,
  input: Omit<FieldNote, 'id' | 'sessionId' | 'eventSku' | 'createdAt' | 'updatedAt'>,
): Promise<FieldNote> {
  const noteId = await nextFieldNoteId(session.sessionCode)
  const now = Date.now()
  const note: FieldNote = {
    id: noteId,
    sessionId: session.id,
    eventSku: session.eventSku,
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  await redisRest.lpush(fieldNoteListKey(session.sessionCode), noteId)
  await redisRest.hset(fieldNoteItemKey(session.sessionCode, noteId), {
    id: note.id,
    sessionId: note.sessionId,
    eventSku: note.eventSku,
    reporterDeviceId: note.reporterDeviceId,
    reporterName: note.reporterName,
    reporterRole: note.reporterRole,
    division: note.division,
    fieldLocation: note.fieldLocation,
    matchIdentifier: note.matchIdentifier,
    teamsInvolved: note.teamsInvolved,
    issueSummary: note.issueSummary,
    priority: note.priority,
    sentiment: note.sentiment,
    resolved: String(note.resolved),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  })
  await touchSession(session.sessionCode)
  return note
}

export async function updateFieldNoteResolution(session: Session, noteId: number, resolved: boolean) {
  const key = fieldNoteItemKey(session.sessionCode, noteId)
  const existing = await redisRest.hgetall<Record<string, string>>(key)
  if (!existing || Object.keys(existing).length === 0) {
    return null
  }
  const baseNote = hydrateFieldNote(existing)
  const updated: FieldNote = {
    ...baseNote,
    resolved,
    updatedAt: Date.now(),
  }
  await redisRest.hset(key, {
    resolved: String(resolved),
    updatedAt: updated.updatedAt,
  })
  await touchSession(session.sessionCode)
  return updated
}

export async function removeParticipantByDevice(session: Session, deviceId: string) {
  await redisRest.del(participantKey(session.sessionCode, deviceId))
  await redisRest.srem(participantsSetKey(session.sessionCode), deviceId)
  await touchSession(session.sessionCode)
}

export async function updateParticipantPresence(session: Session, deviceId: string, connected: boolean) {
  const existing = await findParticipantData(session.sessionCode, deviceId)
  if (!existing) return null
  const updated: Participant = {
    ...existing,
    connected,
    lastSeen: Date.now(),
  }
  await saveParticipant(session, updated)
  return updated
}

async function listFieldNotes(session: Session): Promise<FieldNote[]> {
  const rawIds = await redisRest.lrange<string[]>(fieldNoteListKey(session.sessionCode), 0, -1)
  if (!rawIds || rawIds.length === 0) return []
  const noteIds = rawIds.map((value) => Number(value))
  const notes = await Promise.all(noteIds.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(fieldNoteItemKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateFieldNote(data)
  }))
  return notes.filter((note): note is FieldNote => Boolean(note))
}

export async function serializeParticipant(participant: Participant): Promise<SerializedParticipant> {
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

export async function serializePendingOtp(pending: PendingOtp): Promise<SerializedPendingOtp> {
  return {
    otp: pending.otp,
    deviceId: pending.deviceId,
    displayName: pending.displayName,
    requestedRole: pending.requestedRole,
    createdAt: pending.createdAt,
    expiresAt: pending.expiresAt,
  }
}

export function serializeFieldNote(note: FieldNote): SerializedFieldNote {
  return {
    id: note.id,
    sessionId: note.sessionId,
    eventSku: note.eventSku,
    reporterDeviceId: note.reporterDeviceId,
    reporterName: note.reporterName,
    reporterRole: note.reporterRole,
    division: note.division,
    fieldLocation: note.fieldLocation,
    matchIdentifier: note.matchIdentifier,
    teamsInvolved: note.teamsInvolved,
    issueSummary: note.issueSummary,
    priority: note.priority,
    sentiment: note.sentiment,
    resolved: note.resolved,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

export async function serializeSession(session: Session): Promise<SerializedSession> {
  const [participants, pendingOtps, notes] = await Promise.all([
    listParticipants(session).then(async (list) => Promise.all(list.map((participant) => serializeParticipant(participant)))),
    listPendingOtps(session.id).then(async (list) => Promise.all(list.map((pending) => serializePendingOtp(pending)))),
    listFieldNotes(session),
  ])

  return {
    sessionId: session.id,
    sessionCode: session.sessionCode,
    eventSku: session.eventSku,
    createdAt: session.createdAt,
    judgeAdvisorDeviceId: session.judgeAdvisorDeviceId,
    participants,
    pendingOtps,
    fieldNotes: notes.map((note) => serializeFieldNote(note)),
  }
}
