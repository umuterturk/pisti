import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const MATCHES_COLLECTION = 'pisti-matches'
export const USERS_COLLECTION = 'pisti-users'
export const FRIEND_RIVALS_COLLECTION = 'pisti-friend-rivals'
export const GAME_REQUESTS_COLLECTION = 'pisti-game-requests'
export const GAME_REQUEST_TTL_MS = 5 * 60 * 1000

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let authReady: Promise<string> | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp())
  }
  return auth
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())
  }
  return db
}

export async function ensureAnonymousAuth(): Promise<string> {
  if (!authReady) {
    authReady = (async () => {
      const firebaseAuth = getFirebaseAuth()
      if (!firebaseAuth.currentUser) {
        await signInAnonymously(firebaseAuth)
      }
      const uid = firebaseAuth.currentUser?.uid
      if (!uid) throw new Error('Anonymous sign-in failed.')
      return uid
    })()
  }
  return authReady
}
