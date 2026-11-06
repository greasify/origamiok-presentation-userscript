export const ZOOM_MIN = 1
export const ZOOM_MAX = 5

export interface RemotePhoto {
  src: string
  alt: string
}

export interface RemoteSlide {
  title: string
  step: string
  images: RemotePhoto[]
  markup: string
}

export interface RemoteView {
  scale: number
  nx: number
  ny: number
}

export interface RemoteState {
  key: string
  open: boolean
  index: number
  slides: RemoteSlide[]
  lightbox: {
    index: number
    view: RemoteView
  } | null
}

export type RemoteCommand
  = | { type: 'show', key: string, index: number }
    | { type: 'lightbox-open', key: string, index: number }
    | { type: 'lightbox-close', key: string }
    | { type: 'lightbox-photo', key: string, index: number }
    | { type: 'lightbox-view', key: string, view: RemoteView }
    | { type: 'copy-scroll', key: string, index: number, top: number }
    | { type: 'text-save', key: string, source: string, value: string }
    | { type: 'text-reset', key: string, source: string }

export type HubMessage
  = | { type: 'hello', role: 'stage' | 'remote' }
    | { type: 'sync' }
    | { type: 'state', state: RemoteState }
    | { type: 'command', command: RemoteCommand }

export function deckKey(pathname: string, canonical: string) {
  return `${pathname}|${canonical}`
}

export function canonicalPath(href: string) {
  if (!href) return ''
  try {
    return new URL(href).pathname
  } catch {
    return href
  }
}

export function clampIndex(index: number, total: number) {
  if (total <= 0) return 0
  const next = Number.isFinite(index) ? Math.trunc(index) : 0
  return Math.min(total - 1, Math.max(0, next))
}

export function clampScale(scale: number) {
  if (!Number.isFinite(scale)) return ZOOM_MIN
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale))
}

export function clampPan(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(-1, value))
}

export function normalizePan(pan: number, room: number) {
  if (room <= 0) return 0
  return clampPan(pan / room)
}

export function denormalizePan(value: number, room: number) {
  return clampPan(value) * Math.max(0, room)
}

export function viewFromPixels(input: {
  scale: number
  panX: number
  panY: number
  roomX: number
  roomY: number
}): RemoteView {
  return {
    scale: clampScale(input.scale),
    nx: normalizePan(input.panX, input.roomX),
    ny: normalizePan(input.panY, input.roomY),
  }
}

