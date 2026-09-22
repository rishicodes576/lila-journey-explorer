import type { MapMeta } from './types'

/**
 * World (x, z) -> logical map position, IDENTICAL math to scripts/preprocess.mjs.
 *
 * The README defines a UV mapping that is resolution-independent, so we render in a
 * fixed `logicalSize` square (1024) regardless of the actual minimap image resolution:
 *
 *   u = (x - originX) / scale          v = (z - originZ) / scale
 *
 * We keep the deck.gl OrthographicView in a Y-UP coordinate space (flipY: false):
 * the BitmapLayer covers [0,0]..[L,L] and a point sits at [u*L, v*L]. Because both the
 * image and the points use the same u,v, they align pixel-perfectly. (The README's
 * pixel_y = (1 - v) * 1024 is simply the Y-DOWN image-space equivalent of v*L.)
 */
export function worldToLogical(x: number, z: number, m: MapMeta): [number, number] {
  const L = m.logicalSize
  const u = (x - m.originX) / m.scale
  const v = (z - m.originZ) / m.scale
  return [u * L, v * L]
}

/** Inverse: logical map position -> world (x, z). Used for hover read-outs. */
export function logicalToWorld(px: number, py: number, m: MapMeta): [number, number] {
  const L = m.logicalSize
  return [(px / L) * m.scale + m.originX, (py / L) * m.scale + m.originZ]
}
