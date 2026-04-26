<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { get } from 'svelte/store'
  import { TicketId } from 'nostr-cs'
  import { client } from '$lib/stores/client.js'
  import { identity } from '$lib/stores/identity.js'
  import {
    tickets,
    replies,
    messages,
    statusEvents,
    csats,
    currentStatus,
    pushOptimisticMessage,
  } from '$lib/stores/tickets.js'
  import { buildTimeline } from '$lib/nostr/timeline.js'
  import { clockTime } from '$lib/nostr/format.js'
  import TicketMeta from '$lib/components/TicketMeta.svelte'
  import PubkeyChip from '$lib/components/PubkeyChip.svelte'
  import CsatStars from '$lib/components/CsatStars.svelte'
  import AttachmentPicker from '$lib/components/AttachmentPicker.svelte'
  import MessageBody from '$lib/components/MessageBody.svelte'
  import { encodeEnvelope, type EncryptedAttachment } from 'nostr-cs'

  const ticketIdStr = $derived($page.params.id ?? '')
  const ticket = $derived($tickets.get(ticketIdStr))
  const myPubkey = $derived($identity?.pubkey ?? '')

  const status = $derived(ticket ? ($currentStatus.get(ticket.eventId) ?? ticket.status) : 'open')
  const isResolved = $derived(status === 'resolved' || status === 'closed')

  const timeline = $derived(
    ticket
      ? buildTimeline({
          ticket,
          replies: $replies.get(ticket.eventId),
          notes: undefined,
          messages: $messages.get(ticket.eventId),
          statuses: $statusEvents.get(ticket.eventId),
          showNotes: false,
        })
      : [],
  )

  const csat = $derived(ticket ? $csats.get(ticket.eventId) : undefined)

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
    try {
      const body = encodeEnvelope({
        v: 1,
        text: composerText,
        attachments: composerAttachments,
      })
      await c.sendMessage({
        ticketId: ticket.id,
        threadRoot: ticket.eventId,
        content: body,
        recipientPubkey: ticket.agentPubkey,
      })
      pushOptimisticMessage({
        ticketId: ticket.id,
        threadRoot: ticket.eventId,
        body,
        senderPubkey: myPubkey,
      })
      composerText = ''
      composerAttachments = []
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      sending = false
    }
  }

  let csatRating = $state<0 | 1 | 2 | 3 | 4 | 5>(0)
  let csatComment = $state('')
  let submittingCsat = $state(false)

  async function submitCsat(): Promise<void> {
    if (!ticket || csatRating === 0) return
    const c = get(client)
    if (!c) return
    submittingCsat = true
    try {
      await c.submitCsat({
        ticketId: ticket.id,
        threadRoot: ticket.eventId,
        agentPubkey: ticket.agentPubkey,
        rating: csatRating,
        comment: csatComment,
      })
      csatRating = 0
      csatComment = ''
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      submittingCsat = false
    }
  }
</script>

