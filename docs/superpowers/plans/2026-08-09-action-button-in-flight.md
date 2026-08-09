# ActionButton-In-flight-Zustände Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle vorgesehenen asynchronen Community-Aktionen zeigen zuverlässig ihren eigenen In-flight-Zustand, ohne andere Zeilenaktionen zu sperren.

**Architecture:** `ActionButton` bleibt unverändert und wird an den vorhandenen Aufrufstellen eingesetzt. `useKeyedAction` erweitert `useAction.ts` um eine reaktive Menge paralleler Busy-Schlüssel für Tabellenzeilen; die übrigen Seiten verwenden voneinander getrennte `useAction`-Instanzen. Seiten behalten Ownership über API-Aufrufe, Aktualisierung lokaler Daten und ihre bestehenden Fehlertexte.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, Tailwind v4, Vitest, Vue Test Utils.

## Global Constraints

- Nur `webapp-vue` ändern; Backend-Endpunkte, Berechtigungen und API-Typen bleiben unverändert.
- Source und Tests sind Englisch; neue sichtbare deutsche Texte verwenden `„…“`.
- `ActionButton` und seine reservierten 14px-Slots, sein sichtbares Label sowie sein Bewegungsverhalten bleiben unverändert.
- Der Drawer-Logout bleibt unverändert: Er ist eine `LINK`-Navigationszeile und kein `ActionButton`.
- Ein zweiter Aufruf desselben Zeilenschlüssels wird verworfen; unterschiedliche Zeilenschlüssel laufen parallel.
- Bei jeder Aktion bleiben der bisherige Erfolgspfad und die bekannte Fehlersemantik erhalten, insbesondere der 409-Text beim letzten Admin und `landingFailed` beim Retry.
- Teste `disabled` als Attribut; ein Klick auf einen bereits deaktivierten Button beweist mit Vue Test Utils keinen Handler-Schutz.
- Der letzte Task entscheidet anhand der Aufnahmehürde aus `.claude/guidelines/feeding-knowledge-back.md` über eine Guideline-Änderung.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `webapp-vue/src/ui/useAction.ts` | Bestehende Einzelaktion und neue parallele keyed Aktion. |
| `webapp-vue/src/ui/__tests__/useAction.spec.ts` | Busy-, Fehler- und Parallelitätsvertrag beider Composables. |
| `webapp-vue/src/pages/c/[slug]/requests.vue` | Keyed Annahme und Ablehnung von Beitrittsanfragen. |
| `webapp-vue/src/pages/c/[slug]/members.vue` | Keyed Befördern, Degradieren und Entfernen von Mitgliedern. |
| `webapp-vue/src/pages/c/[slug]/__tests__/requests.spec.ts` | In-flight- und Refresh-Vertrag für Anfragen. |
| `webapp-vue/src/pages/c/[slug]/__tests__/members.spec.ts` | In-flight- und Refresh-Vertrag für Mitglieder. |
| `webapp-vue/src/pages/c/[slug]/settings.vue` | Unabhängige Einzelaktionen für Speichern und Einladungslink. |
| `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts` | Busy-Zustände der Einstellungsaktionen. |
| `webapp-vue/src/pages/index.vue` | Retry mit `ActionButton`, ohne `landingFailed` umzudeuten. |
| `webapp-vue/src/pages/__tests__/index.spec.ts` | Sichtbarer In-flight-Retry und unveränderte Retry-Resultate. |

### Task 1: Keyed In-flight-Composable

**Files:**
- Modify: `webapp-vue/src/ui/useAction.ts`
- Modify: `webapp-vue/src/ui/__tests__/useAction.spec.ts`

**Interfaces:**
- Consumes: `Ref`, `Readonly`, `ref` und `readonly` aus Vue sowie den bestehenden `DEFAULT_MESSAGE`-Fehlervertrag.
- Produces: `useKeyedAction(toMessage?)` mit `isBusy(key: string): boolean`, `error: Readonly<Ref<string | null>>` und `run(key: string, fn: () => Promise<void>): Promise<void>` für Tasks 2 und 3.

