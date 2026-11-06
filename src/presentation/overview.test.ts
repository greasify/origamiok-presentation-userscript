import { describe, expect, it } from 'vitest'
import { createOverview } from './overview'

function slide(text: string, active = false) {
  const node = document.createElement('article')
  node.className = active ? 'slide is-active' : 'slide'
  node.textContent = text
  return node
}

describe('slide overview', () => {
  it('jumps to the chosen slide and leaves escape on the same one', () => {
    let picked = -1
    let closed = 0
    const overview = createOverview(
      [slide('One', true), slide('Two')],
      (index) => {
        picked = index
      },
      () => {
        closed += 1
      },
    )
    document.body.append(overview.root)

    overview.open(0)
    expect(overview.root.querySelectorAll('.overview-card')).toHaveLength(2)
    expect(overview.root.querySelector('.slide.is-active')).toBeNull()
    overview.root.querySelectorAll<HTMLButtonElement>('.overview-card')[1]?.click()
    expect(picked).toBe(1)
    expect(overview.isOpen()).toBe(false)

    overview.open(1)
    overview.onKey(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(overview.isOpen()).toBe(false)
    expect(picked).toBe(1)
    expect(closed).toBe(2)
  })

  it('moves the frame with arrows and opens it with enter', () => {
    let picked = -1
    const overview = createOverview([slide('One'), slide('Two'), slide('Three')], (index) => {
      picked = index
    }, () => {})
    document.body.append(overview.root)
    overview.open(0)
    expect(overview.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(true)
    expect(overview.onKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true)
    expect(picked).toBe(1)
  })
})
