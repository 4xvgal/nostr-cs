import type { SimplePool } from 'nostr-tools/pool'
import type { Filter } from 'nostr-tools/filter'
import type {
  RelayIndexFilter,
  RelayIndexPort,
} from '../../../application/ports/outbound/RelayIndexPort.js'

export class SimplePoolRelayIndexAdapter implements RelayIndexPort {
  private static readonly DEFAULT_MONITOR_RELAYS = [
    'wss://relay.nostr.watch',
    'wss://relaypag.es',
  ]

  private readonly monitorRelays: string[]

  constructor(
    private readonly pool: SimplePool,
    monitorRelays: readonly string[] = SimplePoolRelayIndexAdapter.DEFAULT_MONITOR_RELAYS,
  ) {
    this.monitorRelays = [...monitorRelays]
  }

  async fetchPublicRelays(filter: RelayIndexFilter = {}): Promise<string[]> {
    const markers: string[] = []
    if (filter.noPayment) markers.push('!payment')
    if (filter.noAuth) markers.push('!auth')

    const reqFilter: Filter = {
      kinds: [30166],
      limit: filter.limit ?? 10,
    }
    if (markers.length > 0) {
      ;(reqFilter as unknown as Record<string, string[]>)['#R'] = markers
    }

    const events = await this.pool.querySync(
      this.monitorRelays,
      reqFilter,
      { maxWait: 3000 },
    )

    const urls: string[] = []
    for (const ev of events) {
      const d = ev.tags.find((t) => t[0] === 'd')?.[1]
      if (d && d.startsWith('wss://')) urls.push(d)
    }
    return urls
  }
}
