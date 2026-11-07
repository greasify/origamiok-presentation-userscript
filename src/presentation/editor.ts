import { el } from '@zero-dependency/dom'

export interface EditorDraft {
  source: string
  current: string
  paragraph?: boolean
  hidden?: boolean
}

export interface EditorController {
  root: HTMLElement
  open: (draft: EditorDraft) => void
  close: () => void
  isOpen: () => boolean
  editingSource: () => string | null
  onKey: (event: KeyboardEvent) => boolean
}

function textButton(className: string, label: string) {
  const button = el('button', { className })
  button.type = 'button'
  button.textContent = label
  return button
}

export function createEditor(handlers: {
  onSave: (source: string, value: string) => void
  onReset: (source: string) => void
  onHide?: (source: string, hidden: boolean) => void
  onDismiss?: (source: string) => void
}): EditorController {
  const root = el('div', { className: 'copy-editor' })
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Правка текста')
  const sourceLine = el('p', { className: 'copy-editor-source' })
  const field = el('textarea', { className: 'copy-editor-field' })
  field.rows = 4
  const actions = el('div', { className: 'copy-editor-actions' })
  const hideButton = textButton('copy-editor-hide', 'Скрыть')
  hideButton.hidden = true
  const resetButton = textButton('copy-editor-reset', 'Сброс')
  const cancelButton = textButton('copy-editor-cancel', 'Отмена')
  const saveButton = textButton('copy-editor-save', 'Сохранить')
  actions.append(hideButton, resetButton, cancelButton, saveButton)
  root.append(sourceLine, field, actions)

  let source = ''
  let concealed = false

  const close = () => {
    if (root.hidden) return
    const current = source
    root.hidden = true
    source = ''
    field.value = ''
    if (current) handlers.onDismiss?.(current)
  }

  const commit = () => {
    if (!source) return
    handlers.onSave(source, field.value)
    close()
  }

  const reset = () => {
    if (!source) return
    handlers.onReset(source)
    close()
  }

  const toggleHidden = () => {
    if (!source) return
    handlers.onHide?.(source, !concealed)
    close()
  }

  const open = (draft: EditorDraft) => {
    source = draft.source
    concealed = Boolean(draft.hidden)
    sourceLine.textContent = draft.source
    field.value = draft.current
    hideButton.hidden = !draft.paragraph
    hideButton.textContent = concealed ? 'Показать' : 'Скрыть'
    root.hidden = false
    field.focus()
  }

  const onKey = (event: KeyboardEvent) => {
    if (root.hidden) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return true
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      commit()
      return true
    }
    return true
  }

  cancelButton.addEventListener('click', close)
  hideButton.addEventListener('click', toggleHidden)
  resetButton.addEventListener('click', reset)
  saveButton.addEventListener('click', commit)

  return {
    root,
    open,
    close,
    isOpen: () => !root.hidden,
    editingSource: () => source || null,
    onKey,
  }
}