- [ ] **Step 1: Add failing keyed-composable tests**

  Reuse the existing `deferred()` helper and append these two cases to `useAction.spec.ts`:

  ```ts
  it('runs different keys in parallel while exposing only their own busy states', async () => {
    const { isBusy, run } = useKeyedAction()
    const first = deferred()
    const second = deferred()

    const firstCall = run('approve:u1', () => first.promise)
    const secondCall = run('approve:u2', () => second.promise)

    expect(isBusy('approve:u1')).toBe(true)
    expect(isBusy('approve:u2')).toBe(true)
    expect(isBusy('reject:u1')).toBe(false)

    first.resolve()
    await firstCall
    expect(isBusy('approve:u1')).toBe(false)
    expect(isBusy('approve:u2')).toBe(true)

    second.resolve()
    await secondCall
    expect(isBusy('approve:u2')).toBe(false)
  })

  it('drops only a duplicate key and clears it after its rejection', async () => {
    const { isBusy, error, run } = useKeyedAction()
    const request = deferred()
    const duplicate = vi.fn(() => Promise.resolve())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const pending = run('remove:u1', () => request.promise)
    await run('remove:u1', duplicate)
    expect(duplicate).not.toHaveBeenCalled()

    request.reject(new Error('boom'))
    await pending
    expect(isBusy('remove:u1')).toBe(false)
    expect(error.value).toBe('Aktion fehlgeschlagen.')
  })
  ```

- [ ] **Step 2: Run the focused test to verify the missing export fails**

  Run: `pnpm --dir webapp-vue exec vitest run useAction.spec`

  Expected: FAIL with an import/export error because `useKeyedAction` does not exist yet.

- [ ] **Step 3: Implement `useKeyedAction` beside `useAction`**

  Add this exported function to `useAction.ts`. Mutate the reactive `Set` directly so Vue tracks its collection changes; do not expose the set for callers to mutate.

  ```ts
  export function useKeyedAction(
    toMessage: (e: unknown) => string = () => DEFAULT_MESSAGE,
  ): {
    isBusy: (key: string) => boolean
    error: Readonly<Ref<string | null>>
    run: (key: string, fn: () => Promise<void>) => Promise<void>
  } {
    const busyKeys = ref(new Set<string>())
    const error = ref<string | null>(null)

    function isBusy(key: string): boolean {
      return busyKeys.value.has(key)
    }

    async function run(key: string, fn: () => Promise<void>): Promise<void> {
      if (busyKeys.value.has(key)) return
      busyKeys.value.add(key)
      error.value = null
      try {
        await fn()
      } catch (e) {
        console.error('action failed', e)
        error.value = toMessage(e)
      } finally {
        busyKeys.value.delete(key)
      }
    }

    return { isBusy, error: readonly(error), run }
  }
  ```

- [ ] **Step 4: Run the focused composable test**

  Run: `pnpm --dir webapp-vue exec vitest run useAction.spec`

  Expected: PASS, including the existing single-action behavior.

- [ ] **Step 5: Commit the composable contract**

  ```bash
  git add webapp-vue/src/ui/useAction.ts webapp-vue/src/ui/__tests__/useAction.spec.ts
  git commit -m "feat(ui): support keyed action busy states"
  ```

