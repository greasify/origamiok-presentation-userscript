export const LAYOUTS = ['cover', 'chapter', 'split', 'grid', 'cards', 'quote', 'end'] as const

export type Layout = typeof LAYOUTS[number]

export const LAYOUT_LABEL: Record<Layout, string> = {
  cover: 'Обложка',
  chapter: 'Глава',
  split: 'Текст и фото',
  grid: 'Сетка',
  cards: 'Карточки',
  quote: 'Цитата',
  end: 'Конец',
}

export interface StudioImage {
  src: string
  alt: string
}

export interface StudioCard {
  title: string
  body: string
  image: StudioImage | null
}

export interface StudioSlide {
  id: string
  layout: Layout
  title: string
  body: string[]
  imageSide: 'left' | 'right'
  images: StudioImage[]
  cards: StudioCard[]
  href: string
  youtubeId: string
}

export interface Deck {
  id: string
  title: string
  slides: StudioSlide[]
}

export interface DeckSummary {
  id: string
  title: string
}

export interface LibraryImage {
  src: string
  name: string
}

export interface LibraryGroup {
  id: string
  title: string
  images: LibraryImage[]
}

const DECK_ID = /^[a-z0-9-]+$/
const SLIDE_ID = /^[\w-]+$/

export function isLayout(value: string): value is Layout {
  return (LAYOUTS as readonly string[]).includes(value)
}

export function blankCard(): StudioCard {
  return { title: 'Карточка', body: '', image: null }
}

export function blankSlide(layout: Layout = 'chapter'): StudioSlide {
  return {
    id: crypto.randomUUID(),
    layout,
    title: layout === 'chapter' ? 'Новая глава' : 'Новый слайд',
    body: [],
    imageSide: 'right',
    images: [],
    cards: layout === 'cards' ? [blankCard(), blankCard()] : [],
    href: '',
    youtubeId: '',
  }
}

export function youtubeIdOf(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)
  const found = match?.[1]
  if (found) return found
  if (/^[\w-]{6,}$/.test(trimmed)) return trimmed
  return ''
}

export function httpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function parseImage(value: unknown): StudioImage | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.src !== 'string' || !record.src.trim()) return null
  return {
    src: record.src.trim(),
    alt: typeof record.alt === 'string' ? record.alt : '',
  }
}

function parseCard(value: unknown): StudioCard | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.title !== 'string') return null
  let image: StudioImage | null = null
  if (record.image != null) {
    image = parseImage(record.image)
    if (!image) return null
  }
  return {
    title: record.title,
    body: typeof record.body === 'string' ? record.body : '',
    image,
  }
}

function parseSlide(value: unknown): StudioSlide | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !SLIDE_ID.test(record.id)) return null
  if (typeof record.layout !== 'string' || !isLayout(record.layout)) return null
  if (typeof record.title !== 'string') return null
  if (!Array.isArray(record.body) || record.body.some(item => typeof item !== 'string')) return null
  if (!Array.isArray(record.images)) return null
  if (!Array.isArray(record.cards)) return null
  const images: StudioImage[] = []
  for (const item of record.images) {
    const image = parseImage(item)
    if (!image) return null
    images.push(image)
  }
  const cards: StudioCard[] = []
  for (const item of record.cards) {
    const card = parseCard(item)
    if (!card) return null
    cards.push(card)
  }
  return {
    id: record.id,
    layout: record.layout,
    title: record.title,
    body: record.body,
    imageSide: record.imageSide === 'left' ? 'left' : 'right',
    images,
    cards,
    href: typeof record.href === 'string' ? record.href : '',
    youtubeId: typeof record.youtubeId === 'string' ? record.youtubeId : '',
  }
}

export function parseDeck(value: unknown): Deck | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !DECK_ID.test(record.id)) return null
  if (typeof record.title !== 'string') return null
  if (!Array.isArray(record.slides)) return null
  const slides: StudioSlide[] = []
  for (const item of record.slides) {
    const slide = parseSlide(item)
    if (!slide) return null
    slides.push(slide)
  }
  return { id: record.id, title: record.title, slides }
}

export function parseDeckList(value: unknown): DeckSummary[] {
  if (!Array.isArray(value)) return []
  const list: DeckSummary[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.title !== 'string') continue
    if (!DECK_ID.test(record.id)) continue
    list.push({ id: record.id, title: record.title })
  }
  return list
}

export function parseLibrary(value: unknown): LibraryGroup[] {
  if (!Array.isArray(value)) return []
  const groups: LibraryGroup[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.title !== 'string') continue
    if (!Array.isArray(record.images)) continue
    const images: LibraryImage[] = []
    for (const image of record.images) {
      if (!image || typeof image !== 'object') continue
      const photo = image as Record<string, unknown>
      if (typeof photo.src !== 'string' || typeof photo.name !== 'string') continue
      images.push({ src: photo.src, name: photo.name })
    }
    groups.push({ id: record.id, title: record.title, images })
  }
  return groups
}
