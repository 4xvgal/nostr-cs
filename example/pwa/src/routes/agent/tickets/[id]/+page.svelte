<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { get } from 'svelte/store'
  import { client } from '$lib/stores/client.js'
  import { identity } from '$lib/stores/identity.js'
  import {
    tickets,
    replies,
    notes,
    messages,
    statusEvents,
    currentStatus,
    pushOptimisticReply,
    pushOptimisticNote,
    pushOptimisticStatus,
    pushOptimisticMessage,
  } from '$lib/stores/tickets.js'
  import { buildTimeline } from '$lib/nostr/timeline.js'
  import { clockTime, shortPubkey, timeAgo } from '$lib/nostr/format.js'
  import TicketMeta from '$lib/components/TicketMeta.svelte'
  import PubkeyChip from '$lib/components/PubkeyChip.svelte'
  import AttachmentPicker from '$lib/components/AttachmentPicker.svelte'
  import MessageBody from '$lib/components/MessageBody.svelte'
  import { encodeEnvelope, type EncryptedAttachment, type TicketStatus } from 'nostr-cs'
  import { isIdea, categoryLabel } from '$lib/nostr/category.js'

  const ticketIdStr = $derived($page.params.id ?? '')
  const ticket = $derived($tickets.get(ticketIdStr))
  const myPubkey = $derived($identity?.pubkey ?? '')
  const idea = $derived(!!ticket && isIdea(ticket))
  const status = $derived(ticket ? ($currentStatus.get(ticket.eventId) ?? ticket.status) : 'open')
  const isResolved = $derived(status === 'resolved' || status === 'closed')

  function back(): void {
    if (typeof history !== 'undefined' && history.length > 1) history.back()
    else goto(idea ? '/agent/ideas' : '/agent/inbox')
  }

  const timeline = $derived(
    ticket
      ? buildTimeline({
          ticket,
          replies: $replies.get(ticket.eventId),
          notes: $notes.get(ticket.eventId),
          messages: $messages.get(ticket.eventId),
          statuses: $statusEvents.get(ticket.eventId),
          showNotes: true,
        })
      : [],
  )

  const recentTickets = $derived(
    ticket
      ? [...$tickets.values()]
          .filter((t) => t.customerPubkey === ticket.customerPubkey && !t.id.equals(ticket.id))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
      : [],
  )

  const ticketNotes = $derived(ticket ? ($notes.get(ticket.eventId) ?? []) : [])

  let mode = $state<'reply' | 'dm' | 'note'>('reply')
  let composerText = $state('')
  let composerAttachments = $state<EncryptedAttachment[]>([])
  let sending = $state(false)
  let errorMsg = $state('')

  async function send(): Promise<void> {
    if (!ticket) return
    if (!composerText.trim() && composerAttachments.length === 0) return
    const c = get(client)
    if (!c) {
      errorMsg = 'Not connected'
      return
    }
    sending = true
    errorMsg = ''
    const body = encodeEnvelope({
      v: 1,
      text: composerText,
      attachments: composerAttachments,
    })
    try {
      if (mode === 'reply') {
        await c.replyTicket({
          ticketId: ticket.id,
          threadRoot: ticket.eventId,
          body,
          customerPubkey: ticket.customerPubkey,
        })
        pushOptimisticReply({ ticketId: ticket.id, threadRoot: ticket.eventId, body, byPubkey: myPubkey })
      } else if (mode === 'dm') {
        await c.sendMessage({
          ticketId: ticket.id,
          threadRoot: ticket.eventId,
          content: body,
          recipientPubkey: ticket.customerPubkey,
        })
        pushOptimisticMessage({ ticketId: ticket.id, threadRoot: ticket.eventId, body, senderPubkey: myPubkey })
      } else {
        await c.addInternalNote({
          ticketId: ticket.id,
          threadRoot: ticket.eventId,
          body,
          otherAgentPubkeys: [],
        })
        pushOptimisticNote({ ticketId: ticket.id, threadRoot: ticket.eventId, body, byPubkey: myPubkey })
      }
      composerText = ''
      composerAttachments = []
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      sending = false
    }
  }

  let republishing = $state(false)

  async function setStatus(newStatus: TicketStatus): Promise<void> {
    if (!ticket) return
    const c = get(client)
    if (!c) return
    try {
      await c.updateStatus({
        ticketId: ticket.id,
        threadRoot: ticket.eventId,
        newStatus,
        customerPubkey: ticket.customerPubkey,
      })
      pushOptimisticStatus({
        ticketId: ticket.id,
        threadRoot: ticket.eventId,
        newStatus,
        byPubkey: myPubkey,
      })
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    }
  }

  const resolve = (): Promise<void> => setStatus('resolved')
  const startProgress = (): Promise<void> => setStatus('in_progress')

  async function republishStatus(): Promise<void> {
    republishing = true
    try {
      await setStatus(status)
    } finally {
      republishing = false
    }
  }