export function pixelsFromView(view: RemoteView, roomX: number, roomY: number) {
  return {
    scale: clampScale(view.scale),
    x: denormalizePan(view.nx, roomX),
    y: denormalizePan(view.ny, roomY),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isView(value: unknown): value is RemoteView {
  return isRecord(value)
    && typeof value.scale === 'number'
    && typeof value.nx === 'number'
    && typeof value.ny === 'number'
}

function isSlide(value: unknown): value is RemoteSlide {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.step === 'string'
    && typeof value.markup === 'string'
    && Array.isArray(value.images)
    && value.images.every(image => isRecord(image) && typeof image.src === 'string' && typeof image.alt === 'string')
}

export function blankRepeatedMarkup(previous: readonly string[], slides: readonly RemoteSlide[]) {
  return slides.map((slide, index) => {
    if (!slide.markup || slide.markup !== previous[index]) return slide
    return { ...slide, markup: '' }
  })
}

export function needsMarkup(state: RemoteState) {
  return state.slides.some(slide => !slide.markup)
}

export function mergeStoredState(previousRaw: string | null, message: Extract<HubMessage, { type: 'state' }>) {
  const previous = previousRaw ? parseHubMessage(previousRaw) : null
  const prior = previous?.type === 'state' ? previous.state : null
  return JSON.stringify({ type: 'state', state: tidy(carriedMarkup(prior, message.state)) })
}

function carriedMarkup(current: RemoteState | null, incoming: RemoteState) {
  if (!current || current.key !== incoming.key) return incoming
  return {
    ...incoming,
    slides: incoming.slides.map((slide, index) => {
      if (slide.markup) return slide
      const previous = current.slides[index]?.markup
      if (!previous) return slide
      return { ...slide, markup: previous }
    }),
  }
}

function isState(value: unknown): value is RemoteState {
  return isRecord(value)
    && typeof value.key === 'string'
    && typeof value.open === 'boolean'
    && typeof value.index === 'number'
    && Array.isArray(value.slides)
    && value.slides.every(slide => isSlide(slide))
    && (value.lightbox === null || (
      isRecord(value.lightbox)
      && typeof value.lightbox.index === 'number'
      && isView(value.lightbox.view)
    ))
}

function isCommand(value: unknown): value is RemoteCommand {
  if (!isRecord(value) || typeof value.key !== 'string' || typeof value.type !== 'string') return false
  if (value.type === 'lightbox-close') return true
  if (value.type === 'lightbox-view') return isView(value.view)
  if (value.type === 'show' || value.type === 'lightbox-open' || value.type === 'lightbox-photo') {
    return typeof value.index === 'number'
  }
  if (value.type === 'copy-scroll') return typeof value.index === 'number' && typeof value.top === 'number'
  if (value.type === 'text-save') return typeof value.source === 'string' && typeof value.value === 'string'
  if (value.type === 'text-reset') return typeof value.source === 'string'
  return false
}

export const PRESENTER_SOCKET_PROTOCOL = 'vite-hmr'

export function encodePresenterFrame(message: HubMessage) {
  return JSON.stringify({ type: 'custom', event: 'presenter', data: message })
}

export function decodePresenterFrame(raw: string): HubMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.type !== 'custom' || parsed.event !== 'presenter' || !isRecord(parsed.data)) return null
  return parseHubMessage(JSON.stringify(parsed.data))
}

export function parseHubMessage(raw: string): HubMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null
  if (parsed.type === 'hello' && (parsed.role === 'stage' || parsed.role === 'remote')) {
    return { type: 'hello', role: parsed.role }
  }
  if (parsed.type === 'sync') return { type: 'sync' }
  if (parsed.type === 'state' && isState(parsed.state)) return { type: 'state', state: tidy(parsed.state) }
  if (parsed.type === 'command' && isCommand(parsed.command)) {
    return { type: 'command', command: tidyCommand(parsed.command) }
  }
  return null
}

function tidy(state: RemoteState): RemoteState {
  const slides = state.slides
  const lightbox = state.lightbox
  return {
    key: state.key,
    open: state.open,
    index: clampIndex(state.index, slides.length),
    slides,
    lightbox: lightbox
      ? {
          index: Math.max(0, Math.trunc(lightbox.index)),
          view: {
            scale: clampScale(lightbox.view.scale),
            nx: clampPan(lightbox.view.nx),
            ny: clampPan(lightbox.view.ny),
          },
        }
      : null,
  }
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function tidyCommand(command: RemoteCommand): RemoteCommand {
  if (command.type === 'lightbox-close' || command.type === 'text-save' || command.type === 'text-reset') return command
  if (command.type === 'lightbox-view') {
    return {
      type: 'lightbox-view',
      key: command.key,
      view: {
        scale: clampScale(command.view.scale),
        nx: clampPan(command.view.nx),
        ny: clampPan(command.view.ny),
      },
    }
  }
  if (command.type === 'copy-scroll') {
    return {
      type: 'copy-scroll',
      key: command.key,
      index: Math.max(0, Math.trunc(command.index)),
      top: clampUnit(command.top),
    }
  }
  return { ...command, index: Math.max(0, Math.trunc(command.index)) }
}

export function applyIncoming(
  current: RemoteState | null,
  incoming: RemoteState,
): { state: RemoteState, echo: false } | null {
  if (current && current.key === incoming.key && current.slides.length !== incoming.slides.length) return null
  return { state: tidy(carriedMarkup(current, incoming)), echo: false }
}
