import { Hono } from 'hono'
import { z } from 'zod'
import {
  assignJudgeAdvisor,
  ensureSession,
  getSessionByCode,
  getSessionBySku,
  getSessionById,
  createOtpForSession,
  consumeOtp,
  serializeSession,
  serializeParticipant,
  serializePendingOtp,
  addParticipant,
  addFieldNoteToSession,
  updateFieldNoteResolution,
  serializeFieldNote,
  removeParticipantByDevice,
  setParticipantRole,
  getParticipantByDevice,
  updateJudgeAdvisor,
  getSocketIO,
  storeSigningKey,
  deleteSigningKey,
  touchSession,
} from '../store.js'
import { getRoomName, broadcastToRoom, broadcastToRole } from '../socket/rooms.js'
import { generateToken, revokeToken } from '../auth/jwt.js'
import { requireAuth, getAuth } from '../middleware/auth.js'
import { requireSignature } from '../middleware/hmac.js'

const createSessionSchema = z.object({
  eventSku: z.string().min(3),
  deviceId: z.string().min(3),
  displayName: z.string().min(1),
})

const sessionBySkuSchema = z.object({
  deviceId: z.string().min(3),
  displayName: z.string().min(1),
  role: z.enum(['judge_advisor', 'judge', 'viewer']).default('judge'),
})

const otpRequestSchema = z.object({
  deviceId: z.string().min(3),
  displayName: z.string().min(1),
  requestedRole: z.enum(['judge', 'viewer']).default('judge'),
})

const otpApproveSchema = z.object({
  otp: z.string().length(6),
  advisorDeviceId: z.string().min(3),
})

const fieldNoteCreateSchema = z.object({
  deviceId: z.string().min(3),
  reporterName: z.string().min(1),
  division: z.string().max(120).optional(),
  fieldLocation: z.string().max(120).optional(),
  matchIdentifier: z.string().max(120).optional(),
  teamsInvolved: z.string().min(1),
  issueSummary: z.string().min(1),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  sentiment: z.enum(['positive', 'negative']).default('negative'),
})

const fieldNoteUpdateSchema = z.object({
  deviceId: z.string().min(3),
  resolved: z.boolean(),
})

const participantRoleUpdateSchema = z.object({
  advisorDeviceId: z.string().min(3),
  role: z.enum(['judge_advisor', 'judge', 'viewer', 'head_referee', 'field_staff', 'event_partner']),
})

const participantRemoveSchema = z.object({
  advisorDeviceId: z.string().min(3),
})

const FIELD_NOTE_ALLOWED_ROLES = new Set(['judge', 'judge_advisor', 'head_referee', 'field_staff', 'event_partner'])

export const sessionsRoute = new Hono()

sessionsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parseResult = createSessionSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid session payload' } }, 400)
  }
  const { eventSku, deviceId, displayName } = parseResult.data

  // Get/create the session
  const session = await ensureSession(eventSku)

  // Generate JWT and signing key for the participant
  const { token, tokenId } = await generateToken(deviceId, session.sessionCode, 'judge_advisor')

  // Assign judge advisor with skipTouch=true (we'll touch at the end)
  const participant = await assignJudgeAdvisor(session, deviceId, displayName, tokenId, true)

  const signingKey = await storeSigningKey(session.sessionCode, deviceId, session.id)

  // Touch session once at the end of transaction
  await touchSession(session.sessionCode)

  const serialized = await serializeSession(session)
  const io = getSocketIO()
  if (io) {
    broadcastToRoom(io, session.sessionCode, 'session:state', serialized)
  }

  return c.json({
    session: serialized,
    participant: await serializeParticipant(participant),
    auth: {
      token,
      signingKey,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      tokenId,
    },
  })
})

