import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type ToastVariant = 'info' | 'success' | 'warning' | 'destructive'

interface Toast {
  id: number
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => void
}

interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback((toast: ToastInput) => {
    setToasts((current) => {
      const id = Date.now() + Math.random()
      const { variant = 'info', duration = 4000, ...rest } = toast
      const fullToast: Toast = {
        id,
        variant,
        duration,
        ...rest,
      }
      return [...current, fullToast]
    })
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return

    const timers = toasts.map((toast) =>
      window.setTimeout(() => removeToast(toast.id), toast.duration),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [toasts, removeToast])

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex w-80 flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-xl border border-white/10 bg-black/90 px-4 py-3 text-sm text-foreground shadow-xl shadow-black/50 backdrop-blur"
          >
            <div className="font-semibold">{toast.title}</div>
            {toast.description && (
              <div className="mt-1 text-xs text-muted-foreground">{toast.description}</div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
