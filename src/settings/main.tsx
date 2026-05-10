import { createRoot } from 'react-dom/client'
import { SettingsLayout } from './components/SettingsLayout'
import '../renderer/index.css'

const root = createRoot(document.getElementById('root')!)
root.render(<SettingsLayout />)