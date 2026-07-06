import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './pwa.ts'
import { isWeakDevice } from './perf/deviceTier.ts'

setupPwa()

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
