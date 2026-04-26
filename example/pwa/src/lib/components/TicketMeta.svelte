<script lang="ts">
  import type { TicketStatus, Priority } from 'nostr-cs'
  import { shortTicketId } from '$lib/nostr/format.js'

  let {
    ticketIdStr,
    status,
    priority,
  }: {
    ticketIdStr: string
    status: TicketStatus
    priority: Priority
  } = $props()

  const statusStyle: Record<TicketStatus, string> = {
    open: 'bg-surface-container text-on-surface-variant',
    in_progress: 'bg-secondary-container text-on-secondary-container',
    resolved: 'bg-primary-container text-on-primary-container',
    closed: 'bg-surface-container-highest text-outline',
  }

  const priorityStyle: Record<Priority, string> = {
    urgent: 'bg-error-container text-on-error-container',
    high: 'bg-error-container text-on-error-container',
    normal: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    low: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  }
</script>

<div class="flex flex-wrap items-center gap-2 text-label-sm font-mono">
  <span class="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-bold tracking-wider uppercase">
    {shortTicketId(ticketIdStr)}
  </span>
  <span class="px-2 py-0.5 rounded {statusStyle[status]}">
    <span class="opacity-60">status:</span><span class="font-bold">{status}</span>
  </span>
  <span class="px-2 py-0.5 rounded {priorityStyle[priority]}">
    <span class="opacity-60">priority:</span><span class="font-bold">{priority}</span>
  </span>
</div>
