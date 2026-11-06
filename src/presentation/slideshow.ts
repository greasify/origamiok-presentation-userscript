import type { Photo } from '../parse-page'
import { el } from '@zero-dependency/dom'
import { photoFrame } from './dom'

const HOLD_MS = 10000

export function photoShow(images: Photo[], label: string) {
  const root = el('div', { className: 'photo-show' })
  const bar = el('span')
  const progress = el('div', { className: 'photo-progress' })
  progress.append(bar)
  const stack = el('div', { className: 'photo-frames' })
  const frames = images.map(image => photoFrame(image, label))
  const dots = el('div', { className: 'photo-dots' })
  const buttons = images.map((_, index) => {
    const button = el('button', { className: 'photo-dot' })
    button.type = 'button'
    button.setAttribute('aria-label', `Фото ${index + 1}`)
    dots.append(button)
    return button
  })
  stack.append(...frames)
  root.append(stack)

  let index = 0
  let elapsed = 0
  let stamp = -1
  let paused = false
  let seen = false

  const paint = () => {
    const ratio = Math.min(elapsed / HOLD_MS, 1)
    bar.style.transform = `scaleX(${ratio})`
    frames.forEach((frame, frameIndex) => {
      frame.hidden = frameIndex !== index
    })
    const frame = frames[index]
    if (!frame) return
    frame.querySelector('.photo-frame')?.append(progress, dots)
    buttons.forEach((button, buttonIndex) => {
      const current = buttonIndex === index
      button.classList.toggle('is-current', current)
      if (current) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
  }

  const show = (next: number) => {
    index = (next + images.length) % images.length
    elapsed = 0
    stamp = -1
    paint()
  }

  buttons.forEach((button, buttonIndex) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      show(buttonIndex)
    })
  })

  const tick = (now: number) => {
    if (!root.isConnected) {
      if (seen) return
      requestAnimationFrame(tick)
      return
    }
    seen = true
    requestAnimationFrame(tick)
    const active = root.closest('.slide')?.classList.contains('is-active') ?? false
    const overlay = root.closest('.overlay') as HTMLElement | null
    const shown = !overlay || !overlay.hidden
    const zoomed = overlay?.classList.contains('is-zoomed') ?? false
    if (paused || !active || !shown || zoomed) {
      stamp = now
      return
    }
    if (stamp < 0) {
      stamp = now
      return
    }
    elapsed += now - stamp
    stamp = now
    if (elapsed >= HOLD_MS) show(index + 1)
    else paint()
  }

  stack.addEventListener('pointerenter', () => {
    paused = true
  })
  stack.addEventListener('pointerleave', () => {
    paused = false
    stamp = -1
  })

  paint()
  requestAnimationFrame(tick)
  return root
}
