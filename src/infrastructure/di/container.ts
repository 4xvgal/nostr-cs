import NDK from '@nostr-dev-kit/ndk'

import type { EventBusPort } from '../../application/ports/outbound/EventBusPort.js'
import type { KeyProvider } from '../../application/ports/outbound/KeyProvider.js'
import type { ResolvedRelayConfig } from '../../application/config/ResolvedRelayConfig.js'

import { RelayDiscoveryService } from '../../domain/services/RelayDiscoveryService.js'

import { BootstrapUseCase } from '../../application/use-cases/publish/BootstrapUseCase.js'
import { CreateTicketUseCase } from '../../application/use-cases/publish/CreateTicketUseCase.js'
import { InternalNoteUseCase } from '../../application/use-cases/publish/InternalNoteUseCase.js'
import { ReplyTicketUseCase } from '../../application/use-cases/publish/ReplyTicketUseCase.js'
import { SendDMUseCase } from '../../application/use-cases/publish/SendDMUseCase.js'
import { SubmitCsatUseCase } from '../../application/use-cases/publish/SubmitCsatUseCase.js'
import { UpdateStatusUseCase } from '../../application/use-cases/publish/UpdateStatusUseCase.js'
import { SubscribeAsAgentUseCase } from '../../application/use-cases/subscribe/SubscribeAsAgentUseCase.js'
import { SubscribeAsCustomerUseCase } from '../../application/use-cases/subscribe/SubscribeAsCustomerUseCase.js'

import { InMemoryEventBus } from '../adapters/outbound/InMemoryEventBus.js'
import { NDKCryptoAdapter } from '../adapters/outbound/NDKCryptoAdapter.js'
import { NDKProfileAdapter } from '../adapters/outbound/NDKProfileAdapter.js'
import { NDKRelayAdapter } from '../adapters/outbound/NDKRelayAdapter.js'
import { NDKRelayIndexAdapter } from '../adapters/outbound/NDKRelayIndexAdapter.js'

export interface DIContainer {
  ndk: NDK
  eventBus: EventBusPort
  createTicketUseCase: CreateTicketUseCase
  replyTicketUseCase: ReplyTicketUseCase
  updateStatusUseCase: UpdateStatusUseCase
  sendDMUseCase: SendDMUseCase
  internalNoteUseCase: InternalNoteUseCase
  submitCsatUseCase: SubmitCsatUseCase
  subscribeAsCustomerUseCase: SubscribeAsCustomerUseCase
  subscribeAsAgentUseCase: SubscribeAsAgentUseCase
  bootstrapUseCase: BootstrapUseCase
}

export async function buildContainer(
  keyProvider: KeyProvider,
  relays: ResolvedRelayConfig,
  profileMeta?: { name: string; csRole: 'agent' | 'customer' },
): Promise<DIContainer> {
  const ndk = new NDK({
    explicitRelayUrls: [...relays.bootstrap],
    signer: keyProvider.getNDKSigner(),
  })
  await ndk.connect()

  const relayPort = new NDKRelayAdapter(ndk, keyProvider)
  const cryptoPort = new NDKCryptoAdapter(ndk, keyProvider)
  const profilePort = new NDKProfileAdapter(ndk, keyProvider)
  const relayIndexPort = new NDKRelayIndexAdapter(ndk)
  const eventBus = new InMemoryEventBus()

  const relayDiscovery = new RelayDiscoveryService(profilePort, relays.bootstrap)

  return {
    ndk,
    eventBus,
    createTicketUseCase: new CreateTicketUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relayDiscovery,
      eventBus,
    ),
    replyTicketUseCase: new ReplyTicketUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relayDiscovery,
    ),
    updateStatusUseCase: new UpdateStatusUseCase(relayPort, keyProvider, relayDiscovery),
    sendDMUseCase: new SendDMUseCase(relayPort, cryptoPort, keyProvider, relayDiscovery),
    internalNoteUseCase: new InternalNoteUseCase(
      relayPort,
      cryptoPort,
      keyProvider,
      relayDiscovery,
    ),
    submitCsatUseCase: new SubmitCsatUseCase(relayPort, keyProvider, relayDiscovery),
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
    bootstrapUseCase: new BootstrapUseCase(
      profilePort,
      relayIndexPort,
      keyProvider,
      relays,
      profileMeta,
    ),
  }
}
