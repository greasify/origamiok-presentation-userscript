import type { RemoteCommand, RemoteState } from '../presenter/protocol'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const presenter = vi.hoisted(() => ({
  options: null as null | {
    readonly key: string
    read: () => RemoteState
    apply: (command: RemoteCommand) => void
  },
}))

vi.mock('../presentation/sync', () => ({
  presenterHref: () => 'https://presenter.local/presenter',
  attachStage: (options: NonNullable<typeof presenter.options>) => {
    presenter.options = options
    return { publish() {}, stop() {} }
  },
}))

const deck = JSON.parse(readFileSync(resolve('studio/decks/learn-to-origami.json'), 'utf8')) as {
  id: string
  title: string
}

function stage() {
  const host = document.querySelector('.studio-stage')
  if (!(host instanceof HTMLElement) || !host.shadowRoot) throw new TypeError('сцена не собралась')
  return host.shadowRoot
}

function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(item => item.textContent === label)
  if (!(found instanceof HTMLButtonElement)) throw new TypeError(label)
  return found
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

function lightbox() {
  const node = stage().querySelector('.lightbox')
  if (!(node instanceof HTMLElement)) throw new TypeError('lightbox')
  return node
}

describe('studio show', () => {
  it('opens slide photos in a lightbox and follows the presenter', async () => {
    document.body.replaceChildren()
    const root = document.createElement('div')
    root.id = 'studio'
    document.body.append(root)
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/studio/api/library')) return Response.json([])
      if (url.endsWith('/studio/api/decks') && method === 'GET') {
        return Response.json([{ id: deck.id, title: deck.title }])
      }
      if (url.endsWith(`/studio/api/decks/${deck.id}`) && method === 'GET') return Response.json(deck)
      if (method === 'PUT') return Response.json({ ok: true })
      return new Response('missing', { status: 404 })
    })
    const opened = vi.spyOn(window, 'open').mockImplementation(() => ({ focus() {} }) as Window)

    await import('./main.ts')
    await vi.waitFor(() => {
      const title = document.querySelector('.studio-title')
      expect(title).toBeInstanceOf(HTMLInputElement)
      expect((title as HTMLInputElement).value).toBe('Учимся оригами')
    })

    const link = presenter.options
    expect(link).not.toBeNull()
    if (!link) return
    expect(link.key).toBe('studio:learn-to-origami')
    expect(link.read().open).toBe(false)
    expect(link.read().slides[0]?.images[0]?.src).toContain('05-Notebook-Paper-Crane.webp')

    const cover = stage().querySelector('.sheet-photo')
    expect(cover).toBeInstanceOf(HTMLImageElement)
    cover?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(lightbox().hidden).toBe(true)
    expect(stage().querySelector<HTMLElement>('.bar')?.hidden).toBe(true)

    button('Показать').click()
    expect(document.querySelector('.studio')?.classList.contains('is-presenting')).toBe(true)
    expect(stage().querySelector<HTMLElement>('.bar')?.hidden).toBe(false)
    expect(stage().querySelector('.counter')?.textContent).toBe('1 / 8')
    expect(document.querySelector('.studio-remote-float')).toBeNull()
    expect(link.read().open).toBe(true)

    stage().querySelector('.photo-zoom')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(lightbox().hidden).toBe(false)
    expect(stage().querySelector('.lightbox-photo')?.getAttribute('src')).toContain('05-Notebook-Paper-Crane.webp')
    press('ArrowRight')
    expect(stage().querySelector('h1')?.textContent).toBe('Учимся оригами')
    press('Escape')
    expect(lightbox().hidden).toBe(true)
    expect(document.querySelector('.studio')?.classList.contains('is-presenting')).toBe(true)

    for (let step = 0; step < 5; step += 1) press('ArrowRight')
    expect(stage().querySelector('h1')?.textContent).toBe('Виды оригами')
    const cards = [...stage().querySelectorAll<HTMLImageElement>('.card-photo img')]
    expect(cards).toHaveLength(4)
    cards[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(lightbox().hidden).toBe(false)
    expect(stage().querySelector('.lightbox-photo')?.getAttribute('src')).toContain('25-Origami-Kusudama')
    press('ArrowRight')
    expect(stage().querySelector('.lightbox-photo')?.getAttribute('src')).toContain('Origami-Elephant')
    expect(stage().querySelector('h1')?.textContent).toBe('Виды оригами')

    link.apply({ type: 'show', key: link.key, index: 2 })
    expect(lightbox().hidden).toBe(true)
    expect(stage().querySelector('h1')?.textContent).toBe('История оригами')
    link.apply({ type: 'lightbox-open', key: link.key, index: 0 })
    expect(lightbox().hidden).toBe(false)
    expect(stage().querySelector('.lightbox-photo')?.getAttribute('src')).toContain('33-Origami-Crane-Washi-Paper.webp')

    press('Escape')
    press('Escape')
    expect(document.querySelector('.studio')?.classList.contains('is-presenting')).toBe(false)
    expect(link.read().open).toBe(false)
    stage().querySelector('.sheet-photo')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(lightbox().hidden).toBe(true)

    link.apply({ type: 'show', key: link.key, index: 0 })
    expect(document.querySelector('.studio')?.classList.contains('is-presenting')).toBe(true)
    expect(link.read().index).toBe(0)
    const presenterButton = stage().querySelector<HTMLButtonElement>('[aria-label="Режим ведущего"]')
    presenterButton?.click()
    const open = [...stage().querySelectorAll('button')].find(item => item.textContent === 'Открыть')
    open?.click()
    expect(opened).toHaveBeenCalledWith('https://presenter.local/presenter', 'origami-presenter')
  })
})
