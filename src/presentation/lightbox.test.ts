import { afterEach, describe, expect, it } from 'vitest'
import { createLightbox } from './lightbox'

function mount() {
  const overlay = document.createElement('div')
  const lightbox = createLightbox(overlay, () => {})
  document.body.append(overlay, lightbox.root)
  return lightbox
}

function photo(lightbox: ReturnType<typeof mount>) {
  return lightbox.root.querySelector<HTMLImageElement>('.lightbox-photo')
}

describe('lightbox photos', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('steps to the next photo and resets the zoom', () => {
    const lightbox = mount()
    lightbox.open([
      { src: 'https://origamiok.com/0.webp', alt: 'One' },
      { src: 'https://origamiok.com/1.webp', alt: 'Two' },
    ], 0)
    const image = photo(lightbox)
    const zoom = lightbox.root.querySelector<HTMLButtonElement>('[aria-label="Увеличить"]')
    zoom?.click()
    expect(image?.style.transform).toBe('translate(0px, 0px) scale(1.5)')
    expect(zoom?.getAttribute('aria-pressed')).toBe('true')
    zoom?.click()
    expect(image?.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(lightbox.root.querySelector('[aria-label="Увеличить"]')?.getAttribute('aria-pressed')).toBe('false')
    lightbox.root.querySelector<HTMLButtonElement>('[aria-label="Увеличить"]')?.click()

    expect(image?.classList.contains('is-entering')).toBe(false)
    lightbox.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(image?.getAttribute('src')).toBe('https://origamiok.com/1.webp')
    expect(image?.classList.contains('is-entering')).toBe(true)
    expect(image?.style.transform).toBe('translate(0px, 0px) scale(1)')

    lightbox.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(image?.getAttribute('src')).toBe('https://origamiok.com/0.webp')
  })

  it('hides the arrows when there is one photo', () => {
    const lightbox = mount()
    lightbox.open([{ src: 'https://origamiok.com/only.webp', alt: 'Only' }], 0)
    expect(lightbox.root.querySelector('[aria-label="Предыдущее фото"]')?.hasAttribute('hidden')).toBe(true)
    expect(lightbox.root.querySelector('[aria-label="Следующее фото"]')?.hasAttribute('hidden')).toBe(true)

    lightbox.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(photo(lightbox)?.getAttribute('src')).toBe('https://origamiok.com/only.webp')
    expect(lightbox.root.querySelector('.photo-dots')?.hasAttribute('hidden')).toBe(true)
  })

  it('marks the active photo and jumps from a dot', () => {
    const lightbox = mount()
    lightbox.open([
      { src: 'https://origamiok.com/0.webp', alt: 'One' },
      { src: 'https://origamiok.com/1.webp', alt: 'Two' },
    ], 0)
    const dots = [...lightbox.root.querySelectorAll<HTMLButtonElement>('.photo-dot')]
    expect(dots).toHaveLength(2)
    expect(lightbox.root.querySelector('.photo-dots')?.hasAttribute('hidden')).toBe(false)
    expect(dots[0]?.classList.contains('is-current')).toBe(true)
    expect(dots[0]?.getAttribute('aria-current')).toBe('true')

    lightbox.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(dots[1]?.classList.contains('is-current')).toBe(true)
    expect(dots[0]?.hasAttribute('aria-current')).toBe(false)

    dots[0]?.click()
    expect(photo(lightbox)?.getAttribute('src')).toBe('https://origamiok.com/0.webp')
    expect(dots[0]?.classList.contains('is-current')).toBe(true)
    expect(dots[0]?.getAttribute('aria-current')).toBe('true')
  })

  it('applies a normalized zoom from the presenter', () => {
    const lightbox = mount()
    lightbox.open([{ src: 'https://origamiok.com/only.webp', alt: 'Only' }], 0)
    lightbox.setView({ scale: 2, nx: 0, ny: 0 })
    expect(photo(lightbox)?.style.transform).toBe('translate(0px, 0px) scale(2)')
    expect(lightbox.root.querySelector('.lightbox-stage')?.classList.contains('is-dragging')).toBe(false)
    expect(lightbox.getView()).toEqual({ scale: 2, nx: 0, ny: 0 })
    lightbox.setView({ scale: 9, nx: 4, ny: -4 })
    expect(photo(lightbox)?.style.transform).toBe('translate(0px, 0px) scale(5)')
    expect(lightbox.getView().scale).toBe(5)
  })
})
