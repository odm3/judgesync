import { useEffect, useState, useCallback, useRef } from 'react'
import {
  addTeamImage,
  deleteTeamImage,
  listTeamImages,
  type TeamImageRecord,
} from '@/storage/teamImages'

interface TeamImageView extends TeamImageRecord {
  objectUrl: string
}

interface UseTeamImagesResult {
  images: TeamImageView[]
  isLoading: boolean
  addImage: (file: File) => Promise<void>
  removeImage: (id: number) => Promise<void>
}

export function useTeamImages(eventSku: string, teamNumber: string): UseTeamImagesResult {
  const [images, setImages] = useState<TeamImageView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const imagesRef = useRef<TeamImageView[]>([])

  const loadImages = useCallback(async () => {
    setIsLoading(true)
    try {
      const records = await listTeamImages(eventSku, teamNumber)
      setImages((previous) => {
        previous.forEach((img) => URL.revokeObjectURL(img.objectUrl))
        const next = records.map((record) => ({
          ...record,
          objectUrl: URL.createObjectURL(record.blob),
        }))
        imagesRef.current = next
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [eventSku, teamNumber])

  useEffect(() => {
    loadImages()

    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.objectUrl))
      imagesRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImages])

  const addImage = useCallback(
    async (file: File) => {
      await addTeamImage(eventSku, teamNumber, file)
      await loadImages()
    },
    [eventSku, teamNumber, loadImages]
  )

  const removeImage = useCallback(
    async (id: number) => {
      await deleteTeamImage(id)
      await loadImages()
    },
    [loadImages]
  )

  return {
    images,
    isLoading,
    addImage,
    removeImage,
  }
}
