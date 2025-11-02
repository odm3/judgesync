import { randomBytes, randomUUID } from 'node:crypto'
import type { Server as SocketIOServer } from 'socket.io'
import { redisRest } from './redis.js'
import { getRoomName } from './socket/rooms.js'
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
import {
  type JudgeTeam,
  type TeamAssignment,
  type ConflictOfInterest,
  type NotebookScore,
  type InterviewScore,
  type TeamNomination,
  type TimerSettings,
  type TeamPhoto,
  type TeamJudgingNote,
} from './types/judging.js'
import { generateSigningKey } from './auth/hmac.js'
import { revokeToken } from './auth/jwt.js'

const SESSION_TTL_SECONDS = Number.parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10) // default 24 hours
const PARTICIPANT_INACTIVITY_TTL_SECONDS = Number.parseInt(process.env.PARTICIPANT_INACTIVITY_TTL_SECONDS ?? '3600', 10) // default 1 hour
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
    tokenId: source.tokenId || null,
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

function generateSessionCode(): string {
  // Generate cryptographically secure random code
  // Format: XXYYYYYY (8 chars total, no hyphen for easier entry)
  // XX = 2 random uppercase letters (26^2 = 676 combinations)
  // YYYYYY = 6 random alphanumeric chars (36^6 = ~2.1 billion combinations)
  // Total entropy: ~60 bits

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  // Generate prefix (2 letters)
  const bytes = randomBytes(8)
  const byte0 = bytes[0]!
  const byte1 = bytes[1]!
  const prefix = letters.charAt(byte0 % 26) + letters.charAt(byte1 % 26)

  // Generate suffix (6 alphanumeric)
  let suffix = ''
  for (let i = 2; i < 8; i++) {
    const byte = bytes[i]!
    suffix += alphanumeric.charAt(byte % 36)
  }

  return `${prefix}${suffix}`
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

function signingKeyKey(sessionCode: string, deviceId: string) {
  return `session:${sessionCode}:signing-key:${deviceId}`
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

export async function touchSession(sessionCode: string) {
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
    sessionCode: generateSessionCode(),
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

async function saveParticipant(session: Session, participant: Participant, skipTouch = false) {
  await redisRest.hset(participantKey(session.sessionCode, participant.deviceId), {
    id: participant.id,
    deviceId: participant.deviceId,
    displayName: participant.displayName,
    role: participant.role,
    connected: String(participant.connected),
    joinedAt: participant.joinedAt,
    lastSeen: participant.lastSeen,
    tokenId: participant.tokenId ?? '',
  })
  await redisRest.sadd(participantsSetKey(session.sessionCode), participant.deviceId)
  if (!skipTouch) {
    await touchSession(session.sessionCode)
  }
}

export async function assignJudgeAdvisor(
  session: Session,
  deviceId: string,
  displayName: string,
  tokenId: string,
  skipTouch = false,
): Promise<Participant> {
  await removeDeviceFromOtherSessions(deviceId, session.sessionCode)
  session.judgeAdvisorDeviceId = deviceId
  await redisRest.hset(sessionMetaKey(session.sessionCode), { judgeAdvisorDeviceId: deviceId })

  let participant = await findParticipantData(session.sessionCode, deviceId)
  if (participant) {
    // Revoke old token if exists
    if (participant.tokenId) {
      await revokeToken(participant.tokenId)
    }
    participant = {
      ...participant,
      displayName,
      role: 'judge_advisor',
      connected: true,
      lastSeen: Date.now(),
      tokenId,
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
      tokenId,
    }
  }

  await saveParticipant(session, participant, skipTouch)
  return participant
}

export async function addParticipant(
  session: Session,
  deviceId: string,
  displayName: string,
  role: JudgingRole,
  tokenId: string,
  connected = true,
  skipTouch = false,
): Promise<Participant> {
  await removeDeviceFromOtherSessions(deviceId, session.sessionCode)
  const existing = await findParticipantData(session.sessionCode, deviceId)

  // Revoke old token if participant already exists
  if (existing?.tokenId) {
    await revokeToken(existing.tokenId)
  }

  const now = Date.now()
  const participant: Participant = existing
    ? {
      ...existing,
      displayName,
      role,
      connected,
      lastSeen: now,
      tokenId,
    }
    : {
      id: randomUUID(),
      deviceId,
      displayName,
      role,
      connected,
      joinedAt: now,
      lastSeen: now,
      tokenId,
    }

  await saveParticipant(session, participant, skipTouch)
  return participant
}

export async function listParticipants(session: Session): Promise<Participant[]> {
  const deviceIds = await redisRest.smembers<string[]>(participantsSetKey(session.sessionCode))
  if (!deviceIds || deviceIds.length === 0) return []
  const participants = await Promise.all(deviceIds.map((deviceId) => findParticipantData(session.sessionCode, deviceId)))
  const validParticipants = participants.filter((p): p is Participant => Boolean(p))

  // Clean up stale and legacy participants before returning
  return cleanupStaleParticipants(session, validParticipants)
}

/**
 * Remove stale and legacy participants from a session
 * - Legacy participants: Missing tokenId (created before JWT update)
 * - Stale participants: Inactive for longer than PARTICIPANT_INACTIVITY_TTL_SECONDS
 */
async function cleanupStaleParticipants(session: Session, participants: Participant[]): Promise<Participant[]> {
  const now = Date.now()
  const inactivityThreshold = now - (PARTICIPANT_INACTIVITY_TTL_SECONDS * 1000)

  const participantsToRemove: Participant[] = []
  const participantsToKeep: Participant[] = []

  for (const participant of participants) {
    const isLegacy = !participant.tokenId
    const isStale = participant.lastSeen < inactivityThreshold

    if (isLegacy || isStale) {
      participantsToRemove.push(participant)
    } else {
      participantsToKeep.push(participant)
    }
  }

  // Remove stale/legacy participants
  if (participantsToRemove.length > 0) {
    console.log(`Cleaning up ${participantsToRemove.length} stale/legacy participants from session ${session.sessionCode}`)

    await Promise.all(
      participantsToRemove.map(async (participant) => {
        // Revoke token if exists
        if (participant.tokenId) {
          await revokeToken(participant.tokenId)
        }

        // Delete participant data
        await redisRest.del(participantKey(session.sessionCode, participant.deviceId))
        await redisRest.srem(participantsSetKey(session.sessionCode), participant.deviceId)

        // Delete signing key
        await redisRest.del(signingKeyKey(session.sessionCode, participant.deviceId))

        console.log(`  - Removed ${participant.tokenId ? 'stale' : 'legacy'} participant: ${participant.displayName} (${participant.deviceId})`)
      }),
    )
  }

  return participantsToKeep
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
  await removePendingOtpsForDevice(deviceId)
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const now = Date.now()
  const pending: PendingOtp = {
    otp,
    sessionId: session.id,
    deviceId,
    displayName,
    requestedRole,
    createdAt: now,
    expiresAt: now + 60 * 1000, // 60 seconds
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
  const raw = await redisRest.hgetall<Record<string, any>>(otpHashKey(session.sessionCode))
  if (!raw || Object.keys(raw).length === 0) return []
  const now = Date.now()
  const results: PendingOtp[] = []
  for (const [otp, payload] of Object.entries(raw)) {
    if (!payload) continue
    // Upstash SDK auto-parses JSON, payload is already an object
    const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as PendingOtp
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
      // Upstash SDK auto-parses JSON, payload is already an object
      const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as PendingOtp
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
    const raw = await redisRest.hgetall<Record<string, any>>(otpHashKey(sessionCode))
    if (!raw) return
    const expired: string[] = []
    for (const [otp, payload] of Object.entries(raw)) {
      if (!payload) continue
      // Upstash SDK auto-parses JSON, payload is already an object
      const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as PendingOtp
      if (parsed.expiresAt < now) {
        expired.push(otp)
      }
    }
    if (expired.length > 0) {
      await redisRest.hdel(otpHashKey(sessionCode), ...expired)
    }
  }))
}

async function removePendingOtpsForDevice(deviceId: string) {
  const sessions = await redisRest.smembers<string[]>(SESSIONS_SET_KEY)
  if (!sessions || sessions.length === 0) return

  await Promise.all(
    sessions.map(async (sessionCode) => {
      const raw = await redisRest.hgetall<Record<string, string>>(otpHashKey(sessionCode))
      if (!raw || Object.keys(raw).length === 0) return

      const toRemove: string[] = []
      for (const [otp, payload] of Object.entries(raw)) {
        if (!payload) continue
        try {
          const parsed = JSON.parse(payload) as PendingOtp
          if (parsed.deviceId === deviceId) {
            toRemove.push(otp)
          }
        } catch (error) {
          // Ignore malformed payloads; they will be cleaned up elsewhere.
        }
      }

      if (toRemove.length > 0) {
        await redisRest.hdel(otpHashKey(sessionCode), ...toRemove)
      }
    }),
  )
}

async function removeDeviceFromOtherSessions(deviceId: string, keepSessionCode: string) {
  const sessionCodes = await redisRest.smembers<string[]>(SESSIONS_SET_KEY)
  if (!sessionCodes || sessionCodes.length === 0) {
    return
  }

  await Promise.all(
    sessionCodes
      .filter((code) => code !== keepSessionCode)
      .map(async (sessionCode) => {
        const participant = await findParticipantData(sessionCode, deviceId)
        if (!participant) return

        if (participant.tokenId) {
          await revokeToken(participant.tokenId)
        }

        await redisRest.del(participantKey(sessionCode, deviceId))
        await redisRest.srem(participantsSetKey(sessionCode), deviceId)
        await deleteSigningKey(sessionCode, deviceId)

        const metaKey = sessionMetaKey(sessionCode)
        const currentAdvisor = await redisRest.hget<string | null>(metaKey, 'judgeAdvisorDeviceId')
        if (currentAdvisor === deviceId) {
          await redisRest.hset(metaKey, { judgeAdvisorDeviceId: '' })
        }

        await touchSession(sessionCode)
        await broadcastSessionState(sessionCode)
      }),
  )
}

async function broadcastSessionState(sessionCode: string) {
  const io = getSocketIO()
  if (!io) return

  const session = await readSessionMeta(sessionCode)
  if (!session) return

  const serialized = await serializeSession(session)
  io.to(getRoomName(sessionCode)).emit('session:state', serialized)
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
  // Get participant's tokenId before deletion
  const participant = await findParticipantData(session.sessionCode, deviceId)

  // Revoke token to immediately log out the participant
  if (participant?.tokenId) {
    await revokeToken(participant.tokenId)
  }

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

export async function storeSigningKey(sessionCode: string, deviceId: string, sessionId: string): Promise<string> {
  const signingKey = generateSigningKey(sessionId)
  await redisRest.set(signingKeyKey(sessionCode, deviceId), signingKey, { ex: SESSION_TTL_SECONDS })
  return signingKey
}

export async function getSigningKeyByDeviceId(sessionCode: string, deviceId: string): Promise<string | null> {
  return await redisRest.get<string | null>(signingKeyKey(sessionCode, deviceId))
}

export async function deleteSigningKey(sessionCode: string, deviceId: string): Promise<void> {
  await redisRest.del(signingKeyKey(sessionCode, deviceId))
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

// ============================================================================
// JUDGING SYSTEM - Redis Key Functions
// ============================================================================

function judgeTeamsListKey(sessionCode: string) {
  return `session:${sessionCode}:judge-teams`
}

function judgeTeamKey(sessionCode: string, teamId: string) {
  return `session:${sessionCode}:judge-team:${teamId}`
}

function teamAssignmentsListKey(sessionCode: string) {
  return `session:${sessionCode}:team-assignments`
}

function teamAssignmentKey(sessionCode: string, assignmentId: string) {
  return `session:${sessionCode}:team-assignment:${assignmentId}`
}

function conflictsListKey(sessionCode: string) {
  return `session:${sessionCode}:conflicts`
}

function conflictKey(sessionCode: string, conflictId: string) {
  return `session:${sessionCode}:conflict:${conflictId}`
}

function notebookScoresListKey(sessionCode: string) {
  return `session:${sessionCode}:notebook-scores`
}

function notebookScoreKey(sessionCode: string, scoreId: string) {
  return `session:${sessionCode}:notebook-score:${scoreId}`
}

function interviewScoresListKey(sessionCode: string) {
  return `session:${sessionCode}:interview-scores`
}

function interviewScoreKey(sessionCode: string, scoreId: string) {
  return `session:${sessionCode}:interview-score:${scoreId}`
}

function nominationsListKey(sessionCode: string) {
  return `session:${sessionCode}:nominations`
}

function nominationKey(sessionCode: string, nominationId: string) {
  return `session:${sessionCode}:nomination:${nominationId}`
}

function timerSettingsKey(sessionCode: string) {
  return `session:${sessionCode}:timer`
}

function teamPhotosListKey(sessionCode: string) {
  return `session:${sessionCode}:team-photos`
}

function teamPhotoKey(sessionCode: string, photoId: string) {
  return `session:${sessionCode}:team-photo:${photoId}`
}

function teamJudgingNotesListKey(sessionCode: string) {
  return `session:${sessionCode}:judging-notes`
}

function teamJudgingNoteKey(sessionCode: string, noteId: string) {
  return `session:${sessionCode}:judging-note:${noteId}`
}

// ============================================================================
// JUDGING SYSTEM - Hydration Functions
// ============================================================================

function hydrateJudgeTeam(source: Record<string, string>): JudgeTeam {
  return {
    id: requireHashField(source, 'id', 'judge team'),
    sessionId: requireHashField(source, 'sessionId', 'judge team'),
    name: requireHashField(source, 'name', 'judge team'),
    judgeDeviceIds: JSON.parse(requireHashField(source, 'judgeDeviceIds', 'judge team')),
    createdAt: requireNumberField(source, 'createdAt', 'judge team'),
    updatedAt: requireNumberField(source, 'updatedAt', 'judge team'),
  }
}

function hydrateTeamAssignment(source: Record<string, string>): TeamAssignment {
  return {
    id: requireHashField(source, 'id', 'team assignment'),
    sessionId: requireHashField(source, 'sessionId', 'team assignment'),
    judgeTeamId: requireHashField(source, 'judgeTeamId', 'team assignment'),
    teamNumber: requireHashField(source, 'teamNumber', 'team assignment'),
    createdAt: requireNumberField(source, 'createdAt', 'team assignment'),
  }
}

function hydrateConflict(source: Record<string, string>): ConflictOfInterest {
  return {
    id: requireHashField(source, 'id', 'conflict'),
    sessionId: requireHashField(source, 'sessionId', 'conflict'),
    judgeDeviceId: requireHashField(source, 'judgeDeviceId', 'conflict'),
    teamNumber: requireHashField(source, 'teamNumber', 'conflict'),
    reason: source.reason || undefined,
    createdBy: requireHashField(source, 'createdBy', 'conflict') as 'judge' | 'judge_advisor',
    createdAt: requireNumberField(source, 'createdAt', 'conflict'),
  }
}

function hydrateNotebookScore(source: Record<string, string>): NotebookScore {
  return {
    id: requireHashField(source, 'id', 'notebook score'),
    sessionId: requireHashField(source, 'sessionId', 'notebook score'),
    judgeTeamId: requireHashField(source, 'judgeTeamId', 'notebook score'),
    teamNumber: requireHashField(source, 'teamNumber', 'notebook score'),
    scores: JSON.parse(requireHashField(source, 'scores', 'notebook score')),
    totalScore: requireNumberField(source, 'totalScore', 'notebook score'),
    notes: source.notes || undefined,
    gradeLevel: source.gradeLevel as 'ES' | 'MS' | 'HS' | 'University' | undefined,
    judgeName: source.judgeName || undefined,
    digitalNotebookUrl: source.digitalNotebookUrl || undefined,
    createdAt: requireNumberField(source, 'createdAt', 'notebook score'),
    updatedAt: requireNumberField(source, 'updatedAt', 'notebook score'),
    createdBy: requireHashField(source, 'createdBy', 'notebook score'),
  }
}

function hydrateInterviewScore(source: Record<string, string>): InterviewScore {
  return {
    id: requireHashField(source, 'id', 'interview score'),
    sessionId: requireHashField(source, 'sessionId', 'interview score'),
    judgeTeamId: requireHashField(source, 'judgeTeamId', 'interview score'),
    teamNumber: requireHashField(source, 'teamNumber', 'interview score'),
    scores: JSON.parse(requireHashField(source, 'scores', 'interview score')),
    totalScore: requireNumberField(source, 'totalScore', 'interview score'),
    notes: source.notes || undefined,
    gradeLevel: source.gradeLevel as 'ES' | 'MS' | 'HS' | 'University' | undefined,
    judgeName: source.judgeName || undefined,
    specialAttributes: source.specialAttributes || undefined,
    interviewDuration: source.interviewDuration ? Number(source.interviewDuration) : undefined,
    createdAt: requireNumberField(source, 'createdAt', 'interview score'),
    updatedAt: requireNumberField(source, 'updatedAt', 'interview score'),
    createdBy: requireHashField(source, 'createdBy', 'interview score'),
  }
}

function hydrateNomination(source: Record<string, string>): TeamNomination {
  return {
    id: requireHashField(source, 'id', 'nomination'),
    sessionId: requireHashField(source, 'sessionId', 'nomination'),
    judgeTeamId: requireHashField(source, 'judgeTeamId', 'nomination'),
    teamNumber: requireHashField(source, 'teamNumber', 'nomination'),
    awardCategory: requireHashField(source, 'awardCategory', 'nomination'),
    notes: source.notes || undefined,
    createdAt: requireNumberField(source, 'createdAt', 'nomination'),
    createdBy: requireHashField(source, 'createdBy', 'nomination'),
  }
}

function hydrateTimerSettings(source: Record<string, string>): TimerSettings {
  return {
    sessionId: requireHashField(source, 'sessionId', 'timer settings'),
    defaultDuration: requireNumberField(source, 'defaultDuration', 'timer settings'),
    currentDuration: requireNumberField(source, 'currentDuration', 'timer settings'),
    isRunning: requireHashField(source, 'isRunning', 'timer settings') === 'true',
    isPaused: requireHashField(source, 'isPaused', 'timer settings') === 'true',
    startedAt: source.startedAt ? Number(source.startedAt) : undefined,
    pausedAt: source.pausedAt ? Number(source.pausedAt) : undefined,
    updatedAt: requireNumberField(source, 'updatedAt', 'timer settings'),
    updatedBy: requireHashField(source, 'updatedBy', 'timer settings'),
  }
}

function hydrateTeamPhoto(source: Record<string, string>): TeamPhoto {
  return {
    id: requireHashField(source, 'id', 'team photo'),
    sessionId: requireHashField(source, 'sessionId', 'team photo'),
    teamNumber: requireHashField(source, 'teamNumber', 'team photo'),
    judgeTeamId: source.judgeTeamId || undefined,
    url: requireHashField(source, 'url', 'team photo'),
    caption: source.caption || undefined,
    createdAt: requireNumberField(source, 'createdAt', 'team photo'),
    createdBy: requireHashField(source, 'createdBy', 'team photo'),
  }
}

function hydrateTeamJudgingNote(source: Record<string, string>): TeamJudgingNote {
  return {
    id: requireHashField(source, 'id', 'team judging note'),
    sessionId: requireHashField(source, 'sessionId', 'team judging note'),
    judgeTeamId: requireHashField(source, 'judgeTeamId', 'team judging note'),
    teamNumber: requireHashField(source, 'teamNumber', 'team judging note'),
    content: requireHashField(source, 'content', 'team judging note'),
    createdAt: requireNumberField(source, 'createdAt', 'team judging note'),
    updatedAt: requireNumberField(source, 'updatedAt', 'team judging note'),
    createdBy: requireHashField(source, 'createdBy', 'team judging note'),
  }
}

// ============================================================================
// JUDGING SYSTEM - Judge Teams CRUD
// ============================================================================

export async function createJudgeTeam(
  session: Session,
  name: string,
  judgeDeviceIds: string[],
): Promise<JudgeTeam> {
  const id = randomUUID()
  const now = Date.now()
  const judgeTeam: JudgeTeam = {
    id,
    sessionId: session.id,
    name,
    judgeDeviceIds,
    createdAt: now,
    updatedAt: now,
  }

  await redisRest.hset(judgeTeamKey(session.sessionCode, id), {
    id: judgeTeam.id,
    sessionId: judgeTeam.sessionId,
    name: judgeTeam.name,
    judgeDeviceIds: JSON.stringify(judgeTeam.judgeDeviceIds),
    createdAt: judgeTeam.createdAt,
    updatedAt: judgeTeam.updatedAt,
  })
  await redisRest.sadd(judgeTeamsListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return judgeTeam
}

export async function listJudgeTeams(session: Session): Promise<JudgeTeam[]> {
  const ids = await redisRest.smembers<string[]>(judgeTeamsListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const teams = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(judgeTeamKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateJudgeTeam(data)
  }))
  return teams.filter((team): team is JudgeTeam => Boolean(team))
}

export async function getJudgeTeam(session: Session, teamId: string): Promise<JudgeTeam | null> {
  const data = await redisRest.hgetall<Record<string, string>>(judgeTeamKey(session.sessionCode, teamId))
  if (!data || Object.keys(data).length === 0) return null
  return hydrateJudgeTeam(data)
}

export async function updateJudgeTeam(
  session: Session,
  teamId: string,
  updates: { name?: string | undefined; judgeDeviceIds?: string[] | undefined },
): Promise<JudgeTeam | null> {
  const existing = await getJudgeTeam(session, teamId)
  if (!existing) return null

  const updated: JudgeTeam = {
    ...existing,
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.judgeDeviceIds !== undefined && { judgeDeviceIds: updates.judgeDeviceIds }),
    updatedAt: Date.now(),
  }

  await redisRest.hset(judgeTeamKey(session.sessionCode, teamId), {
    id: updated.id,
    sessionId: updated.sessionId,
    name: updated.name,
    judgeDeviceIds: JSON.stringify(updated.judgeDeviceIds),
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
  await touchSession(session.sessionCode)
  return updated
}

export async function deleteJudgeTeam(session: Session, teamId: string): Promise<void> {
  await redisRest.del(judgeTeamKey(session.sessionCode, teamId))
  await redisRest.srem(judgeTeamsListKey(session.sessionCode), teamId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Team Assignments CRUD
// ============================================================================

export async function createTeamAssignment(
  session: Session,
  judgeTeamId: string,
  teamNumber: string,
): Promise<TeamAssignment> {
  const id = randomUUID()
  const assignment: TeamAssignment = {
    id,
    sessionId: session.id,
    judgeTeamId,
    teamNumber,
    createdAt: Date.now(),
  }

  await redisRest.hset(teamAssignmentKey(session.sessionCode, id), {
    id: assignment.id,
    sessionId: assignment.sessionId,
    judgeTeamId: assignment.judgeTeamId,
    teamNumber: assignment.teamNumber,
    createdAt: assignment.createdAt,
  })
  await redisRest.sadd(teamAssignmentsListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return assignment
}

export async function listTeamAssignments(session: Session): Promise<TeamAssignment[]> {
  const ids = await redisRest.smembers<string[]>(teamAssignmentsListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const assignments = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(teamAssignmentKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateTeamAssignment(data)
  }))
  return assignments.filter((a): a is TeamAssignment => Boolean(a))
}

export async function deleteTeamAssignment(session: Session, assignmentId: string): Promise<void> {
  await redisRest.del(teamAssignmentKey(session.sessionCode, assignmentId))
  await redisRest.srem(teamAssignmentsListKey(session.sessionCode), assignmentId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Conflicts of Interest CRUD
// ============================================================================

export async function createConflictOfInterest(
  session: Session,
  judgeDeviceId: string,
  teamNumber: string,
  createdBy: 'judge' | 'judge_advisor',
  reason?: string,
): Promise<ConflictOfInterest> {
  const id = randomUUID()
  const conflict: ConflictOfInterest = {
    id,
    sessionId: session.id,
    judgeDeviceId,
    teamNumber,
    reason,
    createdBy,
    createdAt: Date.now(),
  }

  await redisRest.hset(conflictKey(session.sessionCode, id), {
    id: conflict.id,
    sessionId: conflict.sessionId,
    judgeDeviceId: conflict.judgeDeviceId,
    teamNumber: conflict.teamNumber,
    reason: conflict.reason ?? '',
    createdBy: conflict.createdBy,
    createdAt: conflict.createdAt,
  })
  await redisRest.sadd(conflictsListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return conflict
}

export async function listConflictsOfInterest(session: Session): Promise<ConflictOfInterest[]> {
  const ids = await redisRest.smembers<string[]>(conflictsListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const conflicts = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(conflictKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateConflict(data)
  }))
  return conflicts.filter((c): c is ConflictOfInterest => Boolean(c))
}

export async function deleteConflictOfInterest(session: Session, conflictId: string): Promise<void> {
  await redisRest.del(conflictKey(session.sessionCode, conflictId))
  await redisRest.srem(conflictsListKey(session.sessionCode), conflictId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Notebook Scores CRUD
// ============================================================================

export async function createNotebookScore(
  session: Session,
  input: Omit<NotebookScore, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>,
): Promise<NotebookScore> {
  const id = randomUUID()
  const now = Date.now()
  const score: NotebookScore = {
    id,
    sessionId: session.id,
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  await redisRest.hset(notebookScoreKey(session.sessionCode, id), {
    id: score.id,
    sessionId: score.sessionId,
    judgeTeamId: score.judgeTeamId,
    teamNumber: score.teamNumber,
    scores: JSON.stringify(score.scores),
    totalScore: score.totalScore,
    notes: score.notes ?? '',
    gradeLevel: score.gradeLevel ?? '',
    judgeName: score.judgeName ?? '',
    digitalNotebookUrl: score.digitalNotebookUrl ?? '',
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
    createdBy: score.createdBy,
  })
  await redisRest.sadd(notebookScoresListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return score
}

export async function listNotebookScores(session: Session): Promise<NotebookScore[]> {
  const ids = await redisRest.smembers<string[]>(notebookScoresListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const scores = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(notebookScoreKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateNotebookScore(data)
  }))
  return scores.filter((s): s is NotebookScore => Boolean(s))
}

export async function updateNotebookScore(
  session: Session,
  scoreId: string,
  updates: {
    judgeTeamId?: string;
    teamNumber?: string;
    scores?: Record<string, number> | undefined;
    totalScore?: number | undefined;
    notes?: string | undefined;
    gradeLevel?: 'ES' | 'MS' | 'HS' | 'University' | undefined;
    judgeName?: string | undefined;
    digitalNotebookUrl?: string | undefined;
    createdBy?: string;
  },
): Promise<NotebookScore | null> {
  const existingData = await redisRest.hgetall<Record<string, string>>(notebookScoreKey(session.sessionCode, scoreId))
  if (!existingData || Object.keys(existingData).length === 0) return null

  const existing = hydrateNotebookScore(existingData)
  const updated: NotebookScore = {
    ...existing,
    ...(updates.judgeTeamId !== undefined && { judgeTeamId: updates.judgeTeamId }),
    ...(updates.teamNumber !== undefined && { teamNumber: updates.teamNumber }),
    ...(updates.scores !== undefined && { scores: updates.scores }),
    ...(updates.totalScore !== undefined && { totalScore: updates.totalScore }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
    ...(updates.gradeLevel !== undefined && { gradeLevel: updates.gradeLevel }),
    ...(updates.judgeName !== undefined && { judgeName: updates.judgeName }),
    ...(updates.digitalNotebookUrl !== undefined && { digitalNotebookUrl: updates.digitalNotebookUrl }),
    ...(updates.createdBy !== undefined && { createdBy: updates.createdBy }),
    updatedAt: Date.now(),
  }

  await redisRest.hset(notebookScoreKey(session.sessionCode, scoreId), {
    id: updated.id,
    sessionId: updated.sessionId,
    judgeTeamId: updated.judgeTeamId,
    teamNumber: updated.teamNumber,
    scores: JSON.stringify(updated.scores),
    totalScore: updated.totalScore,
    notes: updated.notes ?? '',
    gradeLevel: updated.gradeLevel ?? '',
    judgeName: updated.judgeName ?? '',
    digitalNotebookUrl: updated.digitalNotebookUrl ?? '',
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    createdBy: updated.createdBy,
  })
  await touchSession(session.sessionCode)
  return updated
}

export async function deleteNotebookScore(session: Session, scoreId: string): Promise<void> {
  await redisRest.del(notebookScoreKey(session.sessionCode, scoreId))
  await redisRest.srem(notebookScoresListKey(session.sessionCode), scoreId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Interview Scores CRUD
// ============================================================================

export async function createInterviewScore(
  session: Session,
  input: Omit<InterviewScore, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>,
): Promise<InterviewScore> {
  const id = randomUUID()
  const now = Date.now()
  const score: InterviewScore = {
    id,
    sessionId: session.id,
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  await redisRest.hset(interviewScoreKey(session.sessionCode, id), {
    id: score.id,
    sessionId: score.sessionId,
    judgeTeamId: score.judgeTeamId,
    teamNumber: score.teamNumber,
    scores: JSON.stringify(score.scores),
    totalScore: score.totalScore,
    notes: score.notes ?? '',
    gradeLevel: score.gradeLevel ?? '',
    judgeName: score.judgeName ?? '',
    specialAttributes: score.specialAttributes ?? '',
    interviewDuration: score.interviewDuration?.toString() ?? '',
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
    createdBy: score.createdBy,
  })
  await redisRest.sadd(interviewScoresListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return score
}

export async function listInterviewScores(session: Session): Promise<InterviewScore[]> {
  const ids = await redisRest.smembers<string[]>(interviewScoresListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const scores = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(interviewScoreKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateInterviewScore(data)
  }))
  return scores.filter((s): s is InterviewScore => Boolean(s))
}

export async function updateInterviewScore(
  session: Session,
  scoreId: string,
  updates: {
    judgeTeamId?: string;
    teamNumber?: string;
    scores?: Record<string, number> | undefined;
    totalScore?: number | undefined;
    notes?: string | undefined;
    gradeLevel?: 'ES' | 'MS' | 'HS' | 'University' | undefined;
    judgeName?: string | undefined;
    specialAttributes?: string | undefined;
    interviewDuration?: number | undefined;
    createdBy?: string;
  },
): Promise<InterviewScore | null> {
  const existingData = await redisRest.hgetall<Record<string, string>>(interviewScoreKey(session.sessionCode, scoreId))
  if (!existingData || Object.keys(existingData).length === 0) return null

  const existing = hydrateInterviewScore(existingData)
  const updated: InterviewScore = {
    ...existing,
    ...(updates.judgeTeamId !== undefined && { judgeTeamId: updates.judgeTeamId }),
    ...(updates.teamNumber !== undefined && { teamNumber: updates.teamNumber }),
    ...(updates.scores !== undefined && { scores: updates.scores }),
    ...(updates.totalScore !== undefined && { totalScore: updates.totalScore }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
    ...(updates.gradeLevel !== undefined && { gradeLevel: updates.gradeLevel }),
    ...(updates.judgeName !== undefined && { judgeName: updates.judgeName }),
    ...(updates.specialAttributes !== undefined && { specialAttributes: updates.specialAttributes }),
    ...(updates.interviewDuration !== undefined && { interviewDuration: updates.interviewDuration }),
    ...(updates.createdBy !== undefined && { createdBy: updates.createdBy }),
    updatedAt: Date.now(),
  }

  await redisRest.hset(interviewScoreKey(session.sessionCode, scoreId), {
    id: updated.id,
    sessionId: updated.sessionId,
    judgeTeamId: updated.judgeTeamId,
    teamNumber: updated.teamNumber,
    scores: JSON.stringify(updated.scores),
    totalScore: updated.totalScore,
    notes: updated.notes ?? '',
    gradeLevel: updated.gradeLevel ?? '',
    judgeName: updated.judgeName ?? '',
    specialAttributes: updated.specialAttributes ?? '',
    interviewDuration: updated.interviewDuration?.toString() ?? '',
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    createdBy: updated.createdBy,
  })
  await touchSession(session.sessionCode)
  return updated
}

export async function deleteInterviewScore(session: Session, scoreId: string): Promise<void> {
  await redisRest.del(interviewScoreKey(session.sessionCode, scoreId))
  await redisRest.srem(interviewScoresListKey(session.sessionCode), scoreId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Team Nominations CRUD
// ============================================================================

export async function createNomination(
  session: Session,
  input: Omit<TeamNomination, 'id' | 'sessionId' | 'createdAt'>,
): Promise<TeamNomination> {
  const id = randomUUID()
  const nomination: TeamNomination = {
    id,
    sessionId: session.id,
    createdAt: Date.now(),
    ...input,
  }

  await redisRest.hset(nominationKey(session.sessionCode, id), {
    id: nomination.id,
    sessionId: nomination.sessionId,
    judgeTeamId: nomination.judgeTeamId,
    teamNumber: nomination.teamNumber,
    awardCategory: nomination.awardCategory,
    notes: nomination.notes ?? '',
    createdAt: nomination.createdAt,
    createdBy: nomination.createdBy,
  })
  await redisRest.sadd(nominationsListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return nomination
}

export async function listNominations(session: Session): Promise<TeamNomination[]> {
  const ids = await redisRest.smembers<string[]>(nominationsListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const nominations = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(nominationKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateNomination(data)
  }))
  return nominations.filter((n): n is TeamNomination => Boolean(n))
}

export async function deleteNomination(session: Session, nominationId: string): Promise<void> {
  await redisRest.del(nominationKey(session.sessionCode, nominationId))
  await redisRest.srem(nominationsListKey(session.sessionCode), nominationId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Timer Settings
// ============================================================================

export async function getTimerSettings(session: Session): Promise<TimerSettings | null> {
  const data = await redisRest.hgetall<Record<string, string>>(timerSettingsKey(session.sessionCode))
  if (!data || Object.keys(data).length === 0) return null
  return hydrateTimerSettings(data)
}

export async function initializeTimer(session: Session, deviceId: string): Promise<TimerSettings> {
  const timer: TimerSettings = {
    sessionId: session.id,
    defaultDuration: 600, // 10 minutes default
    currentDuration: 600,
    isRunning: false,
    isPaused: false,
    updatedAt: Date.now(),
    updatedBy: deviceId,
  }

  await redisRest.hset(timerSettingsKey(session.sessionCode), {
    sessionId: timer.sessionId,
    defaultDuration: timer.defaultDuration,
    currentDuration: timer.currentDuration,
    isRunning: String(timer.isRunning),
    isPaused: String(timer.isPaused),
    startedAt: '',
    pausedAt: '',
    updatedAt: timer.updatedAt,
    updatedBy: timer.updatedBy,
  })
  await touchSession(session.sessionCode)
  return timer
}

export async function updateTimer(
  session: Session,
  updates: {
    defaultDuration?: number | undefined;
    currentDuration?: number | undefined;
    isRunning?: boolean | undefined;
    isPaused?: boolean | undefined;
    startedAt?: number | undefined;
    pausedAt?: number | undefined;
    updatedAt?: number;
    updatedBy?: string;
  },
): Promise<TimerSettings | null> {
  const existing = await getTimerSettings(session)
  if (!existing) return null

  const updated: TimerSettings = {
    ...existing,
    ...(updates.defaultDuration !== undefined && { defaultDuration: updates.defaultDuration }),
    ...(updates.currentDuration !== undefined && { currentDuration: updates.currentDuration }),
    ...(updates.isRunning !== undefined && { isRunning: updates.isRunning }),
    ...(updates.isPaused !== undefined && { isPaused: updates.isPaused }),
    ...(updates.startedAt !== undefined && { startedAt: updates.startedAt }),
    ...(updates.pausedAt !== undefined && { pausedAt: updates.pausedAt }),
    ...(updates.updatedBy !== undefined && { updatedBy: updates.updatedBy }),
    updatedAt: Date.now(),
  }

  await redisRest.hset(timerSettingsKey(session.sessionCode), {
    sessionId: updated.sessionId,
    defaultDuration: updated.defaultDuration,
    currentDuration: updated.currentDuration,
    isRunning: String(updated.isRunning),
    isPaused: String(updated.isPaused),
    startedAt: updated.startedAt?.toString() ?? '',
    pausedAt: updated.pausedAt?.toString() ?? '',
    updatedAt: updated.updatedAt,
    updatedBy: updated.updatedBy,
  })
  await touchSession(session.sessionCode)
  return updated
}

// ============================================================================
// JUDGING SYSTEM - Team Photos CRUD
// ============================================================================

export async function createTeamPhoto(
  session: Session,
  input: Omit<TeamPhoto, 'id' | 'sessionId' | 'createdAt'>,
): Promise<TeamPhoto> {
  const id = randomUUID()
  const photo: TeamPhoto = {
    id,
    sessionId: session.id,
    createdAt: Date.now(),
    ...input,
  }

  await redisRest.hset(teamPhotoKey(session.sessionCode, id), {
    id: photo.id,
    sessionId: photo.sessionId,
    teamNumber: photo.teamNumber,
    judgeTeamId: photo.judgeTeamId ?? '',
    url: photo.url,
    caption: photo.caption ?? '',
    createdAt: photo.createdAt,
    createdBy: photo.createdBy,
  })
  await redisRest.sadd(teamPhotosListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return photo
}

export async function listTeamPhotos(session: Session): Promise<TeamPhoto[]> {
  const ids = await redisRest.smembers<string[]>(teamPhotosListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const photos = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(teamPhotoKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateTeamPhoto(data)
  }))
  return photos.filter((p): p is TeamPhoto => Boolean(p))
}

export async function deleteTeamPhoto(session: Session, photoId: string): Promise<void> {
  await redisRest.del(teamPhotoKey(session.sessionCode, photoId))
  await redisRest.srem(teamPhotosListKey(session.sessionCode), photoId)
  await touchSession(session.sessionCode)
}

// ============================================================================
// JUDGING SYSTEM - Team Judging Notes CRUD
// ============================================================================

export async function createTeamJudgingNote(
  session: Session,
  input: Omit<TeamJudgingNote, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>,
): Promise<TeamJudgingNote> {
  const id = randomUUID()
  const now = Date.now()
  const note: TeamJudgingNote = {
    id,
    sessionId: session.id,
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  await redisRest.hset(teamJudgingNoteKey(session.sessionCode, id), {
    id: note.id,
    sessionId: note.sessionId,
    judgeTeamId: note.judgeTeamId,
    teamNumber: note.teamNumber,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    createdBy: note.createdBy,
  })
  await redisRest.sadd(teamJudgingNotesListKey(session.sessionCode), id)
  await touchSession(session.sessionCode)
  return note
}

export async function listTeamJudgingNotes(session: Session): Promise<TeamJudgingNote[]> {
  const ids = await redisRest.smembers<string[]>(teamJudgingNotesListKey(session.sessionCode))
  if (!ids || ids.length === 0) return []
  const notes = await Promise.all(ids.map(async (id) => {
    const data = await redisRest.hgetall<Record<string, string>>(teamJudgingNoteKey(session.sessionCode, id))
    if (!data || Object.keys(data).length === 0) return null
    return hydrateTeamJudgingNote(data)
  }))
  return notes.filter((n): n is TeamJudgingNote => Boolean(n))
}

export async function updateTeamJudgingNote(
  session: Session,
  noteId: string,
  content: string,
): Promise<TeamJudgingNote | null> {
  const existingData = await redisRest.hgetall<Record<string, string>>(teamJudgingNoteKey(session.sessionCode, noteId))
  if (!existingData || Object.keys(existingData).length === 0) return null

  const existing = hydrateTeamJudgingNote(existingData)
  const updated: TeamJudgingNote = {
    ...existing,
    content,
    updatedAt: Date.now(),
  }

  await redisRest.hset(teamJudgingNoteKey(session.sessionCode, noteId), {
    id: updated.id,
    sessionId: updated.sessionId,
    judgeTeamId: updated.judgeTeamId,
    teamNumber: updated.teamNumber,
    content: updated.content,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    createdBy: updated.createdBy,
  })
  await touchSession(session.sessionCode)
  return updated
}

export async function deleteTeamJudgingNote(session: Session, noteId: string): Promise<void> {
  await redisRest.del(teamJudgingNoteKey(session.sessionCode, noteId))
  await redisRest.srem(teamJudgingNotesListKey(session.sessionCode), noteId)
  await touchSession(session.sessionCode)
}
