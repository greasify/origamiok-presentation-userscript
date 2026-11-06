import { describe, expect, it } from 'vitest'
import {
  applyIncoming,
  blankRepeatedMarkup,
  clampScale,
  decodePresenterFrame,
  denormalizePan,
  encodePresenterFrame,
  mergeStoredState,
  needsMarkup,
  normalizePan,
  parseHubMessage,
  viewFromPixels,
} from './protocol'

const slide = {
  title: 'Swan',
  step: '1',
  images: [{ src: 'https://origamiok.com/1.webp', alt: 'Step' }],
  markup: '<article class="slide paper-step">fold</article>',
}

function state(index: number) {
  return {
    key: '/origami-swan/|/origami-swan/',
    open: true,
    index,
    slides: [slide, { ...slide, step: '2' }],
    lightbox: null,
  }
}

describe('zoom normalization', () => {
  it('keeps the scale inside the lightbox range', () => {
    expect(clampScale(0)).toBe(1)
    expect(clampScale(2.25)).toBe(2.25)
    expect(clampScale(9)).toBe(5)
    expect(clampScale(Number.NaN)).toBe(1)
  })

  it('maps pixel pan to a fraction of the free room', () => {
    expect(normalizePan(50, 100)).toBe(0.5)
    expect(normalizePan(-400, 100)).toBe(-1)
    expect(normalizePan(10, 0)).toBe(0)
    expect(denormalizePan(0.5, 80)).toBe(40)
    expect(denormalizePan(3, 80)).toBe(80)
    expect(viewFromPixels({ scale: 8, panX: 40, panY: -10, roomX: 80, roomY: 20 })).toEqual({
      scale: 5,
      nx: 0.5,
      ny: -0.5,
    })
  })
})

describe('incoming presenter state', () => {
  it('applies a foreign state without echoing it', () => {
    const incoming = state(1)
    const applied = applyIncoming(null, incoming)
    expect(applied).toEqual({ state: incoming, echo: false })
  })

  it('follows another open lesson and ignores a broken deck of the same lesson', () => {
    const current = state(0)
    const other = applyIncoming(current, { ...state(0), key: '/other/|' })
    expect(other?.state.key).toBe('/other/|')
    expect(applyIncoming(current, { ...state(1), slides: [slide] })).toBeNull()
  })

  it('keeps the previous slide copy when the next message omits it', () => {
    const current = state(0)
    const incoming = state(1)
    incoming.slides = incoming.slides.map(item => ({ ...item, markup: '' }))
    const applied = applyIncoming(current, incoming)
    expect(applied?.state.slides.map(item => item.markup)).toEqual([slide.markup, slide.markup])
    expect(applied?.state.index).toBe(1)
  })

  it('keeps the slide copy for a presenter that connects later', () => {
    const full = JSON.stringify({ type: 'state', state: state(0) })
    const follow = state(1)
    follow.slides = follow.slides.map(item => ({ ...item, markup: '' }))
    const stored = mergeStoredState(full, { type: 'state', state: follow })
    const parsed = JSON.parse(stored) as { state: { index: number, slides: Array<{ markup: string }> } }
    expect(parsed.state.index).toBe(1)
    expect(parsed.state.slides.map(item => item.markup)).toEqual([slide.markup, slide.markup])
  })

  it('sends slide markup only when the copy changed', () => {
    const again = blankRepeatedMarkup([slide.markup, ''], [slide, { ...slide, markup: '<article class="slide">next</article>' }])
    expect(again.map(item => item.markup)).toEqual(['', '<article class="slide">next</article>'])
  })

  it('asks the open presentation for a full copy when the snapshot has none', () => {
    expect(needsMarkup(state(0))).toBe(false)
    expect(needsMarkup({ ...state(0), slides: state(0).slides.map(item => ({ ...item, markup: '' })) })).toBe(true)
    expect(parseHubMessage('{"type":"sync"}')).toEqual({ type: 'sync' })
  })

  it('reads a presenter frame and ignores an hmr frame', () => {
    expect(decodePresenterFrame(encodePresenterFrame({ type: 'sync' }))).toEqual({ type: 'sync' })
    expect(decodePresenterFrame('{"type":"connected"}')).toBeNull()
    expect(decodePresenterFrame('{"type":"full-reload","path":"*"}')).toBeNull()
  })

  it('keeps a scroll fraction and a text edit', () => {
    const scroll = JSON.stringify({
      type: 'command',
      command: { type: 'copy-scroll', key: 'deck', index: 1.2, top: 1.4 },
    })
    expect(parseHubMessage(scroll)).toEqual({
      type: 'command',
      command: { type: 'copy-scroll', key: 'deck', index: 1, top: 1 },
    })
    const save = JSON.stringify({
      type: 'command',
      command: { type: 'text-save', key: 'deck', source: 'Fold', value: 'Сгиб' },
    })
    expect(parseHubMessage(save)).toEqual({
      type: 'command',
      command: { type: 'text-save', key: 'deck', source: 'Fold', value: 'Сгиб' },
    })
    const reset = JSON.stringify({
      type: 'command',
      command: { type: 'text-reset', key: 'deck', source: 'Fold' },
    })
    expect(parseHubMessage(reset)).toEqual({
      type: 'command',
      command: { type: 'text-reset', key: 'deck', source: 'Fold' },
    })
    expect(parseHubMessage('{"type":"command","command":{"type":"copy-scroll","key":"deck","index":0,"top":"nope"}}')).toBeNull()
  })

  it('drops a message that is not a hub payload', () => {
    expect(parseHubMessage('nope')).toBeNull()
    expect(parseHubMessage('{"type":"state","state":{"key":"a"}}')).toBeNull()
    const raw = JSON.stringify({ type: 'command', command: { type: 'show', key: 'deck', index: 2.8 } })
    expect(parseHubMessage(raw)).toEqual({
      type: 'command',
      command: { type: 'show', key: 'deck', index: 2 },
    })
  })
})
