import { nip19 } from 'nostr-tools'

export function shortTicketId(uuid: string): string {
  return 'T-' + uuid.slice(0, 6).toUpperCase()
}

export function shortPubkey(pubkeyHex: string): string {
  try {
    const npub = nip19.npubEncode(pubkeyHex)
    return npub.slice(0, 8) + '…' + npub.slice(-4)
  } catch {
    return pubkeyHex.slice(0, 8) + '…' + pubkeyHex.slice(-4)
  }
}

export function npubOf(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex)
}

export function tryHexFromNpub(input: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(input)) return input.toLowerCase()
  try {
    const decoded = nip19.decode(input.trim())
    if (decoded.type === 'npub') return decoded.data
  } catch {}
  return null
}

export function timeAgo(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec
  if (diff < 60) return Math.floor(diff) + 's ago'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}

export function clockTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
