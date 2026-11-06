import type {
  Facts,
  Photo,
  RelatedBlock,
  RelatedCard,
  SectionBlock,
  StepBlock,
} from './types'
import { capturePaper } from './cover'
import { cleanModelTitle } from './title'

interface DraftImage extends Photo {
  width: number
}

interface Draft {
  kind: 'step' | 'section'
  n: number
  heading: string
  paragraphs: string[]
  lists: string[][]
  images: DraftImage[]
  skip: boolean
}

const POST_GRID = '.wp-block-kadence-postgrid, .kt-blocks-post-loop-block'
const SKIP = `${POST_GRID}, #comments, .comments-area, .comment-list`
const HEADING = new Set(['H2', 'H3', 'H4'])
const SKIP_HEADING = /^(?:what['’]?s next|other origami|related(?:\s+posts)?|comments)\b/i
const SKIP_RELATED_HEADING = /^(?:similar posts|comments)\b/i
const NAME = String.raw`[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}`

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim()

function absoluteUrl(raw: string, base: string) {
  if (!raw || raw.startsWith('data:')) return ''
  try {
    return new URL(raw, base).href
  } catch {
    return ''
  }
}

function imageKey(url: string) {
  try {
    const base = new URL(url).pathname.split('/').pop() ?? url
    return base.replace(/-\d+x\d+(?=\.)/i, '').replace(/-scaled(?=\.)/i, '').toLowerCase()
  } catch {
    return url
  }
}

function rememberImage(images: DraftImage[], image: DraftImage) {
  if (!image.url) return
  const key = imageKey(image.url)
  const index = images.findIndex(item => imageKey(item.url) === key)
  if (index === -1) {
    images.push(image)
    return
  }
  const current = images[index]
  if (!current || image.width < current.width) return
  images[index] = { ...image, alt: image.alt || current.alt }
}

function pickImageUrl(img: HTMLImageElement, base: string) {
  const candidates: Array<{ url: string, width: number }> = []
  const push = (raw: string, width: number) => {
    const url = absoluteUrl(raw, base)
    if (!url || !url.includes('/wp-content/uploads/')) return
    candidates.push({ url, width: Number.isFinite(width) ? width : 0 })
  }

  const src = img.dataset.origFile
    || img.dataset.largeFile
    || img.dataset.lazySrc
    || img.dataset.src
    || img.getAttribute('src')
    || ''
  const declared = Number(img.getAttribute('width')) || 0
  push(src, declared)

  const srcset = img.getAttribute('srcset') || img.dataset.srcset || img.dataset.lazySrcset || ''
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/)
    const size = bits[1] ?? ''
    const width = size.endsWith('w') ? Number(size.slice(0, -1)) || 0 : 0
    push(bits[0] ?? '', width)
  }

  candidates.sort((a, b) => b.width - a.width)
  const best = candidates[0]
  if (!best || (best.width > 0 && best.width < 180)) return null

  const caption = cleanText(img.closest('figure')?.querySelector('figcaption')?.textContent ?? '')
  return { url: best.url, alt: cleanText(img.alt) || caption, width: best.width }
}

function collectImages(node: Element, images: DraftImage[], base: string) {
  const imgs = node instanceof HTMLImageElement ? [node] : [...node.querySelectorAll('img')]
  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement) || img.closest(SKIP)) continue
    const picked = pickImageUrl(img, base)
    if (picked) rememberImage(images, picked)
  }
}

function emptyDraft(kind: Draft['kind'], heading: string, n = 0): Draft {
  return {
    kind,
    n,
    heading,
    paragraphs: [],
    lists: [],
    images: [],
    skip: false,
  }
}

function pushDraft(blocks: Draft[], current: Draft) {
  if (current.skip) return
  const filled = current.paragraphs.length > 0 || current.lists.length > 0 || current.images.length > 0
  if (filled || current.kind === 'step') blocks.push(current)
}

function listItems(node: Element) {
  return [...node.children]
    .filter(child => child.tagName === 'LI')
    .map(child => cleanText(child.textContent ?? ''))
    .filter(Boolean)
}

function blocksFrom(content: Element, base: string) {
  const nodes = [...content.querySelectorAll('h2, h3, h4, p, figure, ul, ol')]
    .filter(node => !node.closest(SKIP) && !node.parentElement?.closest('figure, ul, ol'))

  const blocks: Draft[] = []
  let current = emptyDraft('section', 'Intro')

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    if (HEADING.has(node.tagName)) {
      const heading = cleanText(node.textContent ?? '')
      if (!heading) continue
      pushDraft(blocks, current)
      const step = heading.match(/^step\s+(\d+)\b/i)
      const stepNo = Number(step?.[1])
      if (step && Number.isFinite(stepNo)) {
        current = emptyDraft('step', heading, stepNo)
        continue
      }
      current = emptyDraft('section', heading)
      current.skip = SKIP_HEADING.test(heading)
      continue
    }

    if (current.skip) continue
    if (node.tagName === 'P') {
      const text = cleanText(node.textContent ?? '')
      if (text) current.paragraphs.push(text)
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const items = listItems(node)
      if (!items.length) continue
      if (current.kind === 'step') current.paragraphs.push(...items)
      else current.lists.push(items)
    }
    collectImages(node, current.images, base)
  }

  pushDraft(blocks, current)
  return blocks
}

