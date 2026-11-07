import type {
  RemoteCommand,
  RemoteSlide,
  RemoteState,
  RemoteView,
} from './protocol'
import { el } from '@zero-dependency/dom'
import { socketUrl } from 'virtual:presenter-hub'
import presentationCss from '../presentation.scss?inline'
import {
  CLOSE_ICON,
  CREASE,
  EDIT_ICON,
  FONT_HREF,
  MAGNIFY_ICON,
  NEXT_ICON,
  OVERVIEW_ICON,
  PHOTO_ICON,
  PREV_ICON,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../presentation/dom'
import { createEditor } from '../presentation/editor'
import {
  applyIncoming,
  clampIndex,
  clampScale,
  decodePresenterFrame,
  encodePresenterFrame,
  pixelsFromView,
  PRESENTER_SOCKET_PROTOCOL,
  viewFromPixels,
} from './protocol'
import './main.scss'

const REST_VIEW: RemoteView = { scale: 1, nx: 0, ny: 0 }

function seal(label: string, icon: string, className = '') {
  const button = el('button', { className: className ? `seal ${className}` : 'seal' })
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.innerHTML = icon
  return button
}

const painted = new WeakMap<HTMLElement, string>()

function thumbCss(css: string) {
  const open = css.indexOf('{')
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) return css
  const body = css.slice(open + 1, close)
    .replace(/position:\s*fixed\s*;/, 'position: relative;')
    .replace(/z-index:\s*2147483646\s*;/, 'z-index: auto;')
    .replace(/inset:\s*0\s*;/, 'overflow: hidden; width: 100%; height: 100%;')
  return `${css.slice(0, open + 1)}${body}${css.slice(close)}
.overview-scale .slide { opacity: 1; }
.overview-scale,
.overview-scale * { cursor: default; pointer-events: none; }
.overview-scale .photo-frames .photo-slot,
.overview-scale .photo-frame,
.overview-scale .sheet-photo,
.overview-scale .photo-dot { cursor: default; pointer-events: none; }
.overview-scale .photo-zoom { display: none; }
:host(.is-live) .copy-body { pointer-events: auto; overscroll-behavior: contain; }
:host(.is-editing) .is-copy {
  cursor: pointer;
  outline: 2px dashed var(--seal);
  outline-offset: 3px;
  pointer-events: auto;
}
:host(.is-editing) .copy-body .is-copy {
  outline: none;
  border: 2px dashed var(--seal);
}
:host(.is-editing) .is-hidden {
  display: block;
  opacity: 0.45;
  pointer-events: auto;
}
`
}

const THUMB_CSS = thumbCss(presentationCss)
const OVERVIEW_CSS = `${THUMB_CSS}
:host { position: relative; z-index: auto; overflow: visible; width: 100%; height: auto; inset: auto; }
.overview-card { pointer-events: auto; }
`

function fitThumb(frame: HTMLElement) {
  const width = frame.clientWidth
  if (width > 0) frame.style.setProperty('--thumb', String(width / STAGE_WIDTH))
}

function paintThumb(frame: HTMLElement, markup: string) {
  let shadow = frame.shadowRoot
  if (!shadow) {
    shadow = frame.attachShadow({ mode: 'open' })
    const style = el('style', THUMB_CSS)
    const fonts = el('link')
    fonts.rel = 'stylesheet'
    fonts.href = FONT_HREF
    const scale = el('span', { className: 'overview-scale' })
    shadow.append(style, fonts, scale)
    const watch = new ResizeObserver(() => fitThumb(frame))
    watch.observe(frame)
  }
  const scale = shadow.querySelector('.overview-scale')
  if (!(scale instanceof HTMLElement) || !markup || painted.get(scale) === markup) {
    fitThumb(frame)
    return
  }
  scale.innerHTML = markup
  painted.set(scale, markup)
  fitThumb(frame)
}

let current: RemoteState | null = null
let editing = false
let scrollFrame = 0

function cardFrame(slide: RemoteSlide, live = false) {
  const frame = el('span', { className: live ? 'frame is-live' : 'frame' })
  if (live && editing) frame.classList.add('is-editing')
  frame.style.setProperty('--stage-w', String(STAGE_WIDTH))
  frame.style.setProperty('--stage-h', String(STAGE_HEIGHT))
  paintThumb(frame, slide.markup)
  return frame
}

