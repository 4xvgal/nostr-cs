export class TicketId {
  private constructor(private readonly value: string) {}

  static generate(): TicketId {
    const ts = BigInt(Date.now())
    const bytes = new Uint8Array(16)
    bytes[0] = Number((ts >> 40n) & 0xffn)
    bytes[1] = Number((ts >> 32n) & 0xffn)
    bytes[2] = Number((ts >> 24n) & 0xffn)
    bytes[3] = Number((ts >> 16n) & 0xffn)
    bytes[4] = Number((ts >> 8n) & 0xffn)
    bytes[5] = Number(ts & 0xffn)

    const rand = new Uint8Array(10)
    globalThis.crypto.getRandomValues(rand)
    bytes.set(rand, 6)

    bytes[6] = (bytes[6]! & 0x0f) | 0x70
    bytes[8] = (bytes[8]! & 0x3f) | 0x80

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return new TicketId(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    )
  }

  static fromString(raw: string): TicketId {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw)) {
      throw new Error(`invalid UUIDv7: ${raw}`)
    }
    return new TicketId(raw)
  }

  toString(): string {
    return this.value
  }

  timestampMs(): number {
    const hex = this.value.replace(/-/g, '').slice(0, 12)
    return Number(BigInt('0x' + hex))
  }

  equals(other: TicketId): boolean {
    return this.value === other.value
  }
}
