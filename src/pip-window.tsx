import React from 'react'
import ReactDOM from 'react-dom/client'
import PipWindow from './components/PipWindow'
import './index.css'

console.log('[pip-window] Entry loaded')

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PipWindow />
    </React.StrictMode>
  )
} catch (err) {
  console.error('[pip-window] Render error:', err)
}
