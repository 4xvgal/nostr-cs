import type { KeyProvider } from './application/ports/outbound/KeyProvider.js'
import type { EventBusPort } from './application/ports/outbound/EventBusPort.js'
import type { ResolvedRelayConfig } from './application/config/ResolvedRelayConfig.js'

import type {
  CreateTicketParams,
  SendMessageParams,
  SubmitCsatParams,
} from './application/ports/inbound/CustomerPort.js'
import type {
  InternalNoteParams,
  ReplyParams,
  UpdateStatusParams,
} from './application/ports/inbound/AgentPort.js'

import type { Ticket } from './domain/entities/Ticket.js'
import type { Message } from './domain/entities/Message.js'
import type { TicketReply } from './domain/entities/TicketReply.js'
import type { StatusUpdate } from './domain/entities/StatusUpdate.js'
import type { CsatResponse } from './domain/entities/CsatResponse.js'

import { PrivateKeyProvider } from './infrastructure/adapters/outbound/key-providers/PrivateKeyProvider.js'
import { buildContainer, type DIContainer } from './infrastructure/di/container.js'

export type KeyInput =
  | { type: 'nsec'; value: string }
  | { type: 'hex'; value: string }
  | { type: 'signer'; value: KeyProvider }

export interface RelayConfig {
  bootstrap: [string, ...string[]]
  write?: string[]
  read?: string[]
  dm?: string[]
}

export interface CSClientConfig {
  key: KeyInput
  relays: RelayConfig
  profile?: {
    name: string
    csRole: 'agent' | 'customer'
  }
}

function resolveRelayConfig(cfg: RelayConfig): ResolvedRelayConfig {
  return {
    bootstrap: [...cfg.bootstrap],
    write: cfg.write ?? [...cfg.bootstrap],
    read: cfg.read ?? [...cfg.bootstrap],
    dm: cfg.dm ?? cfg.read ?? [...cfg.bootstrap],
  }
}

export class CSClient {
  private readonly keyProvider: KeyProvider
  private container: DIContainer | null = null

  constructor(private readonly config: CSClientConfig) {
    this.keyProvider =
      config.key.type === 'signer'
        ? config.key.value
        : new PrivateKeyProvider(config.key)
  }

  async connect(): Promise<void> {
    const resolved = resolveRelayConfig(this.config.relays)
    this.container = buildContainer(this.keyProvider, resolved, this.config.profile)

    await this.container.bootstrapUseCase.execute()

    if (this.config.profile?.csRole === 'agent') {
      await this.container.subscribeAsAgentUseCase.execute()
    } else {
      await this.container.subscribeAsCustomerUseCase.execute()
    }
  }

  async disconnect(): Promise<void> {
    if (!this.container) return
    this.container.subscribeAsAgentUseCase.stop()
    this.container.subscribeAsCustomerUseCase.stop()
    this.container.pool.destroy()
  }

  private get bus(): EventBusPort {
    return this.container!.eventBus
  }

  createTicket(p: CreateTicketParams): Promise<Ticket> {
    return this.container!.createTicketUseCase.execute(p)
  }
  sendMessage(p: SendMessageParams): Promise<void> {
    return this.container!.sendDMUseCase.execute(p)
  }
  submitCsat(p: SubmitCsatParams): Promise<void> {
    return this.container!.submitCsatUseCase.execute(p)
  }

  replyTicket(p: ReplyParams): Promise<void> {
    return this.container!.replyTicketUseCase.execute(p)
  }
  updateStatus(p: UpdateStatusParams): Promise<void> {
    return this.container!.updateStatusUseCase.execute(p)
  }
  addInternalNote(p: InternalNoteParams): Promise<void> {
    return this.container!.internalNoteUseCase.execute(p)
  }

  onTicket(h: (t: Ticket) => void): () => void {
    return this.bus.on('ticket:created', h)
  }
  onReply(h: (r: TicketReply) => void): () => void {
    return this.bus.on('ticket:reply', h)
  }
  onNote(h: (r: TicketReply) => void): () => void {
    return this.bus.on('ticket:note', h)
  }
  onStatusChange(h: (u: StatusUpdate) => void): () => void {
    return this.bus.on('status:changed', h)
  }
  onMessage(h: (m: Message) => void): () => void {
    return this.bus.on('message:received', h)
  }
  onCsat(h: (c: CsatResponse) => void): () => void {
    return this.bus.on('csat:submitted', h)
  }
}
