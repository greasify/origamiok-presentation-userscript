import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePage } from '../parse-page'
import { toolLines } from './cover'

const html = readFileSync(resolve('fixtures/preview.html'), 'utf8')
  .replaceAll('<iframe', '<div')
  .replaceAll('</iframe>', '</div>')

describe('swan fixture', () => {
  it('keeps the model, the tools and the editorial grid', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const content = doc.querySelector('.entry-content')
    expect(content).not.toBeNull()
    if (!content) return

    const page = parsePage(doc, content)
    expect(page.modelName).toBe('Swan')
    const material = page.sections.find(section => section.heading === 'Material')
    expect(material?.paragraphs[0]).toMatch(/square paper/)
    expect(material?.images.map(image => image.alt)).toEqual(['Square paper'])
    expect(page.youtubeId).toBe('xeFapLWCJPs')
    expect(page.steps.map(item => item.n)).toEqual([1, 2])
    expect(toolLines(page.steps)).toEqual([
      { kind: 'scissors', text: 'ножницы' },
      { kind: 'glue', text: 'клей' },
    ])
    expect(page.related?.items.map(item => item.title)).toEqual(['Frog Face', 'Pig Face'])
    expect(JSON.stringify(page)).not.toContain('Rose Box')
    expect(page.sections.some(section => section.heading === 'What’s Next')).toBe(false)
  })
})
