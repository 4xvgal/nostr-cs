import NDK, { NDKRelaySet } from '@nostr-dev-kit/ndk'
import type { NDKFilter } from '@nostr-dev-kit/ndk'
import type {
  RelayIndexFilter,
  RelayIndexPort,
} from '../../../application/ports/outbound/RelayIndexPort.js'

export class NDKRelayIndexAdapter implements RelayIndexPort {
  private static readonly MONITOR_RELAYS = [
    'wss://relay.nostr.watch',
    'wss://relaypag.es',
  ]

  constructor(private readonly ndk: NDK) {}

  async fetchPublicRelays(filter: RelayIndexFilter = {}): Promise<string[]> {
    const ndkFilter: NDKFilter = {
      kinds: [30166 as number],
      limit: filter.limit ?? 10,
    }
    const markers: string[] = []
    if (filter.noPayment) markers.push('!payment')
    if (filter.noAuth) markers.push('!auth')
    if (markers.length > 0) (ndkFilter as unknown as Record<string, string[]>)['#R'] = markers

    const relaySet = NDKRelaySet.fromRelayUrls(
      NDKRelayIndexAdapter.MONITOR_RELAYS,
      this.ndk,
    )

    return new Promise((resolve) => {
      const urls: string[] = []
      const sub = this.ndk.subscribe(ndkFilter, { closeOnEose: true }, relaySet)

      sub.on('event', (ev) => {
        const d = ev.tags.find((t) => t[0] === 'd')?.[1]
        if (d && d.startsWith('wss://')) urls.push(d)
      })
      sub.on('eose', () => resolve(urls))
      setTimeout(() => resolve(urls), 3000)
    })
  }
}
