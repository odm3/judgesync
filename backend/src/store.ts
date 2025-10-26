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
  console.log(`Sessions: ${sessions} `);
  if (!sessions) return null
  for (const sessionCode of sessions) {
    const payload = await redisRest.hget<string | null>(otpHashKey(sessionCode), code)
    console.log(`Payload: ${payload} `);
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
