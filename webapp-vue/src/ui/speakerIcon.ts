import IconLoud from '~icons/lucide/volume-2'
import IconSoft from '~icons/lucide/volume-1'
import IconMuted from '~icons/lucide/volume-x'
import { DEFAULT_VOLUME } from './useGameVolume'

/** The speaker for a volume: × at zero, one wave below the default, two from it on. */
export function speakerIcon(volume: number): typeof IconLoud {
  if (volume === 0) return IconMuted

  return volume < DEFAULT_VOLUME ? IconSoft : IconLoud
}
