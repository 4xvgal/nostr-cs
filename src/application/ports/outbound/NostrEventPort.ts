export interface UnsignedEvent {
  kind: number
  tags: string[][]
  content: string
  created_at: number
}

export interface SignedEvent extends UnsignedEvent {
  id: string
  pubkey: string
  sig: string
}

export type SubscriptionFilter = {
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
} & { [tag: `#${string}`]: string[] | undefined }

export interface Subscription {
  close(): void
}

export interface NostrEventPort {
  publish(event: UnsignedEvent, targetRelays?: string[]): Promise<SignedEvent>
  subscribe(
    filter: SubscriptionFilter,
    onEvent: (event: SignedEvent) => void,
    opts?: { relays?: string[] },
  ): Subscription
}
