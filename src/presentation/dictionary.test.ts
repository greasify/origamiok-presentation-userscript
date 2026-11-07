import type { DictionaryEntry } from './dictionary'
import { afterEach, describe, expect, it } from 'vitest'
import { createDictionary } from './dictionary'

function mount(initial: DictionaryEntry[], concealed: string[] = []) {
  const saved: Array<[string, string]> = []
  const deleted: string[] = []
  let closed = 0
  let entries = initial
  const dictionary = createDictionary({
    load: () => entries,
    hidden: () => concealed,
    onSave: (source, value) => {
      saved.push([source, value])
    },
    onDelete: (source) => {
      deleted.push(source)
    },
    onClose: () => {
      closed += 1
    },
  })
  document.body.append(dictionary.root)
  return {
    dictionary,
    saved,
    deleted,
    closed: () => closed,
    replace: (next: DictionaryEntry[]) => {
      entries = next
    },
  }
}

function rows(root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>('.dictionary-row')]
}

function visibleRows(root: ParentNode) {
  return rows(root).filter(row => !row.hidden)
}

describe('dictionary window', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('lists stored lines and leaves later arrivals out until the next open', () => {
    const { dictionary, replace } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
    ])
    dictionary.open()
    expect(dictionary.isOpen()).toBe(true)
    expect(rows(dictionary.root)).toHaveLength(2)
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('2 перевода')
    expect(document.activeElement).toBe(dictionary.root.querySelector('input'))

    replace([
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
      { source: 'open the model', value: 'раскрой модель' },
    ])
    expect(rows(dictionary.root)).toHaveLength(2)

    dictionary.close()
    dictionary.open()
    expect(rows(dictionary.root)).toHaveLength(3)
  })

  it('filters by the english line and the stored translation', () => {
    const { dictionary } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
    ])
    dictionary.open()
    const search = dictionary.root.querySelector('input')
    if (!search) throw new Error('missing search')
    search.value = 'УГОЛ'
    search.dispatchEvent(new Event('input'))
    const shown = visibleRows(dictionary.root)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.querySelector('.dictionary-source')?.textContent).toBe('fold the corner')
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('1 из 2')

    search.value = 'missing'
    search.dispatchEvent(new Event('input'))
    expect(visibleRows(dictionary.root)).toHaveLength(0)
    expect(dictionary.root.querySelector('.dictionary-empty')?.textContent).toBe('Ничего не найдено')
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('0 из 2')
  })

  it('shows hidden lines from the filter beside the search', () => {
    const { dictionary } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
    ], ['fold the corner', 'leave it flat'])
    dictionary.open()
    const filter = dictionary.root.querySelector<HTMLButtonElement>('.dictionary-hidden')
    if (!filter) throw new Error('missing filter')
    expect(filter.getAttribute('aria-pressed')).toBe('false')
    expect(visibleRows(dictionary.root).map(row => row.querySelector('.dictionary-source')?.textContent)).toEqual([
      'fold the corner',
      'turn the paper',
    ])

    filter.click()
    expect(filter.getAttribute('aria-pressed')).toBe('true')
    const shown = visibleRows(dictionary.root)
    expect(shown.map(row => row.querySelector('.dictionary-source')?.textContent)).toEqual([
      'fold the corner',
      'leave it flat',
    ])
    expect(shown[0]?.querySelector('.dictionary-flag')?.textContent).toBe('Скрыто')
    expect(shown[1]?.querySelector('textarea')?.value).toBe('')
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('2 скрытые')

    const search = dictionary.root.querySelector('input')
    if (!search) throw new Error('missing search')
    search.value = 'flat'
    search.dispatchEvent(new Event('input'))
    expect(visibleRows(dictionary.root).map(row => row.querySelector('.dictionary-source')?.textContent)).toEqual([
      'leave it flat',
    ])
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('1 из 2')

    filter.click()
    expect(visibleRows(dictionary.root).map(row => row.querySelector('.dictionary-source')?.textContent)).toEqual([])
    expect(dictionary.root.querySelector('.dictionary-empty')?.textContent).toBe('Ничего не найдено')
  })

  it('says when nothing is hidden', () => {
    const { dictionary } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
    ])
    dictionary.open()
    dictionary.root.querySelector<HTMLButtonElement>('.dictionary-hidden')?.click()
    expect(visibleRows(dictionary.root)).toHaveLength(0)
    expect(dictionary.root.querySelector('.dictionary-empty')?.textContent).toBe('Нет скрытых строк')
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('')
  })

  it('saves a changed line and ignores a blank one', () => {
    const { dictionary, saved } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
    ])
    dictionary.open()
    const field = dictionary.root.querySelector('textarea')
    const save = dictionary.root.querySelector<HTMLButtonElement>('.dictionary-save')
    if (!field || !save) throw new Error('missing field')
    expect(save.disabled).toBe(true)

    field.value = 'сложи угол   '
    field.dispatchEvent(new Event('input'))
    expect(save.disabled).toBe(true)

    field.value = '   '
    field.dispatchEvent(new Event('input'))
    expect(save.disabled).toBe(true)
    save.click()
    expect(saved).toEqual([])

    field.value = '  прижми угол  '
    field.dispatchEvent(new Event('input'))
    expect(save.disabled).toBe(false)
    save.click()
    expect(saved).toEqual([['fold the corner', 'прижми угол']])
    expect(field.value).toBe('прижми угол')
    expect(save.disabled).toBe(true)
  })

  it('resets a stored line and keeps the fresh translation', async () => {
    let finish: (value: string | null) => void = () => {}
    const pending = new Promise<string | null>((resolve) => {
      finish = resolve
    })
    const reset: string[] = []
    const dictionary = createDictionary({
      load: () => [{ source: 'fold the corner', value: 'сложи угол' }],
      hidden: () => ['fold the corner'],
      onSave: () => {},
      onDelete: () => {},
      onReset: (source) => {
        reset.push(source)
        return pending
      },
    })
    document.body.append(dictionary.root)
    dictionary.open()
    const field = dictionary.root.querySelector('textarea')
    const button = dictionary.root.querySelector<HTMLButtonElement>('.dictionary-reset')
    if (!field || !button) throw new Error('missing reset')
    expect(dictionary.root.querySelector('.dictionary-flag')?.textContent).toBe('Скрыто')
    button.click()
    expect(reset).toEqual(['fold the corner'])
    expect(field.value).toBe('fold the corner')
    expect(button.disabled).toBe(true)
    expect(dictionary.root.querySelector('.dictionary-flag')).toBeNull()
    expect(visibleRows(dictionary.root)).toHaveLength(1)
    finish('новый вариант')
    await pending
    expect(field.value).toBe('новый вариант')
    expect(button.disabled).toBe(false)
    expect(dictionary.root.querySelector<HTMLButtonElement>('.dictionary-save')?.disabled).toBe(true)
  })

  it('drops a reset line when no fresh translation arrives', async () => {
    const dictionary = createDictionary({
      load: () => [{ source: 'fold the corner', value: 'сложи угол' }],
      onSave: () => {},
      onDelete: () => {},
      onReset: () => Promise.resolve(null),
    })
    document.body.append(dictionary.root)
    dictionary.open()
    dictionary.root.querySelector<HTMLButtonElement>('.dictionary-reset')?.click()
    await Promise.resolve()
    expect(visibleRows(dictionary.root)).toHaveLength(0)
    expect(dictionary.root.querySelector('.dictionary-empty')?.textContent).toBe('Пока нет сохранённых переводов')
  })

  it('deletes one line and keeps the rest', () => {
    const { dictionary, deleted } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
    ])
    dictionary.open()
    dictionary.root.querySelector<HTMLButtonElement>('.dictionary-delete')?.click()
    expect(deleted).toEqual(['fold the corner'])
    expect(rows(dictionary.root).map(row => row.querySelector('.dictionary-source')?.textContent)).toEqual([
      'turn the paper',
    ])
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('1 перевод')
  })

  it('closes on Escape without saving', () => {
    const { dictionary, saved, closed } = mount([
      { source: 'fold the corner', value: 'сложи угол' },
    ])
    expect(dictionary.onKey(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false)
    dictionary.open()
    const field = dictionary.root.querySelector('textarea')
    if (!field) throw new Error('missing field')
    field.value = 'иначе'
    expect(dictionary.onKey(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true)
    expect(dictionary.isOpen()).toBe(false)
    expect(saved).toEqual([])
    expect(closed()).toBe(1)
  })

  it('shows an empty dictionary without invented lines', () => {
    const { dictionary } = mount([])
    dictionary.open()
    expect(rows(dictionary.root)).toHaveLength(0)
    expect(dictionary.root.querySelector<HTMLElement>('.dictionary-empty')?.hidden).toBe(false)
    expect(dictionary.root.querySelector('.dictionary-empty')?.textContent).toBe('Пока нет сохранённых переводов')
    expect(dictionary.root.querySelector('.dictionary-count')?.textContent).toBe('')
  })

  it('applies a remote edit and keeps an unsaved field', () => {
    let entries: DictionaryEntry[] = [
      { source: 'crease the edge', value: 'сгиб' },
      { source: 'fold the corner', value: 'сложи угол' },
      { source: 'turn the paper', value: 'переверни лист' },
    ]
    let concealed: string[] = []
    const dictionary = createDictionary({
      load: () => entries,
      hidden: () => concealed,
      onSave: () => {},
      onDelete: () => {},
    })
    document.body.append(dictionary.root)
    dictionary.open()
    const draft = dictionary.root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Перевод: fold the corner"]')
    if (!draft) throw new Error('missing draft')
    draft.value = 'черновик'
    draft.dispatchEvent(new Event('input'))
    entries = [
      { source: 'open the model', value: 'раскрой' },
      { source: 'turn the paper', value: 'чужой лист' },
    ]
    concealed = ['turn the paper']
    dictionary.sync()
    const sources = rows(dictionary.root).map(row => row.querySelector('.dictionary-source')?.textContent)
    expect(sources).toEqual(['open the model', 'turn the paper', 'fold the corner'])
    expect(draft.value).toBe('черновик')
    expect(draft.closest('article')?.querySelector<HTMLButtonElement>('.dictionary-save')?.disabled).toBe(false)
    const turn = dictionary.root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Перевод: turn the paper"]')
    const opened = dictionary.root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Перевод: open the model"]')
    expect(turn?.value).toBe('чужой лист')
    expect(opened?.value).toBe('раскрой')
    expect(turn?.closest('article')?.querySelector('.dictionary-flag')?.textContent).toBe('Скрыто')
    expect(dictionary.root.querySelector('textarea[aria-label="Перевод: crease the edge"]')).toBeNull()
  })
})
