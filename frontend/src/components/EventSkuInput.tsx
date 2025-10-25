import { useState } from 'react'
import { isValidEventSku, formatEventSku } from '@/services/robotevents'
import { Search, AlertCircle } from 'lucide-react'

interface EventSkuInputProps {
  onSubmit: (sku: string) => void
  isLoading?: boolean
}

export function EventSkuInput({ onSubmit, isLoading = false }: EventSkuInputProps) {
  const [sku, setSku] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedSku = sku.trim()

    if (!trimmedSku) {
      setError('Please enter an event SKU')
      return
    }

    const formattedSku = formatEventSku(trimmedSku)

    if (!isValidEventSku(formattedSku)) {
      setError('Invalid SKU format. Expected format: RE-XXXXX-XX-XXXX (e.g., RE-V5RC-25-0790)')
      return
    }

    onSubmit(formattedSku)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSku(e.target.value)
    setError('')
  }

  return (
    <div className="w-full space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="SKU or Event Name"
            value={sku}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !sku.trim()}
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300">{error}</p>
        </div>
      )}

      <div className="text-center text-xs text-gray-400 space-y-1">
        <p>Enter a RobotEvents SKU to get started</p>
        <p>Format: RE-XXXXX-XX-XXXX</p>
      </div>
    </div>
  )
}
