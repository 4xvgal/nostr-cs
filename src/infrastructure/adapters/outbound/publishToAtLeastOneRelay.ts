import type { Event as NtEvent } from 'nostr-tools/core'
import type { SimplePool } from 'nostr-tools/pool'
import { normalizeURL } from 'nostr-tools/utils'

export async function publishToAtLeastOneRelay(
  pool: SimplePool,
  relays: string[],
  event: NtEvent,
): Promise<void> {
  const normalizedRelays = relays.map(normalizeURL)

  await Promise.any(
    normalizedRelays.map((url, index, relayList) =>
      publishToRelay(pool, url, index, relayList, event),
    ),
  )
}

async function publishToRelay(
  pool: SimplePool,
  url: string,
  index: number,
  relayList: string[],
  event: NtEvent,
): Promise<string> {
  if (relayList.indexOf(url) !== index) {
    throw new Error(`duplicate relay url: ${url}`)
  }

  if (pool.allowConnectingToRelay?.(url, ['write', event]) === false) {
    throw new Error(`connection skipped by allowConnectingToRelay: ${url}`)
  }

  let relay: Awaited<ReturnType<SimplePool['ensureRelay']>>
  try {
    relay = await pool.ensureRelay(url, {
      connectionTimeout: pool.maxWaitForConnection,
    })
  } catch (error) {
    pool.onRelayConnectionFailure?.(url)
    throw error
  }

  const reason = await relay.publish(event)
  if (pool.trackRelays) {
    let seen = pool.seenOn.get(event.id)
    if (!seen) {
      seen = new Set()
      pool.seenOn.set(event.id, seen)
    }
    seen.add(relay)
  }

  return reason
}