</script>

{#if !ticket}
  <div class="px-4 py-12 text-center text-on-surface-variant">
    <span class="material-symbols-outlined text-3xl text-outline">search_off</span>
    <p class="mt-2 text-body-md">Ticket not found in local cache.</p>
    <button class="mt-3 text-primary text-label-sm font-bold" onclick={back}>Back</button>
  </div>
{:else}
  <div class="flex flex-col md:flex-row min-h-[calc(100dvh-3.5rem)]">
    <section class="flex-1 flex flex-col bg-white border-r border-outline-variant min-w-0">
      <div class="p-6 border-b border-outline-variant bg-surface-container-lowest">
        <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <button class="material-symbols-outlined text-on-surface-variant md:hidden" onclick={back}>arrow_back</button>
              <TicketMeta ticketIdStr={ticket.id.toString()} status={status} priority={ticket.priority} {idea} />
            </div>
            <h1 class="text-h2 text-on-surface">{ticket.title}</h1>
          </div>
          {#if !idea}
            <div class="flex gap-2">
              {#if status === 'open'}
                <button class="border border-outline-variant px-3 py-1.5 rounded-lg text-label-sm flex items-center gap-2 hover:bg-surface-container-low" onclick={startProgress}>
                  <span class="material-symbols-outlined text-[18px]">play_arrow</span> Start
                </button>
              {/if}
              {#if !isResolved}
                <button class="bg-primary text-on-primary px-3 py-1.5 rounded-lg text-label-sm flex items-center gap-2 hover:opacity-90" onclick={resolve}>
                  <span class="material-symbols-outlined text-[18px]">check_circle</span> Resolve
                </button>
              {/if}
              <button
                class="border border-outline-variant px-3 py-1.5 rounded-lg text-label-sm flex items-center gap-2 hover:bg-surface-container-low disabled:opacity-50"
                onclick={republishStatus}
                disabled={republishing}
                title={`Re-emit a kind 7701 with current status (${status}) — useful when a relay missed the prior publish.`}
              >
                <span class="material-symbols-outlined text-[18px]">refresh</span>
                {republishing ? 'Republishing…' : 'Republish'}
              </button>
            </div>
          {/if}
        </div>
        <div class="flex flex-wrap gap-6 text-label-sm text-on-surface-variant">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">person</span>
            <PubkeyChip pubkey={ticket.customerPubkey} showAvatar={false} />
          </div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">schedule</span>
            <span>Opened {timeAgo(ticket.createdAt)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">label</span>
            <span>{categoryLabel(ticket.category)}</span>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FDFDFD]">
        <div class="flex gap-4 max-w-3xl">
          <div class="h-10 w-10 rounded bg-surface-container-high flex-shrink-0 flex items-center justify-center">
            <span class="material-symbols-outlined text-outline">person</span>
          </div>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <PubkeyChip pubkey={ticket.customerPubkey} showAvatar={false} />
              <span class="text-[11px] text-outline">{clockTime(ticket.createdAt)}</span>
            </div>
            <div class="bg-surface-container-low border border-outline-variant p-4 rounded-xl rounded-tl-none">
              <MessageBody body={ticket.body} />
            </div>
          </div>
        </div>

        {#each timeline as entry}
          {#if entry.kind === 'ticket'}
            <!-- already rendered -->
          {:else if entry.kind === 'status'}
            <div class="flex justify-center">
              <div class="bg-surface-container border border-outline-variant rounded-lg px-3 py-1 text-label-sm text-on-surface-variant">
                Status → <span class="font-semibold">{entry.status.newStatus}</span> · {clockTime(entry.at)}
              </div>
            </div>
          {:else if entry.kind === 'note'}
            <div class="flex justify-center">
              <div class="bg-surface-container border border-outline-variant rounded-lg px-4 py-2 flex items-center gap-3 max-w-2xl">
                <span class="material-symbols-outlined text-outline text-[18px]">sticky_note_2</span>
                <div class="text-label-sm text-on-surface-variant italic"><span class="font-bold not-italic">Internal:</span> <MessageBody body={entry.note.body} /></div>
                <span class="text-[10px] text-outline ml-2">{clockTime(entry.at)}</span>
              </div>
            </div>
          {:else}
            {@const fromMe = entry.kind === 'reply' ? entry.reply.byPubkey === myPubkey : entry.message.senderPubkey === myPubkey}
            {@const isDM = entry.kind === 'message' && entry.message.channel === 'dm'}
            {@const author = entry.kind === 'reply' ? entry.reply.byPubkey : entry.message.senderPubkey}
            {@const body = entry.kind === 'reply' ? entry.reply.body : entry.message.body}
            <div class="flex gap-4 max-w-3xl {fromMe ? 'ml-auto flex-row-reverse' : ''}">
              <div class="h-10 w-10 rounded {fromMe ? 'bg-primary-container' : 'bg-surface-container-high'} flex-shrink-0 flex items-center justify-center">
                <span class="material-symbols-outlined {fromMe ? 'text-on-primary-container' : 'text-outline'}">{fromMe ? 'support_agent' : 'person'}</span>
              </div>
              <div class="{fromMe ? 'text-right' : ''}">
                <div class="flex items-center gap-2 mb-1 {fromMe ? 'justify-end' : ''}">
                  {#if fromMe}<span class="text-[11px] text-outline">{clockTime(entry.at)}</span>{/if}
                  <PubkeyChip pubkey={author} showAvatar={false} />
                  {#if !fromMe}<span class="text-[11px] text-outline">{clockTime(entry.at)}</span>{/if}
                </div>
                <div class="{fromMe ? 'bg-primary text-on-primary rounded-tr-none' : 'bg-white border border-outline-variant rounded-tl-none'} {isDM ? 'border-l-4 border-secondary' : ''} p-4 rounded-xl shadow-sm">
                  {#if isDM}
                    <div class="flex items-center gap-1 mb-1 text-label-sm font-bold {fromMe ? 'text-on-primary' : 'text-secondary'}">
                      <span class="material-symbols-outlined text-[14px] filled">lock</span>
                      Encrypted DM
                    </div>
                  {/if}
                  <MessageBody body={body} />
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      {#if !isResolved}
        <div class="p-4 border-t border-outline-variant bg-white">
          <div class="max-w-4xl mx-auto">
            <div class="flex mb-2 bg-surface-container p-1 rounded-lg w-fit">
              {#each [{ k: 'reply', l: 'Reply', i: 'reply' }, { k: 'dm', l: 'DM', i: 'lock' }, { k: 'note', l: 'Note', i: 'note_add' }] as opt}
                <button class="px-4 py-1.5 rounded-md text-label-sm flex items-center gap-2 {mode === opt.k ? 'bg-white shadow-sm text-primary font-semibold' : 'text-outline hover:text-on-surface'}" onclick={() => (mode = opt.k as typeof mode)}>
                  <span class="material-symbols-outlined text-[18px]">{opt.i}</span> {opt.l}
                </button>
              {/each}
            </div>
            <p class="mb-2 text-label-sm text-on-surface-variant">
              {#if mode === 'reply'}
                <span class="font-semibold">Reply (kind 7702)</span> — public ticket thread; body NIP-44 encrypted to customer; presence visible to anyone watching the thread.
              {:else if mode === 'dm'}
                <span class="font-semibold">DM (NIP-17 / kind 1059)</span> — gift-wrapped; sender identity hidden, content end-to-end encrypted.
              {:else}
                <span class="font-semibold">Note (kind 7703)</span> — internal; encrypted to other agents on this ticket. Customer never sees it.
              {/if}
            </p>
            <div class="relative border border-outline-variant rounded-xl overflow-hidden focus-within:border-primary transition-colors">
              <textarea
                class="w-full min-h-[100px] p-4 text-body-md border-none focus:ring-0 resize-none outline-none"
                placeholder={mode === 'reply' ? 'Type a reply…' : mode === 'dm' ? 'Type an encrypted DM…' : 'Type an internal note…'}
                bind:value={composerText}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    if ((composerText.trim() || composerAttachments.length > 0) && !sending) void send()
                  }
                }}
              ></textarea>
              <div class="flex items-center justify-between gap-3 p-3 bg-surface-container-low border-t border-outline-variant">
                <AttachmentPicker bind:attachments={composerAttachments} />
                <button class="bg-primary text-on-primary px-6 py-2 rounded-lg font-bold text-label-sm disabled:opacity-50" onclick={send} disabled={(!composerText.trim() && composerAttachments.length === 0) || sending}>
                  {sending ? 'Sending…' : mode === 'note' ? 'Save Note' : mode === 'dm' ? 'Send DM' : 'Send Reply'}
                </button>
              </div>
            </div>
            {#if errorMsg}<p class="mt-2 text-label-sm text-error">{errorMsg}</p>{/if}
          </div>
        </div>
      {/if}
    </section>

    <aside class="w-full md:w-80 bg-surface-container-lowest border-l border-outline-variant p-6 space-y-8 overflow-y-auto md:max-h-[calc(100dvh-3.5rem)] no-scrollbar">
      <div>
        <h4 class="text-label-sm text-outline uppercase tracking-widest mb-4 font-bold">Customer Context</h4>
        <PubkeyChip pubkey={ticket.customerPubkey} />
        <div class="mt-3 space-y-2 bg-surface-container-low p-3 rounded-lg border border-outline-variant text-label-sm">
          <div class="flex justify-between"><span class="text-outline">npub</span><span class="font-mono">{shortPubkey(ticket.customerPubkey)}</span></div>
          <div class="flex justify-between"><span class="text-outline">first seen</span><span>{timeAgo(ticket.createdAt)}</span></div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-label-sm text-outline uppercase tracking-widest font-bold">Internal Notes</h4>
          <span class="text-label-sm font-bold text-primary">{ticketNotes.length}</span>
        </div>
        {#if ticketNotes.length === 0}
          <p class="text-label-sm text-on-surface-variant italic">No internal notes yet. Use the <span class="font-semibold">Note</span> mode in the composer below.</p>
        {:else}
          <ul class="space-y-2">
            {#each ticketNotes as note}
              <li class="bg-surface-container-low border border-outline-variant rounded-lg p-3 text-label-sm">
                <div class="flex items-center justify-between mb-1 text-on-surface-variant">
                  <PubkeyChip pubkey={note.byPubkey} showAvatar={false} />
                  <span class="text-[10px] text-outline">{clockTime(note.at)}</span>
                </div>
                <div class="text-body-md text-on-surface"><MessageBody body={note.body} /></div>
              </li>
            {/each}
          </ul>
        {/if}
        <p class="mt-3 text-[11px] text-outline">
          Notes are kind 7703, encrypted to <span class="font-mono">otherAgentPubkeys</span>. The framework supports targeting other agents — this example currently posts with an empty target list, so only the author sees their own notes here.
        </p>
      </div>

      {#if recentTickets.length > 0}
        <div>
          <h4 class="text-label-sm text-outline uppercase tracking-widest mb-4 font-bold">Recent History</h4>
          <div class="grid grid-cols-1 gap-2">
            {#each recentTickets as rt}
              {@const rIsIdea = isIdea(rt)}
              {@const rst = $currentStatus.get(rt.eventId) ?? rt.status}
              <button class="text-left p-3 bg-white border border-outline-variant rounded-lg hover:border-primary transition-colors" onclick={() => goto(`/agent/tickets/${rt.id.toString()}`)}>
                <p class="text-label-sm font-bold mb-1 truncate">{rt.title}</p>
                <div class="flex justify-between items-center">
                  <span class="text-[10px] text-outline">{timeAgo(rt.createdAt)}</span>
                  {#if rIsIdea}
                    <span class="px-1.5 py-0.5 rounded text-[9px] uppercase" style="background:#EEF0FB;color:#515AC0;">Idea</span>
                  {:else}
                    <span class="bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded text-[9px] uppercase">{rst}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </aside>
  </div>
{/if}
