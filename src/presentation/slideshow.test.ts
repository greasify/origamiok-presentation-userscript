import type { PageModel } from '../parse-page'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderSlides } from './slides'
import { photoShow } from './slideshow'

const page: PageModel = {
  sourceUrl: 'https://origamiok.com/origami-swan/',
  modelName: 'swan',
  authors: [],
  facts: { minutes: null, paper: null, steps: null, difficulty: null },
  youtubeId: null,
  hero: null,
  steps: [],
  sections: [],
  related: null,
}

function visibleSrc(show: HTMLElement) {
  return show.querySelector('.photo-slot:not([hidden]) img')?.getAttribute('src')
}

function mount() {
  const show = photoShow([
    { url: 'https://origamiok.com/0.webp', alt: 'One' },
    { url: 'https://origamiok.com/1.webp', alt: 'Two' },
    { url: 'https://origamiok.com/2.webp', alt: 'Three' },
  ], 'Swan')
  const slide = document.createElement('article')
  slide.className = 'slide is-active'
  slide.append(show)
  document.body.append(slide)
  return show
}

describe('photo slideshow', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('advances after ten seconds, jumps from a dot, and pauses over the photo', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
    const show = mount()
    expect(visibleSrc(show)).toBe('https://origamiok.com/0.webp')

    vi.advanceTimersByTime(5200)
    expect(visibleSrc(show)).toBe('https://origamiok.com/0.webp')
    vi.advanceTimersByTime(5000)
    expect(visibleSrc(show)).toBe('https://origamiok.com/1.webp')

    let bubbled = false
    show.addEventListener('click', () => {
      bubbled = true
    })
    show.querySelectorAll<HTMLButtonElement>('.photo-dot')[2]?.click()
    expect(bubbled).toBe(false)
    expect(visibleSrc(show)).toBe('https://origamiok.com/2.webp')
    expect(show.querySelector<HTMLElement>('.photo-progress span')?.style.transform).toBe('scaleX(0)')

    show.querySelector('.photo-frames')?.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(10200)
    expect(visibleSrc(show)).toBe('https://origamiok.com/2.webp')
  })

  it('leaves a single photo without dots or a progress line', () => {
    const { rendered } = renderSlides({
      ...page,
      steps: [{
        n: 1,
        paragraphs: ['fold the corner'],
        images: [{ url: 'https://origamiok.com/only.webp', alt: 'Only' }],
      }],
    })
    const step = rendered[1]?.root
    expect(step?.querySelector('.photo-dot')).toBeNull()
    expect(step?.querySelector('.photo-progress')).toBeNull()
    expect(step?.querySelector('img')?.getAttribute('src')).toBe('https://origamiok.com/only.webp')
  })
})
