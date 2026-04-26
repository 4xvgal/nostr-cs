<script lang="ts">
  import { encryptBlob } from '$lib/crypto/aesgcm.js'
  import { uploadBlob, deleteBlob } from '$lib/blossom/client.js'
  import { record as keyringRecord, forget as keyringForget, get as keyringGet } from '$lib/blossom/keyring.js'
  import type { EncryptedAttachment } from 'nostr-cs'

  let {
    attachments = $bindable([]),
  }: { attachments?: EncryptedAttachment[] } = $props()

  let busy = $state(false)
  let errorMsg = $state('')

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return
    errorMsg = ''
    busy = true
    try {
      for (const file of Array.from(files)) {
        const buf = new Uint8Array(await file.arrayBuffer())
        const enc = await encryptBlob(buf)
        const desc = await uploadBlob({
          ciphertext: enc.ciphertext,
          ciphertextSha256: enc.ciphertextSha256,
          contentType: 'application/octet-stream',
        })
        const att: EncryptedAttachment = {
          type: 'encrypted_blob',
          mime: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
          sha256: enc.plaintextSha256,
          cipher: 'aes-256-gcm',
          key: enc.keyB64,
          iv: enc.ivB64,
          blossom: {
            blob_sha256: enc.ciphertextSha256,
            servers: desc.servers,
          },
        }
        // Persist the ephemeral nsec into the Nostr-backed keyring so we can
        // DELETE this blob later (BUD-01 requires the original uploader's key).
        keyringRecord(enc.ciphertextSha256, {
          nsec: desc.ephemeralNsec,
          uploadedAt: Math.floor(Date.now() / 1000),
          size: file.size,
          mime: att.mime,
          name: file.name,
          servers: desc.servers,
        })
        attachments = [...attachments, att]
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function remove(i: number): Promise<void> {
    const att = attachments[i]
    if (!att) return
    // Optimistically remove from the composer list immediately
    attachments = attachments.filter((_, idx) => idx !== i)
    // ...and clean up the orphaned blob in the background. The user uploaded
    // it but never sent it, so there's no recipient who needs the link.
    const entry = keyringGet(att.blossom.blob_sha256)
    if (!entry) return
    try {
      await deleteBlob({
        blobSha256: att.blossom.blob_sha256,
        ephemeralNsec: entry.nsec,
        servers: att.blossom.servers,
      })
      keyringForget(att.blossom.blob_sha256)
    } catch (e) {
      // Don't surface — the composer list is already updated; keyring entry
      // remains so the user can retry from Settings. Log for diagnostics.
      console.warn('Background blob cleanup failed:', e)
    }
  }

  function fmtSize(n: number): string {
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1024 / 1024).toFixed(1) + ' MB'
  }
</script>

<div class="space-y-2">
  {#if attachments.length > 0}
    <ul class="flex flex-wrap gap-2">
      {#each attachments as att, i}
        <li class="flex items-center gap-2 px-2 py-1 bg-surface-container-low border border-outline-variant rounded text-label-sm">
          <span class="material-symbols-outlined text-[16px] text-primary filled">lock</span>
          <span class="font-mono truncate max-w-[180px]">{att.name ?? att.blossom.blob_sha256.slice(0, 8)}</span>
          <span class="text-outline">{fmtSize(att.size)}</span>
          <button class="material-symbols-outlined text-[16px] text-outline hover:text-error" type="button" onclick={() => remove(i)}>close</button>
        </li>
      {/each}
    </ul>
  {/if}
  <label class="inline-flex items-center gap-2 px-3 py-1.5 border border-outline-variant rounded-lg text-label-sm cursor-pointer hover:bg-surface-container-low {busy ? 'opacity-50 pointer-events-none' : ''}">
    <span class="material-symbols-outlined text-[18px]">{busy ? 'hourglass_empty' : 'attach_file'}</span>
    {busy ? 'Encrypting & uploading…' : 'Attach file'}
    <input type="file" multiple class="hidden" disabled={busy} onchange={(e) => handleFiles((e.currentTarget as HTMLInputElement).files)} />
  </label>
  {#if errorMsg}
    <p class="text-label-sm text-error flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">error</span> {errorMsg}
    </p>
  {/if}
</div>
