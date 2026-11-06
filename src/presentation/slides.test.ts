import type { PageModel } from '../parse-page'
import { describe, expect, it } from 'vitest'
import { applyText, renderSlides } from './slides'

const page: PageModel = {
  sourceUrl: 'https://origamiok.com/origami-swan/',
  modelName: 'swan',
  authors: [],
  facts: { minutes: null, paper: null, steps: null, difficulty: null },
  youtubeId: null,
  hero: null,
  steps: [{ n: 1, paragraphs: ['fold the corner. leave it flat.'], images: [] }],
  sections: [],
  related: {
    heading: 'other ideas',
    items: [{
      title: 'frog face',
      href: 'https://origamiok.com/origami-frog-face/',
      image: null,
      meta: [],
    }],
  },
}

describe('headings', () => {
  it('keeps a capital letter after translation', () => {
    const { rendered, bindings } = renderSlides(page)
    const cover = rendered[0]?.root
    expect(cover?.querySelector('h1')?.textContent).toBe('Swan')

    applyText(bindings, 'swan', 'лебедь')
    expect(cover?.querySelector('h1')?.textContent).toBe('Лебедь')

    const step = rendered[1]?.root
    expect(step?.querySelector('h1')).toBeNull()
    expect(step?.querySelector('p')?.textContent).toBe('fold the corner. leave it flat.')
    applyText(bindings, 'fold the corner. leave it flat.', 'сложи угол. оставь лист.')
    expect(step?.querySelector('p')?.textContent).toBe('сложи угол. оставь лист.')

    const related = rendered.at(-1)?.root
    applyText(bindings, 'frog face', 'лицо лягушки')
    expect(related?.querySelector('strong')?.textContent).toBe('Лицо лягушки')
  })
})

const hero = { url: 'https://origamiok.com/hero.webp', alt: 'Finished' }
const detail = { url: 'https://origamiok.com/detail.webp', alt: 'Detail' }
const paper = { url: 'https://origamiok.com/paper.webp', alt: 'Paper' }

function instruction(heading: string): PageModel {
  return {
    ...page,
    hero,
    sections: [
      {
        heading: 'Intro',
        paragraphs: ['A long neck.'],
        lists: [],
        images: [hero, detail],
      },
      {
        heading,
        paragraphs: ['Use duo paper.'],
        lists: [['15 cm']],
        images: [paper, hero],
      },
    ],
  }
}

describe('material slide', () => {
  it('follows the cover on an instruction and keeps the spare intro photo', () => {
    const { rendered, bindings } = renderSlides(instruction('Material'))
    const cover = rendered[0]?.root
    expect(cover?.querySelector('img')?.getAttribute('src')).toBe(hero.url)
    expect(cover?.querySelectorAll('img')).toHaveLength(1)

    const material = rendered[1]?.root
    expect(material?.querySelector('h1')?.textContent).toBe('Material')
    expect([...material?.querySelectorAll('p') ?? []].map(node => node.textContent)).toEqual([
      'Use duo paper.',
      '15 cm',
    ])
    expect([...material?.querySelectorAll('img') ?? []].map(node => node.getAttribute('src'))).toEqual([
      paper.url,
      hero.url,
      detail.url,
    ])
    expect(bindings.has('Material for Origami Swan')).toBe(false)

    applyText(bindings, 'Material', 'материал')
    expect(material?.querySelector('h1')?.textContent).toBe('Материал')

    const step = rendered[2]?.root
    expect(step?.querySelector('h1')).toBeNull()
    expect(step?.querySelector('.step-seal')?.textContent).toBe('1')
  })

  it('ignores a longer material heading and pages without steps', () => {
    const named = renderSlides(instruction('Material for Origami Swan'))
    expect(named.rendered[1]?.root.querySelector('h1')).toBeNull()
    expect(named.rendered[1]?.root.querySelector('.step-seal')?.textContent).toBe('1')

    const article = renderSlides({ ...instruction('Material'), steps: [] })
    const headings = article.rendered.map(slide => slide.root.querySelector('h1')?.textContent)
    expect(headings.filter(title => title === 'Material')).toEqual(['Material'])
  })
})
