import React from 'react'
import ReactDOM from 'react-dom/client'
import CameraPreviewOverlay from './components/CameraPreviewOverlay'
import './index.css'

const getUrlParam = (key: string) => {
  const params = new URLSearchParams(window.location.search)
  return params.get(key)
}

const urlMode = getUrlParam('mode') as 'preview' | 'recording' | null
const urlDeviceId = getUrlParam('deviceId') || ''

function CameraPreviewWindow() {
  if (urlMode === 'recording') {
    return <CameraPreviewOverlay initialMode="recording" deviceId={urlDeviceId} />
  }

  const handleConfirm = (settings: { deviceId: string }) => {
    window.screenApi.sendCameraSettingsConfirmed(settings)
  }

  const handleCancel = () => {
    window.screenApi.cancelCameraPreview()
  }

  return <CameraPreviewOverlay onConfirm={handleConfirm} onCancel={handleCancel} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CameraPreviewWindow />
  </React.StrictMode>
)
