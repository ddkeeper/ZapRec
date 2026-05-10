import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './renderer/App'
import './renderer/index.css'

console.log('[Screen] Renderer starting...')

const root = document.getElementById('root')

if (!root) {
  console.error('[Screen] Root element not found!')
  throw new Error('Root element not found')
}

console.log('[Screen] Creating React root...')

const reactRoot = ReactDOM.createRoot(root)

reactRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

console.log('[Screen] React rendered')

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Screen] Global error:', { message, source, lineno, colno, error })
}

window.onunhandledrejection = (event) => {
  console.error('[Screen] Unhandled rejection:', event.reason)
}
