import { writable } from 'svelte/store'

export interface Identity {
  pubkey: string
  role: 'agent' | 'customer'
  profileName: string
}

export const identity = writable<Identity | null>(null)
