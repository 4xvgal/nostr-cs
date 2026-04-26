<script lang="ts">
  import { goto } from '$app/navigation'
  import { get } from 'svelte/store'
  import { client } from '$lib/stores/client.js'
  import { tryHexFromNpub } from '$lib/nostr/format.js'
  import { upsertTicket } from '$lib/stores/tickets.js'
  import type { Priority, Category } from 'nostr-cs'

  let title = $state('')
  let body = $state('')
  let agentInput = $state('')
  let priority = $state<Priority>('normal')
  let category = $state<Category>('general')
  let submitting = $state(false)
  let errorMsg = $state('')

  async function submit(): Promise<void> {
    errorMsg = ''
    const c = get(client)
    if (!c) {
      errorMsg = 'Not connected'
      return
    }
    const agentPubkey = tryHexFromNpub(agentInput)
    if (!agentPubkey) {
      errorMsg = 'Agent npub or hex pubkey required'
      return
    }
    if (!title.trim() || !body.trim()) {
      errorMsg = 'Title and body required'
      return
    }
    submitting = true
    try {
      const ticket = await c.createTicket({ title: title.trim(), body: body.trim(), agentPubkey, priority, category })
      upsertTicket(ticket)
      goto(`/customer/tickets/${ticket.id.toString()}`)
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      submitting = false
    }
  }
</script>

<div class="px-4 py-6 max-w-md mx-auto">
  <div class="flex items-center gap-3 mb-6">
    <button class="material-symbols-outlined text-primary" onclick={() => goto('/customer/tickets')}>arrow_back</button>
    <h1 class="text-h2 font-bold">New Ticket</h1>
  </div>

  <form
    onsubmit={(e) => {
      e.preventDefault()
      void submit()
    }}
    class="space-y-md"
  >
    <label class="block">
      <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Title</span>
      <input class="mt-1 w-full h-12 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary" bind:value={title} placeholder="Short summary" />
    </label>

    <label class="block">
      <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Description</span>
      <textarea class="mt-1 w-full min-h-[120px] px-md py-2 bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary resize-none" bind:value={body} placeholder="Describe the issue…"></textarea>
    </label>

    <label class="block">
      <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Agent npub (or hex)</span>
      <input class="mt-1 w-full h-12 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary font-mono text-code" bind:value={agentInput} placeholder="npub1..." />
    </label>

    <div class="grid grid-cols-2 gap-md">
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Priority</span>
        <select class="mt-1 w-full h-12 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary" bind:value={priority}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </label>
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Category</span>
        <select class="mt-1 w-full h-12 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary" bind:value={category}>
          <option value="general">General</option>
          <option value="technical">Technical</option>
          <option value="billing">Billing</option>
        </select>
      </label>
    </div>

    {#if errorMsg}
      <p class="text-label-sm text-error flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]">error</span> {errorMsg}
      </p>
    {/if}

    <button
      type="submit"
      class="w-full p-md bg-primary text-on-primary rounded-lg font-semibold disabled:opacity-50"
      disabled={submitting}
    >{submitting ? 'Publishing…' : 'Open Ticket'}</button>
  </form>
</div>
