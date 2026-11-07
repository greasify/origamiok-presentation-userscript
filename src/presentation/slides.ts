import type { PageModel, Photo, RelatedCard, SectionBlock } from '../parse-page'
import type { CoverFact } from '../parse/cover'
import { el } from '@zero-dependency/dom'
import { renderSVG } from 'uqr'
import { factLines, toolLines } from '../parse-page'
import { capitalLead } from '../parse/title'
import { cachedTranslation, isCopyHidden } from '../translate'
import { FACT_ICONS, photoFrame } from './dom'
import { photoShow } from './slideshow'

const MATERIAL_HEADING = /^materials?\b/i
const MATERIAL_TITLE = 'Material'

interface SlideModel {
  kind: 'cover' | 'step' | 'section' | 'material' | 'end' | 'related'
  title: string
  body: string[]
  images: Photo[]
  facts: CoverFact[]
  cards: RelatedCard[]
  n: number
  href: string
  youtubeId: string | null
}

export interface RenderedSlide {
  root: HTMLElement
  texts: string[]
}

interface CopySink {
  texts: string[]
  bindings: Map<string, Set<HTMLElement>>
}

function splitLead(paragraphs: string[]) {
  const [first = '', ...rest] = paragraphs.map(item => item.trim()).filter(Boolean)
  const match = first.match(/^.*?[.!?…](?=\s|$)/)
  const title = (match?.[0] ?? first).trim()
  const tail = first.slice(title.length).trim()
  return {
    title,
    body: [tail, ...rest].map(item => item.trim()).filter(Boolean),
  }
}

function uniquePhotos(images: Photo[]) {
  const seen = new Set<string>()
  const unique: Photo[] = []
  for (const image of images) {
    if (seen.has(image.url)) continue
    seen.add(image.url)
    unique.push(image)
  }
  return unique
}

function materialSlide(page: PageModel): SlideModel | null {
  const material = page.sections.find(section => MATERIAL_HEADING.test(section.heading))
  if (!material) return null
  const intro = page.sections.find(section => section.heading === 'Intro')
  const extra = (intro?.images ?? []).filter(image => image.url !== page.hero?.url)
  const images = uniquePhotos([...material.images, ...extra])
  const body = sectionBody(material)
  if (!body.length && !images.length) return null
  return {
    kind: 'material',
    title: MATERIAL_TITLE,
    body,
    images,
    facts: [],
    cards: [],
    n: 0,
    href: '',
    youtubeId: null,
  }
}

function sectionBody(section: SectionBlock) {
  const lists = section.heading === 'Intro' ? [] : section.lists.flat()
  return [...section.paragraphs, ...lists].map(item => item.trim()).filter(Boolean)
}

function slidesOf(page: PageModel): SlideModel[] {
  const slides: SlideModel[] = [{
    kind: 'cover',
    title: page.modelName,
    body: [],
    images: page.hero ? [page.hero] : [],
    facts: [...factLines(page.facts, page.steps.length), ...toolLines(page.steps)],
    cards: [],
    n: 0,
    href: '',
    youtubeId: null,
  }]

  if (page.steps.length > 0) {
    const material = materialSlide(page)
    if (material) slides.push(material)
    for (const step of page.steps) {
      slides.push({
        kind: 'step',
        title: '',
        body: step.paragraphs.map(item => item.trim()).filter(Boolean),
        images: step.images,
        facts: [],
        cards: [],
        n: step.n,
        href: '',
        youtubeId: null,
      })
    }
  } else {
    for (const section of page.sections) {
      const paragraphs = sectionBody(section)
      const images = section.heading === 'Intro'
        ? section.images.filter(image => image.url !== page.hero?.url)
        : section.images
      if (!paragraphs.length && !images.length) continue
      const copy = section.heading === 'Intro'
        ? splitLead(paragraphs)
        : { title: section.heading, body: paragraphs }
      slides.push({
        kind: 'section',
        title: copy.title || page.modelName,
        body: copy.body,
        images,
        facts: [],
        cards: [],
        n: 0,
        href: '',
        youtubeId: null,
      })
    }
  }

  slides.push({
    kind: 'end',
    title: page.modelName,
    body: [],
    images: [],
    facts: [],
    cards: [],
    n: 0,
    href: page.sourceUrl,
    youtubeId: page.youtubeId,
  })

  if (page.related) {
    slides.push({
      kind: 'related',
      title: page.related.heading,
      body: [],
      images: [],
      facts: [],
      cards: page.related.items,
      n: 0,
      href: '',
      youtubeId: null,
    })
  }

  return slides
}

