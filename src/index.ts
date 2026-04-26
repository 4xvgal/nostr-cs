export { CSClient } from './CSClient.js'
export type { CSClientConfig, RelayConfig, KeyInput } from './CSClient.js'

export { PrivateKeyProvider } from './infrastructure/adapters/outbound/key-providers/PrivateKeyProvider.js'
export { NIP07KeyProvider } from './infrastructure/adapters/outbound/key-providers/NIP07KeyProvider.js'
export { NIP46KeyProvider } from './infrastructure/adapters/outbound/key-providers/NIP46KeyProvider.js'

export type {
  NostrEventPort,
  UnsignedEvent,
  SignedEvent,
  SubscriptionFilter,
  Subscription,
} from './application/ports/outbound/NostrEventPort.js'
export type { CryptoPort, Nip17Rumor, Nip17Unsealed } from './application/ports/outbound/CryptoPort.js'
export type { KeyProvider } from './application/ports/outbound/KeyProvider.js'
export type { ProfilePort } from './application/ports/outbound/ProfilePort.js'
export type { RelayIndexPort, RelayIndexFilter } from './application/ports/outbound/RelayIndexPort.js'
export type { EventBusPort, CSEvent } from './application/ports/outbound/EventBusPort.js'

export type {
  CreateTicketParams,
  SendMessageParams,
  SubmitCsatParams,
  CustomerPort,
} from './application/ports/inbound/CustomerPort.js'
export type {
  ReplyParams,
  UpdateStatusParams,
  InternalNoteParams,
  AgentPort,
} from './application/ports/inbound/AgentPort.js'

export { TicketId } from './domain/value-objects/TicketId.js'
export { RelaySet } from './domain/value-objects/RelaySet.js'
export { Ticket } from './domain/entities/Ticket.js'
export { Message } from './domain/entities/Message.js'
export { NostrProfile } from './domain/entities/NostrProfile.js'
export type { TicketReply } from './domain/entities/TicketReply.js'
export type { StatusUpdate } from './domain/entities/StatusUpdate.js'
export type { CsatResponse } from './domain/entities/CsatResponse.js'
export type { TicketStatus } from './domain/value-objects/TicketStatus.js'
export type { Priority } from './domain/value-objects/Priority.js'
export type { Category } from './domain/value-objects/Category.js'

export type { MessageEnvelope, EncryptedAttachment } from './application/codec/envelope.js'
export { encodeEnvelope, decodeEnvelope } from './application/codec/envelope.js'
