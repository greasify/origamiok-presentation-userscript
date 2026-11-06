import { el } from '@zero-dependency/dom'
import {
  CLOSE_ICON,
  MAGNIFY_ICON,
  NEXT_ICON,
  PREV_ICON,
  sealButton,
} from './dom'

export interface LightboxPhoto {
  src: string
  alt: string
}

const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_STEP = 1.1
const ZOOM_JUMP = 1.5
const WHEEL_ZOOM = 1.05
const WHEEL_SETTLE_MS = 200

export interface LightboxController {
  root: HTMLElement
  open: (photos: readonly LightboxPhoto[], index: number, onIndex?: (index: number) => void) => void
  close: () => void
  isOpen: () => boolean
  onKey: (event: KeyboardEvent) => boolean
}

export function createLightbox(overlay: HTMLElement, onClose: () => void): LightboxController {
  const root = el('div', { className: 'lightbox' })
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Фото на весь экран')
  const stage = el('div', { className: 'lightbox-stage' })
  const frame = el('div', { className: 'lightbox-frame' })
  const photo = el('img', { className: 'lightbox-photo' })
  photo.draggable = false
  const zoomButton = sealButton('lightbox-zoom', 'Увеличить', MAGNIFY_ICON)
  zoomButton.setAttribute('aria-pressed', 'false')
  const closeButton = sealButton('lightbox-close', 'Закрыть', CLOSE_ICON)
  const prev = sealButton('lightbox-nav is-prev', 'Предыдущее фото', PREV_ICON)
  const next = sealButton('lightbox-nav is-next', 'Следующее фото', NEXT_ICON)
  frame.append(photo)
  stage.append(frame)
  root.append(stage, prev, next, zoomButton, closeButton)

  let magnification = ZOOM_MIN
  let panX = 0
  let panY = 0
  let dragged = false
  let settleTimer = 0
  let photos: readonly LightboxPhoto[] = []
  let index = 0
  let onIndex: ((index: number) => void) | null = null

  const paintMagnification = () => {
    photo.style.transform = `translate(${panX}px, ${panY}px) scale(${magnification})`
    const zoomed = magnification > ZOOM_MIN
    stage.classList.toggle('is-magnified', zoomed)
    zoomButton.setAttribute('aria-pressed', zoomed ? 'true' : 'false')
    zoomButton.setAttribute('aria-label', zoomed ? 'Сбросить увеличение' : 'Увеличить')
  }

  const clampAxis = (value: number, limit: number, strict: boolean) => {
    if (strict) return Math.min(limit, Math.max(-limit, value))
    if (value > limit) return value + (limit - value) / 10
    if (value < -limit) return value - (limit + value) / 10
    return value
  }

  const placePhoto = (scale: number, point: { x: number, y: number }, strict: boolean) => {
    const roomX = Math.max(0, (photo.offsetWidth * scale - stage.clientWidth) / 2)
    const roomY = Math.max(0, (photo.offsetHeight * scale - stage.clientHeight) / 2)
    let nextScale = scale
    if (strict) nextScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale))
    else if (nextScale > ZOOM_MAX) nextScale += (ZOOM_MAX - nextScale) / 10
    else if (nextScale < ZOOM_MIN) nextScale += (ZOOM_MIN - nextScale) / 10
    const nextX = nextScale === ZOOM_MIN ? 0 : clampAxis(point.x, roomX, strict)
    const nextY = nextScale === ZOOM_MIN ? 0 : clampAxis(point.y, roomY, strict)
    return { scale: nextScale, x: nextX, y: nextY }
  }

  const applyPlace = (placed: { scale: number, x: number, y: number }) => {
    magnification = placed.scale
    panX = placed.x
    panY = placed.y
    paintMagnification()
  }

  const setMagnification = (next: number) => {
    applyPlace(placePhoto(next, { x: panX, y: panY }, true))
  }

  const settlePhoto = () => {
    settleTimer = 0
    applyPlace(placePhoto(magnification, { x: panX, y: panY }, true))
  }

  const armSettle = () => {
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(settlePhoto, WHEEL_SETTLE_MS)
  }

  const close = () => {
    window.clearTimeout(settleTimer)
    settleTimer = 0
    root.hidden = true
    overlay.classList.remove('is-zoomed')
    photo.removeAttribute('src')
    photo.alt = ''
    photo.classList.remove('is-entering')
    photo.style.transform = ''
    photos = []
    onIndex = null
    prev.hidden = true
    next.hidden = true
    setMagnification(ZOOM_MIN)
  }

  const dismiss = () => {
    close()
    onClose()
  }

  const paintNav = () => {
    const many = photos.length > 1
    prev.hidden = !many
    next.hidden = !many
  }

  const showPhoto = (nextIndex: number, notify = true) => {
    if (!photos.length) return
    index = (nextIndex + photos.length) % photos.length
    const item = photos[index]
    if (!item) return
    const animate = !root.hidden && photo.getAttribute('src') !== item.src
    photo.src = item.src
    photo.alt = item.alt
    setMagnification(ZOOM_MIN)
    if (animate) {
      photo.classList.remove('is-entering')
      void photo.offsetWidth
      photo.classList.add('is-entering')
    }
    if (notify) onIndex?.(index)
  }

  const open = (items: readonly LightboxPhoto[], start: number, follow?: (index: number) => void) => {
    photos = items
    onIndex = follow ?? null
    paintNav()
    showPhoto(start, false)
    overlay.classList.add('is-zoomed')
    root.hidden = false
  }

  const onKey = (event: KeyboardEvent) => {
    if (root.hidden) return false
    const key = event.key
    if (key === '+' || key === '=') {
      event.preventDefault()
      setMagnification(magnification * ZOOM_STEP)
      return true
    }
    if (key === '-' || key === '_') {
      event.preventDefault()
      setMagnification(magnification / ZOOM_STEP)
      return true
    }
    if (key === '0') {
      event.preventDefault()
      setMagnification(ZOOM_MIN)
      return true
    }
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && photos.length > 1) {
      event.preventDefault()
      showPhoto(index + (key === 'ArrowRight' ? 1 : -1))
      return true
    }
    event.preventDefault()
    return true
  }

  root.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false
      return
    }
    const target = event.target
    if (target === root || target === stage) dismiss()
  })
  closeButton.addEventListener('click', dismiss)
  prev.addEventListener('click', () => showPhoto(index - 1))
  next.addEventListener('click', () => showPhoto(index + 1))
  zoomButton.addEventListener('click', () => {
    setMagnification(magnification > ZOOM_MIN ? ZOOM_MIN : ZOOM_JUMP)
  })
  stage.addEventListener('dblclick', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.lightbox-photo')) return
    setMagnification(magnification > ZOOM_MIN ? ZOOM_MIN : ZOOM_JUMP)
  })
  const stopNativeDrag = (event: Event) => {
    event.preventDefault()
  }
  photo.addEventListener('dragstart', stopNativeDrag)
  stage.addEventListener('dragstart', stopNativeDrag)
  stage.addEventListener('dragenter', stopNativeDrag)
  stage.addEventListener('wheel', (event) => {
    event.preventDefault()
    const pinch = event.ctrlKey
    const mouseWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
    if (!pinch && !mouseWheel) {
      if (magnification <= ZOOM_MIN) return
      applyPlace(placePhoto(magnification, { x: panX - event.deltaX, y: panY - event.deltaY }, true))
      return
    }
    const delta = -event.deltaY
    if (!delta) return
    const next = magnification * (delta > 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM)
    applyPlace(placePhoto(next, { x: panX, y: panY }, false))
    armSettle()
  }, { passive: false })
  let drag: { x: number, y: number, panX: number, panY: number } | null = null
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if (!(event.target instanceof Element) || !event.target.closest('.lightbox-photo')) return
    event.preventDefault()
    if (magnification <= ZOOM_MIN) return
    drag = { x: event.clientX, y: event.clientY, panX, panY }
    dragged = false
    stage.setPointerCapture(event.pointerId)
  })
  stage.addEventListener('pointermove', (event) => {
    if (!drag) return
    event.preventDefault()
    const nextX = drag.panX + event.clientX - drag.x
    const nextY = drag.panY + event.clientY - drag.y
    if (Math.hypot(nextX - drag.panX, nextY - drag.panY) > 3) dragged = true
    applyPlace(placePhoto(magnification, { x: nextX, y: nextY }, true))
  })
  const endDrag = () => {
    drag = null
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)
  setMagnification(ZOOM_MIN)

  return {
    root,
    open,
    close,
    isOpen: () => !root.hidden,
    onKey,
  }
}
