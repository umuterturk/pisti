import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics, track } from './analytics.ts'
import { getJoinCodeFromUrl } from './app/shareInvite.ts'
import { hasContinueParam } from './game/gamePersistence.ts'
import { setupPwa } from './pwa.ts'
import { isWeakDevice } from './perf/deviceTier.ts'

setupPwa()
initAnalytics()

const joinCode = getJoinCodeFromUrl()
const entry = joinCode
  ? 'join_link'
  : hasContinueParam()
    ? 'continue'
    : new URLSearchParams(window.location.search).has('play')
      ? 'play_url'
      : 'home'
track('app_open', { entry })

// On weak devices, tag the root so CSS strips per-frame raster costs (blur,
// drop-shadow) while capable devices keep the full visual polish.
if (isWeakDevice()) {
  document.documentElement.classList.add('perf-lite')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
