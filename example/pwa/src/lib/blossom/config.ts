import { PUBLIC_BLOSSOM_SERVERS } from '$env/static/public'

function parseServers(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\//.test(s))
}

const FALLBACK = ['https://blossom.primal.net']

export const blossomServers: string[] = (() => {
  const parsed = parseServers(PUBLIC_BLOSSOM_SERVERS)
  return parsed.length > 0 ? parsed : FALLBACK
})()

export const primaryBlossomServer: string = blossomServers[0]!
