export function isIdea(t: { category?: string } | string | undefined | null): boolean {
  const c = typeof t === 'string' ? t : t?.category
  return !!c && c.startsWith('idea_')
}

function prettify(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim()
}

/**
 * Return a display label for whatever category string the client sent.
 * No enum, no lookup — purely derived from the wire value.
 * For idea_* the "idea_" prefix is stripped because the "Idea" chip already
 * conveys idea-ness; the remainder is shown prettified.
 */
export function categoryLabel(c: string | undefined | null): string {
  if (!c) return 'Uncategorized'
  const base = c.startsWith('idea_') ? c.slice(5) : c
  return prettify(base) || 'Idea'
}
