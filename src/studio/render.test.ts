import type { Layout, StudioSlide } from './deck'
import { describe, expect, it } from 'vitest'
import { renderStudioSlide, slidePhotos } from './render'

function sample(layout: Layout, patch: Partial<StudioSlide> = {}): StudioSlide {
  return {
    id: layout,
    title: 'Заголовок',
    body: ['Первая строка', 'Вторая строка'],
    imageSide: 'right',
    images: [
      { src: '/a.webp', alt: 'а' },
      { src: '/b.webp', alt: 'б' },
      { src: '/c.webp', alt: 'в' },
      { src: '/d.webp', alt: 'г' },
      { src: '/e.webp', alt: 'д' },
      { src: '/f.webp', alt: 'е' },
      { src: '/g.webp', alt: 'ё' },
    ],
    cards: [
      { title: 'Одна', body: 'фраза', image: { src: '/card.webp', alt: 'карточка' } },
      { title: 'Две', body: 'ещё', image: null },
      { title: 'Три', body: '', image: null },
      { title: 'Четыре', body: 'конец', image: null },
      { title: 'Лишняя', body: 'не видна', image: null },
    ],
    href: 'https://origamiok.com/learn-to-origami/',
    youtubeId: 'https://www.youtube.com/watch?v=xHDm-Mfa3Sk',
    ...patch,
    layout,
  }
}

describe('studio slides', () => {
  it('renders a cover with one photo and the first line', () => {
    const root = renderStudioSlide(sample('cover'))
    expect(root.classList.contains('paper-cover')).toBe(true)
    expect(root.classList.contains('has-photo')).toBe(true)
    expect(root.querySelector('h1')?.textContent).toBe('Заголовок')
    expect(root.querySelector('.cover-lead')?.textContent).toBe('Первая строка')
    expect(root.querySelectorAll('p')).toHaveLength(1)
    expect(root.querySelectorAll('img')).toHaveLength(1)
    expect(root.querySelector('img')?.getAttribute('src')).toBe('/a.webp')
    expect(root.querySelector('.photo-zoom')?.getAttribute('aria-label')).toBe('На весь экран')
  })

  it('renders a chapter as a single line', () => {
    const root = renderStudioSlide(sample('chapter'))
    expect(root.querySelector('.section-fold')).toBeTruthy()
    expect(root.querySelector('h1')?.textContent).toBe('Заголовок')
    expect(root.querySelector('p')).toBeNull()
    expect(root.querySelector('img')).toBeNull()
  })

  it('puts the split photo on the chosen side and keeps every paragraph', () => {
    const right = renderStudioSlide(sample('split'))
    expect(right.classList.contains('paper-split')).toBe(true)
    expect(right.querySelector('.is-photo-left')).toBeNull()
    expect([...right.querySelectorAll('p')].map(node => node.textContent)).toEqual(['Первая строка', 'Вторая строка'])
    expect(right.querySelectorAll('img')).toHaveLength(1)

    const left = renderStudioSlide(sample('split', { imageSide: 'left', images: [] }))
    expect(left.querySelector('.is-photo-left')).toBeNull()
    expect(left.querySelector('.fold-split')?.classList.contains('solo')).toBe(true)

    const placed = renderStudioSlide(sample('split', { imageSide: 'left' }))
    expect(placed.querySelector('.fold-split')?.classList.contains('is-photo-left')).toBe(true)
    expect(placed.querySelector('img')?.getAttribute('src')).toBe('/a.webp')
  })

  it('shows up to six photos in a grid', () => {
    const root = renderStudioSlide(sample('grid'))
    expect(root.classList.contains('paper-grid')).toBe(true)
    expect(root.dataset.count).toBe('6')
    expect(root.querySelectorAll('.photo-mosaic img')).toHaveLength(6)
    expect(root.querySelector('img')?.getAttribute('src')).toBe('/a.webp')
    expect(root.querySelectorAll('img')[5]?.getAttribute('src')).toBe('/f.webp')
  })

  it('renders cards as text blocks, not links', () => {
    const root = renderStudioSlide(sample('cards'))
    expect(root.classList.contains('paper-cards')).toBe(true)
    expect(root.dataset.count).toBe('4')
    expect(root.querySelector('a')).toBeNull()
    expect(root.querySelectorAll('.paper-card')).toHaveLength(4)
    expect(root.querySelector('.paper-card strong')?.textContent).toBe('Одна')
    expect(root.querySelector('.paper-card img')?.getAttribute('src')).toBe('/card.webp')
    expect(root.querySelector('.card-photo .photo-frame')).toBeNull()
    expect(root.textContent).not.toContain('Лишняя')
  })

  it('renders a quote with an optional photo', () => {
    const plain = renderStudioSlide(sample('quote', { images: [] }))
    expect(plain.classList.contains('has-photo')).toBe(false)
    expect(plain.querySelector('h1')?.textContent).toBe('Заголовок')
    expect(plain.querySelectorAll('p')).toHaveLength(1)
    expect(plain.querySelector('p')?.textContent).toBe('Первая строка')

    const photo = renderStudioSlide(sample('quote'))
    expect(photo.classList.contains('has-photo')).toBe(true)
    expect(photo.querySelectorAll('img')).toHaveLength(1)
  })

  it('renders source and video codes on the end slide', () => {
    const root = renderStudioSlide(sample('end'))
    const source = root.querySelector<HTMLAnchorElement>('[data-qr="source"]')
    const video = root.querySelector<HTMLAnchorElement>('[data-qr="video"]')
    expect(root.classList.contains('paper-end')).toBe(true)
    expect(source?.getAttribute('href')).toBe('https://origamiok.com/learn-to-origami/')
    expect(source?.textContent).toContain('Источник')
    expect(video?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=xHDm-Mfa3Sk')
    expect(video?.textContent).toContain('Видео')
  })
})

function photoPaths(slide: StudioSlide) {
  return slidePhotos(renderStudioSlide(slide)).map(photo => new URL(photo.src, 'http://studio.local').pathname)
}

describe('studio slide photos', () => {
  it('collects a grid in order, a card photo, and nothing from a chapter', () => {
    const grid = renderStudioSlide(sample('grid'))
    expect(slidePhotos(grid).map(photo => photo.alt)).toEqual(['а', 'б', 'в', 'г', 'д', 'е'])
    expect(photoPaths(sample('grid'))).toEqual(['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp', '/f.webp'])
    expect(photoPaths(sample('cards'))).toEqual(['/card.webp'])
    expect(slidePhotos(renderStudioSlide(sample('chapter')))).toEqual([])
  })
})
