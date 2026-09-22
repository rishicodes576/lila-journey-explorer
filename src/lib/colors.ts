import type { EventName, HeatmapMode } from './types'

export type RGBA = [number, number, number, number]

/**
 * Event colors encode 3 SEMANTIC FAMILIES; the specific event within a family is
 * carried by a distinct ICON SHAPE (primary identity channel) + the legend.
 *
 * The 3-family palette (green / red / blue) is validated for both CVD and normal
 * vision under the all-pairs test (dataviz validator: worst normal ΔE 29.0, CVD 8.6).
 *   Kill family  -> green  #008300   (a kill was scored here)
 *   Death family -> red    #e66767   (someone died here)
 *   Loot         -> blue   #3987e5   (an item was picked up)
 */
export const FAMILY: Record<'kill' | 'death' | 'loot', [number, number, number]> = {
  kill: [0, 131, 0],
  death: [230, 103, 103],
  loot: [57, 135, 229],
}

/** icon shape name in the generated atlas (see components/iconAtlas.ts) */
export type IconShape = 'star' | 'triUp' | 'triDown' | 'cross' | 'hex' | 'diamond'

interface EventStyle {
  label: string
  rgb: [number, number, number]
  icon: IconShape
  family: 'kill' | 'death' | 'loot'
}

export const EVENT_STYLE: Record<Exclude<EventName, 'Position' | 'BotPosition'>, EventStyle> = {
  BotKill: { label: 'Kill (bot)', rgb: FAMILY.kill, icon: 'triUp', family: 'kill' },
  Kill: { label: 'Kill (player)', rgb: FAMILY.kill, icon: 'star', family: 'kill' },
  BotKilled: { label: 'Death (by bot)', rgb: FAMILY.death, icon: 'triDown', family: 'death' },
  Killed: { label: 'Death (by player)', rgb: FAMILY.death, icon: 'cross', family: 'death' },
  KilledByStorm: { label: 'Storm death', rgb: FAMILY.death, icon: 'hex', family: 'death' },
  Loot: { label: 'Loot', rgb: FAMILY.loot, icon: 'diamond', family: 'loot' },
}

/** Movement track colors: human = salient cyan, bot = recessive gray (AI is ambient). */
export const HUMAN_RGB: [number, number, number] = [56, 189, 248] // #38bdf8
export const BOT_RGB: [number, number, number] = [139, 138, 128] // #8b8a80

export const HUMAN_HEX = '#38bdf8'
export const BOT_HEX = '#8b8a80'

/**
 * Heatmap color ramps — one single-hue ramp per mode (only one heatmap is ever shown
 * at a time, satisfying the "sequential = one hue" rule). Low alpha near zero so cold
 * areas recede into the dark map; hot areas glow.
 */
export const HEATMAP_RANGE: Record<Exclude<HeatmapMode, 'off'>, RGBA[]> = {
  // movement density — cool cyan/blue
  traffic: [
    [12, 74, 110, 0],
    [3, 105, 161, 120],
    [14, 165, 233, 170],
    [56, 189, 248, 210],
    [125, 211, 252, 235],
    [224, 242, 254, 255],
  ],
  // offensive hotspots — green
  kills: [
    [5, 46, 22, 0],
    [22, 101, 52, 120],
    [22, 163, 74, 170],
    [74, 222, 128, 210],
    [134, 239, 172, 235],
    [220, 252, 231, 255],
  ],
  // danger zones — red/amber
  deaths: [
    [69, 10, 10, 0],
    [153, 27, 27, 130],
    [220, 38, 38, 180],
    [248, 113, 113, 215],
    [252, 165, 165, 240],
    [254, 226, 226, 255],
  ],
}

export const rgbaCss = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
