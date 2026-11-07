import type { Facts, StepBlock } from './types'
import { describe, expect, it } from 'vitest'
import { capturePaper, factLines, paperLine, toolLines } from './cover'

function facts(patch: Partial<Facts> = {}): Facts {
  return {
    minutes: null,
    paper: null,
    steps: null,
    difficulty: null,
    ...patch,
  }
}

const step = (paragraphs: string[]): StepBlock => ({ n: 1, paragraphs, images: [] })

describe('cover lines', () => {
  it('declines minutes and steps', () => {
    expect(factLines(facts({ minutes: 1 }), 0)).toContainEqual({ kind: 'time', text: '1 минута' })
    expect(factLines(facts(), 2)).toContainEqual({ kind: 'steps', text: '2 шага' })
    expect(factLines(facts(), 5)).toContainEqual({ kind: 'steps', text: '5 шагов' })
  })

  it('counts every sheet size on the cover', () => {
    const line = (paper: string) => factLines(facts({ paper }), 0).find(item => item.kind === 'paper')?.text
    expect(line('15cm x 15cm / 2')).toBe('2 листа 15×15 см')
    expect(line('15×15 cm / 2')).toBe('2 листа 15×15 см')
    expect(line('15×15 cm / 4')).toBe('4 листа 15×15 см')
    expect(line('15×15 cm/2 7.5×7.5 cm/2')).toBe('2 листа 15×15 см, 2 листа 7.5×7.5 см')
    expect(line('a square of paper')).toBe('1 лист, a square of paper')
    expect(paperLine('15×20 cm')).toBe('1 лист 15×20 см')
    expect(capturePaper('Folding time: 20 minutes Paper: 15×15 cm / 4 Total steps: 11')).toBe('15×15 cm / 4')
    expect(capturePaper('Paper: 15×15 cm/2 7.5×7.5 cm/2 Difficulty: easy')).toBe('15×15 cm/2 7.5×7.5 cm/2')
  })

  it('counts cutting as scissors and keeps glue', () => {
    expect(toolLines([step(['Cut the tip and fix it with glue.'])])).toEqual([
      { kind: 'scissors', text: 'ножницы' },
      { kind: 'glue', text: 'клей' },
    ])
  })

  it('ignores a crease that is only a fold', () => {
    expect(toolLines([step(['Leave a crease, then unfold.'])])).toEqual([])
  })
})
