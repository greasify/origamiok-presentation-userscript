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
    applyText(bindings, 'leave it flat.', 'оставь лист.')
    expect(step?.querySelector('p')?.textContent).toBe('оставь лист.')

    const related = rendered.at(-1)?.root
    applyText(bindings, 'frog face', 'лицо лягушки')
    expect(related?.querySelector('strong')?.textContent).toBe('Лицо лягушки')
  })
})
