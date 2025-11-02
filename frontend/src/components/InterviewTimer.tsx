import { useEffect, useState, useRef } from 'react'
import { Play, Pause, RotateCcw, Settings2 } from 'lucide-react'
import { useJudgingSession } from '@/context/JudgingSessionContext'

interface InterviewTimerProps {
  compact?: boolean
}

export function InterviewTimer({ compact = false }: InterviewTimerProps) {
  const { timer, sessionCode } = useJudgingSession()
  const [localTime, setLocalTime] = useState(timer?.currentDuration ?? 600)
  const [showSettings, setShowSettings] = useState(false)
  const [newDuration, setNewDuration] = useState(10)
  const lastAlertRef = useRef<number>(0)

  // Update local time when timer changes
  useEffect(() => {
    if (timer) {
      setLocalTime(timer.currentDuration)
    }
  }, [timer])

  // Countdown logic
  useEffect(() => {
    if (!timer?.isRunning || timer.isPaused) return

    const interval = setInterval(() => {
      setLocalTime((prev) => {
        const next = Math.max(0, prev - 1)

        // Audio/haptic alerts
        if (next === 120 && lastAlertRef.current !== 120) {
          playAlert()
          vibrate([200, 100, 200])
          lastAlertRef.current = 120
        } else if (next === 60 && lastAlertRef.current !== 60) {
          playAlert()
          vibrate([200, 100, 200])
          lastAlertRef.current = 60
        } else if (next === 30 && lastAlertRef.current !== 30) {
          playAlert()
          vibrate([200, 100, 200, 100, 200])
          lastAlertRef.current = 30
        } else if (next === 0 && lastAlertRef.current !== 0) {
          playAlert(true)
          vibrate([500, 200, 500, 200, 500])
          lastAlertRef.current = 0
        }

        return next
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timer?.isRunning, timer?.isPaused])

  const playAlert = (final = false) => {
    // Use Web Audio API for beep
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = final ? 800 : 600
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  }

  const vibrate = (pattern: number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  }

  const handleStart = async () => {
    if (!sessionCode) return
    // TODO: Call API to start timer
    console.log('Start timer')
  }

  const handlePause = async () => {
    if (!sessionCode) return
    // TODO: Call API to pause timer
    console.log('Pause timer')
  }

  const handleReset = async () => {
    if (!sessionCode) return
    // TODO: Call API to reset timer
    console.log('Reset timer')
    lastAlertRef.current = 0
  }

  const handleUpdateDuration = async () => {
    if (!sessionCode) return
    // TODO: Call API to update default duration
    console.log('Update duration:', newDuration * 60)
    setShowSettings(false)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getColorClass = () => {
    if (localTime <= 30) return 'text-red-400'
    if (localTime <= 60) return 'text-yellow-400'
    return 'text-foreground'
  }

  const getProgressPercent = () => {
    const total = timer?.defaultDuration ?? 600
    return (localTime / total) * 100
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-card/80 px-3 py-2">
        <div className={`font-mono text-lg font-bold ${getColorClass()}`}>
          {formatTime(localTime)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-card/80 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Interview Timer</h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {showSettings && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-background/50 p-4">
          <label className="block text-sm font-medium text-foreground">
            Default Duration (minutes)
          </label>
          <input
            type="number"
            min="1"
            max="30"
            value={newDuration}
            onChange={(e) => setNewDuration(Number(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
          />
          <button
            onClick={handleUpdateDuration}
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Update Duration
          </button>
        </div>
      )}

      {/* Circular Progress */}
      <div className="relative mx-auto h-48 w-48">
        <svg className="h-full w-full -rotate-90 transform">
          <circle
            cx="96"
            cy="96"
            r="88"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-white/5"
          />
          <circle
            cx="96"
            cy="96"
            r="88"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 88}`}
            strokeDashoffset={`${2 * Math.PI * 88 * (1 - getProgressPercent() / 100)}`}
            className={`transition-all ${getColorClass()}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`font-mono text-4xl font-bold ${getColorClass()}`}>
            {formatTime(localTime)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!timer?.isRunning || timer?.isPaused ? (
          <button
            onClick={handleStart}
            className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700"
          >
            <Play className="mx-auto h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 rounded-lg bg-yellow-600 px-4 py-3 font-medium text-white hover:bg-yellow-700"
          >
            <Pause className="mx-auto h-5 w-5" />
          </button>
        )}
        <button
          onClick={handleReset}
          className="flex-1 rounded-lg border border-white/10 bg-card px-4 py-3 font-medium text-foreground hover:border-white/20"
        >
          <RotateCcw className="mx-auto h-5 w-5" />
        </button>
      </div>

      <div className="space-y-1 text-center text-sm text-muted-foreground">
        <p>Alerts at: 2:00, 1:00, 0:30, 0:00</p>
        <p className="text-xs">Audio beeps and vibration (if supported)</p>
      </div>
    </div>
  )
}
