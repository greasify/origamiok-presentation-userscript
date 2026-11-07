import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDeck } from './deck'
import { parseLibraries, safeSegments } from './files'

const root = resolve(import.meta.dirname, '../..')

describe('studio files', () => {
  it('rejects a path that climbs out of the library', () => {
    expect(safeSegments('images/kami.webp')).toEqual(['images', 'kami.webp'])
    expect(safeSegments('images//kami.webp')).toEqual(['images', 'kami.webp'])
    expect(safeSegments('images/../../secret.webp')).toBeNull()
    expect(safeSegments('images/%2e%2e/secret.webp')).toBeNull()
    expect(safeSegments('images/%2e%2e%2fsecret.webp')).toBeNull()
  })

  it('reads the draft decks and their local photos', () => {
    const libraries = parseLibraries(JSON.parse(readFileSync(resolve(root, 'studio/libraries.json'), 'utf8')) as unknown)
    const files = readdirSync(resolve(root, 'studio/decks')).filter(name => name.endsWith('.json'))
    expect(files.sort()).toEqual([
      'best-origami-paper.json',
      'learn-to-origami.json',
      'types-of-origami.json',
    ])
    for (const name of files) {
      const deck = parseDeck(JSON.parse(readFileSync(resolve(root, 'studio/decks', name), 'utf8')) as unknown)
      expect(deck?.id).toBe(name.slice(0, -'.json'.length))
      expect(deck?.slides.length).toBeGreaterThan(0)
      const images = deck?.slides.flatMap(slide => [
        ...slide.images,
        ...slide.cards.flatMap(card => card.image ? [card.image] : []),
      ]) ?? []
      expect(images.length).toBeGreaterThan(0)
      for (const image of images) {
        if (/^https?:/.test(image.src)) continue
        const match = image.src.match(/^\/studio\/sources\/([a-z0-9-]+)\/(.+)$/)
        expect(match, image.src).toBeTruthy()
        const folder = libraries[match?.[1] ?? '']
        const parts = safeSegments(match?.[2] ?? '')
        expect(folder).toBeTruthy()
        expect(parts).toBeTruthy()
        expect(existsSync(resolve(folder ?? '', ...(parts ?? [])))).toBe(true)
      }
    }
  })
})
