<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { identity } from '$lib/stores/identity.js'
  import { settings } from '$lib/stores/settings.js'
  import { connection } from '$lib/stores/connection.js'

  onMount(() => {
    if ($identity) {
      goto($identity.role === 'agent' ? '/agent/inbox' : '/customer/tickets')
      return
    }
    if (!$settings.key || !$settings.role) {
      goto('/setup')
      return
    }
    if ($connection.state === 'idle' || $connection.state === 'connecting') {
      // Wait — auto-connect runs in +layout.svelte; route once identity flips.
      const unsub = identity.subscribe((id) => {
        if (id) {
          goto(id.role === 'agent' ? '/agent/inbox' : '/customer/tickets')
          unsub()
        }
      })
    }
  })
</script>

<div class="min-h-[60dvh] flex flex-col items-center justify-center gap-3 text-on-surface-variant">
  <span class="material-symbols-outlined text-4xl text-primary animate-pulse">sensors</span>
  <p class="text-label-sm">Connecting to relay network…</p>
</div>
