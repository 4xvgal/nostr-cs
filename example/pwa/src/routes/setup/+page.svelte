<script lang="ts">
  import { goto } from '$app/navigation'
  import { generateSecretKey } from 'nostr-tools/pure'
  import { nip19 } from 'nostr-tools'
  import { settings, type StoredKey } from '$lib/stores/settings.js'
  import { connect } from '$lib/stores/client.js'

  let step = $state(1)
  let keyMode = $state<'choose' | 'nsec' | 'generated'>('choose')
  let nsecInput = $state('')
  let generatedNsec = $state('')
  let showSecret = $state(false)
  let role = $state<'customer' | 'agent'>('customer')
  let profileName = $state('')
  let relayInput = $state(($settings.relays.bootstrap ?? []).join('\n'))
  let connecting = $state(false)
  let errorMsg = $state('')

  function chooseNip07(): void {
    if (!window.nostr) {
      errorMsg = 'No NIP-07 extension found. Try Alby or nos2x.'
      return
    }
    const key: StoredKey = { type: 'nip07' }
    settings.update((s) => ({ ...s, key }))
    step = 2
  }

  function chooseNsec(): void {
    keyMode = 'nsec'
    errorMsg = ''
  }

  function applyNsec(): void {
    try {
      const decoded = nip19.decode(nsecInput.trim())
      if (decoded.type !== 'nsec') throw new Error('Not an nsec')
      const key: StoredKey = { type: 'nsec', value: nsecInput.trim() }
      settings.update((s) => ({ ...s, key }))
      step = 2
    } catch (e) {
      errorMsg = 'Invalid nsec — must start with nsec1...'
    }
  }

  function chooseGenerate(): void {
    const sk = generateSecretKey()
    const nsec = nip19.nsecEncode(sk)
    generatedNsec = nsec
    keyMode = 'generated'
  }

  function confirmGenerated(): void {
    const key: StoredKey = { type: 'nsec', value: generatedNsec }
    settings.update((s) => ({ ...s, key }))
    step = 2
  }

  function pickRole(r: 'customer' | 'agent'): void {
    role = r
    settings.update((s) => ({ ...s, role: r, profileName }))
    step = 3
  }

  async function finish(): Promise<void> {
    errorMsg = ''
    const relays = relayInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('wss://') || s.startsWith('ws://'))
    if (relays.length === 0) {
      errorMsg = 'At least one relay (wss://...) is required'
      return
    }
    settings.update((s) => ({
      ...s,
      profileName,
      role,
      relays: { ...s.relays, bootstrap: relays },
    }))
    connecting = true
    try {
      // Need fresh value after the update above:
      let snapshot = $settings
      const unsub = settings.subscribe((v) => {
        snapshot = v
      })
      unsub()
      await connect(snapshot)
      goto(role === 'agent' ? '/agent/inbox' : '/customer/tickets')
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      connecting = false
    }
  }

  function copy(text: string): void {
    void navigator.clipboard?.writeText(text)
  }
</script>