function renderPhotos(images: Photo[], label: string) {
  const first = images[0]
  if (!first) return null
  if (images.length === 1) return photoFrame(first, label)
  return photoShow(images, label)
}

function paint(node: HTMLElement, text: string) {
  node.textContent = node.matches('h1, strong') ? capitalLead(text) : text
}

function bind(node: HTMLElement, source: string, sink: CopySink) {
  const text = source.trim()
  if (!text) return
  node.classList.add('is-copy')
  if (isCopyHidden(text)) node.classList.add('is-hidden')
  node.dataset.source = text
  paint(node, cachedTranslation(text) ?? text)
  const bucket = sink.bindings.get(text) ?? new Set<HTMLElement>()
  bucket.add(node)
  sink.bindings.set(text, bucket)
  sink.texts.push(text)
}

function renderCover(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: slide.images.length ? 'slide paper-cover has-photo' : 'slide paper-cover' })
  if (!slide.images.length) root.append(el('div', { className: 'dog-ear' }))
  const stack = el('div', { className: slide.images.length ? 'fold-split cover-model' : 'cover-stack' })
  const copy = el('div')
  const title = el('h1')
  bind(title, slide.title, sink)
  copy.append(title)
  if (slide.facts.length) {
    const list = el('ul', { className: 'cover-facts' })
    for (const fact of slide.facts) {
      const icon = el('span', { className: 'fact-icon' })
      icon.innerHTML = FACT_ICONS[fact.kind]
      const item = el('li')
      item.append(icon, fact.text)
      list.append(item)
    }
    copy.append(list)
  }
  stack.append(copy)
  const photo = renderPhotos(slide.images, slide.title)
  if (photo) stack.append(photo)
  root.append(stack)
  return root
}

function copyEdge(className: string) {
  const edge = el('div', { className })
  edge.setAttribute('aria-hidden', 'true')
  return edge
}

function renderStep(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: 'slide paper-step' })
  const split = el('div', { className: slide.images.length ? 'fold-split' : 'fold-split solo' })
  const copy = el('div', { className: 'copy' })
  if (slide.kind === 'step') copy.append(el('span', { className: 'step-seal' }, String(slide.n)))
  if (slide.kind !== 'step' && slide.title) {
    const title = el('h1')
    bind(title, slide.title, sink)
    copy.append(title)
  }
  if (slide.body.length) {
    const body = el('div', { className: 'copy-body' })
    body.append(copyEdge('copy-edge copy-edge-top'), copyEdge('copy-edge copy-edge-bottom'))
    for (const paragraph of slide.body) {
      const line = el('p')
      bind(line, paragraph, sink)
      body.append(line)
    }
    copy.append(body)
  }
  split.append(copy)
  const photo = renderPhotos(slide.images, slide.title)
  if (photo) split.append(photo)
  root.append(split)
  return root
}

function renderSection(slide: SlideModel, sink: CopySink) {
  if (slide.images.length) return renderStep(slide, sink)
  const root = el('article', { className: 'slide paper-section' })
  root.append(el('div', { className: 'section-fold' }))
  const title = el('h1')
  bind(title, slide.title, sink)
  root.append(title)
  for (const paragraph of slide.body) {
    const line = el('p')
    bind(line, paragraph, sink)
    root.append(line)
  }
  return root
}

const PRESENTATION_LABEL = 'Презентация'

