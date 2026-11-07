import type { StudioImage, StudioSlide } from './deck'
import { el } from '@zero-dependency/dom'
import { renderSVG } from 'uqr'
import { httpUrl, youtubeIdOf } from './deck'

const GRID_LIMIT = 6
const CARD_LIMIT = 4

function article(className: string) {
  const root = el('article', { className: `slide ${className} is-active` })
  root.setAttribute('aria-hidden', 'false')
  return root
}

function lines(body: string[]) {
  return body.map(item => item.trim()).filter(Boolean)
}

function frame(image: StudioImage, label: string) {
  const slot = el('div', { className: 'photo-slot' })
  const box = el('div', { className: 'photo-frame' })
  const img = el('img', { className: 'sheet-photo' })
  img.src = image.src
  img.alt = image.alt || label
  img.decoding = 'async'
  box.append(img)
  slot.append(box)
  return slot
}

function qrLink(href: string, label: string, kind: string) {
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

function renderCover(slide: StudioSlide) {
  const photo = slide.images[0]
  const root = article(photo ? 'paper-cover has-photo' : 'paper-cover')
  if (!photo) root.append(el('div', { className: 'dog-ear' }))
  const stack = el('div', { className: photo ? 'fold-split cover-model' : 'cover-stack' })
  const copy = el('div')
  const title = el('h1')
  title.textContent = slide.title
  copy.append(title)
  const lead = lines(slide.body)[0]
  if (lead) {
    const note = el('p', { className: 'cover-lead' })
    note.textContent = lead
    copy.append(note)
  }
  stack.append(copy)
  if (photo) stack.append(frame(photo, slide.title))
  root.append(stack)
  return root
}

function renderChapter(slide: StudioSlide) {
  const root = article('paper-section')
  const title = el('h1')
  title.textContent = slide.title
  root.append(el('div', { className: 'section-fold' }), title)
  return root
}

function renderSplit(slide: StudioSlide) {
  const photo = slide.images[0]
  const root = article('paper-step paper-split')
  const split = el('div', { className: photo ? 'fold-split' : 'fold-split solo' })
  if (photo && slide.imageSide === 'left') split.classList.add('is-photo-left')
  const copy = el('div', { className: 'copy' })
  if (slide.title) {
    const title = el('h1')
    title.textContent = slide.title
    copy.append(title)
  }
  const paragraphs = lines(slide.body)
  if (paragraphs.length) {
    const body = el('div', { className: 'copy-body' })
    for (const paragraph of paragraphs) {
      const line = el('p')
      line.textContent = paragraph
      body.append(line)
    }
    copy.append(body)
  }
  split.append(copy)
  if (photo) split.append(frame(photo, slide.title))
  root.append(split)
  return root
}

function renderGrid(slide: StudioSlide) {
  const images = slide.images.slice(0, GRID_LIMIT)
  const root = article('paper-grid')
  root.dataset.count = String(images.length)
  if (slide.title) {
    const title = el('h1')
    title.textContent = slide.title
    root.append(title)
  }
  const mosaic = el('div', { className: 'photo-mosaic' })
  for (const image of images) mosaic.append(frame(image, slide.title))
  root.append(mosaic)
  return root
}

function renderCards(slide: StudioSlide) {
  const cards = slide.cards.slice(0, CARD_LIMIT)
  const root = article('paper-cards')
  root.dataset.count = String(cards.length)
  if (slide.title) {
    const title = el('h1')
    title.textContent = slide.title
    root.append(title)
  }
  const grid = el('div', { className: 'card-grid' })
  grid.style.setProperty('--cards', String(Math.min(Math.max(cards.length, 1), 4)))
  for (const card of cards) {
    const item = el('div', { className: 'paper-card' })
    if (card.image?.src) {
      const photo = el('div', { className: 'card-photo' })
      const img = el('img')
      img.src = card.image.src
      img.alt = card.image.alt || card.title
      photo.append(img)
      item.append(photo)
    }
    const copy = el('div', { className: 'card-copy' })
    const name = el('strong')
    name.textContent = card.title
    copy.append(name)
    if (card.body.trim()) {
      const text = el('p')
      text.textContent = card.body
      copy.append(text)
    }
    item.append(copy)
    grid.append(item)
  }
  root.append(grid)
  return root
}

function renderQuote(slide: StudioSlide) {
  const photo = slide.images[0]
  const root = article(photo ? 'paper-quote has-photo' : 'paper-quote')
  const copy = el('div')
  const title = el('h1')
  title.textContent = slide.title
  copy.append(title)
  const note = lines(slide.body)[0]
  if (note) {
    const text = el('p')
    text.textContent = note
    copy.append(text)
  }
  root.append(copy)
  if (photo) root.append(frame(photo, slide.title))
  return root
}

function renderEnd(slide: StudioSlide) {
  const root = article('paper-end')
  const title = el('h1')
  title.textContent = slide.title
  const row = el('div', { className: 'qr-row' })
  const source = httpUrl(slide.href)
  if (source) row.append(qrLink(source, 'Источник', 'source'))
  const video = youtubeIdOf(slide.youtubeId)
  if (video) row.append(qrLink(`https://www.youtube.com/watch?v=${video}`, 'Видео', 'video'))
  root.append(title, row)
  return root
}

export function renderStudioSlide(slide: StudioSlide) {
  if (slide.layout === 'cover') return renderCover(slide)
  if (slide.layout === 'chapter') return renderChapter(slide)
  if (slide.layout === 'grid') return renderGrid(slide)
  if (slide.layout === 'cards') return renderCards(slide)
  if (slide.layout === 'quote') return renderQuote(slide)
  if (slide.layout === 'end') return renderEnd(slide)
  return renderSplit(slide)
}
