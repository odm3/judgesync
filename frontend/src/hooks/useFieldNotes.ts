import { useCallback, useEffect, useState } from 'react'
import {
  addFieldNote as addLocalFieldNote,
  listFieldNotes,
  updateFieldNoteResolution as updateLocalFieldNoteResolution,
  type FieldNoteRecord,
} from '@/storage/fieldNotes'
import { useJudgingSession, type SharingFieldNote } from '@/context/JudgingSessionContext'
import { createFieldNote, updateFieldNoteResolution } from '@/services/sharing'

interface UseFieldNotesResult {
  notes: FieldNoteRecord[]
  isLoading: boolean
  createNote: (note: Omit<FieldNoteRecord, 'id' | 'createdAt' | 'eventSku'>) => Promise<void>
  setResolved: (id: number, resolved: boolean) => Promise<void>
}

function mapSharedFieldNote(note: SharingFieldNote): FieldNoteRecord {
  return {
    id: note.id,
    eventSku: note.eventSku,
    createdAt: note.createdAt,
    reporterName: note.reporterName,
    reporterRole: note.reporterRole,
    division: note.division ?? '',
    fieldLocation: note.fieldLocation ?? '',
    matchIdentifier: note.matchIdentifier ?? '',
    teamsInvolved: note.teamsInvolved ?? '',
    issueSummary: note.issueSummary ?? '',
    priority: note.priority,
    sentiment: note.sentiment,
    resolved: note.resolved,
  }
}

export function useFieldNotes(eventSku: string): UseFieldNotesResult {
  const [notes, setNotes] = useState<FieldNoteRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { sessionCode, sessionInfo, setSessionInfo } = useJudgingSession()

  const loadLocalNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const records = await listFieldNotes(eventSku)
      setNotes(records)
    } finally {
      setIsLoading(false)
    }
  }, [eventSku])

  useEffect(() => {
    if (sessionInfo && sessionInfo.eventSku === eventSku) {
      const records = sessionInfo.fieldNotes.map(mapSharedFieldNote)
      setNotes(records)
      setIsLoading(false)
    } else {
      loadLocalNotes()
    }
  }, [sessionInfo, eventSku, loadLocalNotes])

  const createNote = useCallback(
    async (note: Omit<FieldNoteRecord, 'id' | 'createdAt' | 'eventSku'>) => {
      if (sessionCode) {
        const result = await createFieldNote(sessionCode, {
          reporterName: note.reporterName,
          division: note.division,
          fieldLocation: note.fieldLocation,
          matchIdentifier: note.matchIdentifier,
          teamsInvolved: note.teamsInvolved,
          issueSummary: note.issueSummary,
          priority: note.priority,
          sentiment: note.sentiment,
        })
        setSessionInfo(result.session)
        setNotes(result.session.fieldNotes.map(mapSharedFieldNote))
      } else {
        const record = await addLocalFieldNote({ ...note, eventSku })
        setNotes((prev) => [record, ...prev])
      }
    },
    [sessionCode, eventSku, setSessionInfo],
  )

  const setResolved = useCallback(
    async (id: number, resolved: boolean) => {
      if (sessionCode) {
        const result = await updateFieldNoteResolution(sessionCode, id, resolved)
        setSessionInfo(result.session)
        setNotes(result.session.fieldNotes.map(mapSharedFieldNote))
      } else {
        await updateLocalFieldNoteResolution(id, resolved)
        setNotes((prev) =>
          prev.map((note) => (note.id === id ? { ...note, resolved } : note)),
        )
      }
    },
    [sessionCode, setSessionInfo],
  )

  return {
    notes,
    isLoading,
    createNote,
    setResolved,
  }
}
