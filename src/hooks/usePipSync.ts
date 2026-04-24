import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function usePipSync() {
  const pipEnabled = useAppStore(state => state.pipEnabled)
  const setPipEnabled = useAppStore(state => state.setPipEnabled)

  useEffect(() => {
    if (pipEnabled) {
      window.caplet.openPipWindow()
    } else {
      window.caplet.closePipWindow()
    }
  }, [pipEnabled])

  useEffect(() => {
    const unlisten = window.caplet.onPipClosed(() => {
      const currentState = useAppStore.getState().pipEnabled
      if (currentState) {
        setPipEnabled(false)
      }
    })
    return () => unlisten()
  }, [setPipEnabled])
}
