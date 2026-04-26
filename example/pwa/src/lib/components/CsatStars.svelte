<script lang="ts">
  let {
    rating = 0,
    onPick,
  }: { rating?: number; onPick?: (n: 1 | 2 | 3 | 4 | 5) => void } = $props()
</script>

<div class="flex items-center gap-1">
  {#each [1, 2, 3, 4, 5] as n}
    <button
      type="button"
      class="text-2xl transition-colors {n <= rating ? 'text-primary' : 'text-outline-variant'} {onPick ? 'cursor-pointer hover:text-primary' : ''}"
      onclick={() => onPick?.(n as 1 | 2 | 3 | 4 | 5)}
      disabled={!onPick}
    >
      <span class="material-symbols-outlined {n <= rating ? 'filled' : ''}">star</span>
    </button>
  {/each}
</div>
