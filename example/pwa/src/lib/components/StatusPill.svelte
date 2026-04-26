<script lang="ts">
  import type { TicketStatus } from 'nostr-cs'
  let { status }: { status: TicketStatus } = $props()

  const styles: Record<TicketStatus, { dot: string; text: string; label: string }> = {
    open: { dot: 'bg-outline', text: 'text-on-surface-variant', label: 'Open' },
    in_progress: { dot: 'bg-secondary', text: 'text-secondary', label: 'In Progress' },
    resolved: { dot: 'bg-primary', text: 'text-primary', label: 'Resolved' },
    closed: { dot: 'bg-surface-dim', text: 'text-outline', label: 'Closed' },
  }
  const s = $derived(styles[status])
</script>

<span class="flex items-center gap-2">
  <span class="w-2 h-2 rounded-full {s.dot}"></span>
  <span class="text-label-sm font-medium {s.text}">{s.label}</span>
</span>
