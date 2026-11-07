import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from './editor'

function mount() {
  const saved: Array<[string, string]> = []
  const hidden: Array<[string, boolean]> = []
  const editor = createEditor({
    onSave: (source, value) => {
      saved.push([source, value])
    },
    onReset: () => {},
    onHide: (source, concealed) => {
      hidden.push([source, concealed])
    },
  })
  document.body.append(editor.root)
  return { editor, saved, hidden }
}

describe('copy editor', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('closes on Escape without saving', () => {
    const { editor, saved } = mount()
    editor.open({ source: 'fold the corner', current: 'сложи угол' })
    const field = editor.root.querySelector('textarea')
    if (field) field.value = 'иначе'
    editor.onKey(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(saved).toEqual([])
    expect(editor.isOpen()).toBe(false)
    expect(editor.editingSource()).toBeNull()
  })

  it('saves the field on Ctrl+Enter', () => {
    const { editor, saved } = mount()
    editor.open({ source: 'fold the corner', current: 'сложи угол' })
    const field = editor.root.querySelector('textarea')
    if (!field) throw new Error('missing field')
    field.value = 'прижми угол'
    editor.onKey(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))
    expect(saved).toEqual([['fold the corner', 'прижми угол']])
    expect(editor.isOpen()).toBe(false)
  })

  it('hides a paragraph and shows it again', () => {
    const { editor, hidden, saved } = mount()
    editor.open({ source: 'swan', current: 'Лебедь' })
    const absent = editor.root.querySelector<HTMLButtonElement>('.copy-editor-hide')
    expect(absent?.hidden).toBe(true)

    editor.open({ source: 'fold the corner', current: 'сложи угол', paragraph: true })
    const button = editor.root.querySelector<HTMLButtonElement>('.copy-editor-hide')
    expect(button?.hidden).toBe(false)
    expect(button?.textContent).toBe('Скрыть')
    button?.click()
    expect(hidden).toEqual([['fold the corner', true]])
    expect(saved).toEqual([])
    expect(editor.isOpen()).toBe(false)

    editor.open({ source: 'fold the corner', current: 'сложи угол', paragraph: true, hidden: true })
    expect(button?.textContent).toBe('Показать')
    button?.click()
    expect(hidden).toEqual([['fold the corner', true], ['fold the corner', false]])
  })
})
