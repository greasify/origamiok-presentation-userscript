import { el } from '@zero-dependency/dom'
import presentationCss from '../presentation.scss?inline'
import { CREASE, FONT_HREF, STAGE_HEIGHT, STAGE_WIDTH } from './dom'
import { applyGroupQr } from './slides'

const READY_MS = 2000

function printRules() {
  return `
html {
  --paper: #f3ecdf;
  --ink: #1c1915;
  --seal: #c23b22;
  --mountain: #243e6a;
  --muted: #5c5146;
  --sans: Onest, 'Avenir Next', 'Segoe UI', sans-serif;
  --display: Unbounded, 'Avenir Next', sans-serif;
  --control: 36px;
  --stamp: 0 8px 16px rgb(28 25 21 / 28%);

  color: var(--ink);
  color-scheme: light;
  background: var(--paper);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.35;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

body {
  margin: 0;
  background: var(--paper);
}

@page {
  size: ${STAGE_WIDTH}px ${STAGE_HEIGHT}px;
  margin: 0;
}

.print-deck .slide {
  position: relative;
  z-index: 0;
  opacity: 1;
  inset: auto;
  overflow: hidden;
  width: ${STAGE_WIDTH}px;
  height: ${STAGE_HEIGHT}px;
  break-after: page;
  page-break-after: always;
  pointer-events: auto;
  background: var(--paper);
}

.print-deck .crease-field {
  z-index: -1;
}

.print-deck .crease-grid {
  inset: 10px;
  width: calc(100% - 20px);
  height: calc(100% - 20px);
}

.print-deck .slide:last-child {
  break-after: auto;
  page-break-after: auto;
}

.print-deck .copy-edge {
  display: none;
}
`
}

function cloneSlide(slide: HTMLElement) {
  const clone = slide.cloneNode(true)
  if (!(clone instanceof HTMLElement)) throw new TypeError('slide clone')
  for (const node of clone.querySelectorAll('.photo-zoom, .photo-progress, .photo-dots')) node.remove()
  for (const frames of clone.querySelectorAll('.photo-frames')) {
    if (frames.querySelector('.photo-slot.is-shown')) continue
    frames.querySelector('.photo-slot')?.classList.add('is-shown')
  }
  const field = el('div', { className: 'crease-field' })
  field.innerHTML = CREASE
  clone.prepend(field)
  return clone
}

function printable(slide: HTMLElement) {
  return !slide.classList.contains('paper-related')
}

export function buildPrintDeck(slides: readonly HTMLElement[]) {
  const deck = el('div', { className: 'print-deck' })
  for (const slide of slides) {
    if (!printable(slide)) continue
    const clone = cloneSlide(slide)
    if (clone.classList.contains('paper-end')) applyGroupQr(clone)
    deck.append(clone)
  }
  return deck
}

interface CopyChunk {
  sample: HTMLElement
  words: string[]
}

function wordsOf(node: HTMLElement) {
  return (node.textContent ?? '').trim().split(/\s+/).filter(Boolean)
}

function chunkText(chunk: CopyChunk) {
  const original = wordsOf(chunk.sample)
  const whole = chunk.words.length === original.length && chunk.words.every((word, index) => word === original[index])
  if (whole) return (chunk.sample.textContent ?? '').trim()
  return chunk.words.join(' ')
}

function renderChunks(body: HTMLElement, edges: readonly HTMLElement[], chunks: readonly CopyChunk[]) {
  const nodes = chunks.map((chunk) => {
    const node = chunk.sample.cloneNode(false)
    if (!(node instanceof HTMLElement)) throw new TypeError('copy chunk')
    node.textContent = chunkText(chunk)
    return node
  })
  body.replaceChildren(...edges, ...nodes)
}