### Task 2: Keyed request actions

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/requests.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/__tests__/requests.spec.ts`

**Interfaces:**
- Consumes: `useKeyedAction` from Task 1 and existing `approveMember`, `removeMember`, `listMembers`, and community-context `refresh()`.
- Produces: `approve(userId: string): Promise<void>` and `reject(userId: string): Promise<void>` plus stable test attributes `approve-<userId>` and `reject-<userId>`.

- [ ] **Step 1: Add a failing per-row in-flight test**

  Put a `deferred()` helper in this spec. Mock two pending users and make the approval calls wait by user ID. Assert that triggering both distinct rows calls both APIs, while only their matching controls show busy:

  ```ts
  it('keeps separate request actions independently busy', async () => {
    const first = deferred()
    const second = deferred()
    vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'PENDING', isAdmin: false },
    ])
    const approve = vi.spyOn(api, 'approveMember').mockImplementation((_slug, userId) =>
      userId === 'u1' ? first.promise : second.promise,
    )
    const Requests = (await import('@/pages/c/[slug]/requests.vue')).default
    const w = mount(Requests)
    await flushPromises()

    await w.get('[data-test=approve-u1]').trigger('click')
    await w.get('[data-test=approve-u2]').trigger('click')

    expect(approve).toHaveBeenCalledTimes(2)
    expect(w.get('[data-test=approve-u1]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=approve-u2]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=reject-u1]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=approve-u1]').find('[data-test=spinner]').exists()).toBe(true)
    expect(w.get('[data-test=reject-u1]').find('[data-test=spinner]').exists()).toBe(false)

    first.resolve()
    second.resolve()
  })
  ```

- [ ] **Step 2: Run the request spec to verify it fails**

  Run: `pnpm --dir webapp-vue exec vitest run requests.spec`

  Expected: FAIL because the page still renders native buttons and lacks the keyed attributes.

- [ ] **Step 3: Replace local run logic with keyed actions**

  Import `ActionButton` and `useKeyedAction`; remove the local `error` ref and local `run`. Keep `load()` unchanged. Add the two page handlers:

  ```ts
  const { isBusy, error, run } = useKeyedAction()

  function approve(userId: string): Promise<void> {
    return run(`approve:${userId}`, async () => {
      await approveMember(slug, userId)
      await load()
      await refresh()
    })
  }

  function reject(userId: string): Promise<void> {
    return run(`reject:${userId}`, async () => {
      await removeMember(slug, userId)
      await load()
      await refresh()
    })
  }
  ```

  Replace each native button with `ActionButton`, retaining its action-specific text class and binding its own key:

  ```vue
  <ActionButton
    :data-test="`approve-${m.userId}`"
    :busy="isBusy(`approve:${m.userId}`)"
    @click="approve(m.userId)"
  >
    Bestätigen
  </ActionButton>
  ```

  Use the equivalent `reject` key and `Ablehnen` label for the destructive control.

- [ ] **Step 4: Run the request spec**

  Run: `pnpm --dir webapp-vue exec vitest run requests.spec`

  Expected: PASS; the existing refresh test still verifies that a successful action reloads the list and shell badge.

- [ ] **Step 5: Commit the requests page**

  ```bash
  git add webapp-vue/src/pages/c/'[slug]'/requests.vue webapp-vue/src/pages/c/'[slug]'/__tests__/requests.spec.ts
  git commit -m "feat(communities): show request actions in flight"
  ```

### Task 3: Keyed member actions

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/members.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/__tests__/members.spec.ts`

**Interfaces:**
- Consumes: `useKeyedAction` from Task 1 and `promoteMember`, `demoteMember`, `removeMember`, and `listMembers`.
- Produces: `promote(userId: string): Promise<void>`, `demote(userId: string): Promise<void>`, `remove(userId: string): Promise<void>` and the attributes `promote-<userId>`, `demote-<userId>`, `remove-<userId>`.

- [ ] **Step 1: Add a failing member-row in-flight test**

  Extend the member fixture to contain two active non-admin users. Return separate deferred promises from `promoteMember`, click both promotion controls, and assert the parallel contract:

  ```ts
  expect(w.get('[data-test=promote-u1]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test=promote-u2]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test=remove-u1]').attributes('disabled')).toBeUndefined()
  expect(w.get('[data-test=promote-u1]').find('[data-test=spinner]').exists()).toBe(true)
  expect(w.get('[data-test=remove-u1]').find('[data-test=spinner]').exists()).toBe(false)
  ```

  Resolve both requests, await `flushPromises()`, and retain the existing assertion that removing a member calls `removeMember('team', 'u1')`.

- [ ] **Step 2: Run the member spec to verify it fails**

  Run: `pnpm --dir webapp-vue exec vitest run members.spec`

  Expected: FAIL because no member control currently has an independent busy state.

