import type { Server as SocketIOServer, Socket } from 'socket.io'
import {
  getSessionByCode,
  updateParticipantPresence,
  serializeSession,
  serializeParticipant,
  getParticipantByDevice,
} from '../store.js'
import { getRoomName, joinRoom, leaveRoom, broadcastToRoom } from './rooms.js'
import type { JoinSessionPayload, LeaveSessionPayload, OperationPayload } from './types.js'
import { verifyToken } from '../auth/jwt.js'

interface SocketContext {
  sessionCode: string
  deviceId: string
}

const socketContexts = new Map<string, SocketContext>()

export function initializeSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket) => {
    socket.on('join_session', async (payload: JoinSessionPayload & { token?: string }) => {
      // Validate JWT token
      if (!payload.token) {
        socket.emit('session:error', { message: 'Authentication token required' })
        return
      }

      let deviceId: string
      try {
        const verified = await verifyToken(payload.token)
        deviceId = verified.deviceId

        // Verify the token's session matches the requested session
        if (verified.sessionCode !== payload.sessionCode) {
          socket.emit('session:error', { message: 'Token session mismatch' })
          return
        }
      } catch (error) {
        socket.emit('session:error', { message: 'Invalid or expired authentication token' })
        return
      }

      const session = await getSessionByCode(payload.sessionCode)
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' })
        return
      }

      joinRoom(socket, session.sessionCode)
      socketContexts.set(socket.id, { sessionCode: session.sessionCode, deviceId })
      socket.data.sessionCode = session.sessionCode
      socket.data.deviceId = deviceId

      const participant = await updateParticipantPresence(session, deviceId, true)
      socket.emit('session:state', await serializeSession(session))
      if (participant) {
        broadcastToRoom(io, session.sessionCode, 'participant:connected', {
          participant: await serializeParticipant(participant),
        })
      }
    })

    socket.on('leave_session', async (payload: LeaveSessionPayload) => {
      const session = await getSessionByCode(payload.sessionCode)
      if (!session) return
      leaveRoom(socket, session.sessionCode)
      await updateParticipantPresence(session, payload.deviceId, false)
      socketContexts.delete(socket.id)
      broadcastToRoom(io, session.sessionCode, 'participant:disconnected', {
        deviceId: payload.deviceId,
      })
    })

    socket.on('operation', async (payload: OperationPayload) => {
      const session = await getSessionByCode(payload.sessionCode)
      if (!session) return
      broadcastToRoom(io, session.sessionCode, 'operation', payload.operation)
    })

    socket.on('request_snapshot', async (payload: { sessionCode: string }) => {
      const session = await getSessionByCode(payload.sessionCode)
      if (!session) return
      socket.emit('session:state', await serializeSession(session))
    })

    socket.on('disconnect', async () => {
      const context = socketContexts.get(socket.id)
      if (!context) return
      const session = await getSessionByCode(context.sessionCode)
      socketContexts.delete(socket.id)
      if (!session) return
      await updateParticipantPresence(session, context.deviceId, false)
      leaveRoom(socket, context.sessionCode)
      const participant = await getParticipantByDevice(session, context.deviceId)
      if (participant) {
        broadcastToRoom(io, context.sessionCode, 'participant:disconnected', {
          deviceId: context.deviceId,
          participant: await serializeParticipant(participant),
        })
      }
    })
  })
}
