import { vi } from 'vitest'

// happy-dom computes no padding (`''`), and vueuse ≥ 15 subtracts it from offsetWidth: NaN.
// Answer what happy-dom lays out, 0 × 0. A spec's own mock of '@vueuse/core' still wins.
vi.mock('@vueuse/core', async (importOriginal) => {
  const { ref } = await import('vue')
  return {
    ...(await importOriginal<typeof import('@vueuse/core')>()),
    useElementSize: () => ({ width: ref(0), height: ref(0), stop: () => {} }),
  }
})
