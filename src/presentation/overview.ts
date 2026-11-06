import { el } from '@zero-dependency/dom'
import { STAGE_WIDTH } from './dom'

export interface OverviewController {
  root: HTMLElement
  open: (current: number) => void
  close: () => void
  isOpen: () => boolean
  onKey: (event: KeyboardEvent) => boolean
}

function freezeShow(copy: HTMLElement) {
  const slots = copy.querySelectorAll<HTMLElement>('.photo-slot')
  if (slots.length < 2) return
  slots.forEach((slot, slotIndex) => {
    const shown = slotIndex === 0
    slot.classList.toggle('is-shown', shown)
    slot.inert = !shown
  })
  copy.querySelectorAll('.photo-dot').forEach((dot, dotIndex) => {
    const current = dotIndex === 0
    dot.classList.toggle('is-current', current)
    if (current) dot.setAttribute('aria-current', 'true')
    else dot.removeAttribute('aria-current')
  })
  const bar = copy.querySelector('.photo-progress span')
  if (bar instanceof HTMLElement) bar.style.transform = 'scaleX(0)'
}

export function slideMarkup(root: HTMLElement) {
  const copy = root.cloneNode(true)
  if (!(copy instanceof HTMLElement)) return ''
  freezeShow(copy)
  copy.classList.remove('is-active')
  copy.setAttribute('aria-hidden', 'true')
  return copy.outerHTML
}

export function createOverview(
  slides: readonly HTMLElement[],
  onPick: (index: number) => void,
  onClose: () => void,
): OverviewController {
  const root = el('div', { className: 'overview' })
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Все слайды')
  const grid = el('div', { className: 'overview-grid' })
  root.append(grid)

  const cards: HTMLButtonElement[] = []
  let cursor = 0

  const fit = () => {
    for (const card of cards) {
      const frame = card.querySelector('.overview-frame')
      const scale = card.querySelector('.overview-scale')
      if (!(frame instanceof HTMLElement) || !(scale instanceof HTMLElement)) continue
      const thumb = frame.clientWidth / STAGE_WIDTH
      if (thumb > 0) scale.style.setProperty('--thumb', String(thumb))
    }
  }

  const watch = new ResizeObserver(() => fit())
  watch.observe(grid)

  const mark = (current: number) => {
    cursor = current
    cards.forEach((card, index) => {
      const selected = index === cursor
      card.classList.toggle('is-current', selected)
      if (selected) card.setAttribute('aria-current', 'true')
      else card.removeAttribute('aria-current')
    })
  }

  const close = () => {
    if (root.hidden) return
    root.hidden = true
    onClose()
  }

  const choose = (index: number) => {
    close()
    onPick(index)
  }

  const paint = (current: number) => {
    grid.replaceChildren()
    cards.length = 0
    slides.forEach((slide, index) => {
      const copy = slide.cloneNode(true)
      if (!(copy instanceof HTMLElement)) return
      freezeShow(copy)
      copy.classList.remove('is-active')
      copy.inert = true
      const scale = el('span', { className: 'overview-scale' })
      scale.append(copy)
      const frame = el('span', { className: 'overview-frame' })
      frame.append(scale, el('span', { className: 'overview-index' }, String(index + 1)))
      const card = el('button', { className: 'overview-card' })
      card.type = 'button'
      card.setAttribute('aria-label', `Слайд ${index + 1}`)
      card.append(frame)
      card.addEventListener('click', () => choose(index))
      grid.append(card)
      cards.push(card)
    })
    mark(Math.min(cards.length - 1, Math.max(0, current)))
  }

  const columnsOf = () => {
    const first = cards[0]
    if (!first) return 1
    const top = first.offsetTop
    const columns = cards.filter(card => card.offsetTop === top).length
    return columns || 1
  }

  const move = (next: number) => {
    const clamped = Math.min(cards.length - 1, Math.max(0, next))
    mark(clamped)
    cards[clamped]?.scrollIntoView({ block: 'nearest' })
  }

  const onKey = (event: KeyboardEvent) => {
    if (root.hidden) return false
    const key = event.key
    if (key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    if (key === 'Enter') {
      event.preventDefault()
      choose(cursor)
      return true
    }
    const columns = columnsOf()
    let next = cursor
    if (key === 'ArrowRight') next += 1
    else if (key === 'ArrowLeft') next -= 1
    else if (key === 'ArrowDown' || key === 'PageDown') next += columns
    else if (key === 'ArrowUp' || key === 'PageUp') next -= columns
    else if (key === 'Home') next = 0
    else if (key === 'End') next = cards.length - 1
    else if (key === ' ') next += columns
    else return false
    event.preventDefault()
    move(next)
    return true
  }

  const open = (current: number) => {
    paint(current)
    root.hidden = false
    fit()
    cards[cursor]?.focus()
    cards[cursor]?.scrollIntoView({ block: 'nearest' })
  }

  return {
    root,
    open,
    close,
    isOpen: () => !root.hidden,
    onKey,
  }
}