sessionsRoute.post('/by-sku/:eventSku', async (c) => {
  console.log("This shit wack");
  const params = sessionBySkuSchema.safeParse(await c.req.json().catch(() => null))
  console.log(params);
  if (!params.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid session payload' } }, 400)
  }
  const eventSku = c.req.param('eventSku')
  console.log(params);
  const { deviceId, displayName, role } = params.data

  if (role === 'judge_advisor') {
    // Get/create the session
    const session = await ensureSession(eventSku)

    // Generate JWT and signing key for the participant
    const { token, tokenId } = await generateToken(deviceId, session.sessionCode, 'judge_advisor')

    // Assign judge advisor with skipTouch=true (we'll touch at the end)
    const participant = await assignJudgeAdvisor(session, deviceId, displayName, tokenId, true)

    const signingKey = await storeSigningKey(session.sessionCode, deviceId, session.id)

    // Touch session once at the end of transaction
    await touchSession(session.sessionCode)

    const serialized = await serializeSession(session)
    const io = getSocketIO()
    if (io) {
      broadcastToRoom(io, session.sessionCode, 'session:state', serialized)
    }
    return c.json({
      session: serialized,
      participant: await serializeParticipant(participant),
      auth: {
        token,
        signingKey,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        tokenId,
      },
    })
  }

  const session = await ensureSession(eventSku)
  return c.json({ session: await serializeSession(session) })
})

sessionsRoute.post('/by-sku/:eventSku/otp', async (c) => {
  const eventSku = c.req.param('eventSku')
  const session = await ensureSession(eventSku)

  const body = await c.req.json().catch(() => null)
  console.log(body);
  const parseResult = otpRequestSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid OTP payload' } }, 400)
  }

  const { deviceId, displayName, requestedRole } = parseResult.data
  const pending = await createOtpForSession(session, deviceId, displayName, requestedRole)

  const io = getSocketIO()
  if (io) {
    const serializedSession = await serializeSession(session)
    const participants = serializedSession.participants.map((participant) => ({
      deviceId: participant.deviceId,
      role: participant.role,
    }))
    broadcastToRole(
      io,
      session.sessionCode,
      'judge_advisor',
      'join_request_pending',
      { otp: await serializePendingOtp(pending) },
      participants,
    )
  }

  return c.json({
    otp: pending.otp,
    expiresAt: pending.expiresAt,
    sessionCode: session.sessionCode,
  })
})

sessionsRoute.post('/:code/otp', async (c) => {
  const code = c.req.param('code')
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parseResult = otpRequestSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid OTP payload' } }, 400)
  }

  const { deviceId, displayName, requestedRole } = parseResult.data
  const pending = await createOtpForSession(session, deviceId, displayName, requestedRole)

  const io = getSocketIO()
  if (io) {
    const serializedSession = await serializeSession(session)
    const participants = serializedSession.participants.map((participant) => ({
      deviceId: participant.deviceId,
      role: participant.role,
    }))
    broadcastToRole(
      io,
      session.sessionCode,
      'judge_advisor',
      'join_request_pending',
      { otp: await serializePendingOtp(pending) },
      participants,
    )
  }

  return c.json({
    otp: pending.otp,
    expiresAt: pending.expiresAt,
    sessionCode: session.sessionCode,
  })
})

sessionsRoute.post('/:code/approve', requireAuth, async (c) => {
  const code = c.req.param('code')
  console.log(`CodeL ${code}`);
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const auth = getAuth(c)
  const advisorDeviceId = auth.deviceId

  const body = await c.req.json().catch(() => null)
  console.log(body);
  const parseResult = z.object({ otp: z.string().length(6) }).safeParse(body)
  console.log(parseResult);
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid approval payload' } }, 400)
  }
  const { otp } = parseResult.data
  console.log(`OTP: ${otp}`);
  // Verify that the authenticated user is the judge advisor
  if (!session.judgeAdvisorDeviceId) {
    session.judgeAdvisorDeviceId = advisorDeviceId
  }
  if (session.judgeAdvisorDeviceId !== advisorDeviceId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Only the Judge Advisor may approve requests' } }, 403)
  }

  const pending = await consumeOtp(otp)
  const io = getSocketIO()

  if (!pending || pending.sessionId !== session.id) {
    // Notify requesting device that their OTP was rejected/invalid
    if (io && pending) {
      io.to(getRoomName(session.sessionCode)).emit('otp:rejected', {
        deviceId: pending.deviceId,
        reason: 'invalid_or_expired',
        otp,
      })
    }
    return c.json({ error: { code: 'OTP_INVALID', message: 'OTP is invalid or expired' } }, 400)
  }

  try {
    // Generate JWT and signing key for the newly approved participant
    const { token, tokenId } = await generateToken(pending.deviceId, session.sessionCode, pending.requestedRole)
    const participant = await addParticipant(session, pending.deviceId, pending.displayName, pending.requestedRole, tokenId, false, true)
    const signingKey = await storeSigningKey(session.sessionCode, pending.deviceId, session.id)

    // Touch session once at end of transaction
    await touchSession(session.sessionCode)

    const serializedParticipant = await serializeParticipant(participant)
    const serializedSession = await serializeSession(session)

    if (io) {
      const room = getRoomName(session.sessionCode)
      io.to(room).emit('participant:joined', {
        participant: serializedParticipant,
        session: serializedSession,
      })
    }

    return c.json({
      participant: serializedParticipant,
      session: serializedSession,
      auth: {
        token,
        signingKey,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        tokenId,
      },
    })
  } catch (error) {
    // Notify requesting device that approval failed
    if (io) {
      io.to(getRoomName(session.sessionCode)).emit('otp:rejected', {
        deviceId: pending.deviceId,
        reason: 'approval_failed',
        otp,
      })
    }
    throw error
  }
})

