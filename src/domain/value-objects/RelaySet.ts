export class RelaySet {
  constructor(
    readonly write: string[],
    readonly read: string[],
  ) {}

  static fromNIP65Tags(tags: string[][]): RelaySet {
    const write: string[] = []
    const read: string[] = []
    for (const tag of tags) {
      if (tag[0] !== 'r' || !tag[1]) continue
      const marker = tag[2]
      if (!marker || marker === 'write') write.push(tag[1])
      if (!marker || marker === 'read') read.push(tag[1])
    }
    return new RelaySet(write, read)
  }

  toNIP65Tags(): string[][] {
    const tags: string[][] = []
    const w = new Set(this.write)
    const r = new Set(this.read)
    for (const url of w) tags.push(r.has(url) ? ['r', url] : ['r', url, 'write'])
    for (const url of r) if (!w.has(url)) tags.push(['r', url, 'read'])
    return tags
  }
}
