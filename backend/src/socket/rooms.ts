import type { Server as SocketIOServer, Socket } from 'socket.io'

export function getRoomName(sessionCode: string) {
  return `session:${sessionCode}`
}

export function getSocketsInRoom(io: SocketIOServer, sessionCode: string) {
  return io.sockets.adapter.rooms.get(getRoomName(sessionCode)) ?? new Set<string>()
}

export function broadcastToRoom(io: SocketIOServer, sessionCode: string, event: string, data: unknown) {
  io.to(getRoomName(sessionCode)).emit(event, data)
}

export function broadcastToRole(io: SocketIOServer, sessionCode: string, role: string, event: string, data: unknown, participants: Array<{ deviceId: string; role: string }>) {
  const sockets = getSocketsInRoom(io, sessionCode)
  const targetDeviceIds = participants.filter((p) => p.role === role).map((p) => p.deviceId)
  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId)
    if (!socket) continue
    const deviceId = socket.data?.deviceId as string | undefined
    if (deviceId && targetDeviceIds.includes(deviceId)) {
      socket.emit(event, data)
    }
  }
}

export function joinRoom(socket: Socket, sessionCode: string) {
  socket.join(getRoomName(sessionCode))
}

export function leaveRoom(socket: Socket, sessionCode: string) {
  socket.leave(getRoomName(sessionCode))
}