function bindCopyScroll(frame: HTMLElement) {
  const body = frame.shadowRoot?.querySelector('.copy-body')
  if (!(body instanceof HTMLElement)) return
  body.addEventListener('scroll', () => {
    if (scrollFrame) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      if (!current?.open || !body.isConnected) return
      const room = body.scrollHeight - body.clientHeight
      const top = room > 0 ? Math.min(1, Math.max(0, body.scrollTop / room)) : 0
      send({ type: 'copy-scroll', key: current.key, index: current.index, top })
    })
  }, { passive: true })
}

function fillCard(card: HTMLElement, slide: RemoteSlide | undefined, live = false) {
  card.replaceChildren()
  if (!slide) {
    card.hidden = true
    return
  }
  card.hidden = false
  const frame = cardFrame(slide, live)
  card.append(frame)
  if (live) bindCopyScroll(frame)
}

const field = el('div', { className: 'crease' })
field.innerHTML = CREASE
const waitingLabel = el('span')
waitingLabel.textContent = 'Ожидаем открытия презентации'
const waiting = el('p', { className: 'waiting' }, waitingLabel)
const deck = el('div', { className: 'deck' })
deck.hidden = true
const currentCard = el('article', { className: 'slide-card is-current' })
const nextCard = el('button', { className: 'slide-card is-next' })
nextCard.type = 'button'
deck.append(currentCard, nextCard)

const prev = seal('Назад', PREV_ICON)
const counter = el('span', { className: 'counter' })
const next = seal('Дальше', NEXT_ICON)
const overviewButton = seal('Все слайды', OVERVIEW_ICON)
overviewButton.setAttribute('aria-pressed', 'false')
const editButton = seal('Править текст', EDIT_ICON)
editButton.setAttribute('aria-pressed', 'false')
const photoButton = seal('Фото', PHOTO_ICON)
const bar = el('div', { className: 'bar' })
bar.hidden = true
bar.append(prev, counter, next, overviewButton, editButton, photoButton)

const overview = el('div', { className: 'sheet overview' })
overview.hidden = true
overview.setAttribute('role', 'dialog')
overview.setAttribute('aria-label', 'Все слайды')
const overviewStage = el('div', { className: 'overview-stage' })
overview.append(overviewStage)

const photoSheet = el('div', { className: 'sheet photo' })
photoSheet.hidden = true
photoSheet.setAttribute('role', 'dialog')
photoSheet.setAttribute('aria-label', 'Фото на весь экран')
const photoStage = el('div', { className: 'photo-stage' })
const photoImg = el('img', { className: 'photo-img' })
photoImg.draggable = false
photoStage.append(photoImg)
const photoPrev = seal('Предыдущее фото', PREV_ICON, 'photo-nav is-prev')
const photoNext = seal('Следующее фото', NEXT_ICON, 'photo-nav is-next')
const zoomButton = seal('Увеличить', MAGNIFY_ICON)
zoomButton.setAttribute('aria-pressed', 'false')
const photoClose = seal('Закрыть', CLOSE_ICON)
const photoTools = el('div', { className: 'photo-tools' })
photoTools.append(zoomButton, photoClose)
const photoDots = el('div', { className: 'photo-dots' })
photoDots.hidden = true
photoSheet.append(photoStage, photoPrev, photoNext, photoTools, photoDots)

const editor = createEditor({
  onSave(source, value) {
    if (!current?.open) return
    send({ type: 'text-save', key: current.key, source, value })
  },
  onReset(source) {
    if (!current?.open) return
    send({ type: 'text-reset', key: current.key, source })
  },
  onHide(source, hidden) {
    if (!current?.open) return
    send({ type: 'text-hide', key: current.key, source, hidden })
  },
})

const remote = el('main', { className: 'remote' })
remote.append(field, waiting, deck, bar, overview, photoSheet, editor.root)
document.body.append(remote)

let photoWanted = false
let gesturing = false
let signature = ''
let shown = ''
let scale = 1
let panX = 0
let panY = 0

const link = connect((incoming) => {
  const applied = applyIncoming(current, incoming)
  if (!applied) return
  if (applied.state.key !== current?.key) {
    photoWanted = false
    shown = ''
    signature = ''
  }
  current = applied.state
  if (!current.lightbox) photoWanted = false
  render()
})

function imagesOf(state: RemoteState) {
  return state.slides[state.index]?.images ?? []
}

