<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { connection } from '$lib/stores/connection.js'

  function active(prefix: string): boolean {
    return $page.url.pathname.startsWith(prefix)
  }

  const items: { label: string; icon: string; href: string }[] = [
    { label: 'Active Tickets', icon: 'confirmation_number', href: '/agent/inbox' },
    { label: 'Ideas', icon: 'bolt', href: '/agent/ideas' },
    { label: 'Settings', icon: 'settings', href: '/settings' },
  ]
</script>

<nav
  class="hidden md:flex flex-col fixed left-0 top-14 h-[calc(100dvh-3.5rem)] py-4 bg-surface-container-low w-64 border-r border-outline-variant z-30"
>
  <div class="px-6 mb-8 pt-2">
    <div class="flex items-center gap-3">
      <div class="h-10 w-10 rounded-lg bg-primary-container flex items-center justify-center">
        <span class="material-symbols-outlined text-on-primary-container">hub</span>
      </div>
      <div>
        <h3 class="text-lg font-black text-primary leading-tight">Support Node</h3>
        <p
          class="text-[10px] uppercase tracking-wider font-medium {$connection.state === 'connected'
            ? 'text-secondary'
            : 'text-outline'}"
        >
          Relay: {$connection.state}
        </p>
      </div>
    </div>
  </div>

  <div class="flex-1 space-y-1 px-3">
    {#each items as it}
      <button
        type="button"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-label-sm font-medium {active(
          it.href,
        )
          ? 'bg-secondary-container text-primary border-r-4 border-primary'
          : 'text-on-surface-variant hover:bg-surface-container'}"
        onclick={() => goto(it.href)}
      >
        <span class="material-symbols-outlined text-[20px]">{it.icon}</span>
        <span>{it.label}</span>
      </button>
    {/each}
  </div>

  <div class="px-4 mt-auto">
    <button
      class="w-full bg-primary-container text-on-primary-container py-3 rounded-lg flex items-center justify-center gap-2 font-label-sm font-medium hover:opacity-90 transition-all"
      onclick={() => goto('/customer/new')}
    >
      <span class="material-symbols-outlined text-[18px]">add</span>
      New Ticket
    </button>
  </div>
</nav>
