import { describe, test, expect } from 'bun:test'
import { TicketId } from '../../src/domain/value-objects/TicketId.js'

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('TicketId.generate', () => {
  test('produces a string matching RFC 9562 UUIDv7 layout', () => {
    for (let i = 0; i < 50; i++) {
      const id = TicketId.generate().toString()
      expect(id).toMatch(UUID_V7_REGEX)
    }
  })

  test('embeds a timestamp close to Date.now()', () => {
    const before = Date.now()
    const id = TicketId.generate()
    const after = Date.now()
    const ts = id.timestampMs()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  test('consecutive IDs are time-ordered (weakly — ms resolution)', () => {
    const n = 100
    const timestamps: number[] = []
    for (let i = 0; i < n; i++) timestamps.push(TicketId.generate().timestampMs())
    // At ms resolution, successive IDs within the same ms tick may match;
    // but none should ever go backwards.
    for (let i = 1; i < n; i++) {
      expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i - 1]!)
    }
  })

  test('produces unique IDs in rapid succession (random bits diverge)', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(TicketId.generate().toString())
    expect(ids.size).toBe(1000)
  })
})

describe('TicketId.fromString', () => {
  test('accepts a valid UUIDv7 and round-trips', () => {
    const raw = TicketId.generate().toString()
    const parsed = TicketId.fromString(raw)
    expect(parsed.toString()).toBe(raw)
  })

  test('rejects wrong version nibble (UUIDv4 shape)', () => {
    expect(() =>
      TicketId.fromString('018f1a2b-3c4d-4abc-8def-0123456789ab'),
    ).toThrow(/invalid UUIDv7/)
  })

  test('rejects wrong variant nibble', () => {
    expect(() =>
      TicketId.fromString('018f1a2b-3c4d-7abc-0def-0123456789ab'),
    ).toThrow(/invalid UUIDv7/)
  })

  test('rejects missing dashes', () => {
    expect(() => TicketId.fromString('018f1a2b3c4d7abc8def0123456789ab')).toThrow(
      /invalid UUIDv7/,
    )
  })

  test('rejects uppercase hex', () => {
    expect(() =>
      TicketId.fromString('018F1A2B-3C4D-7ABC-8DEF-0123456789AB'),
    ).toThrow(/invalid UUIDv7/)
  })
})

describe('TicketId.equals', () => {
  test('same underlying value → true', () => {
    const raw = TicketId.generate().toString()
    expect(TicketId.fromString(raw).equals(TicketId.fromString(raw))).toBe(true)
  })

  test('different values → false', () => {
    const a = TicketId.generate()
    const b = TicketId.generate()
    expect(a.equals(b)).toBe(false)
  })
})