function qrLink(href: string, label: string, kind: 'pictures' | 'video' | 'presentation') {
  const link = el('a', { className: 'qr-link' })
  link.href = href
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.dataset.qr = kind
  const mark = el('span', { className: 'qr-mark' })
  mark.innerHTML = renderSVG(href, {
    ecc: 'M',
    border: 2,
    blackColor: 'currentColor',
    whiteColor: '#f3ecdf',
  })
  const caption = el('span')
  caption.textContent = label
  link.append(mark, caption)
  return link
}

function renderEnd(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: 'slide paper-end' })
  const title = el('h1')
  bind(title, slide.title, sink)
  root.append(title)
  const row = el('div', { className: 'qr-row' })
  if (slide.href) row.append(qrLink(slide.href, 'С картинками', 'pictures'))
  if (slide.youtubeId) row.append(qrLink(`https://www.youtube.com/watch?v=${slide.youtubeId}`, 'Видео', 'video'))
  const add = el('button', { className: 'qr-add' }, PRESENTATION_LABEL)
  add.type = 'button'
  row.append(add)
  root.append(row)
  return root
}

function renderRelated(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: slide.cards.length > 4 ? 'slide paper-related is-dense' : 'slide paper-related' })
  const title = el('h1')
  bind(title, slide.title, sink)
  const grid = el('div', { className: 'related-grid' })
  grid.style.setProperty('--cards', String(Math.min(slide.cards.length, 4)))
  for (const card of slide.cards) {
    const link = el('a', { className: 'related-card' })
    link.href = card.href
    if (card.image) {
      const photo = el('img')
      photo.src = card.image.url
      photo.alt = card.image.alt || card.title
      link.append(photo)
    }
    const name = el('strong')
    bind(name, card.title, sink)
    link.append(name)
    if (card.meta.length) {
      const meta = el('span', { className: 'related-meta' })
      for (const line of card.meta) {
        const bit = el('span')
        bind(bit, line, sink)
        meta.append(bit)
      }
      link.append(meta)
    }
    grid.append(link)
  }
  root.append(title, grid)
  return root
}

export function renderSlides(page: PageModel) {
  const bindings = new Map<string, Set<HTMLElement>>()
  const rendered: RenderedSlide[] = []

  for (const slide of slidesOf(page)) {
    const sink: CopySink = { texts: [], bindings }
    let root: HTMLElement
    if (slide.kind === 'cover') {
      root = renderCover(slide, sink)
    } else if (slide.kind === 'end') {
      root = renderEnd(slide, sink)
    } else if (slide.kind === 'related') {
      root = renderRelated(slide, sink)
    } else if (slide.kind === 'section' && !slide.images.length) {
      root = renderSection(slide, sink)
    } else {
      root = renderStep(slide, sink)
    }
    root.setAttribute('aria-hidden', 'true')
    rendered.push({ root, texts: sink.texts })
  }

  return { rendered, bindings }
}

export function applyText(bindings: Map<string, Set<HTMLElement>>, source: string, translated: string) {
  bindings.get(source)?.forEach(node => paint(node, translated))
}

export function applyHidden(bindings: Map<string, Set<HTMLElement>>, source: string, hidden: boolean) {
  bindings.get(source)?.forEach(node => node.classList.toggle('is-hidden', hidden))
}

export function applyEndLinks(root: HTMLElement, state: { presentation: string, hidden: readonly string[] }) {
  root.querySelector('[data-qr="pictures"]')?.classList.toggle('is-hidden', state.hidden.includes('pictures'))
  root.querySelector('[data-qr="video"]')?.classList.toggle('is-hidden', state.hidden.includes('video'))
  const row = root.querySelector('.qr-row')
  if (!row) return
  const existing = row.querySelector<HTMLAnchorElement>('[data-qr="presentation"]')
  if (!state.presentation) {
    existing?.remove()
    return
  }
  if (existing?.getAttribute('href') === state.presentation) return
  existing?.remove()
  const link = qrLink(state.presentation, PRESENTATION_LABEL, 'presentation')
  const add = row.querySelector('.qr-add')
  if (add) row.insertBefore(link, add)
  else row.append(link)
}
