import { useState, useEffect, useCallback } from 'react'
import { DISPLAY_NAME } from '../../config'

const DEFAULT_SETTINGS_LOCAL = {
  general: {
    countdownSeconds: 3,
    fps: 60,
    resolution: 'original',
    minimizeToTrayOnClose: true,
  },
  shortcuts: {
    toggleRecord: 'Alt+Shift+R',
    togglePause: 'Alt+Shift+P',
    toggleVisibility: 'Alt+Shift+H',
  },
  storage: {
    saveDirectory: '',
    filenamePrefix: DISPLAY_NAME,
    filenameTemplate: '{app}_{date}_{time}',
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
}

export function useSettings() {
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS_LOCAL>(DEFAULT_SETTINGS_LOCAL)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (window.screenApi as any).settingsLoad().then((loaded: typeof DEFAULT_SETTINGS_LOCAL) => {
      setSettings(loaded)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  const updateSettings = useCallback(<K extends keyof typeof DEFAULT_SETTINGS_LOCAL>(
    section: K,
    updates: Partial<typeof DEFAULT_SETTINGS_LOCAL[K]>
  ) => {
    setSettings((prev: typeof DEFAULT_SETTINGS_LOCAL) => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        ...updates,
      },
    }))
  }, [])

  const saveSettings = useCallback(async (newSettings: typeof DEFAULT_SETTINGS_LOCAL) => {
    setSettings(newSettings)
    await (window.screenApi as any).settingsLoad()
  }, [])

  const setSetting = useCallback(async (key: string, value: unknown) => {
    await (window.screenApi as any).settingsSet(key, value)
    const keys = key.split('.')
    if (keys.length === 2) {
      setSettings((prev: typeof DEFAULT_SETTINGS_LOCAL) => ({
        ...prev,
        [keys[0]]: {
          ...(prev as any)[keys[0]],
          [keys[1]]: value,
        },
      }))
    }
  }, [])

  const resetSettings = useCallback(async () => {
    const defaults = await (window.screenApi as any).settingsReset()
    setSettings(defaults)
  }, [])

  return { 
    settings, 
    loading, 
    updateSettings, 
    saveSettings, 
    setSetting,
    resetSettings 
  }
}