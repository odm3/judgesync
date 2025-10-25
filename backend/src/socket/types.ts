import type {
  SerializedSession,
  SerializedPendingOtp,
  SerializedParticipant,
  SerializedFieldNote,
} from '../types.js'

export interface JoinSessionPayload {
  sessionCode: string
  deviceId: string
}

export interface LeaveSessionPayload {
  sessionCode: string
  deviceId: string
}

export interface OperationPayload {
  sessionCode: string
  operation: unknown
}

export interface SnapshotResponse {
  session: SerializedSession
}

export interface JoinRequestPendingEvent {
  otp: SerializedPendingOtp
}

export interface ParticipantStatusEvent {
  participant: SerializedParticipant
}

export interface ParticipantRoleEvent {
  participant: SerializedParticipant
  session: SerializedSession
}

export interface ParticipantRemovedEvent {
  deviceId: string
  session: SerializedSession
}

export interface FieldNoteCreatedEvent {
  fieldNote: SerializedFieldNote
}

export interface FieldNoteUpdatedEvent {
  fieldNote: SerializedFieldNote
}
