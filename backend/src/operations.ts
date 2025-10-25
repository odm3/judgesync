interface Operation {
  seq: number
  timestamp: number
  payload: unknown
}

const sequences = new Map<string, number>()
const buffers = new Map<string, Operation[]>()
const MAX_BUFFER_SIZE = 200

export function getNextSeq(sessionId: string) {
  const next = (sequences.get(sessionId) ?? 0) + 1
  sequences.set(sessionId, next)
  return next
}

export function storeOperation(sessionId: string, op: Operation) {
  const list = buffers.get(sessionId) ?? []
  list.push(op)
  if (list.length > MAX_BUFFER_SIZE) {
    list.shift()
  }
  buffers.set(sessionId, list)
}

export function getOperationsSince(sessionId: string, seq: number) {
  const list = buffers.get(sessionId) ?? []
  return list.filter((op) => op.seq > seq)
}

export function clearOperations(sessionId: string) {
  buffers.delete(sessionId)
  sequences.delete(sessionId)
}
