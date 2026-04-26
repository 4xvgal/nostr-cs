<script lang="ts">
  import { goto } from '$app/navigation'
  import { tickets, currentStatus, replies, messages } from '$lib/stores/tickets.js'
  import { identity } from '$lib/stores/identity.js'
  import { timeAgo } from '$lib/nostr/format.js'
  import TicketMeta from '$lib/components/TicketMeta.svelte'

  let filter = $state<'all' | 'open' | 'resolved'>('all')

  const myPubkey = $derived($identity?.pubkey ?? '')

  const myTickets = $derived(
    [...$tickets.values()]
      .filter((t) => t.customerPubkey === myPubkey)
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  const filtered = $derived(
    myTickets.filter((t) => {
      const st = $currentStatus.get(t.eventId) ?? t.status
      if (filter === 'all') return true
      if (filter === 'open') return st === 'open' || st === 'in_progress'
      if (filter === 'resolved') return st === 'resolved' || st === 'closed'
      return true
    }),
  )

  function activityCount(eventId: string): number {
    return ($replies.get(eventId)?.length ?? 0) + ($messages.get(eventId)?.length ?? 0)
  }
</script>

<main class="px-4 py-6 max-w-md mx-auto">
  <div class="mb-6">
    <h1 class="text-h2 font-bold text-on-surface mb-1">Support Tickets</h1>
    <p class="text-body-md text-on-surface-variant">Your active inquiries.</p>
  </div>

  <div class="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
    {#each [{ k: 'all', l: 'All' }, { k: 'open', l: 'Open' }, { k: 'resolved', l: 'Resolved' }] as f}
      <button
        class="px-4 py-1.5 rounded-full text-label-sm {filter === f.k
          ? 'bg-primary-container text-on-primary-container'
          : 'bg-white border border-outline-variant text-on-surface-variant'}"
        onclick={() => (filter = f.k as typeof filter)}
      >{f.l}</button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <div class="mt-8 p-8 border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center text-center">
      <div class="w-12 h-12 bg-on-tertiary-container rounded-full flex items-center justify-center mb-3">
        <span class="material-symbols-outlined text-primary">contact_support</span>
      </div>
      <p class="text-label-sm text-on-surface-variant">No tickets yet</p>
      <p class="text-xs text-outline mt-1">Tap the + button to open one.</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each filtered as t (t.id.toString())}
        {@const st = $currentStatus.get(t.eventId) ?? t.status}
        <button
          class="w-full text-left bg-white border border-outline-variant rounded-lg p-4 relative shadow-sm hover:bg-surface-container-low transition-colors"
          onclick={() => goto(`/customer/tickets/${t.id.toString()}`)}
        >
          <TicketMeta ticketIdStr={t.id.toString()} status={st} priority={t.priority} />
          <h3 class="mt-2 text-body-lg font-semibold {st === 'resolved' || st === 'closed' ? 'text-on-surface-variant line-through' : 'text-on-surface'}">{t.title}</h3>
          <div class="flex items-center gap-3 text-on-surface-variant mt-2">
            <div class="flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">schedule</span>
              <span class="text-label-sm">{timeAgo(t.createdAt)}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">chat_bubble_outline</span>
              <span class="text-label-sm">{activityCount(t.eventId)}</span>
            </div>
            <span class="ml-auto text-primary text-label-sm font-bold flex items-center gap-1">
              Details <span class="material-symbols-outlined text-sm">chevron_right</span>
            </span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</main>

<button
  class="fixed right-6 bottom-20 z-40 w-14 h-14 bg-primary-container text-on-primary-container rounded-xl shadow-lg flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
  onclick={() => goto('/customer/new')}
>
  <span class="material-symbols-outlined text-2xl">add</span>
</button>
