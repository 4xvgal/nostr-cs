<script lang="ts">
  import type { Priority } from 'nostr-cs'
  let { priority }: { priority: Priority } = $props()

  const styles: Record<Priority, string> = {
    urgent: 'bg-error-container text-on-error-container',
    high: 'bg-error-container text-on-error-container',
    normal: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    low: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  }
</script>

<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider {styles[priority]}">
  {priority}
</span>
