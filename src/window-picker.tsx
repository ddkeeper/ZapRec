import React from 'react'
import ReactDOM from 'react-dom/client'
import WindowPicker from './components/WindowPicker'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WindowPickerWindow />
  </React.StrictMode>
)

function WindowPickerWindow() {
  const handleSelect = (windowData: { id: string; name: string; thumbnail: string; appIcon: string | null }) => {
    window.caplet.sendWindowSelected(windowData)
  }

  const handleCancel = () => {
    window.caplet.cancelWindowPicker()
  }

  return <WindowPicker onSelect={handleSelect} onCancel={handleCancel} />
}