- [ ] **Step 3: Implement three keyed member handlers**

  Use the status-aware error mapper unchanged and move all list refreshes inside the keyed action:

  ```ts
  const { isBusy, error, run } = useKeyedAction((e) =>
    (e as { status?: number }).status === 409
      ? 'Die Community braucht mindestens einen Admin.'
      : 'Aktion fehlgeschlagen.',
  )

  function promote(userId: string): Promise<void> {
    return run(`promote:${userId}`, async () => {
      await promoteMember(slug, userId)
      await load()
    })
  }
  ```

  Add analogous `demote` and `remove` handlers with `demoteMember` and `removeMember`. Render `ActionButton` for each conditional promote/demote control and for removal. Bind each `busy` prop to the exact key, keep `text-red-600` on removal, and add the dynamic test attributes described above.

- [ ] **Step 4: Run the member spec**

  Run: `pnpm --dir webapp-vue exec vitest run members.spec`

  Expected: PASS, including the existing ACTIVE-only filtering and the exact 409 message behavior.

- [ ] **Step 5: Commit the members page**

  ```bash
  git add webapp-vue/src/pages/c/'[slug]'/members.vue webapp-vue/src/pages/c/'[slug]'/__tests__/members.spec.ts
  git commit -m "feat(communities): show member actions in flight"
  ```

