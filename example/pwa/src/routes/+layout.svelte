<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { identity } from '$lib/stores/identity.js'
  import { settings } from '$lib/stores/settings.js'
  import { connect } from '$lib/stores/client.js'
  import { connection } from '$lib/stores/connection.js'
  import AppHeader from '$lib/components/AppHeader.svelte'
  import BottomNav from '$lib/components/BottomNav.svelte'
  import SideNav from '$lib/components/SideNav.svelte'

  let { children } = $props()

  onMount(async () => {
    const s = $settings
    if (s.key && s.role && $connection.state === 'idle') {
      try {
        await connect(s)
      } catch (e) {
        console.error('Auto-connect failed:', e)
      }
    }
  })

  const onSetup = $derived($page.url.pathname.startsWith('/setup'))
  const isAgent: boolean = $derived($identity?.role === 'agent')
  const showShell: boolean = $derived(!onSetup && $identity !== null)
  const wideShell: boolean = $derived(showShell && isAgent)

  $effect(() => {
    if (!onSetup && !$identity && $settings.key === null) {
      void goto('/setup')
    }
  })
</script>

{#if onSetup}
  {@render children()}
{:else if showShell}
  <AppHeader search={isAgent} />
  {#if isAgent}
    <SideNav />
  {/if}
  <main class={wideShell ? 'has-pinned-header md:ml-64 pb-20 md:pb-6 min-h-[100dvh]' : 'has-pinned-header pb-20 min-h-[100dvh]'}>
    {@render children()}
  </main>
  <BottomNav />
{:else}
  <main class="min-h-screen flex items-center justify-center text-on-surface-variant">
    <div class="text-center">
      <span class="material-symbols-outlined text-4xl text-primary">sensors</span>
      <p class="mt-2">Loading…</p>
    </div>
  </main>
{/if}
