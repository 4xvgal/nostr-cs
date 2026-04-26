<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { identity } from '$lib/stores/identity.js'

  const isAgent = $derived($identity?.role === 'agent')
  const home = $derived(isAgent ? '/agent/inbox' : '/customer/tickets')

  function active(prefix: string): boolean {
    return $page.url.pathname.startsWith(prefix)
  }
</script>

<nav
  class="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 md:hidden bg-white/90 backdrop-blur-md border-t border-outline-variant"
>
  <button class="flex flex-col items-center gap-1 px-4 py-1" onclick={() => goto(home)}>
    <span
      class="material-symbols-outlined {active('/agent') || active('/customer')
        ? 'text-primary filled'
        : 'text-outline'}">support_agent</span
    >
    <span
      class="text-[10px] uppercase tracking-widest font-medium {active('/agent') || active('/customer')
        ? 'text-primary'
        : 'text-outline'}"
    >
      Tickets
    </span>
  </button>

  <button class="flex flex-col items-center gap-1 px-4 py-1" onclick={() => goto('/settings')}>
    <span class="material-symbols-outlined {active('/settings') ? 'text-primary filled' : 'text-outline'}">
      settings
    </span>
    <span
      class="text-[10px] uppercase tracking-widest font-medium {active('/settings')
        ? 'text-primary'
        : 'text-outline'}"
    >
      Settings
    </span>
  </button>
</nav>
