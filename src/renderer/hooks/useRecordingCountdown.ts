import { useRef, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useRecordingCountdown() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)

    const settings = await (window.screenApi as any).settingsLoad()
    const countdownSeconds = settings?.general?.countdownSeconds ?? 3

    const store = useAppStore.getState()
    store.setCountdownValue(countdownSeconds)
    store.setIsCountdownFinished(false)
    store.setStatus('countdown')

    let count = countdownSeconds

    timerRef.current = setInterval(() => {
      if (useAppStore.getState().status !== 'countdown') {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        return
      }

      count--
      if (count > 0) {
        useAppStore.getState().setCountdownValue(count)
      } else {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        useAppStore.getState().setIsCountdownFinished(true)
      }
    }, 1000)
  }, [])

  return { startCountdown }
}
