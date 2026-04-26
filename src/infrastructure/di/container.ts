import { SimplePool } from 'nostr-tools/pool'

import type { EventBusPort } from '../../application/ports/outbound/EventBusPort.js'
import type { KeyProvider } from '../../application/ports/outbound/KeyProvider.js'
import type { ResolvedRelayConfig } from '../../application/config/ResolvedRelayConfig.js'

import { RelayDiscoveryService } from '../../application/services/RelayDiscoveryService.js'

import { BootstrapUseCase } from '../../application/use-cases/publish/BootstrapUseCase.js'
import { CreateTicketUseCase } from '../../application/use-cases/publish/CreateTicketUseCase.js'
import { InternalNoteUseCase } from '../../application/use-cases/publish/InternalNoteUseCase.js'
import { ReplyTicketUseCase } from '../../application/use-cases/publish/ReplyTicketUseCase.js'
import { SendDMUseCase } from '../../application/use-cases/publish/SendDMUseCase.js'
import { SubmitCsatUseCase } from '../../application/use-cases/publish/SubmitCsatUseCase.js'
import { UpdateStatusUseCase } from '../../application/use-cases/publish/UpdateStatusUseCase.js'
import { SubscribeAsAgentUseCase } from '../../application/use-cases/subscribe/SubscribeAsAgentUseCase.js'
import { SubscribeAsCustomerUseCase } from '../../application/use-cases/subscribe/SubscribeAsCustomerUseCase.js'
import { PullOwnHistoryUseCase } from '../../application/use-cases/pull/PullOwnHistoryUseCase.js'
import { AppDataUseCase } from '../../application/use-cases/app-data/AppDataUseCase.js'

import { InMemoryEventBus } from '../adapters/outbound/InMemoryEventBus.js'
import { Nip59CryptoAdapter } from '../adapters/outbound/Nip59CryptoAdapter.js'
import { SimplePoolProfileAdapter } from '../adapters/outbound/SimplePoolProfileAdapter.js'
import { SimplePoolRelayAdapter } from '../adapters/outbound/SimplePoolRelayAdapter.js'
import { SimplePoolRelayIndexAdapter } from '../adapters/outbound/SimplePoolRelayIndexAdapter.js'

export interface DIContainer {
  pool: SimplePool
  eventBus: EventBusPort
  createTicketUseCase: CreateTicketUseCase
  replyTicketUseCase: ReplyTicketUseCase
  updateStatusUseCase: UpdateStatusUseCase
  sendDMUseCase: SendDMUseCase
  internalNoteUseCase: InternalNoteUseCase
  submitCsatUseCase: SubmitCsatUseCase
  subscribeAsCustomerUseCase: SubscribeAsCustomerUseCase
  subscribeAsAgentUseCase: SubscribeAsAgentUseCase
  pullOwnHistoryUseCase: PullOwnHistoryUseCase
  appDataUseCase: AppDataUseCase
  bootstrapUseCase: BootstrapUseCase
}

export function buildContainer(
  keyProvider: KeyProvider,
  relays: ResolvedRelayConfig,
  profileMeta?: { name: string; csRole: 'agent' | 'customer' },
): DIContainer {
  const pool = new SimplePool()

  const relayPort = new SimplePoolRelayAdapter(pool, keyProvider, relays.read)
  const cryptoPort = new Nip59CryptoAdapter(keyProvider)
  const profilePort = new SimplePoolProfileAdapter(pool, keyProvider, relays.bootstrap)
  const relayIndexPort = new SimplePoolRelayIndexAdapter(pool)
  const eventBus = new InMemoryEventBus()

  const relayDiscovery = new RelayDiscoveryService(profilePort, relays.bootstrap)

  return {
    pool,
    eventBus,
    createTicketUseCase: new CreateTicketUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relayDiscovery,
      eventBus,
    ),
    replyTicketUseCase: new ReplyTicketUseCase(relayPort, cryptoPort, relayDiscovery),
    updateStatusUseCase: new UpdateStatusUseCase(relayPort, relayDiscovery),
    sendDMUseCase: new SendDMUseCase(relayPort, cryptoPort, relayDiscovery),
    internalNoteUseCase: new InternalNoteUseCase(relayPort, cryptoPort, relayDiscovery),
    submitCsatUseCase: new SubmitCsatUseCase(relayPort, relayDiscovery),
    subscribeAsCustomerUseCase: new SubscribeAsCustomerUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relays,
      eventBus,
    ),
    subscribeAsAgentUseCase: new SubscribeAsAgentUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relays,
      eventBus,
    ),
    pullOwnHistoryUseCase: new PullOwnHistoryUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relays,
      eventBus,
    ),
    appDataUseCase: new AppDataUseCase(relayPort, cryptoPort, keyProvider, relays),
    bootstrapUseCase: new BootstrapUseCase(
      profilePort,
      relayIndexPort,
      keyProvider,
      relays,
      profileMeta,
    ),
  }
}
