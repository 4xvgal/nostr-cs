<script lang="ts">
  import { goto } from '$app/navigation'
  import { connection } from '$lib/stores/connection.js'
  import { identity } from '$lib/stores/identity.js'
  import { shortPubkey } from '$lib/nostr/format.js'

  let { search: showSearch = false }: { search?: boolean } = $props()

  const sensorColor = $derived(
    $connection.state === 'connected'
      ? 'text-secondary'
      : $connection.state === 'connecting'
        ? 'text-tertiary'
        : $connection.state === 'error'
          ? 'text-error'
          : 'text-outline',
  )
</script>

<header
  class="pinned-header bg-white border-b border-outline-variant flex justify-between items-center w-full px-4 md:px-6 h-14"
>
  <div class="flex items-center gap-4">
    <button class="text-xl font-bold tracking-tight text-primary" onclick={() => goto('/')}>
      CSClient
    </button>
    {#if showSearch}
      <div class="hidden md:flex items-center bg-surface-container rounded-lg px-3 py-1.5 gap-2">
        <span class="material-symbols-outlined text-outline text-[20px]">search</span>
        <input
          class="bg-transparent border-none focus:ring-0 text-label-sm w-48 outline-none"
          placeholder="Filter local cache…"
          type="text"
        />
      </div>
    {/if}
  </div>

  <div class="flex items-center gap-3">
    <button
      class="p-2 rounded-full hover:bg-surface-container-low transition-colors"
      title="Connection: {$connection.state}"
      onclick={() => goto('/settings')}
    >
      <span class="material-symbols-outlined {sensorColor}">sensors</span>
    </button>
    {#if $identity}
      <button
        class="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-surface-container-low transition-colors"
        onclick={() => goto('/settings')}
      >
        <div
          class="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-label-sm"
        >
          {($identity.profileName || shortPubkey($identity.pubkey)).slice(0, 1).toUpperCase()}
        </div>
        <span class="hidden md:block text-label-sm font-medium">{$identity.profileName || shortPubkey($identity.pubkey)}</span>
      </button>
    {/if}
  </div>
</header>
