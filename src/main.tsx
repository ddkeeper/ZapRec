import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('[ZapRec] Renderer starting...')

const root = document.getElementById('root')

if (!root) {
  console.error('[ZapRec] Root element not found!')
  throw new Error('Root element not found')
}

console.log('[ZapRec] Creating React root...')

const reactRoot = ReactDOM.createRoot(root)

reactRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

console.log('[ZapRec] React rendered')

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[ZapRec] Global error:', { message, source, lineno, colno, error })
}

window.onunhandledrejection = (event) => {
  console.error('[ZapRec] Unhandled rejection:', event.reason)
}
