// Minimal Blossom client (BUD-01 / BUD-02 / BUD-03).
// Uses a fresh ephemeral Nostr key per upload — the server only ever sees a
// disposable pubkey, not the user's identity.

import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { blossomServers, primaryBlossomServer } from './config.js'

export interface BlossomDescriptor {
  url: string
  sha256: string
  size: number
  type?: string
  uploaded: number
}

export interface UploadResult extends BlossomDescriptor {
  servers: string[]
  /** nsec of the ephemeral key that signed the upload — caller must persist this
   *  if they want to be able to DELETE the blob later. */
  ephemeralNsec: string
}

export interface DeleteResult {
  serversDeleted: string[]
  serversFailed: { server: string; reason: string }[]
}

function buildAuth(args: {
  action: 'upload' | 'get' | 'list' | 'delete'
  sha256: string
  expirationSec?: number
  description?: string
  secretKey: Uint8Array
}): string {
  const expiration = args.expirationSec ?? Math.floor(Date.now() / 1000) + 60
  const tmpl = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', args.action],
      ['x', args.sha256],
      ['expiration', String(expiration)],
    ],
    content: args.description ?? `${args.action} ${args.sha256}`,
  }
  const signed = finalizeEvent(tmpl, args.secretKey)
  const json = JSON.stringify(signed)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return `Nostr ${b64}`
}

function nsecToSk(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('not an nsec: ' + nsec.slice(0, 10))
  return decoded.data
}

/** Upload an opaque blob to the primary Blossom server. A fresh ephemeral
 *  Nostr key signs the BUD-01 auth, and is returned as `ephemeralNsec` so
 *  the caller can persist it and use it later for DELETE. */
export async function uploadBlob(args: {
  ciphertext: Uint8Array
  ciphertextSha256: string
  contentType?: string
}): Promise<UploadResult> {
  const sk = generateSecretKey()
  const ephemeralNsec = nip19.nsecEncode(sk)
  const auth = buildAuth({
    action: 'upload',
    sha256: args.ciphertextSha256,
    secretKey: sk,
    description: 'Encrypted attachment for nostr-cs',
  })
  const url = `${primaryBlossomServer}/upload`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': args.contentType ?? 'application/octet-stream',
    },
    body: args.ciphertext as BodyInit,
  })
  if (!res.ok) {
    const detail = await safeText(res)
    throw new Error(`Blossom upload failed (${res.status}): ${detail}`)
  }
  const desc = (await res.json()) as BlossomDescriptor
  if (desc.sha256 !== args.ciphertextSha256) {
    throw new Error(`Blossom server reported different sha256 than uploaded`)
  }
  return { ...desc, servers: [...blossomServers], ephemeralNsec }
}

/** Delete a blob from every server that hosts it.
 *  BUD-01 requires the DELETE auth to be signed by the *original uploader*'s
 *  pubkey — that's why we need the persisted ephemeral nsec. */
export async function deleteBlob(args: {
  blobSha256: string
  ephemeralNsec: string
  servers: string[]
}): Promise<DeleteResult> {
  const sk = nsecToSk(args.ephemeralNsec)
  const auth = buildAuth({
    action: 'delete',
    sha256: args.blobSha256,
    secretKey: sk,
    description: 'Encrypted attachment cleanup',
  })
  const targets = dedup([...args.servers, ...blossomServers])
  const serversDeleted: string[] = []
  const serversFailed: { server: string; reason: string }[] = []
  await Promise.all(
    targets.map(async (server) => {
      const url = `${server.replace(/\/+$/, '')}/${args.blobSha256}`
      try {
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: auth },
        })
        if (res.ok || res.status === 404) {
          serversDeleted.push(server)
        } else {
          serversFailed.push({ server, reason: `HTTP ${res.status}: ${await safeText(res)}` })
        }
      } catch (e) {
        serversFailed.push({ server, reason: e instanceof Error ? e.message : String(e) })
      }
    }),
  )
  return { serversDeleted, serversFailed }
}

/** Download an opaque blob, trying each server in order until one returns 200. */
export async function downloadBlob(args: {
  blobSha256: string
  servers: string[]
}): Promise<Uint8Array> {
  const candidates = dedup([...args.servers, ...blossomServers])
  let lastErr: unknown
  for (const server of candidates) {
    const url = `${server.replace(/\/+$/, '')}/${args.blobSha256}`
    try {
      const res = await fetch(url)
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer())
        return buf
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`All Blossom servers failed: ${describeError(lastErr)}`)
}

function dedup<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text()
  } catch {
    return r.statusText
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
