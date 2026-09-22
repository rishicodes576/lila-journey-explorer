import type { IconShape } from './colors'

const CELL = 128
const SHAPES: IconShape[] = ['star', 'triUp', 'triDown', 'cross', 'hex', 'diamond']

function drawShape(ctx: CanvasRenderingContext2D, shape: IconShape, cx: number, cy: number, r: number) {
  ctx.beginPath()
  switch (shape) {
    case 'triUp':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy + r * 0.8)
      ctx.lineTo(cx - r, cy + r * 0.8)
      ctx.closePath()
      break
    case 'triDown':
      ctx.moveTo(cx, cy + r)
      ctx.lineTo(cx + r, cy - r * 0.8)
      ctx.lineTo(cx - r, cy - r * 0.8)
      ctx.closePath()
      break
    case 'diamond':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      break
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        const px = cx + r * Math.cos(a)
        const py = cy + r * Math.sin(a)
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath()
      break
    case 'cross': {
      const w = r * 0.42
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.PI / 4)
      ctx.rect(-w / 2, -r, w, r * 2)
      ctx.rect(-r, -w / 2, r * 2, w)
      ctx.restore()
      break
    }
    case 'star': {
      const spikes = 5
      const outer = r
      const inner = r * 0.45
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner
        const a = (Math.PI / spikes) * i - Math.PI / 2
        const px = cx + rad * Math.cos(a)
        const py = cy + rad * Math.sin(a)
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath()
      break
    }
  }
  ctx.fill()
}

export interface IconAtlas {
  atlas: string
  mapping: Record<string, { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; mask: boolean }>
}

/** Build a white-on-transparent icon strip; mask:true lets deck.gl tint per point. */
export function buildIconAtlas(): IconAtlas {
  const canvas = document.createElement('canvas')
  canvas.width = CELL * SHAPES.length
  canvas.height = CELL
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  const mapping: IconAtlas['mapping'] = {}
  SHAPES.forEach((shape, i) => {
    const cx = i * CELL + CELL / 2
    drawShape(ctx, shape, cx, CELL / 2, CELL * 0.34)
    mapping[shape] = {
      x: i * CELL,
      y: 0,
      width: CELL,
      height: CELL,
      anchorX: CELL / 2,
      anchorY: CELL / 2,
      mask: true,
    }
  })
  return { atlas: canvas.toDataURL('image/png'), mapping }
}
