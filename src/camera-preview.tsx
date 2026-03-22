import React from 'react'
import ReactDOM from 'react-dom/client'
import CameraPreviewOverlay from './components/CameraPreviewOverlay'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CameraPreviewWindow />
  </React.StrictMode>
)

function CameraPreviewWindow() {
  const handleConfirm = (settings: { deviceId: string }) => {
    window.caplet.sendCameraSettingsConfirmed(settings)
  }

  const handleCancel = () => {
    window.caplet.cancelCameraPreview()
  }

  return <CameraPreviewOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}
