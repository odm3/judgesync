import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EventSkuInput } from '@/components/EventSkuInput'
import { Gavel } from 'lucide-react'

export function HomePage() {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleEventSubmit = async (sku: string) => {
    setIsLoading(true)
    // Navigate to the event page - the event page will handle the actual API call
    navigate(`/${sku}`)
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-8 md:py-16">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Gavel className="h-8 w-8 text-emerald-500" />
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                JudgeSync
              </h1>
            </div>
            <p className="text-sm text-gray-400">
              Collaborative judging for VEX Robotics competitions
            </p>
          </div>

          {/* Event Search */}
          <EventSkuInput onSubmit={handleEventSubmit} isLoading={isLoading} />

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 pt-8 space-y-1">
            <p>Local-first collaborative judging with offline support</p>
            <p>Works on any device</p>
          </div>
        </div>
      </div>
    </div>
  )
}
