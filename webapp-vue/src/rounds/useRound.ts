import { computed, onMounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ApiError } from '@/api/client'
import { getCurrentRound, giveUpRound, revealRound, skipStage, submitGuess } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'

/** Which of the card's faces the current answer calls for. */
export type RoundStage = 'no-game' | 'sealed' | 'playing' | 'done'

export function useRound(slug: string): {
  round: Ref<RoundResponse | null>
  state: Ref<'loading' | 'ready' | 'failed'>
  stage: ComputedRef<RoundStage>
  busy: Ref<boolean>
  notice: Ref<string | null>
  reveal: () => Promise<void>
  submit: (guess: unknown) => Promise<void>
  skip: (fromStage: number) => Promise<void>
  giveUp: () => Promise<void>
  reload: () => Promise<void>
} {
  const round = ref<RoundResponse | null>(null)
  const state = ref<'loading' | 'ready' | 'failed'>('loading')
  const busy = ref(false)
  const notice = ref<string | null>(null)

  /**
   * Derived, never stored: a local „I have guessed“ can disagree with the server, the answer cannot.
   * `sealed` is the only face that exists because a *game* asked for it.
   */
  const stage = computed<RoundStage>(() => {
    const current = round.value
    if (current === null || current.game === null) return 'no-game'
    // `sealed` needs both halves: a viewer with no row *and* a game that actually asked for a
    // deliberate reveal. Without the second half, a viewer who may look but not play (a
    // super-admin bypass with no membership row, or a member removed mid-session) would be
    // handed a button that can only ever 404 — there is no game-mandated reveal for them to
    // click through, so the honest answer is that this round is not theirs to open.
    if (current.me === null) return current.game.requiresReveal ? 'sealed' : 'no-game'
    return current.me.guessedAt === null ? 'playing' : 'done'
  })

  /**
   * A game that needs no deliberate reveal is revealed as soon as its card exists — that is what keeps
   * `revealed_at` meaning „the payload went out“ rather than „some page was fetched“, and it is why the
   * `GET` stays read-only. This belongs to *landing on a round*, not to *mounting the composable*: a
   * 409 refetch can land a different round (the day boundary passed under an open tab, which is
   * exactly the case the round-number envelope on a guess exists for) with `me: null` again, and that
   * round deserves the same one-shot implicit reveal the first one got — otherwise a
   * `requiresReveal: false` game strands the player behind `no-game`'s fallback until they reload the
   * page by hand, worse than the `sealed` button they used to land on by accident.
   */
  async function reload(): Promise<void> {
    round.value = await getCurrentRound(slug)
    const game = round.value.game
    if (game !== null && round.value.me == null && !game.requiresReveal) {
      round.value = await revealRound(slug)
    }
  }

  async function load(): Promise<void> {
    state.value = 'loading'
    try {
      await reload()
      state.value = 'ready'
    } catch (err) {
      console.error('[round] failed to load', err)
      state.value = 'failed'
    }
  }

  async function reveal(): Promise<void> {
    await run(async () => {
      round.value = await revealRound(slug)
    })
  }

  async function submit(guess: unknown): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await submitGuess(slug, number, guess)
    })
  }

  async function skip(fromStage: number): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await skipStage(slug, number, fromStage)
    })
  }

  async function giveUp(): Promise<void> {
    const number = round.value?.round?.number
    if (number === undefined) return
    await run(async () => {
      round.value = await giveUpRound(slug, number)
    })
  }

  /**
   * A 409 is not an error to show: the round moved on, or it was already revealed or already guessed.
   * In every one of those cases the server knows better, so refetch and render the truth with one line
   * of explanation instead of a failure the player cannot act on.
   */
  async function run(action: () => Promise<void>): Promise<void> {
    busy.value = true
    notice.value = null
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notice.value = 'Die Runde hat sich geändert — hier ist der aktuelle Stand.'
        await reload().catch((e) => console.error('[round] reload after 409 failed', e))
      } else {
        console.error('[round] action failed', err)
        notice.value = 'Das hat nicht funktioniert. Versuch es nochmal.'
      }
    } finally {
      busy.value = false
    }
  }

  onMounted(load)
  return { round, state, stage, busy, notice, reveal, submit, skip, giveUp, reload }
}
