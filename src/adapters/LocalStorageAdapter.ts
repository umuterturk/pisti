import type { PistiSession, StoragePort } from '../ports'

const USERNAME_KEY = 'pisti:username'
const SESSION_KEY = 'pisti:mp-session'

export class LocalStorageAdapter implements StoragePort {
  async loadUsername(): Promise<string> {
    return localStorage.getItem(USERNAME_KEY) ?? ''
  }

  async saveUsername(name: string): Promise<void> {
    localStorage.setItem(USERNAME_KEY, name.trim())
  }

  loadSession(): PistiSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      return JSON.parse(raw) as PistiSession
    } catch {
      return null
    }
  }

  saveSession(session: PistiSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_KEY)
  }
}
