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
    lightbox.root.querySelector<HTMLButtonElement>('[aria-label="Увеличить"]')?.click()
    expect(image?.style.transform).toBe('translate(0px, 0px) scale(1.25)')

    lightbox.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(image?.getAttribute('src')).toBe('https://origamiok.com/1.webp')
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
  })
})
