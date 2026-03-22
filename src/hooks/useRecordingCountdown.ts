import { useRef, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useRecordingCountdown() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback((onComplete: () => void) => {
    if (timerRef.current) clearInterval(timerRef.current)

    const store = useAppStore.getState()
    const countdownSeconds = store.settings.countdown || 3

    store.setCountdownValue(countdownSeconds)
    store.setStatus('countdown')

    let count = countdownSeconds

    timerRef.current = setInterval(() => {
      if (useAppStore.getState().status !== 'countdown') {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        return
      }

      count--
      if (count <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        onComplete()
      } else {
        useAppStore.getState().setCountdownValue(count)
      }
    }, 1000)
  }, [])

  return { startCountdown }
}
