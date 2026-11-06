import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from './editor'

function mount() {
  const saved: Array<[string, string]> = []
  const editor = createEditor({
    onSave: (source, value) => {
      saved.push([source, value])
    },
    onReset: () => {},
  })
  document.body.append(editor.root)
  return { editor, saved }
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
})
