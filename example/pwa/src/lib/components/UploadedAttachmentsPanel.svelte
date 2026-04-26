<script lang="ts">
  import { keyring, forget as keyringForget } from '$lib/blossom/keyring.js'
  import { deleteBlob } from '$lib/blossom/client.js'

  let busy = $state<Set<string>>(new Set())
  let bulkRunning = $state(false)
  let lastResult = $state('')

  const entries = $derived(
    [...$keyring.entries.entries()]
      .map(([blobSha256, e]) => ({ blobSha256, ...e }))
      .sort((a, b) => b.uploadedAt - a.uploadedAt),
  )

  function fmtSize(n: number | undefined): string {
    if (n == null) return '—'
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1024 / 1024).toFixed(1) + ' MB'
  }

  function fmtTs(unixSec: number): string {
    return new Date(unixSec * 1000).toLocaleString()
  }

  async function deleteOne(blobSha256: string, nsec: string, servers: string[] | undefined): Promise<void> {
    busy = new Set([...busy, blobSha256])
    try {
      const result = await deleteBlob({ blobSha256, ephemeralNsec: nsec, servers: servers ?? [] })
      keyringForget(blobSha256)
      lastResult =
        result.serversFailed.length === 0
          ? `Deleted ${blobSha256.slice(0, 8)}… from ${result.serversDeleted.length} server(s)`
          : `Partial: ${result.serversDeleted.length} ok, ${result.serversFailed.length} failed`
    } catch (e) {
      lastResult = e instanceof Error ? e.message : String(e)
    } finally {
      const next = new Set(busy)
      next.delete(blobSha256)
      busy = next
    }
  }

  async function deleteAll(): Promise<void> {
    if (entries.length === 0) return
    if (
      !confirm(
        `Delete all ${entries.length} uploaded blob(s) from Blossom servers? Recipients keep already-decrypted copies; new readers see 404.`,
      )
    )
      return
    bulkRunning = true
    let ok = 0
    let failed = 0
    for (const e of entries) {
      try {
        const r = await deleteBlob({ blobSha256: e.blobSha256, ephemeralNsec: e.nsec, servers: e.servers ?? [] })
        keyringForget(e.blobSha256)
        if (r.serversFailed.length === 0) ok++
        else failed++
      } catch {
        failed++
      }
    }
    bulkRunning = false
    lastResult = `Bulk delete: ${ok} ok, ${failed} failed`
  }
</script>

<section class="bg-white border border-outline-variant rounded-lg p-md">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-label-sm uppercase tracking-widest text-on-surface-variant font-bold">Uploaded attachments</h2>
    <span class="text-label-sm text-on-surface-variant">{entries.length} blob{entries.length === 1 ? '' : 's'}</span>
  </div>
  <p class="text-label-sm text-on-surface-variant mb-3">
    Blobs you uploaded to Blossom servers, keyed in your NIP-78 keyring (kind 30078, encrypted to self).
    Synced across devices that sign in with the same key. Deletion uses the per-blob ephemeral nsec stored here —
    only you can authorize it.
  </p>

  {#if $keyring.status === 'loading'}
    <p class="text-label-sm text-on-surface-variant flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
      Loading keyring…
    </p>
  {:else if $keyring.status === 'error'}
    <p class="text-label-sm text-error flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">error</span>
      Keyring failed to load: {$keyring.errorMsg ?? 'unknown'}
    </p>
  {:else if entries.length === 0}
    <p class="text-label-sm text-on-surface-variant italic">No uploads yet.</p>
  {:else}
    <ul class="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
      {#each entries as e (e.blobSha256)}
        {@const isBusy = busy.has(e.blobSha256) || bulkRunning}
        <li class="flex items-center gap-3 px-3 py-2 hover:bg-surface-container-low">
          <span class="material-symbols-outlined text-[18px] text-primary filled flex-shrink-0">lock</span>
          <div class="min-w-0 flex-1">
            <p class="text-label-sm font-mono truncate">{e.name ?? e.blobSha256.slice(0, 16) + '…'}</p>
            <p class="text-[11px] text-outline">
              {fmtSize(e.size)} · {e.mime ?? 'application/octet-stream'} · {fmtTs(e.uploadedAt)}
            </p>
          </div>
          <button
            class="text-error text-label-sm font-bold flex items-center gap-1 hover:underline disabled:opacity-50 flex-shrink-0"
            disabled={isBusy}
            onclick={() => deleteOne(e.blobSha256, e.nsec, e.servers)}
          >
            <span class="material-symbols-outlined text-[16px]">delete</span>
            {busy.has(e.blobSha256) ? 'Deleting…' : 'Delete'}
          </button>
        </li>
      {/each}
    </ul>
    <div class="mt-3 flex items-center justify-between gap-2">
      {#if lastResult}
        <p class="text-label-sm text-on-surface-variant flex-1 truncate">{lastResult}</p>
      {:else}
        <span class="flex-1"></span>
      {/if}
      <button
        class="px-3 py-1.5 border border-error text-error rounded-lg text-label-sm font-bold disabled:opacity-50"
        disabled={bulkRunning}
        onclick={deleteAll}
      >
        {bulkRunning ? 'Deleting all…' : `Delete all (${entries.length})`}
      </button>
    </div>
  {/if}
</section>
