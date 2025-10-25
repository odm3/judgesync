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

interface SocketContext {
  sessionCode: string
  deviceId: string
}

const socketContexts = new Map<string, SocketContext>()

export function initializeSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket) => {
    socket.on('join_session', async (payload: JoinSessionPayload) => {
      const session = await getSessionByCode(payload.sessionCode)
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' })
        return
      }

      joinRoom(socket, session.sessionCode)
      socketContexts.set(socket.id, { sessionCode: session.sessionCode, deviceId: payload.deviceId })
      socket.data.sessionCode = session.sessionCode
      socket.data.deviceId = payload.deviceId

      const participant = await updateParticipantPresence(session, payload.deviceId, true)
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
