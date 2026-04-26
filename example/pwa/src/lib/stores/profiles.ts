import { writable } from 'svelte/store'

export interface ProfileMeta {
  name?: string
  display_name?: string
  picture?: string
  about?: string
}

export const profiles = writable<Map<string, ProfileMeta>>(new Map())

export function setProfile(pubkey: string, meta: ProfileMeta): void {
  profiles.update((m) => {
    const next = new Map(m)
    next.set(pubkey, meta)
    return next
  })
}
