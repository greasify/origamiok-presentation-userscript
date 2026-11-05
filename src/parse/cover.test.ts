import type { Facts, StepBlock } from './types'
import { describe, expect, it } from 'vitest'
import { factLines, toolLines } from './cover'

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
