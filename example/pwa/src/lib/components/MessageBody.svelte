<script lang="ts">
  import { decodeEnvelope } from 'nostr-cs'
  import AttachmentView from './AttachmentView.svelte'

  let { body }: { body: string } = $props()

  const envelope = $derived(decodeEnvelope(body))
</script>

{#if envelope.text}
  <p class="text-body-md whitespace-pre-wrap">{envelope.text}</p>
{/if}
{#if envelope.attachments.length > 0}
  <div class="mt-1 flex flex-wrap gap-2">
    {#each envelope.attachments as att}
      <AttachmentView attachment={att} />
    {/each}
  </div>
{/if}
