/** One step round the colour wheel per bar, foundation first. */
export const HUE_STEP = 12

export function barHue(hueStart: number, index: number): number {
  return (hueStart + HUE_STEP * index) % 360
}

export function barFill(hue: number, dark: boolean): string {
  return `oklch(${dark ? 62 : 70}% 0.13 ${hue})`
}