{#if !ticket}
  <div class="px-4 py-12 text-center text-on-surface-variant">
    <span class="material-symbols-outlined text-3xl text-outline">search_off</span>
    <p class="mt-2 text-body-md">Ticket not found in local cache.</p>
    <button class="mt-3 text-primary text-label-sm font-bold" onclick={() => goto('/customer/tickets')}>Back to list</button>
  </div>
{:else}
  <main class="max-w-2xl mx-auto px-4 py-4 mb-32">
    <div class="flex items-center gap-2 mb-3">
      <button class="material-symbols-outlined text-on-surface-variant" onclick={() => goto('/customer/tickets')}>arrow_back</button>
      <h1 class="text-label-sm font-semibold text-on-surface">Ticket Details</h1>
    </div>
    <div class="bg-white border border-outline-variant rounded-lg p-md mb-md">
      <TicketMeta ticketIdStr={ticket.id.toString()} status={status} priority={ticket.priority} />
      <h2 class="mt-2 text-h2 font-semibold leading-tight">{ticket.title}</h2>
      <p class="mt-2 text-body-md text-on-surface-variant whitespace-pre-wrap">{ticket.body}</p>
    </div>

    <div class="space-y-md">
      {#each timeline as entry}
        {#if entry.kind === 'ticket'}
          <!-- Ticket itself rendered above -->
        {:else if entry.kind === 'status'}
          <div class="flex items-center justify-center gap-2 text-label-sm text-on-surface-variant">
            <span class="material-symbols-outlined text-[16px]">flag</span>
            Status changed to <span class="font-semibold">{entry.status.newStatus}</span>
            <span class="text-outline">· {clockTime(entry.at)}</span>
          </div>
        {:else}
          {@const fromMe =
            entry.kind === 'reply'
              ? entry.reply.byPubkey === myPubkey
              : entry.kind === 'message'
                ? entry.message.senderPubkey === myPubkey
                : false}
          {@const body = entry.kind === 'reply' ? entry.reply.body : entry.kind === 'message' ? entry.message.body : ''}
          {@const author = entry.kind === 'reply' ? entry.reply.byPubkey : entry.kind === 'message' ? entry.message.senderPubkey : ''}
          {@const isDM = entry.kind === 'message' && entry.message.channel === 'dm'}
          <div class="flex flex-col {fromMe ? 'items-end' : 'items-start'} w-full">
            <div class="max-w-[85%] {fromMe ? 'bg-primary-container text-on-primary-container rounded-tr-none' : 'bg-white border border-outline-variant text-on-surface rounded-tl-none'} {isDM ? 'border-l-4 border-primary' : ''} p-md rounded-xl shadow-sm">
              <div class="flex items-center justify-between gap-3 mb-1">
                <span class="text-label-sm font-bold flex items-center gap-1">
                  {#if isDM}
                    <span class="material-symbols-outlined text-[14px] filled">lock</span>
                    Encrypted DM
                  {:else if fromMe}
                    Me
                  {:else}
                    <PubkeyChip pubkey={author} showAvatar={false} />
                  {/if}
                </span>
                <span class="text-[10px] opacity-70">{clockTime(entry.at)}</span>
              </div>
              <MessageBody body={body} />
            </div>
          </div>
        {/if}
      {/each}
    </div>

    {#if isResolved && !csat}
      <div class="mt-lg p-md bg-tertiary-fixed border border-outline-variant rounded-lg">
        <p class="text-label-sm font-semibold text-on-tertiary-fixed-variant uppercase tracking-wider mb-2">Rate this support</p>
        <CsatStars rating={csatRating} onPick={(n) => (csatRating = n)} />
        <textarea class="mt-2 w-full px-md py-2 bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary text-body-md" placeholder="Any feedback?" bind:value={csatComment}></textarea>
        <button class="mt-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-label-sm font-bold disabled:opacity-50" disabled={csatRating === 0 || submittingCsat} onclick={submitCsat}>
          {submittingCsat ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    {:else if csat}
      <div class="mt-lg p-md bg-secondary-container/30 border border-outline-variant rounded-lg">
        <p class="text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">CSAT submitted</p>
        <CsatStars rating={csat.rating} />
        {#if csat.comment}<p class="mt-2 text-body-md italic">"{csat.comment}"</p>{/if}
      </div>
    {/if}
  </main>

  {#if !isResolved}
    <div class="fixed bottom-16 left-0 w-full bg-white border-t border-outline-variant px-4 py-3 z-30">
      <div class="max-w-2xl mx-auto">
        <div class="mb-2 text-label-sm text-on-surface-variant">
          <span class="inline-flex items-center gap-1 font-semibold">
            <span class="material-symbols-outlined text-[16px] filled text-primary">lock</span>
            DM (NIP-17 / kind 1059)
          </span>
          — gift-wrapped to agent. Sender identity hidden, content end-to-end encrypted.
          Customers don't have a public Reply channel — that's agent-only (kind 7702).
        </div>
        <div class="relative flex items-end gap-2 bg-surface-container-low border border-outline-variant rounded-xl p-2 focus-within:border-primary transition-all">
          <textarea
            class="w-full bg-transparent border-none focus:ring-0 resize-none text-body-md py-2 px-2 outline-none"
            placeholder="Type a message…"
            rows="1"
            bind:value={composerText}
            onkeydown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          ></textarea>
          <button
            class="w-10 h-10 flex items-center justify-center bg-primary text-on-primary rounded-lg disabled:opacity-50"
            disabled={(!composerText.trim() && composerAttachments.length === 0) || sending}
            onclick={send}
          >
            <span class="material-symbols-outlined filled">send</span>
          </button>
        </div>
        <div class="mt-2">
          <AttachmentPicker bind:attachments={composerAttachments} />
        </div>
        {#if errorMsg}<p class="mt-2 text-label-sm text-error">{errorMsg}</p>{/if}
      </div>
    </div>
  {/if}
{/if}