const toPhotos = (images: DraftImage[]): Photo[] => images.map(({ url, alt }) => ({ url, alt }))

function relatedCards(grid: Element, base: string) {
  const cards: RelatedCard[] = []
  for (const item of grid.querySelectorAll('.kt-blocks-post-grid-item')) {
    const href = absoluteUrl(item.querySelector('a[href]')?.getAttribute('href') ?? '', base)
    const rawTitle = cleanText(item.querySelector('h3')?.textContent ?? '')
    const title = cleanModelTitle(rawTitle)
    if (!href || !title) continue
    const img = item.querySelector('img')
    const picked = img instanceof HTMLImageElement ? pickImageUrl(img, base) : null
    const meta = [...item.querySelectorAll('p')]
      .map(node => cleanText(node.textContent ?? ''))
      .filter(text => text && text.length < 40 && text !== rawTitle && text !== title)
    cards.push({
      title,
      href,
      image: picked ? { url: picked.url, alt: picked.alt } : null,
      meta,
    })
  }
  return cards
}

function relatedFrom(content: Element, base: string): RelatedBlock | null {
  const children = [...content.children]
  let related: RelatedBlock | null = null
  for (let index = 0; index < children.length; index++) {
    const node = children[index]
    if (!node || node.tagName !== 'H2') continue
    const heading = cleanText(node.textContent ?? '')
    if (!heading || SKIP_RELATED_HEADING.test(heading)) continue
    let grid: Element | null = null
    for (let next = index + 1; next < children.length; next++) {
      const sibling = children[next]
      if (!sibling || sibling.tagName === 'H2') break
      if (sibling.matches(POST_GRID)) {
        grid = sibling
        break
      }
    }
    if (!grid) continue
    const items = relatedCards(grid, base)
    if (items.length) related = { heading, items }
  }
  return related
}

function extractFacts(text: string): Facts {
  const minutes = text.match(/folding time:\s*(\d+)\s*minutes?/i) || text.match(/(\d+)\s*minutes?/i)
  const steps = text.match(/total\s+steps:\s*(\d+)/i)
  const difficulty = text.match(/difficulty:\s*(easy|intermediate|advanced|beginner(?: friendly)?)/i)
  return {
    minutes: minutes ? Number(minutes[1]) : null,
    paper: capturePaper(text),
    steps: steps ? Number(steps[1]) : null,
    difficulty: difficulty ? cleanText(difficulty[1] ?? '').replace(/[.,]$/, '') : null,
  }
}

function youtubeIdFrom(source: string) {
  const match = source.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/i)
  return match?.[1] ?? null
}

function bylineFrom(text: string) {
  const written = text.match(new RegExp(String.raw`\bWritten by\s+(${NAME})`, 'u'))
  const by = text.match(new RegExp(String.raw`\bBy\s+(${NAME})`, 'u'))
  return cleanText(written?.[1] ?? by?.[1] ?? '')
}

function ogPhoto(doc: Document): Photo | null {
  const raw = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
  const url = absoluteUrl(raw, doc.baseURI)
  if (!url || !url.includes('/wp-content/uploads/')) return null
  return { url, alt: '' }
}

function authorsFrom(doc: Document, content: Element) {
  const label = doc.querySelector('meta[name="twitter:label1"]')?.getAttribute('content') ?? ''
  const data = doc.querySelector('meta[name="twitter:data1"]')?.getAttribute('content') ?? ''
  const writtenBy = /written by/i.test(label) ? cleanText(data) : ''
  const header = cleanText(doc.querySelector('article .entry-header, article header')?.textContent ?? '')
  const body = cleanText(content.textContent ?? '')
  return [...new Set([writtenBy, bylineFrom(header), bylineFrom(body)].filter(Boolean))]
}

export interface ArticleDraft {
  rawTitle: string
  sourceUrl: string
  authors: string[]
  facts: Facts
  youtubeId: string | null
  hero: Photo | null
  steps: StepBlock[]
  sections: SectionBlock[]
  related: RelatedBlock | null
}

export function walkArticle(doc: Document, content: Element): ArticleDraft {
  const blocks = blocksFrom(content, doc.baseURI)
  const sections: SectionBlock[] = []
  const steps: StepBlock[] = []

  for (const block of blocks) {
    const images = toPhotos(block.images)
    if (block.kind === 'step') {
      steps.push({ n: block.n, paragraphs: block.paragraphs, images })
      continue
    }
    sections.push({
      heading: block.heading,
      paragraphs: block.paragraphs,
      lists: block.lists,
      images,
    })
  }

  const rawTitle = cleanText(
    doc.querySelector('article h1')?.textContent
    || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || doc.title,
  )
  const sourceUrl = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
    || doc.querySelector('meta[property="og:url"]')?.getAttribute('content')
    || doc.location?.href
    || ''

  return {
    rawTitle,
    sourceUrl,
    authors: authorsFrom(doc, content),
    facts: extractFacts(cleanText(content.textContent ?? '')),
    youtubeId: youtubeIdFrom(content.innerHTML),
    hero: sections.find(section => section.images.length > 0)?.images[0] ?? ogPhoto(doc),
    steps,
    sections,
    related: relatedFrom(content, doc.baseURI),
  }
}