### Task 4: Independent settings actions

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`

**Interfaces:**
- Consumes: existing `useAction`, `ActionButton`, and the existing community and invite API functions.
- Produces: independent `saveBusy`, `inviteBusy`, and `revokeBusy` bindings; `data-test="save-settings"`, `data-test="generate-invite"`, `data-test="regenerate-invite"`, and `data-test="revoke-invite"` controls.

- [ ] **Step 1: Add failing settings busy-state tests**

  Add a deferred helper. First, defer `updateCommunity`, submit the form, and assert that only `[data-test=save-settings]` is disabled and contains `[data-test=spinner]`.

  Then mock an existing invite, defer `generateInvite` and `revokeInvite`, and start both visible invitation actions. Verify both can be busy independently:

  ```ts
  await w.get('[data-test=regenerate-invite]').trigger('click')
  await w.get('[data-test=revoke-invite]').trigger('click')

  expect(w.get('[data-test=regenerate-invite]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test=revoke-invite]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test=regenerate-invite]').find('[data-test=spinner]').exists()).toBe(true)
  expect(w.get('[data-test=revoke-invite]').find('[data-test=spinner]').exists()).toBe(true)
  ```

  Resolve the deferred requests before the test ends. Continue to use the existing tests for wall-time conversion and rendering the invite URL.

- [ ] **Step 2: Run the settings spec to verify it fails**

  Run: `pnpm --dir webapp-vue exec vitest run settings.spec`

  Expected: FAIL because native buttons expose no busy state or spinner.

- [ ] **Step 3: Use three `useAction` instances and render ActionButtons**

  Replace `const error = ref<string | null>(null)` with the following actions, then wrap each existing async body in its matching `run` callback. Preserve the request construction and calls exactly.

  ```ts
  const { busy: saveBusy, error: saveError, run: runSave } = useAction(
    () => 'Speichern fehlgeschlagen.',
  )
  const { busy: inviteBusy, error: inviteError, run: runInvite } = useAction(
    () => 'Einladungslink konnte nicht erzeugt werden.',
  )
  const { busy: revokeBusy, error: revokeError, run: runRevoke } = useAction(
    () => 'Einladungslink konnte nicht widerrufen werden.',
  )
  ```

  Bind `saveBusy` to the submit `ActionButton`. Both conditional generate call sites call the same `regenerate()` function and therefore share `inviteBusy`; they are never mounted simultaneously. Bind `revokeBusy` to the revoke `ActionButton`. Keep the copy control a native button. Render `saveError` below the form and `inviteError` and `revokeError` below the invitation controls so each failed asynchronous action is visible without hiding a concurrent failure.

- [ ] **Step 4: Run the settings spec**

  Run: `pnpm --dir webapp-vue exec vitest run settings.spec`

  Expected: PASS; saving preserves its exact request body, and both invitation operations have independent visual progress.

- [ ] **Step 5: Commit the settings page**

  ```bash
  git add webapp-vue/src/pages/c/'[slug]'/settings.vue webapp-vue/src/pages/c/'[slug]'/__tests__/settings.spec.ts
  git commit -m "feat(communities): show settings actions in flight"
  ```

### Task 5: Retry feedback and project verification

**Files:**
- Modify: `webapp-vue/src/pages/index.vue`
- Modify: `webapp-vue/src/pages/__tests__/index.spec.ts`
- Inspect: `.claude/guidelines/feeding-knowledge-back.md`
- Modify only if all admission questions pass: a relevant file in `.claude/guidelines/`

**Interfaces:**
- Consumes: existing `resolveLandingTarget`, `landingFailed`, `ActionButton`, and `useAction`.
- Produces: an `ActionButton` with the existing `landing-retry` test attribute and `busy` while `resolveLandingTarget()` is unsettled.

- [ ] **Step 1: Add a failing retry busy-state test**

  Set `landingFailed.value = true`, defer `listCommunities`, then click the enabled retry control. Before resolving the request, assert the affordance is in flight:

  ```ts
  expect(w.get('[data-test=landing-retry]').attributes('disabled')).toBeDefined()
  expect(w.get('[data-test=landing-retry]').find('[data-test=spinner]').exists()).toBe(true)
  expect(landingFailed.value).toBe(true)
  ```

  Resolve the list with `{ id: 'c1', name: 'Team', slug: 'team' }`, return `{ communityId: null }` from `getSelection`, await `flushPromises()`, and retain the existing success assertion that the router replaces `/c/team/` and clears `landingFailed` only then.

- [ ] **Step 2: Run the index spec to verify it fails**

  Run: `pnpm --dir webapp-vue exec vitest run index.spec`

  Expected: FAIL because the retry is still a native button with no spinner or busy attribute.

- [ ] **Step 3: Wrap the existing retry flow without changing its result policy**

  Import `ActionButton` and `useAction`, add `const { busy, run } = useAction()`, and place the current retry body inside `run`:

  ```ts
  async function retry(): Promise<void> {
    await run(async () => {
      const target = await resolveLandingTarget()
      if (!target) {
        landingFailed.value = true
        return
      }
      const failure = await router.replace(target).catch((e: unknown) => {
        console.error('navigation failed', e)
        return e
      })
      if (!failure) landingFailed.value = false
    })
  }
  ```

  Replace only the native `<button>` with:

  ```vue
  <ActionButton data-test="landing-retry" :busy="busy" @click="retry">
    Erneut versuchen
  </ActionButton>
  ```

  Do not render `useAction`'s generic error: `resolveLandingTarget()` and the existing `landingFailed` view remain the retry's visible failure contract.

- [ ] **Step 4: Run focused checks**

  Run:

  ```bash
  pnpm --dir webapp-vue exec vitest run index.spec
  pnpm --dir webapp-vue typecheck
  pnpm --dir webapp-vue lint
  ```

  Expected: all commands exit 0; the existing retry tests still distinguish failed, cancelled, and successful navigation.

- [ ] **Step 5: Feed knowledge back and commit**

  Re-read `.claude/guidelines/feeding-knowledge-back.md`. The expected decision is no guideline change: the need for independently keyed button state is feature-local and covered by the composable tests, while the disabled-button testing constraint is already documented in `frontend-testing.md`. If the admission bar disproves this, add only one reusable imperative rule to the most specific guideline.

  Commit the retry page and any justified guideline edit:

  ```bash
  git add webapp-vue/src/pages/index.vue webapp-vue/src/pages/__tests__/index.spec.ts .claude/guidelines
  git commit -m "feat(landing): show retry progress"
  ```

- [ ] **Step 6: Run final verification**

  Run:

  ```bash
  pnpm --dir webapp-vue exec vitest run
  pnpm --dir webapp-vue typecheck
  pnpm --dir webapp-vue lint
  git diff --check
  git status --short --branch
  ```

  Expected: all checks exit 0, no whitespace errors, and the branch has only the intended commits and files.