function room(nextScale: number) {
  return {
    x: Math.max(0, (photoImg.offsetWidth * nextScale - photoStage.clientWidth) / 2),
    y: Math.max(0, (photoImg.offsetHeight * nextScale - photoStage.clientHeight) / 2),
  }
}

function paintView(view: RemoteView) {
  const next = clampScale(view.scale)
  const space = room(next)
  const pixels = pixelsFromView(view, space.x, space.y)
  scale = pixels.scale
  panX = pixels.x
  panY = pixels.y
  photoImg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`
  const zoomed = scale > 1
  zoomButton.setAttribute('aria-pressed', zoomed ? 'true' : 'false')
  zoomButton.setAttribute('aria-label', zoomed ? 'Сбросить увеличение' : 'Увеличить')
}

function send(command: RemoteCommand) {
  link.send(command)
}

function go(index: number) {
  if (!current?.open) return
  send({ type: 'show', key: current.key, index: clampIndex(index, current.slides.length) })
}

function openPhoto() {
  if (!current?.open || !imagesOf(current).length) return
  photoWanted = true
  overview.hidden = true
  overviewButton.setAttribute('aria-pressed', 'false')
  send({ type: 'lightbox-open', key: current.key, index: 0 })
  render()
}

function closePhoto() {
  photoWanted = false
  photoSheet.hidden = true
  if (!current?.open) return
  send({ type: 'lightbox-close', key: current.key })
}

function emitView(view: RemoteView) {
  paintView(view)
  if (!current?.open) return
  send({ type: 'lightbox-view', key: current.key, view })
}

function currentView(): RemoteView {
  const space = room(scale)
  return viewFromPixels({ scale, panX, panY, roomX: space.x, roomY: space.y })
}

function overviewGrid() {
  let shadow = overviewStage.shadowRoot
  if (!shadow) {
    shadow = overviewStage.attachShadow({ mode: 'open' })
    overviewStage.style.setProperty('--stage-w', String(STAGE_WIDTH))
    overviewStage.style.setProperty('--stage-h', String(STAGE_HEIGHT))
    const style = el('style', OVERVIEW_CSS)
    const fonts = el('link')
    fonts.rel = 'stylesheet'
    fonts.href = FONT_HREF
    const grid = el('div', { className: 'overview-grid' })
    shadow.append(style, fonts, grid)
    const watch = new ResizeObserver(() => fitOverview(grid))
    watch.observe(grid)
  }
  const grid = shadow.querySelector('.overview-grid')
  if (!(grid instanceof HTMLElement)) return null
  return grid
}

function fitOverview(grid: HTMLElement) {
  for (const frame of grid.querySelectorAll<HTMLElement>('.overview-frame')) {
    const scale = frame.querySelector('.overview-scale')
    if (!(scale instanceof HTMLElement)) continue
    const thumb = frame.clientWidth / STAGE_WIDTH
    if (thumb > 0) scale.style.setProperty('--thumb', String(thumb))
  }
}

function markOverview(index: number) {
  overviewStage.shadowRoot?.querySelectorAll<HTMLButtonElement>('.overview-card').forEach((card, cardIndex) => {
    const selected = cardIndex === index
    card.classList.toggle('is-current', selected)
    if (selected) card.setAttribute('aria-current', 'true')
    else card.removeAttribute('aria-current')
  })
}

function paintOverview(state: RemoteState) {
  const grid = overviewGrid()
  if (!grid) return
  grid.replaceChildren()
  state.slides.forEach((slide, index) => {
    const scale = el('span', { className: 'overview-scale' })
    scale.innerHTML = slide.markup
    const frame = el('span', { className: 'overview-frame' })
    frame.append(scale)
    const card = el('button', { className: 'overview-card' })
    card.type = 'button'
    card.setAttribute('aria-label', `Слайд ${index + 1}`)
    card.append(frame)
    card.addEventListener('click', () => {
      overview.hidden = true
      overviewButton.setAttribute('aria-pressed', 'false')
      go(index)
    })
    grid.append(card)
  })
  markOverview(state.index)
  fitOverview(grid)
}

function setEditing(next: boolean) {
  editing = next
  editButton.setAttribute('aria-pressed', next ? 'true' : 'false')
  currentCard.querySelector('.frame')?.classList.toggle('is-editing', next)
  if (!next) editor.close()
}

function render() {
  const state = current
  if (!state?.open) {
    if (editing) setEditing(false)
    waiting.hidden = false
    deck.hidden = true
    bar.hidden = true
    overview.hidden = true
    photoSheet.hidden = true
    return
  }
  waiting.hidden = true
  deck.hidden = false
  bar.hidden = false
  counter.textContent = `${state.index + 1} / ${state.slides.length}`
  prev.disabled = state.index === 0
  next.disabled = state.index >= state.slides.length - 1
  const slide = state.slides[state.index]
  const following = state.slides[state.index + 1]
  nextCard.setAttribute('aria-label', following ? `Слайд ${state.index + 2}` : 'Дальше')
  photoButton.disabled = !slide?.images.length
  const nextSignature = state.slides.map(item => `${item.step}|${item.title}|${item.markup}|${item.images.map(image => image.src).join(',')}`).join('\n')
  const slideKey = `${state.index}|${nextSignature}`
  if (slideKey !== shown) {
    shown = slideKey
    fillCard(currentCard, slide, true)
    fillCard(nextCard, following)
  }
  if (nextSignature !== signature) {
    signature = nextSignature
    paintOverview(state)
  } else {
    markOverview(state.index)
  }
  const images = imagesOf(state)
  const photoIndex = state.lightbox ? clampIndex(state.lightbox.index, images.length) : 0
  const item = images[photoIndex]
  const many = images.length > 1
  photoPrev.hidden = !many
  photoNext.hidden = !many
  photoDots.hidden = !many
  paintPhotoDots(images, photoIndex)
  photoSheet.hidden = !(photoWanted || state.lightbox)
  if (!item) return
  if (photoImg.getAttribute('src') !== item.src) {
    photoImg.src = item.src
    photoImg.alt = item.alt
  }
  if (!gesturing) paintView(state.lightbox?.view ?? REST_VIEW)
}

prev.addEventListener('click', () => {
  if (current) go(current.index - 1)
})
next.addEventListener('click', () => {
  if (current) go(current.index + 1)
})
nextCard.addEventListener('click', () => {
  if (current) go(current.index + 1)
})
editButton.addEventListener('click', () => {
  setEditing(!editing)
})
currentCard.addEventListener('click', (event) => {
  if (!editing) return
  const copy = event.composedPath().find((node): node is HTMLElement => {
    return node instanceof HTMLElement && node.classList.contains('is-copy')
  })
  if (!copy?.dataset.source) return
  event.preventDefault()
  editor.open({
    source: copy.dataset.source,
    current: copy.textContent ?? '',
    paragraph: copy.tagName === 'P',
    hidden: copy.classList.contains('is-hidden'),
  })
})
overviewButton.addEventListener('click', () => {
  const open = overview.hidden
  overview.hidden = !open
  overviewButton.setAttribute('aria-pressed', open ? 'true' : 'false')
  if (open) {
    const grid = overviewGrid()
    if (grid) fitOverview(grid)
    overviewStage.shadowRoot?.querySelector<HTMLButtonElement>('.is-current')?.focus()
  }
})
photoButton.addEventListener('click', openPhoto)
photoClose.addEventListener('click', closePhoto)
photoPrev.addEventListener('click', () => stepPhoto(-1))
photoNext.addEventListener('click', () => stepPhoto(1))
zoomButton.addEventListener('click', () => {
  emitView(scale > 1 ? REST_VIEW : { scale: 1.5, nx: 0, ny: 0 })
})

function stepPhoto(delta: number) {
  if (!current?.open) return
  const images = imagesOf(current)
  if (images.length < 2) return
  const nextIndex = ((current.lightbox?.index ?? 0) + delta + images.length) % images.length
  send({ type: 'lightbox-photo', key: current.key, index: nextIndex })
}

let photoDotKey = ''

function selectPhoto(index: number) {
  if (!current?.open) return
  const images = imagesOf(current)
  if (images.length < 2) return
  send({ type: 'lightbox-photo', key: current.key, index: clampIndex(index, images.length) })
}

function paintPhotoDots(images: { src: string }[], photoIndex: number) {
  const key = images.map(image => image.src).join('\n')
  if (key !== photoDotKey) {
    photoDotKey = key
    photoDots.replaceChildren()
    images.forEach((_, dotIndex) => {
      const button = el('button', { className: 'photo-dot' })
      button.type = 'button'
      button.setAttribute('aria-label', `Фото ${dotIndex + 1}`)
      button.addEventListener('click', () => selectPhoto(dotIndex))
      photoDots.append(button)
    })
  }
  photoDots.querySelectorAll<HTMLButtonElement>('.photo-dot').forEach((button, buttonIndex) => {
    const current = buttonIndex === photoIndex
    button.classList.toggle('is-current', current)
    if (current) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  })
}

photoImg.addEventListener('load', () => {
  if (!gesturing) paintView(current?.lightbox?.view ?? currentView())
})

const points = new Map<number, { x: number, y: number }>()
let drag: { x: number, y: number, panX: number, panY: number } | null = null
let fingers: { distance: number, scale: number, x: number, y: number, panX: number, panY: number } | null = null

function pair() {
  const all = [...points.values()]
  const a = all[0]
  const b = all[1]
  if (!a || !b) return null
  return {
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

photoStage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  points.set(event.pointerId, { x: event.clientX, y: event.clientY })
  try {
    photoStage.setPointerCapture(event.pointerId)
  } catch {
    // A pointer can already be gone; the gesture still follows later moves.
  }
  gesturing = true
  const now = pair()
  if (now) {
    drag = null
    fingers = { distance: now.distance, scale, x: now.x, y: now.y, panX, panY }
    return
  }
  if (scale <= 1) return
  drag = { x: event.clientX, y: event.clientY, panX, panY }
})
photoStage.addEventListener('pointermove', (event) => {
  const point = points.get(event.pointerId)
  if (point) {
    point.x = event.clientX
    point.y = event.clientY
  }
  if (fingers) {
    const now = pair()
    if (!now) return
    const nextScale = fingers.scale * (now.distance / fingers.distance)
    scale = clampScale(nextScale)
    panX = fingers.panX + now.x - fingers.x
    panY = fingers.panY + now.y - fingers.y
    emitView(currentView())
    return
  }
  if (!drag) return
  panX = drag.panX + event.clientX - drag.x
  panY = drag.panY + event.clientY - drag.y
  emitView(currentView())
})
function endPointer(event: PointerEvent) {
  points.delete(event.pointerId)
  if (points.size < 2) fingers = null
  if (points.size === 0) {
    drag = null
    gesturing = false
    emitView(currentView())
  }
}
photoStage.addEventListener('pointerup', endPointer)
photoStage.addEventListener('pointercancel', endPointer)

window.addEventListener('keydown', (event) => {
  if (editor.onKey(event)) return
  if (!current?.open) return
  if (event.key === 'Escape') {
    if (!photoSheet.hidden) {
      closePhoto()
      return
    }
    if (!overview.hidden) {
      overview.hidden = true
      overviewButton.setAttribute('aria-pressed', 'false')
      return
    }
    if (editing) setEditing(false)
    return
  }
  if (!photoSheet.hidden && (event.key === '+' || event.key === '=')) {
    event.preventDefault()
    emitView({ ...currentView(), scale: scale * 1.1 })
    return
  }
  if (!photoSheet.hidden && (event.key === '-' || event.key === '_')) {
    event.preventDefault()
    emitView({ ...currentView(), scale: scale / 1.1 })
    return
  }
  if (!photoSheet.hidden && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
    event.preventDefault()
    stepPhoto(event.key === 'ArrowRight' ? 1 : -1)
    return
  }
  if (event.key === 'ArrowRight') go(current.index + 1)
  if (event.key === 'ArrowLeft') go(current.index - 1)
})

function connect(onState: (state: RemoteState) => void) {
  let socket: WebSocket | null = null
  let timer = 0
  const sendCommand = (command: RemoteCommand) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encodePresenterFrame({ type: 'command', command }))
    }
  }
  const open = () => {
    if (!socketUrl) {
      timer = window.setTimeout(open, 1000)
      return
    }
    const ws = new WebSocket(socketUrl, PRESENTER_SOCKET_PROTOCOL)
    socket = ws
    ws.addEventListener('open', () => {
      remote.classList.add('is-linked')
      ws.send(encodePresenterFrame({ type: 'hello', role: 'remote' }))
    })
    ws.addEventListener('message', (event) => {
      const message = decodePresenterFrame(String(event.data))
      if (message?.type === 'state') onState(message.state)
    })
    ws.addEventListener('close', () => {
      remote.classList.remove('is-linked')
      if (socket !== ws) return
      timer = window.setTimeout(open, 1000)
    })
  }
  open()
  return {
    send: sendCommand,
    stop() {
      window.clearTimeout(timer)
      socket?.close()
      socket = null
    },
  }
}
