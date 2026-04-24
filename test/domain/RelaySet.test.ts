import { describe, test, expect } from 'bun:test'
import { RelaySet } from '../../src/domain/value-objects/RelaySet.js'

describe('RelaySet.fromNIP65Tags', () => {
  test('no marker → relay goes to both write and read', () => {
    const rs = RelaySet.fromNIP65Tags([['r', 'wss://a.example']])
    expect(rs.write).toEqual(['wss://a.example'])
    expect(rs.read).toEqual(['wss://a.example'])
  })

  test('marker "write" → write only', () => {
    const rs = RelaySet.fromNIP65Tags([['r', 'wss://w.example', 'write']])
    expect(rs.write).toEqual(['wss://w.example'])
    expect(rs.read).toEqual([])
  })

  test('marker "read" → read only', () => {
    const rs = RelaySet.fromNIP65Tags([['r', 'wss://r.example', 'read']])
    expect(rs.write).toEqual([])
    expect(rs.read).toEqual(['wss://r.example'])
  })

  test('ignores malformed tags', () => {
    const rs = RelaySet.fromNIP65Tags([
      [''],
      ['r'],
      ['r', ''],
      ['x', 'wss://bad.example'],
      ['r', 'wss://good.example'],
    ])
    expect(rs.write).toEqual(['wss://good.example'])
    expect(rs.read).toEqual(['wss://good.example'])
  })
})

describe('RelaySet.toNIP65Tags', () => {
  test('relay in both → marker-less ["r", url]', () => {
    const rs = new RelaySet(['wss://both.example'], ['wss://both.example'])
    expect(rs.toNIP65Tags()).toEqual([['r', 'wss://both.example']])
  })

  test('write-only relay emits marker "write"', () => {
    const rs = new RelaySet(['wss://w.example'], [])
    expect(rs.toNIP65Tags()).toEqual([['r', 'wss://w.example', 'write']])
  })

  test('read-only relay emits marker "read"', () => {
    const rs = new RelaySet([], ['wss://r.example'])
    expect(rs.toNIP65Tags()).toEqual([['r', 'wss://r.example', 'read']])
  })

  test('mixed set emits correct markers for each url', () => {
    const rs = new RelaySet(
      ['wss://both.example', 'wss://w.example'],
      ['wss://both.example', 'wss://r.example'],
    )
    const tags = rs.toNIP65Tags()
    const asSet = new Set(tags.map((t) => t.join('|')))
    expect(asSet).toEqual(
      new Set([
        'r|wss://both.example',
        'r|wss://w.example|write',
        'r|wss://r.example|read',
      ]),
    )
  })
})

describe('RelaySet round-trip', () => {
  test('fromNIP65Tags → toNIP65Tags preserves semantics', () => {
    const input = [
      ['r', 'wss://both.example'],
      ['r', 'wss://w.example', 'write'],
      ['r', 'wss://r.example', 'read'],
    ]
    const rs = RelaySet.fromNIP65Tags(input)
    const out = rs.toNIP65Tags()
    const normalize = (tags: string[][]) =>
      new Set(tags.map((t) => t.join('|')))
    expect(normalize(out)).toEqual(normalize(input))
  })
})