<header class="pinned-header bg-white border-b border-outline-variant flex items-center w-full px-4 md:px-6 h-14">
  <div class="flex items-center gap-3">
    {#if step > 1}
      <button class="material-symbols-outlined text-primary" onclick={() => (step = step - 1)}>arrow_back</button>
    {/if}
    <span class="text-xl font-bold tracking-tight text-primary">CSClient</span>
  </div>
</header>

<main class="has-pinned-header flex-grow p-lg max-w-md mx-auto w-full pb-32">
  <div class="flex items-center gap-2 my-md">
    <div class="h-1 flex-grow rounded-full {step >= 1 ? 'bg-primary' : 'bg-surface-container-highest'}"></div>
    <div class="h-1 flex-grow rounded-full {step >= 2 ? 'bg-primary' : 'bg-surface-container-highest'}"></div>
    <div class="h-1 flex-grow rounded-full {step >= 3 ? 'bg-primary' : 'bg-surface-container-highest'}"></div>
  </div>

  {#if step === 1}
    <section class="mb-md">
      <h1 class="text-h1 text-on-surface mb-xs">Identity Setup</h1>
      <p class="text-body-md text-on-surface-variant">
        Connect a Nostr identity. Keys never leave your device.
      </p>
    </section>

    {#if keyMode === 'choose'}
      <div class="grid gap-gutter">
        <button
          class="flex items-center p-md bg-surface-container-lowest border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors text-left"
          onclick={chooseNip07}
        >
          <div class="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center mr-md">
            <span class="material-symbols-outlined text-on-secondary-container filled">extension</span>
          </div>
          <div class="flex-grow">
            <span class="block text-body-lg text-on-surface font-semibold">NIP-07 Extension</span>
            <span class="block text-label-sm text-on-surface-variant">Alby, nos2x, etc.</span>
          </div>
          <span class="material-symbols-outlined text-outline-variant">chevron_right</span>
        </button>

        <div class="relative py-md">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-outline-variant"></div></div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-on-surface-variant text-label-sm">Or manual entry</span>
          </div>
        </div>

        <button
          class="flex items-center p-md bg-surface-container-lowest border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors text-left"
          onclick={chooseNsec}
        >
          <div class="w-12 h-12 bg-surface-container-highest rounded-lg flex items-center justify-center mr-md">
            <span class="material-symbols-outlined text-on-surface-variant">key</span>
          </div>
          <div class="flex-grow">
            <span class="block text-body-lg text-on-surface font-semibold">Paste nsec</span>
            <span class="block text-label-sm text-on-surface-variant">Demo only — stored in localStorage</span>
          </div>
          <span class="material-symbols-outlined text-outline-variant">chevron_right</span>
        </button>

        <div class="mt-md pt-md border-t border-outline-variant">
          <button
            class="w-full flex items-center justify-center gap-2 p-md bg-primary-container text-on-primary-container rounded-lg text-body-lg font-semibold hover:opacity-90 transition-all"
            onclick={chooseGenerate}
          >
            <span class="material-symbols-outlined">add_circle</span>
            Generate New Key
          </button>
          <p class="text-center mt-md text-label-sm text-on-surface-variant">
            First time? We'll generate a fresh keypair.
          </p>
        </div>
      </div>
    {:else if keyMode === 'nsec'}
      <div class="space-y-md">
        <label class="text-label-sm text-on-surface-variant uppercase tracking-wider">Paste nsec</label>
        <div class="relative">
          <input
            class="w-full h-12 px-md bg-white border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none font-mono text-code"
            placeholder="nsec1..."
            type={showSecret ? 'text' : 'password'}
            bind:value={nsecInput}
          />
          <button
            class="absolute right-3 top-3 text-on-surface-variant"
            onclick={() => (showSecret = !showSecret)}
          >
            <span class="material-symbols-outlined">{showSecret ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        {#if errorMsg}
          <p class="text-label-sm text-error">{errorMsg}</p>
        {/if}
        <p class="text-label-sm text-on-surface-variant flex items-start gap-1">
          <span class="material-symbols-outlined text-[14px] text-error">info</span>
          Demo storage — not for production keys.
        </p>
        <button
          class="w-full p-md bg-primary text-on-primary rounded-lg font-semibold disabled:opacity-50"
          disabled={!nsecInput}
          onclick={applyNsec}
        >Continue</button>
        <button
          class="w-full p-md text-on-surface-variant rounded-lg"
          onclick={() => (keyMode = 'choose')}
        >Back</button>
      </div>
    {:else if keyMode === 'generated'}
      <div class="space-y-md">
        <div class="p-md bg-tertiary-fixed border border-outline-variant rounded-lg">
          <div class="flex items-center gap-2 text-on-tertiary-fixed-variant text-label-sm font-bold mb-2">
            <span class="material-symbols-outlined text-[18px] filled">key</span>
            New nsec — back this up
          </div>
          <code class="block break-all font-mono text-code text-on-tertiary-fixed">{generatedNsec}</code>
          <button
            class="mt-2 text-primary text-label-sm font-bold flex items-center gap-1"
            onclick={() => copy(generatedNsec)}
          >
            <span class="material-symbols-outlined text-[16px]">content_copy</span> Copy
          </button>
        </div>
        <p class="text-label-sm text-error flex items-start gap-1">
          <span class="material-symbols-outlined text-[14px]">warning</span>
          We can't recover this for you. Save it before continuing.
        </p>
        <button class="w-full p-md bg-primary text-on-primary rounded-lg font-semibold" onclick={confirmGenerated}>
          I've saved it — Continue
        </button>
        <button class="w-full p-md text-on-surface-variant rounded-lg" onclick={() => (keyMode = 'choose')}>
          Back
        </button>
      </div>
    {/if}

  {:else if step === 2}
    <section class="mb-md">
      <h1 class="text-h1 text-on-surface mb-xs">Choose your role</h1>
      <p class="text-body-md text-on-surface-variant">You can switch later in Settings.</p>
    </section>

    <div class="space-y-md">
      <label class="block">
        <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">Display name</span>
        <input
          class="mt-1 w-full h-12 px-md bg-white border border-outline-variant rounded-lg outline-none focus:ring-2 focus:ring-primary"
          placeholder="Your display name"
          bind:value={profileName}
        />
      </label>

      <button
        class="w-full flex items-center p-md bg-surface-container-lowest border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors text-left"
        onclick={() => pickRole('customer')}
      >
        <div class="w-12 h-12 bg-primary-container rounded-lg flex items-center justify-center mr-md">
          <span class="material-symbols-outlined text-on-primary-container">contact_support</span>
        </div>
        <div class="flex-grow">
          <span class="block text-body-lg font-semibold">Customer</span>
          <span class="block text-label-sm text-on-surface-variant">Open tickets, chat with agents</span>
        </div>
        <span class="material-symbols-outlined text-outline-variant">chevron_right</span>
      </button>

      <button
        class="w-full flex items-center p-md bg-surface-container-lowest border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors text-left"
        onclick={() => pickRole('agent')}
      >
        <div class="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center mr-md">
          <span class="material-symbols-outlined text-on-secondary-container">support_agent</span>
        </div>
        <div class="flex-grow">
          <span class="block text-body-lg font-semibold">Agent</span>
          <span class="block text-label-sm text-on-surface-variant">Receive tickets, reply &amp; resolve</span>
        </div>
        <span class="material-symbols-outlined text-outline-variant">chevron_right</span>
      </button>
    </div>

  {:else if step === 3}
    <section class="mb-md">
      <h1 class="text-h1 text-on-surface mb-xs">Bootstrap relays</h1>
      <p class="text-body-md text-on-surface-variant">
        Profile lookups (kind 0/10002/10050) start here. One per line.
      </p>
    </section>

    <textarea
      class="w-full h-44 px-md py-2 bg-white border border-outline-variant rounded-lg font-mono text-code outline-none focus:ring-2 focus:ring-primary"
      bind:value={relayInput}
    ></textarea>

    {#if errorMsg}
      <p class="text-label-sm text-error mt-2 flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]">error</span> {errorMsg}
      </p>
    {/if}

    <button
      class="mt-md w-full p-md bg-primary text-on-primary rounded-lg font-semibold disabled:opacity-50"
      disabled={connecting}
      onclick={finish}
    >
      {connecting ? 'Connecting…' : 'Connect'}
    </button>
  {/if}
</main>
