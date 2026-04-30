<script lang="ts">
  import { goto } from '$app/navigation'
  import { tickets, currentStatus, replies, messages, statusEvents } from '$lib/stores/tickets.js'
  import { identity } from '$lib/stores/identity.js'
  import { shortPubkey, timeAgo } from '$lib/nostr/format.js'
  import { profiles } from '$lib/stores/profiles.js'
  import TicketMeta from '$lib/components/TicketMeta.svelte'
  import { isIdea, categoryLabel } from '$lib/nostr/category.js'

  type SortMode = 'priority' | 'recent'
  let sort = $state<SortMode>('recent')
  let query = $state('')

  const myPubkey = $derived($identity?.pubkey ?? '')

  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

  const myInbox = $derived(
    [...$tickets.values()].filter((t) => t.agentPubkey === myPubkey && !isIdea(t)),
  )

  const categoryCounts = $derived.by(() => {
    const m = new Map<string, number>()
    for (const t of myInbox) m.set(t.category, (m.get(t.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  })

  const filtered = $derived(
    myInbox
      .filter((t) => {
        if (!query) return true
        const q = query.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.customerPubkey.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        if (sort === 'recent') return b.createdAt - a.createdAt
        const pa = priorityRank[a.priority] ?? 9
        const pb = priorityRank[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return b.createdAt - a.createdAt
      }),
  )

  function lastActivity(eventId: string): number {
    let latest = 0
    for (const r of $replies.get(eventId) ?? []) latest = Math.max(latest, r.at)
    for (const m of $messages.get(eventId) ?? []) latest = Math.max(latest, m.createdAt)
    for (const s of $statusEvents.get(eventId) ?? []) latest = Math.max(latest, s.at)
    return latest
  }

  function customerLabel(pk: string): string {
    const meta = $profiles.get(pk)
    return meta?.display_name || meta?.name || shortPubkey(pk)
  }

  // Distribution metrics derived from local cache (replaces fake "stream metrics")
  const counts = $derived({
    open: myInbox.filter((t) => {
      const st = $currentStatus.get(t.eventId) ?? t.status
      return st === 'open'
    }).length,
    inProgress: myInbox.filter((t) => ($currentStatus.get(t.eventId) ?? t.status) === 'in_progress').length,
    resolved: myInbox.filter((t) => {
      const st = $currentStatus.get(t.eventId) ?? t.status
      return st === 'resolved' || st === 'closed'
    }).length,
    high: myInbox.filter((t) => t.priority === 'high' || t.priority === 'urgent').length,
  })
</script>

<div class="p-lg max-w-[1400px] mx-auto">
  <div class="flex flex-col md:flex-row md:items-center justify-between mb-md gap-4">
    <div>
      <h1 class="text-h1 text-on-surface">Active Conversations</h1>
      <p class="text-body-md text-on-surface-variant">Materialized from your local relay subscription.</p>
    </div>
    <div class="flex items-center gap-sm">
      <div class="flex bg-white border border-outline-variant rounded p-1">
        <button class="px-3 py-1 text-label-sm rounded-sm {sort === 'priority' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}" onclick={() => (sort = 'priority')}>Priority</button>
        <button class="px-3 py-1 text-label-sm rounded-sm {sort === 'recent' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}" onclick={() => (sort = 'recent')}>Recent</button>
      </div>
      <input class="md:hidden h-9 px-3 bg-white border border-outline-variant rounded text-label-sm outline-none focus:ring-2 focus:ring-primary" placeholder="Filter…" bind:value={query} />
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-12 gap-lg">
    <div class="xl:col-span-8 bg-white border border-outline-variant rounded overflow-hidden">
      {#if filtered.length === 0}
        <div class="p-12 text-center text-on-surface-variant">
          <span class="material-symbols-outlined text-3xl text-outline">inbox</span>
          <p class="mt-2 text-body-md">No tickets yet — waiting on relay.</p>
        </div>
      {:else}
        <div class="divide-y divide-outline-variant/50">
          {#each filtered as t (t.id.toString())}
            {@const st = $currentStatus.get(t.eventId) ?? t.status}
            {@const last = lastActivity(t.eventId) || t.createdAt}
            <button
              class="w-full text-left flex items-start gap-4 px-lg py-md hover:bg-surface-container-low transition-colors group"
              onclick={() => goto(`/agent/tickets/${t.id.toString()}`)}
            >
              <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-primary flex-shrink-0">
                {customerLabel(t.customerPubkey).slice(0, 2).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <TicketMeta ticketIdStr={t.id.toString()} status={st} priority={t.priority} />
                <h4 class="mt-1 text-body-md font-semibold truncate">{t.title}</h4>
                <p class="text-label-sm text-on-surface-variant truncate">
                  {customerLabel(t.customerPubkey)} · last activity {timeAgo(last)}
                </p>
              </div>
              <span class="material-symbols-outlined text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">chevron_right</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="xl:col-span-4 space-y-lg">
      <div class="bg-white border border-outline-variant rounded p-md">
        <h3 class="text-label-sm font-bold uppercase tracking-widest text-on-surface-variant mb-md">Local cache</h3>
        <div class="grid grid-cols-2 gap-sm">
          <div class="p-sm bg-surface-container-low rounded border border-outline-variant">
            <p class="text-label-sm text-on-surface-variant">Open</p>
            <p class="text-h2 text-primary">{counts.open}</p>
          </div>
          <div class="p-sm bg-surface-container-low rounded border border-outline-variant">
            <p class="text-label-sm text-on-surface-variant">In Progress</p>
            <p class="text-h2 text-secondary">{counts.inProgress}</p>
          </div>
          <div class="p-sm bg-surface-container-low rounded border border-outline-variant">
            <p class="text-label-sm text-on-surface-variant">High/Urgent</p>
            <p class="text-h2 text-error">{counts.high}</p>
          </div>
          <div class="p-sm bg-surface-container-low rounded border border-outline-variant">
            <p class="text-label-sm text-on-surface-variant">Resolved</p>
            <p class="text-h2 text-tertiary">{counts.resolved}</p>
          </div>
        </div>
      </div>

      {#if categoryCounts.length > 0}
        <div class="bg-white border border-outline-variant rounded p-md">
          <h3 class="text-label-sm font-bold uppercase tracking-widest text-on-surface-variant mb-md">By category</h3>
          <ul class="space-y-1">
            {#each categoryCounts as [cat, n]}
              <li class="flex items-center justify-between text-label-sm">
                <span class="text-on-surface">{categoryLabel(cat)}</span>
                <span class="font-mono text-on-surface-variant">{n}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
</div>
