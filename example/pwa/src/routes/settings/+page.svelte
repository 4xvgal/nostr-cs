<script lang="ts">
  import { goto } from '$app/navigation'
  import { get } from 'svelte/store'
  import { settings, clearSettings } from '$lib/stores/settings.js'
  import { connection } from '$lib/stores/connection.js'
  import { identity } from '$lib/stores/identity.js'
  import { client, connect, disconnect, wipeLocalCache } from '$lib/stores/client.js'
  import { npubOf, shortPubkey } from '$lib/nostr/format.js'
  import UploadedAttachmentsPanel from '$lib/components/UploadedAttachmentsPanel.svelte'

  let saving = $state(false)
  let pulling = $state(false)
  let errorMsg = $state('')
  let successMsg = $state('')

  let bootstrapText = $state(($settings.relays.bootstrap ?? []).join('\n'))
  let writeText = $state(($settings.relays.write ?? []).join('\n'))
  let readText = $state(($settings.relays.read ?? []).join('\n'))
  let dmText = $state(($settings.relays.dm ?? []).join('\n'))
  let profileName = $state($settings.profileName ?? '')

  function parseRelays(text: string): string[] {
    return text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('wss://') || s.startsWith('ws://'))
  }

  async function applyAndReconnect(): Promise<void> {
    saving = true
    errorMsg = ''
    successMsg = ''
    try {
      const next = {
        ...$settings,
        profileName,
        relays: {
          bootstrap: parseRelays(bootstrapText),
          write: parseRelays(writeText),
          read: parseRelays(readText),
          dm: parseRelays(dmText),
        },
      }
      if (next.relays.bootstrap.length === 0) {
        throw new Error('At least one bootstrap relay required')
      }
      settings.set(next)
      await disconnect()
      await connect(next)
      successMsg = 'Reconnected with new settings'
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function pullFromNostr(): Promise<void> {
    const c = get(client)
    if (!c) {
      errorMsg = 'Not connected'
      return
    }
    pulling = true
    errorMsg = ''
    successMsg = ''
    try {
      await c.pullOwnHistory(8000)
      successMsg = 'Pulled own-authored history from relays'
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      pulling = false
    }
  }

  async function clearLocalCache(): Promise<void> {
    if (!confirm('Clear cached events from this browser? Keys and settings stay; data will refetch from relays.')) return
    if ($identity) wipeLocalCache($identity.pubkey)
    successMsg = 'Local cache cleared'
  }

  async function signOut(): Promise<void> {
    if (!confirm('Sign out and clear local data? This will remove keys from this browser.')) return
    if ($identity) wipeLocalCache($identity.pubkey)
    await disconnect()
    clearSettings()
    void goto('/setup')
  }

  function copy(text: string): void {
    void navigator.clipboard?.writeText(text)
  }

  const npub = $derived($identity ? npubOf($identity.pubkey) : '')
</script>

<div class="px-4 py-6 max-w-2xl mx-auto pb-24 space-y-lg">
  <div class="flex items-center gap-3 mb-2">
    <button class="material-symbols-outlined text-on-surface-variant md:hidden" onclick={() => history.back()}>arrow_back</button>
    <h1 class="text-h1 font-bold">Settings</h1>
  </div>

  <section class="bg-white border border-outline-variant rounded-lg p-md">
    <h2 class="text-label-sm uppercase tracking-widest text-on-surface-variant font-bold mb-md">Identity</h2>
    {#if $identity}
      <div class="space-y-sm">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-h3">
            {($identity.profileName || shortPubkey($identity.pubkey)).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p class="font-bold">{$identity.profileName || 'Unnamed'}</p>
            <p class="text-label-sm text-on-surface-variant capitalize">Role: {$identity.role}</p>
          </div>
        </div>
        <label class="block">
          <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">npub</span>
          <div class="mt-1 flex gap-2">
            <code class="flex-1 px-md py-2 bg-surface-container-low border border-outline-variant rounded-lg font-mono text-code break-all">{npub}</code>
            <button class="px-3 py-2 border border-outline-variant rounded-lg" onclick={() => copy(npub)}>
              <span class="material-symbols-outlined text-[18px]">content_copy</span>
            </button>
          </div>
        </label>
        <label class="block">
          <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Display name</span>
          <input class="mt-1 w-full h-10 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary" bind:value={profileName} />
        </label>
        <label class="block">
          <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Role</span>
          <select
            class="mt-1 w-full h-10 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary"
            value={$settings.role}
            onchange={(e) => settings.update((s) => ({ ...s, role: (e.currentTarget as HTMLSelectElement).value as 'agent' | 'customer' }))}
          >
            <option value="customer">Customer</option>
            <option value="agent">Agent</option>
          </select>
          <p class="mt-1 text-label-sm text-on-surface-variant">Switching role will reconnect on next save.</p>
        </label>
      </div>
    {:else}
      <p class="text-on-surface-variant">Not signed in.</p>
    {/if}
  </section>

  <section class="bg-white border border-outline-variant rounded-lg p-md">
    <div class="flex items-center justify-between mb-md">
      <h2 class="text-label-sm uppercase tracking-widest text-on-surface-variant font-bold">Relays</h2>
      <span class="text-label-sm {$connection.state === 'connected' ? 'text-secondary' : 'text-outline'}">
        {$connection.state}
      </span>
    </div>
    <div class="space-y-md">
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Bootstrap (kind 0/10002/10050 lookup)</span>
        <textarea class="mt-1 w-full min-h-[100px] px-md py-2 bg-white border border-outline-variant rounded-lg font-mono text-code outline-none focus:ring-2 focus:ring-primary" bind:value={bootstrapText}></textarea>
      </label>
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Write (default = bootstrap)</span>
        <textarea class="mt-1 w-full min-h-[80px] px-md py-2 bg-white border border-outline-variant rounded-lg font-mono text-code outline-none focus:ring-2 focus:ring-primary" bind:value={writeText} placeholder="(empty = use bootstrap)"></textarea>
      </label>
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Read (default = bootstrap)</span>
        <textarea class="mt-1 w-full min-h-[80px] px-md py-2 bg-white border border-outline-variant rounded-lg font-mono text-code outline-none focus:ring-2 focus:ring-primary" bind:value={readText} placeholder="(empty = use bootstrap)"></textarea>
      </label>
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">DM (default = read)</span>
        <textarea class="mt-1 w-full min-h-[80px] px-md py-2 bg-white border border-outline-variant rounded-lg font-mono text-code outline-none focus:ring-2 focus:ring-primary" bind:value={dmText} placeholder="(empty = use read)"></textarea>
      </label>
    </div>
    {#if errorMsg}<p class="mt-3 text-label-sm text-error flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">error</span> {errorMsg}</p>{/if}
    {#if successMsg}<p class="mt-3 text-label-sm text-secondary flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check_circle</span> {successMsg}</p>{/if}
    <button class="mt-md w-full p-md bg-primary text-on-primary rounded-lg font-semibold disabled:opacity-50" disabled={saving} onclick={applyAndReconnect}>
      {saving ? 'Reconnecting…' : 'Save & Reconnect'}
    </button>
  </section>

  <section class="bg-white border border-outline-variant rounded-lg p-md">
    <h2 class="text-label-sm uppercase tracking-widest text-on-surface-variant font-bold mb-2">Local cache</h2>
    <p class="text-label-sm text-on-surface-variant mb-3">
      Tickets, replies, notes, status changes and DMs you've seen are cached in this browser. Re-pull from relays
      to recover events your <span class="font-mono">#p:[me]</span> subscription misses (your own creates / replies / status / notes).
      Outgoing NIP-17 DMs can't be re-pulled — they live only in this cache.
    </p>
    <div class="flex flex-wrap gap-2">
      <button class="px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold text-label-sm disabled:opacity-50" disabled={pulling || $connection.state !== 'connected'} onclick={pullFromNostr}>
        {pulling ? 'Pulling…' : 'Pull from Nostr'}
      </button>
      <button class="px-4 py-2 border border-outline-variant rounded-lg text-label-sm hover:bg-surface-container-low" onclick={clearLocalCache}>
        Clear local cache
      </button>
    </div>
  </section>

  <UploadedAttachmentsPanel />

  <section class="bg-error-container/30 border border-error rounded-lg p-md">
    <h2 class="text-label-sm uppercase tracking-widest text-on-error-container font-bold mb-2">Danger zone</h2>
    <p class="text-label-sm text-on-surface-variant mb-3">Sign out and clear all keys, settings, and cached events from this browser.</p>
    <button class="w-full p-md bg-error text-on-error rounded-lg font-semibold" onclick={signOut}>Sign out & wipe</button>
  </section>
</div>
