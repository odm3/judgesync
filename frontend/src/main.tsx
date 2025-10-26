import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { JudgingSessionProvider } from '@/context/JudgingSessionContext'
import { ToastProvider } from '@/context/ToastContext'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <JudgingSessionProvider>
        <App />
      </JudgingSessionProvider>
    </ToastProvider>
  </StrictMode>,
)
