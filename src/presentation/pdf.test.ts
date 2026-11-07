import { describe, expect, it } from 'vitest'
import { buildPrintDeck, spreadScrollingSlides } from './pdf'

function slide(html: string) {
  const root = document.createElement('article')
  root.className = 'slide paper-step'
  root.innerHTML = html
  return root
}

describe('print deck', () => {
  it('keeps one page per slide, including a hidden line', () => {
    const cover = slide('<h1>Лебедь</h1>')
    const step = slide('<p class="is-copy">Сложи угол</p><p class="is-copy is-hidden">hide me</p>')
    const coverHtml = cover.innerHTML
    const deck = buildPrintDeck([cover, step])
    const pages = [...deck.querySelectorAll('.slide')]

    expect(deck.classList.contains('print-deck')).toBe(true)
    expect(deck.classList.contains('stage')).toBe(false)
    expect(pages).toHaveLength(2)
    expect(pages[0]?.querySelector('h1')?.textContent).toBe('Лебедь')
    expect(pages[1]?.querySelector('p')?.textContent).toBe('Сложи угол')
    expect(pages[1]?.querySelector('.is-hidden')?.textContent).toBe('hide me')
    expect(pages[0]?.querySelector('.crease-field .crease-grid')).not.toBeNull()
    expect(pages[1]?.querySelector('.crease-grid')).not.toBeNull()
    expect(cover.querySelector('.crease-grid')).toBeNull()
    expect(cover.innerHTML).toBe(coverHtml)
  })

  it('drops zoom chrome and keeps the shown photo', () => {
    const root = slide(`
      <div class="photo-frames">
        <div class="photo-slot"><img alt="one"><button class="photo-zoom"></button></div>
        <div class="photo-slot is-shown">
          <img alt="two">
          <button class="photo-zoom"></button>
          <div class="photo-progress"></div>
          <div class="photo-dots"></div>
        </div>
      </div>
    `)
    const deck = buildPrintDeck([root])
    const page = deck.querySelector('.slide')
    const slots = page?.querySelectorAll('.photo-slot')

    expect(page?.querySelector('.photo-zoom')).toBeNull()
    expect(page?.querySelector('.photo-progress')).toBeNull()
    expect(page?.querySelector('.photo-dots')).toBeNull()
    expect(slots?.[0]?.classList.contains('is-shown')).toBe(false)
    expect(slots?.[1]?.classList.contains('is-shown')).toBe(true)
    expect(slots?.[1]?.querySelector('img')?.getAttribute('alt')).toBe('two')
    expect(root.querySelector('.photo-zoom')).not.toBeNull()
    expect(root.querySelector('.photo-dots')).not.toBeNull()
  })

  it('leaves out the qr slide and the related ideas', () => {
    const step = slide('<p>Сложи угол</p>')
    const end = document.createElement('article')
    end.className = 'slide paper-end'
    end.innerHTML = '<h1>Swan</h1><a class="qr-link"><span class="qr-mark"></span><span>С картинками</span></a>'
    const related = document.createElement('article')
    related.className = 'slide paper-related'
    related.innerHTML = '<h1>Other ideas</h1>'
    const deck = buildPrintDeck([step, end, related])
    const pages = [...deck.querySelectorAll('.slide')]

    expect(pages).toHaveLength(1)
    expect(pages[0]?.querySelector('p')?.textContent).toBe('Сложи угол')
    expect(pages[0]?.querySelector('.qr-link')).toBeNull()
    expect(end.querySelector('.qr-link')).not.toBeNull()
    expect(related.querySelector('h1')?.textContent).toBe('Other ideas')
  })

  function step(paragraphs: string[]) {
    const root = document.createElement('article')
    root.className = 'slide paper-step'
    const lines = paragraphs.map(text => `<p class="is-copy">${text}</p>`).join('')
    root.innerHTML = `
      <div class="fold-split">
        <div class="copy">
          <span class="step-seal">2</span>
          <div class="copy-body">
            <div class="copy-edge copy-edge-top"></div>
            <div class="copy-edge copy-edge-bottom"></div>
            ${lines}
            <p class="is-copy is-hidden">скрытая строка</p>
          </div>
        </div>
        <img class="sheet-photo" alt="fold">
      </div>
    `
    return root
  }

  function wordCount(body: HTMLElement) {
    return [...body.querySelectorAll('p')].reduce((sum, line) => {
      const words = (line.textContent ?? '').trim().split(/\s+/).filter(Boolean)
      return sum + words.length
    }, 0)
  }

  it('keeps a step that already fits on one page', () => {
    const root = step(['one two'])
    const deck = document.createElement('div')
    deck.append(root)
    spreadScrollingSlides(deck, body => wordCount(body) > 4)

    expect(deck.querySelectorAll('.slide')).toHaveLength(1)
    expect(root.querySelector('p')?.textContent).toBe('one two')
    expect(root.querySelector('.is-hidden')?.textContent).toBe('скрытая строка')
  })

  it('continues a scrolling step on the next page', () => {
    const root = step(['one two three four five six'])
    const deck = document.createElement('div')
    deck.append(root)
    spreadScrollingSlides(deck, body => wordCount(body) > 3)
    const pages = [...deck.querySelectorAll('.slide')]

    expect(pages.map(page => [...page.querySelectorAll('.copy-body p')].map(line => line.textContent))).toEqual([
      ['one two three'],
      ['four five six'],
    ])
    expect(pages[1]?.querySelector('.step-seal')?.textContent).toBe('2')
    expect(pages[1]?.querySelector('img')?.getAttribute('alt')).toBe('fold')
    expect(pages[0]?.querySelector('.is-hidden')).toBeNull()
    expect(pages[1]?.querySelector('.is-hidden')).toBeNull()
  })

  it('fills the rest of a page before continuing the next paragraph', () => {
    const root = step(['one two', 'three four five six'])
    const deck = document.createElement('div')
    deck.append(root)
    spreadScrollingSlides(deck, body => wordCount(body) > 4)
    const pages = [...deck.querySelectorAll('.slide')]

    expect(pages.map(page => [...page.querySelectorAll('.copy-body p')].map(line => line.textContent))).toEqual([
      ['one two', 'three four'],
      ['five six'],
    ])
  })

  it('marks the first photo when none is shown', () => {
    const root = slide(`
      <div class="photo-frames">
        <div class="photo-slot"><img alt="one"></div>
        <div class="photo-slot"><img alt="two"></div>
      </div>
    `)
    const deck = buildPrintDeck([root])
    const slots = deck.querySelectorAll('.photo-slot')

    expect(slots[0]?.classList.contains('is-shown')).toBe(true)
    expect(slots[1]?.classList.contains('is-shown')).toBe(false)
    expect(root.querySelector('.is-shown')).toBeNull()
  })
})
