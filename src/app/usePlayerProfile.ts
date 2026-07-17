import { useCallback, useEffect, useState } from 'react'
import type { StoragePort } from '../ports'

export function usePlayerProfile(storage: StoragePort) {
  const [username, setUsernameState] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    storage.loadUsername().then((name) => {
      setUsernameState(name)
      setLoaded(true)
    })
  }, [storage])

  const saveUsername = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      setUsernameState(trimmed)
      await storage.saveUsername(trimmed)
    },
    [storage],
  )

  return { username, saveUsername, loaded }
}
