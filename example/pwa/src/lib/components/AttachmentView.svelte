<script lang="ts">
  import { onDestroy } from 'svelte'
  import { decryptBlob } from '$lib/crypto/aesgcm.js'
  import { downloadBlob, deleteBlob } from '$lib/blossom/client.js'
  import { keyring, forget as keyringForget } from '$lib/blossom/keyring.js'
  import type { EncryptedAttachment } from 'nostr-cs'

  let { attachment }: { attachment: EncryptedAttachment } = $props()

  let phase: 'idle' | 'loading' | 'ready' | 'error' = $state('idle')
  let errorMsg = $state('')
  let blobUrl = $state('')
  let deleting = $state(false)
  let deleteState = $state<'idle' | 'deleted' | 'partial'>('idle')
  let deleteDetail = $state('')

  const ownEntry = $derived($keyring.entries.get(attachment.blossom.blob_sha256))
  const canDelete = $derived(ownEntry !== undefined && deleteState !== 'deleted')

  const isImage = $derived(attachment.mime.startsWith('image/'))

  async function load(): Promise<void> {
    if (phase === 'loading' || phase === 'ready') return
    phase = 'loading'
    errorMsg = ''
    try {
      const ct = await downloadBlob({
        blobSha256: attachment.blossom.blob_sha256,
        servers: attachment.blossom.servers,
      })
      const pt = await decryptBlob({
        ciphertext: ct,
        keyB64: attachment.key,
        ivB64: attachment.iv,
        expectedCiphertextSha256: attachment.blossom.blob_sha256,
        expectedPlaintextSha256: attachment.sha256,
      })
      const blob = new Blob([pt as BlobPart], { type: attachment.mime })
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      blobUrl = URL.createObjectURL(blob)
      phase = 'ready'
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
      phase = 'error'
    }
  }

  function download(): void {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = attachment.name ?? attachment.blossom.blob_sha256.slice(0, 12)
    a.click()
  }

  async function doDelete(): Promise<void> {
    if (!ownEntry) return
    if (
      !confirm(
        'Delete this blob from all Blossom servers? Recipients who already downloaded a copy keep theirs; new readers will see a 404.',
      )
    )
      return
    deleting = true
    deleteDetail = ''
    try {
      const result = await deleteBlob({
        blobSha256: attachment.blossom.blob_sha256,
        ephemeralNsec: ownEntry.nsec,
        servers: attachment.blossom.servers,
      })
      keyringForget(attachment.blossom.blob_sha256)
      if (result.serversFailed.length === 0) {
        deleteState = 'deleted'
        deleteDetail = `Deleted from ${result.serversDeleted.length} server(s)`
      } else {
        deleteState = 'partial'
        deleteDetail =
          `Deleted on ${result.serversDeleted.length}; failed on ${result.serversFailed.length}: ` +
          result.serversFailed.map((f) => `${f.server} (${f.reason})`).join('; ')
      }
    } catch (e) {
      deleteDetail = e instanceof Error ? e.message : String(e)
    } finally {
      deleting = false
    }
  }

  onDestroy(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  })

  function fmtSize(n: number): string {
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1024 / 1024).toFixed(1) + ' MB'
  }
</script>

<div class="bg-surface-container-low border border-outline-variant rounded-lg p-2 my-2 inline-block max-w-full">
  <div class="flex items-center gap-2 text-label-sm mb-1">
    <span class="material-symbols-outlined text-[16px] text-primary filled">lock</span>
    <span class="font-mono truncate max-w-[200px]">{attachment.name ?? attachment.blossom.blob_sha256.slice(0, 12)}</span>
    <span class="text-outline">{fmtSize(attachment.size)}</span>
    <span class="text-outline">·</span>
    <span class="text-outline">{attachment.mime}</span>
  </div>

  {#if phase === 'idle'}
    <button class="text-primary text-label-sm font-bold flex items-center gap-1 hover:underline" onclick={load}>
      <span class="material-symbols-outlined text-[16px]">download</span>
      Download &amp; decrypt
    </button>
  {:else if phase === 'loading'}
    <p class="text-label-sm text-on-surface-variant flex items-center gap-1">
      <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
      Decrypting…
    </p>
  {:else if phase === 'error'}
    <p class="text-label-sm text-error flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">error</span> {errorMsg}
    </p>
    <button class="mt-1 text-primary text-label-sm font-bold" onclick={load}>Retry</button>
  {:else if phase === 'ready'}
    {#if isImage}
      <img src={blobUrl} alt={attachment.name ?? 'attachment'} class="max-w-[280px] max-h-[280px] rounded border border-outline-variant" />
    {/if}
    <button class="mt-1 text-primary text-label-sm font-bold flex items-center gap-1 hover:underline" onclick={download}>
      <span class="material-symbols-outlined text-[16px]">download</span> Save
    </button>
  {/if}

  {#if canDelete}
    <div class="mt-2 pt-2 border-t border-outline-variant flex items-center gap-2">
      <button class="text-error text-label-sm font-bold flex items-center gap-1 hover:underline disabled:opacity-50" onclick={doDelete} disabled={deleting}>
        <span class="material-symbols-outlined text-[16px]">delete</span>
        {deleting ? 'Deleting…' : 'Delete from server'}
      </button>
      <span class="text-[11px] text-outline">You uploaded this</span>
    </div>
  {/if}

  {#if deleteState !== 'idle'}
    <p class="mt-2 text-label-sm {deleteState === 'deleted' ? 'text-secondary' : 'text-error'} flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">{deleteState === 'deleted' ? 'check_circle' : 'warning'}</span>
      {deleteDetail}
    </p>
  {/if}
</div>
