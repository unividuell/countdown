import type { Router } from 'vue-router'

/**
 * `router.currentRoute.value.params` is typed against the generated route map
 * (`typed-router.d.ts`), which is a union across every route in the app — including
 * routes like `/` whose params are `Record<never, never>`. These specs build a
 * router from a small, test-local route list that always has a `slug` param on the
 * routes they assert against, but vue-tsc only sees the app-wide union and rejects
 * `.params.slug` outright (see `.claude/guidelines/frontend.md` § Routing).
 *
 * This narrows that union down to the `slug` case at the one point specs need it,
 * with a runtime check standing in for the static guarantee the test route list
 * can't express in the type system.
 */
export function slugParam(router: Router): string {
  const { params } = router.currentRoute.value
  if (!('slug' in params) || typeof params.slug !== 'string') {
    throw new Error(
      `expected the current route to have a 'slug' param, got ${JSON.stringify(params)}`,
    )
  }
  return params.slug
}