sessionsRoute.patch('/:code/participants/:participantDeviceId/role', requireAuth, requireSignature, async (c) => {
  const code = c.req.param('code')
  const targetDeviceId = c.req.param('participantDeviceId')
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const auth = getAuth(c)
  const advisorDeviceId = auth.deviceId

  const body = await c.req.json().catch(() => null)
  const parseResult = z.object({ role: z.enum(['judge_advisor', 'judge', 'viewer', 'head_referee', 'field_staff', 'event_partner']) }).safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid role update payload' } }, 400)
  }

  const { role } = parseResult.data

  // Verify that the authenticated user is the judge advisor
  if (session.judgeAdvisorDeviceId !== advisorDeviceId) {
    const advisor = await getParticipantByDevice(session, advisorDeviceId)
    if (!advisor || advisor.role !== 'judge_advisor') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Only the Judge Advisor may update roles' } }, 403)
    }
  }

  // Check that participant exists
  const existing = await getParticipantByDevice(session, targetDeviceId)
  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Participant not found' } }, 404)
  }

  // Generate new token with new role (addParticipant handles revocation of old token)
  const { token, tokenId } = await generateToken(targetDeviceId, session.sessionCode, role)
  const updated = await addParticipant(session, existing.deviceId, existing.displayName, role, tokenId, existing.connected, true)

  if (role === 'judge_advisor') {
    await updateJudgeAdvisor(session, targetDeviceId)
  } else if (session.judgeAdvisorDeviceId === targetDeviceId) {
    await updateJudgeAdvisor(session, advisorDeviceId)
  }

  const signingKey = await storeSigningKey(session.sessionCode, targetDeviceId, session.id)

  // Touch session once at end of transaction
  await touchSession(session.sessionCode)

  const serializedParticipant = await serializeParticipant(updated)
  const serializedSession = await serializeSession(session)

  const io = getSocketIO()
  if (io) {
    const room = getRoomName(session.sessionCode)
    io.to(room).emit('participant:role', {
      participant: serializedParticipant,
      session: serializedSession,
    })
  }

  return c.json({
    participant: serializedParticipant,
    session: serializedSession,
    auth: {
      token,
      signingKey,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      tokenId,
    },
  })
})

sessionsRoute.delete('/:code/participants/:participantDeviceId', requireAuth, requireSignature, async (c) => {
  const code = c.req.param('code')
  const targetDeviceId = c.req.param('participantDeviceId')
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const auth = getAuth(c)
  const advisorDeviceId = auth.deviceId

  // Verify that the authenticated user is the judge advisor
  if (session.judgeAdvisorDeviceId !== advisorDeviceId) {
    const advisor = await getParticipantByDevice(session, advisorDeviceId)
    if (!advisor || advisor.role !== 'judge_advisor') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Only the Judge Advisor may remove participants' } }, 403)
    }
  }

  await removeParticipantByDevice(session, targetDeviceId)
  await deleteSigningKey(session.sessionCode, targetDeviceId)

  if (session.judgeAdvisorDeviceId === targetDeviceId) {
    await updateJudgeAdvisor(session, null)
  }

  const serializedSession = await serializeSession(session)
  const io = getSocketIO()
  if (io) {
    const room = getRoomName(session.sessionCode)
    io.to(room).emit('participant:removed', {
      deviceId: targetDeviceId,
      session: serializedSession,
    })
  }

  return c.json({
    session: serializedSession,
  })
})

