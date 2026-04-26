import { writable } from 'svelte/store'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export const connection = writable<{ state: ConnectionState; error?: string }>({ state: 'idle' })
