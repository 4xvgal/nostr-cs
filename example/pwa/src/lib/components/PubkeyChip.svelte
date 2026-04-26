<script lang="ts">
  import { profiles } from '$lib/stores/profiles.js'
  import { shortPubkey } from '$lib/nostr/format.js'

  let { pubkey, showAvatar = true }: { pubkey: string; showAvatar?: boolean } = $props()

  const meta = $derived($profiles.get(pubkey))
  const display = $derived(meta?.display_name || meta?.name || shortPubkey(pubkey))
  const initial = $derived(display.slice(0, 1).toUpperCase())
</script>

<span class="inline-flex items-center gap-2">
  {#if showAvatar}
    {#if meta?.picture}
      <img src={meta.picture} alt="" class="w-6 h-6 rounded-full object-cover border border-outline-variant" />
    {:else}
      <span
        class="w-6 h-6 rounded-full bg-surface-container-high text-primary flex items-center justify-center text-[10px] font-bold"
      >{initial}</span>
    {/if}
  {/if}
  <span class="text-body-md font-medium">{display}</span>
</span>
