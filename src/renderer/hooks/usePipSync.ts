import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function usePipSync() {
  const pipEnabled = useAppStore(state => state.pipEnabled)
  const setPipEnabled = useAppStore(state => state.setPipEnabled)

  useEffect(() => {
    if (pipEnabled) {
      window.screenApi.openPipWindow()
    } else {
      window.screenApi.closePipWindow()
    }

    const unlisten = window.screenApi.onPipClosed(() => {
      const currentState = useAppStore.getState().pipEnabled
      if (currentState) {
        setPipEnabled(false)
      }
    })
    return () => unlisten()
  }, [pipEnabled, setPipEnabled])
}