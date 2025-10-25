import { io, Socket } from 'socket.io-client'

class SocketService {
  private socket: Socket | null = null
  private serverUrl: string | null = null
  private deviceId: string | null = null
  private currentSessionCode: string | null = null
  private pendingJoinPayload: { sessionCode: string; deviceId: string } | null = null

  connect(serverUrl: string, deviceId: string) {
    if (this.socket) {
      return
    }
    this.serverUrl = serverUrl
    this.deviceId = deviceId
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })

    this.socket.on('reconnect', () => {
      if (this.pendingJoinPayload) {
        this.socket?.emit('join_session', this.pendingJoinPayload)
      }
    })
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
    this.serverUrl = null
    this.deviceId = null
    this.currentSessionCode = null
    this.pendingJoinPayload = null
  }

  joinSession(sessionCode: string, deviceId: string) {
    if (!this.socket || !this.serverUrl) {
      if (this.serverUrl && deviceId) {
        this.connect(this.serverUrl, deviceId)
      } else {
        throw new Error('Socket connection has not been initialised')
      }
    }
    if (!this.socket) return
    this.currentSessionCode = sessionCode
    this.deviceId = deviceId
    this.pendingJoinPayload = { sessionCode, deviceId }
    if (this.socket.connected) {
      this.socket.emit('join_session', this.pendingJoinPayload)
    } else {
      this.socket.once('connect', () => {
        if (this.pendingJoinPayload) {
          this.socket?.emit('join_session', this.pendingJoinPayload)
        }
      })
    }
  }

  leaveSession() {
    if (this.socket && this.currentSessionCode && this.deviceId) {
      this.socket.emit('leave_session', {
        sessionCode: this.currentSessionCode,
        deviceId: this.deviceId,
      })
    }
    this.pendingJoinPayload = null
    this.currentSessionCode = null
  }

  requestSnapshot(sessionCode: string) {
    this.socket?.emit('request_snapshot', { sessionCode })
  }

  emitOperation(sessionCode: string, operation: unknown) {
    this.socket?.emit('operation', { sessionCode, operation })
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.socket?.on(event, handler)
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.socket?.off(event, handler)
  }

  onConnect(handler: () => void) {
    this.socket?.on('connect', handler)
  }

  offConnect(handler: () => void) {
    this.socket?.off('connect', handler)
  }

  onDisconnect(handler: () => void) {
    this.socket?.on('disconnect', handler)
  }

  offDisconnect(handler: () => void) {
    this.socket?.off('disconnect', handler)
  }
}

export const socketService = new SocketService()
