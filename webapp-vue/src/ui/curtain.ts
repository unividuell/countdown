import type { InjectionKey, Ref } from 'vue'
import { inject, provide, ref } from 'vue'

/** True when nothing stands in front of the card. A scene that performs on
 *  load (the ramp's entrance) waits for it. Not `soundOnStage`: that marks a
 *  sounding board on screen, this marks an overlay in front of it. */
export const CURTAIN_KEY: InjectionKey<Readonly<Ref<boolean>>> = Symbol('curtain')

export function provideCurtain(open: Readonly<Ref<boolean>>): void {
  provide(CURTAIN_KEY, open)
}

/** Open where no ramp provides one, so the card never waits on nothing. */
export function useCurtainOpen(): Readonly<Ref<boolean>> {
  return inject(CURTAIN_KEY, ref(true))
}
