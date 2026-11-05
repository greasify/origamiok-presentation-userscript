import type { PageModel, Photo, SectionBlock } from '../parse-page'
import { el } from '@zero-dependency/dom'
import { factLines } from '../parse-page'
import { cachedTranslation } from '../translate'
import { photoFrame } from './dom'

interface SlideModel {
  kind: 'cover' | 'step' | 'section' | 'end'
  title: string
  body: string[]
  images: Photo[]
  facts: string[]
  n: number
  href: string
  author: string
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
    facts: factLines(page.facts, page.steps.length),
    n: 0,
    href: '',
    author: '',
    youtubeId: null,
  }]

  if (page.steps.length > 0) {
    for (const step of page.steps) {
      const copy = splitLead(step.paragraphs)
      slides.push({
        kind: 'step',
        title: copy.title || `Step ${step.n}`,
        body: copy.body,
        images: step.images,
        facts: [],
        n: step.n,
        href: '',
        author: '',
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
        n: 0,
        href: '',
        author: '',
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
    n: 0,
    href: page.sourceUrl,
    author: page.authors.join(', ') || 'OrigamiOK',
    youtubeId: page.youtubeId,
  })

  return slides
}

function renderPhotos(images: Photo[], label: string) {
  const first = images[0]
  if (!first) return null
  if (images.length === 1) return photoFrame(first, label)
  const row = el('div', { className: 'photo-row' })
  for (const [index, image] of images.entries()) {
    row.append(photoFrame(image, image.alt || (index === images.length - 1 ? label : '')))
  }
  return row
}

function bind(node: HTMLElement, source: string, sink: CopySink) {
  const text = source.trim()
  if (!text) return
  node.textContent = cachedTranslation(text) ?? text
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
    for (const fact of slide.facts) list.append(el('li', fact))
    copy.append(list)
  }
  stack.append(copy)
  const photo = renderPhotos(slide.images, slide.title)
  if (photo) stack.append(photo)
  root.append(stack)
  return root
}

function renderStep(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: 'slide paper-step' })
  const split = el('div', { className: slide.images.length ? 'fold-split' : 'fold-split solo' })
  const copy = el('div', { className: 'copy' })
  if (slide.kind === 'step') copy.append(el('span', { className: 'step-seal' }, String(slide.n)))
  const title = el('h1')
  bind(title, slide.title, sink)
  copy.append(title)
  for (const paragraph of slide.body) {
    const line = el('p')
    bind(line, paragraph, sink)
    copy.append(line)
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

function renderEnd(slide: SlideModel, sink: CopySink) {
  const root = el('article', { className: 'slide paper-end' })
  root.append(el('h1', 'Откуда схема'))
  const note = el('p', { className: 'lede' }, 'Фотографии и исходный текст — OrigamiOK.')
  root.append(note)
  const credit = el('p', { className: 'source-credit' })
  const link = el('a')
  link.href = slide.href || '#'
  link.target = '_blank'
  link.rel = 'noreferrer'
  bind(link, slide.title, sink)
  credit.append(link, el('span', slide.author))
  root.append(credit)
  if (slide.youtubeId) {
    const video = el('p', { className: 'source-credit' })
    const watch = el('a', 'Ролик на YouTube')
    watch.href = `https://www.youtube.com/watch?v=${slide.youtubeId}`
    watch.target = '_blank'
    watch.rel = 'noreferrer'
    video.append(watch)
    root.append(video)
  }
  return { root, note }
}

export function renderSlides(page: PageModel) {
  const bindings = new Map<string, Set<HTMLElement>>()
  const rendered: RenderedSlide[] = []
  let note: HTMLElement | null = null

  for (const slide of slidesOf(page)) {
    const sink: CopySink = { texts: [], bindings }
    let root: HTMLElement
    if (slide.kind === 'cover') {
      root = renderCover(slide, sink)
    } else if (slide.kind === 'end') {
      const end = renderEnd(slide, sink)
      root = end.root
      note = end.note
    } else if (slide.kind === 'section' && !slide.images.length) {
      root = renderSection(slide, sink)
    } else {
      root = renderStep(slide, sink)
    }
    root.setAttribute('aria-hidden', 'true')
    rendered.push({ root, texts: sink.texts })
  }

  return { rendered, bindings, note }
}

export function applyText(bindings: Map<string, Set<HTMLElement>>, source: string, translated: string) {
  bindings.get(source)?.forEach((node) => {
    node.textContent = translated
  })
}