sessionsRoute.post('/:code/field-notes', requireAuth, requireSignature, async (c) => {
  const code = c.req.param('code')
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const auth = getAuth(c)
  const deviceId = auth.deviceId

  const body = await c.req.json().catch(() => null)
  const parseResult = z.object({
    reporterName: z.string().min(1),
    division: z.string().max(120).optional(),
    fieldLocation: z.string().max(120).optional(),
    matchIdentifier: z.string().max(120).optional(),
    teamsInvolved: z.string().min(1),
    issueSummary: z.string().min(1),
    priority: z.enum(['normal', 'urgent']).default('normal'),
    sentiment: z.enum(['positive', 'negative']).default('negative'),
  }).safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid field note payload' } }, 400)
  }

  const {
    reporterName,
    division = '',
    fieldLocation = '',
    matchIdentifier = '',
    teamsInvolved,
    issueSummary,
    priority,
    sentiment,
  } = parseResult.data

  const participant = await getParticipantByDevice(session, deviceId)
  if (!participant) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Participant not part of this session' } }, 403)
  }

  if (!FIELD_NOTE_ALLOWED_ROLES.has(participant.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions to create field notes' } }, 403)
  }

  const note = await addFieldNoteToSession(session, {
    reporterDeviceId: deviceId,
    reporterName,
    reporterRole: participant.role,
    division: division ?? '',
    fieldLocation: fieldLocation ?? '',
    matchIdentifier: matchIdentifier ?? '',
    teamsInvolved,
    issueSummary,
    priority,
    sentiment,
    resolved: false,
  })

  const serializedNote = serializeFieldNote(note)
  const serializedSession = await serializeSession(session)

  const io = getSocketIO()
  if (io) {
    const room = getRoomName(session.sessionCode)
    io.to(room).emit('field_note:created', { fieldNote: serializedNote })
  }

  return c.json({
    fieldNote: serializedNote,
    session: serializedSession,
  })
})

sessionsRoute.patch('/:code/field-notes/:noteId', requireAuth, requireSignature, async (c) => {
  const code = c.req.param('code')
  const noteId = Number.parseInt(c.req.param('noteId'), 10)
  if (Number.isNaN(noteId)) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid field note id' } }, 400)
  }
  const session = await getSessionByCode(code)
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }

  const auth = getAuth(c)
  const deviceId = auth.deviceId

  const body = await c.req.json().catch(() => null)
  const parseResult = z.object({ resolved: z.boolean() }).safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid field note update payload' } }, 400)
  }

  const { resolved } = parseResult.data
  const participant = await getParticipantByDevice(session, deviceId)
  if (!participant) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Participant not part of this session' } }, 403)
  }

  if (!FIELD_NOTE_ALLOWED_ROLES.has(participant.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions to update field notes' } }, 403)
  }

  const note = await updateFieldNoteResolution(session, noteId, resolved)
  if (!note) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Field note not found' } }, 404)
  }

  const serializedNote = serializeFieldNote(note)
  const serializedSession = await serializeSession(session)

  const io = getSocketIO()
  if (io) {
    const room = getRoomName(session.sessionCode)
    io.to(room).emit('field_note:updated', { fieldNote: serializedNote })
  }

  return c.json({
    fieldNote: serializedNote,
    session: serializedSession,
  })
})

sessionsRoute.get('/by-sku/:eventSku', async (c) => {
  const session = await getSessionBySku(c.req.param('eventSku'))
  if (!session) {
    const created = await ensureSession(c.req.param('eventSku'))
    return c.json({ session: await serializeSession(created) })
  }
  return c.json({ session: await serializeSession(session) })
})

sessionsRoute.get('/:code', async (c) => {
  const session = await getSessionByCode(c.req.param('code'))
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }
  return c.json({ session: await serializeSession(session) })
})

sessionsRoute.get('/id/:sessionId', async (c) => {
  const session = await getSessionById(c.req.param('sessionId'))
  if (!session) {
    return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
  }
  return c.json({ session: await serializeSession(session) })
})