function fitCount(total: number, overflows: (count: number) => boolean) {
  if (total === 0 || !overflows(total)) return total
  let best = 0
  let low = 1
  let high = total - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (!overflows(mid)) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

function packChunks(chunks: readonly CopyChunk[], overflows: (chunks: readonly CopyChunk[]) => boolean) {
  const pages: CopyChunk[][] = []
  let page: CopyChunk[] = []
  for (const chunk of chunks) {
    let taken = 0
    while (taken < chunk.words.length) {
      const rest = chunk.words.slice(taken)
      const count = fitCount(rest.length, count => overflows([...page, { sample: chunk.sample, words: rest.slice(0, count) }]))
      if (count === 0) {
        if (page.length) {
          pages.push(page)
          page = []
          continue
        }
        pages.push([{ sample: chunk.sample, words: rest.slice(0, 1) }])
        taken += 1
        continue
      }
      page.push({ sample: chunk.sample, words: rest.slice(0, count) })
      taken += count
      if (taken < chunk.words.length) {
        pages.push(page)
        page = []
      }
    }
  }
  if (page.length) pages.push(page)
  return pages
}

function scrolling(body: HTMLElement) {
  return body.scrollHeight - body.clientHeight > 1
}

function continuation(slide: HTMLElement, overflows: (body: HTMLElement) => boolean) {
  const body = slide.querySelector<HTMLElement>('.copy-body')
  if (!body || !overflows(body)) return []
  const edges = [...body.querySelectorAll<HTMLElement>(':scope > .copy-edge')]
  const chunks = [...body.querySelectorAll<HTMLElement>(':scope > p, :scope > li')]
    .filter(node => !node.classList.contains('is-hidden'))
    .flatMap((node) => {
      const words = wordsOf(node)
      return words.length ? [{ sample: node, words }] : []
    })
  if (!chunks.length) return []
  const pages = packChunks(chunks, (next) => {
    renderChunks(body, edges, next)
    return overflows(body)
  })
  const [first, ...rest] = pages
  if (first) renderChunks(body, edges, first)
  return rest.map((page) => {
    const clone = slide.cloneNode(true)
    if (!(clone instanceof HTMLElement)) throw new TypeError('slide clone')
    const copy = clone.querySelector<HTMLElement>('.copy-body')
    if (!copy) return clone
    const cloneEdges = [...copy.querySelectorAll<HTMLElement>(':scope > .copy-edge')]
    renderChunks(copy, cloneEdges, page)
    return clone
  })
}

export function spreadScrollingSlides(deck: HTMLElement, overflows: (body: HTMLElement) => boolean = scrolling) {
  for (const slide of [...deck.querySelectorAll<HTMLElement>(':scope > .slide')]) {
    let anchor: HTMLElement = slide
    for (const extra of continuation(slide, overflows)) {
      anchor.after(extra)
      anchor = extra
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function mountFrame() {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.left = '-10000px'
  frame.style.top = '0'
  frame.style.width = `${STAGE_WIDTH}px`
  frame.style.height = `${STAGE_HEIGHT}px`
  frame.style.border = '0'
  document.body.append(frame)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    throw new Error('print frame')
  }
  const font = doc.createElement('link')
  font.rel = 'stylesheet'
  font.href = FONT_HREF
  const theme = doc.createElement('style')
  theme.textContent = presentationCss
  const print = doc.createElement('style')
  print.textContent = printRules()
  doc.head.append(font, theme, print)
  return frame
}

async function waitReady(doc: Document) {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
  const sheet = new Promise<void>((resolve) => {
    if (!link || link.sheet) {
      resolve()
      return
    }
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
  })
  const images = [...doc.images].map((image) => {
    if (!image.decode) return Promise.resolve()
    return image.decode().catch(() => {})
  })
  const fonts = sheet.then(() => doc.fonts?.ready)
  await Promise.race([
    Promise.all([fonts, ...images]),
    delay(READY_MS),
  ])
}

function whenPrinted(win: Window) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      win.removeEventListener('afterprint', finish)
      resolve()
    }
    win.addEventListener('afterprint', finish)
    win.print()
  })
}

export async function printSlides(slides: readonly HTMLElement[], title: string) {
  const frame = mountFrame()
  const previousTitle = document.title
  document.title = title
  try {
    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) throw new Error('print frame')
    doc.title = title
    const deck = buildPrintDeck(slides)
    doc.body.append(deck)
    await waitReady(doc)
    spreadScrollingSlides(deck)
    await whenPrinted(win)
  } finally {
    document.title = previousTitle
    frame.remove()
  }
}
