import type { Facts, StepBlock } from './types'

export type CoverFactKind = 'time' | 'paper' | 'steps' | 'level' | 'scissors' | 'glue'

export interface CoverFact {
  kind: CoverFactKind
  text: string
}

function plural(value: number, forms: readonly [string, string, string]) {
  const n = Math.abs(value) % 100
  const last = n % 10
  const [one, few, many] = forms
  if (n > 10 && n < 20) return many
  if (last === 1) return one
  if (last > 1 && last < 5) return few
  return many
}

function difficultyLabel(value: string | null) {
  const labels: Record<string, string> = {
    'easy': 'лёгкий уровень',
    'intermediate': 'средний уровень',
    'advanced': 'сложный уровень',
    'beginner friendly': 'для начинающих',
  }
  return labels[value?.trim().toLowerCase() ?? ''] ?? ''
}

export function factLines(facts: Facts, stepCount: number) {
  const items: CoverFact[] = []
  const minutes = facts.minutes
  if (minutes != null && Number.isFinite(minutes)) {
    items.push({ kind: 'time', text: `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}` })
  }

  const paper = (facts.paper ?? '').replace(/\s+/g, ' ').replace(/\bcm\b/gi, 'см').trim()
  if (paper) items.push({ kind: 'paper', text: `1 лист, ${paper}` })
  else if (stepCount > 0) items.push({ kind: 'paper', text: '1 лист' })

  if (stepCount > 0) items.push({ kind: 'steps', text: `${stepCount} ${plural(stepCount, ['шаг', 'шага', 'шагов'])}` })

  const difficulty = difficultyLabel(facts.difficulty)
  if (difficulty) items.push({ kind: 'level', text: difficulty })
  return items
}

export function toolLines(steps: StepBlock[]) {
  const text = steps.flatMap(step => step.paragraphs).join('\n')
  const lines: CoverFact[] = []
  if (/\bscissors\b/i.test(text) || /\bcut(?:s|ting)?\b/i.test(text)) lines.push({ kind: 'scissors', text: 'ножницы' })
  if (/\bglue\b/i.test(text)) lines.push({ kind: 'glue', text: 'клей' })
  return lines
}
