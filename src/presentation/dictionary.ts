import { el } from '@zero-dependency/dom'
import { CLOSE_ICON, sealButton } from './dom'

export interface DictionaryEntry {
  source: string
  value: string
}

export interface DictionaryController {
  root: HTMLElement
  open: () => void
  close: () => void
  isOpen: () => boolean
  sync: () => void
  onKey: (event: KeyboardEvent) => boolean
}

interface DictionaryRow {
  source: string
  value: string
  hidden: boolean
  resetting: boolean
  generation: number
  article: HTMLElement
  field: HTMLTextAreaElement
  save: HTMLButtonElement
  reset: HTMLButtonElement
}

function textButton(className: string, label: string) {
  const button = el('button', { className })
  button.type = 'button'
  button.textContent = label
  return button
}

function canSave(value: string, stored: string) {
  const next = value.trim()
  return next.length > 0 && next !== stored
}

function paintSave(row: DictionaryRow) {
  row.save.disabled = row.resetting || !canSave(row.field.value, row.value)
}

function dirty(row: DictionaryRow) {
  return row.resetting || row.field.value.trim() !== row.value.trim()
}

function setConcealed(row: DictionaryRow, concealed: boolean) {
  row.hidden = concealed
  row.article.classList.toggle('is-concealed', concealed)
  const line = row.article.querySelector('.dictionary-source-line')
  const flag = line?.querySelector('.dictionary-flag')
  if (!concealed) {
    flag?.remove()
    return
  }
  if (flag || !line) return
  const mark = el('span', { className: 'dictionary-flag' })
  mark.textContent = 'Скрыто'
  line.append(mark)
}

function countLabel(count: number, hidden = false) {
  const mod10 = count % 10
  const mod100 = count % 100
  let word = hidden ? 'скрытых' : 'переводов'
  if (mod10 === 1 && mod100 !== 11) word = hidden ? 'скрытая' : 'перевод'
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = hidden ? 'скрытые' : 'перевода'
  return `${count} ${word}`
}

export function createDictionary(handlers: {
  load: () => readonly DictionaryEntry[]
  hidden?: () => readonly string[]
  onSave: (source: string, value: string) => void
  onDelete: (source: string) => void
  onReset?: (source: string) => Promise<string | null> | void
  onClose?: () => void
}): DictionaryController {
  const root = el('div', { className: 'dictionary' })
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Словарь')

  const heading = el('div', { className: 'dictionary-heading' })
  const title = el('h2', { className: 'dictionary-title' })
  title.textContent = 'Словарь'
  const count = el('p', { className: 'dictionary-count' })
  count.setAttribute('aria-live', 'polite')
  heading.append(title, count)

  const closeButton = sealButton('dictionary-close', 'Закрыть словарь', CLOSE_ICON)
  const search = el('input', { className: 'dictionary-search' })
  search.type = 'search'
  search.placeholder = 'Поиск'
  search.setAttribute('aria-label', 'Поиск по словарю')
  search.autocomplete = 'off'
  const hiddenFilter = textButton('dictionary-hidden', 'Скрытые')
  hiddenFilter.setAttribute('aria-pressed', 'false')
  hiddenFilter.setAttribute('aria-label', 'Только скрытые строки')
  const tools = el('div', { className: 'dictionary-tools' })
  tools.append(search, hiddenFilter)
  const head = el('div', { className: 'dictionary-head' })
  head.append(heading, closeButton, tools)

  const empty = el('p', { className: 'dictionary-empty' })
  empty.hidden = true
  const list = el('div', { className: 'dictionary-list' })
  root.append(head, empty, list)

  let rows: DictionaryRow[] = []

  const onlyHidden = () => hiddenFilter.getAttribute('aria-pressed') === 'true'

  const inPool = (row: DictionaryRow) => {
    if (onlyHidden()) return row.hidden
    return row.resetting || Boolean(row.value.trim())
  }

  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase()
    const concealed = onlyHidden()
    let pool = 0
    let visible = 0
    for (const row of rows) {
      const haystack = `${row.source}\n${row.value}`.toLocaleLowerCase()
      const listed = inPool(row)
      const shown = listed && (query.length === 0 || haystack.includes(query))
      row.article.hidden = !shown
      if (listed) pool += 1
      if (shown) visible += 1
    }
    if (pool === 0) {
      count.textContent = ''
      empty.hidden = false
      empty.textContent = concealed ? 'Нет скрытых строк' : 'Пока нет сохранённых переводов'
      return
    }
    count.textContent = query.length === 0 ? countLabel(pool, concealed) : `${visible} из ${pool}`
    empty.hidden = visible > 0
    empty.textContent = visible > 0 ? '' : 'Ничего не найдено'
  }

  const renderRow = (entry: DictionaryEntry, concealed: boolean) => {
    const article = el('article', { className: 'dictionary-row' })
    const sourceRow = el('div', { className: 'dictionary-source-line' })
    const sourceLine = el('p', { className: 'dictionary-source' })
    sourceLine.textContent = entry.source
    sourceRow.append(sourceLine)
    const field = el('textarea', { className: 'dictionary-field' })
    field.rows = 2
    field.value = entry.value
    field.setAttribute('aria-label', `Перевод: ${entry.source}`)
    const actions = el('div', { className: 'dictionary-actions' })
    const remove = textButton('dictionary-delete', 'Удалить')
    const reset = textButton('dictionary-reset', 'Сброс')
    const save = textButton('dictionary-save', 'Сохранить')
    save.disabled = true
    actions.append(remove, reset, save)
    article.append(sourceRow, field, actions)

    const row: DictionaryRow = {
      source: entry.source,
      value: entry.value,
      hidden: false,
      resetting: false,
      generation: 0,
      article,
      field,
      save,
      reset,
    }
    setConcealed(row, concealed)

    field.addEventListener('input', () => {
      row.generation += 1
      paintSave(row)
    })
    save.addEventListener('click', () => {
      const next = field.value.trim()
      if (!next || next === row.value) return
      handlers.onSave(row.source, next)
      row.value = next
      field.value = next
      paintSave(row)
      refresh()
    })
    remove.addEventListener('click', () => {
      handlers.onDelete(row.source)
      rows = rows.filter(item => item.source !== row.source)
      article.remove()
      refresh()
    })
    reset.addEventListener('click', () => {
      const stamp = row.generation + 1
      row.generation = stamp
      row.resetting = true
      row.value = ''
      setConcealed(row, false)
      field.value = row.source
      reset.disabled = true
      paintSave(row)
      refresh()
      Promise.resolve(handlers.onReset?.(row.source) ?? null).then((translated) => {
        if (!article.isConnected) return
        row.resetting = false
        reset.disabled = false
        if (stamp !== row.generation) {
          paintSave(row)
          return
        }
        const next = typeof translated === 'string' ? translated.trim() : ''
        if (!next) {
          field.value = ''
          paintSave(row)
          refresh()
          return
        }
        row.value = next
        field.value = next
        paintSave(row)
        refresh()
      })
    })
    return row
  }

  const close = () => {
    if (root.hidden) return
    root.hidden = true
    handlers.onClose?.()
  }

  const entries = () => {
    const concealed = new Set((handlers.hidden?.() ?? []).map(source => source.trim()).filter(Boolean))
    const merged = new Map<string, string>()
    for (const entry of handlers.load()) {
      const value = entry.value.trim()
      if (!entry.source.trim() || !value) continue
      merged.set(entry.source, value)
    }
    for (const source of concealed) {
      if (!merged.has(source)) merged.set(source, '')
    }
    return [...merged.entries()]
      .map(([source, value]) => ({ source, value, hidden: concealed.has(source) }))
      .sort((left, right) => left.source.localeCompare(right.source, 'en', { sensitivity: 'base' }))
  }

  const absorb = (row: DictionaryRow, entry: DictionaryEntry & { hidden: boolean }) => {
    if (!dirty(row)) {
      row.value = entry.value
      row.field.value = entry.value
    }
    if (!row.resetting) setConcealed(row, entry.hidden)
    paintSave(row)
  }

  const sync = () => {
    if (root.hidden) return
    const next = entries()
    const previous = new Map(rows.map(row => [row.source, row]))
    const kept = new Set<string>()
    const ordered: DictionaryRow[] = []
    for (const entry of next) {
      const row = previous.get(entry.source)
      if (!row) {
        ordered.push(renderRow(entry, entry.hidden))
        continue
      }
      kept.add(entry.source)
      absorb(row, entry)
      ordered.push(row)
    }
    for (const row of rows) {
      if (kept.has(row.source)) continue
      if (!dirty(row)) {
        row.article.remove()
        continue
      }
      ordered.push(row)
    }
    rows = ordered
    list.replaceChildren(...ordered.map(row => row.article))
    refresh()
  }

  const open = () => {
    search.value = ''
    hiddenFilter.setAttribute('aria-pressed', 'false')
    rows = entries().map(entry => renderRow(entry, entry.hidden))
    list.replaceChildren(...rows.map(row => row.article))
    refresh()
    root.hidden = false
    search.focus()
  }

  const onKey = (event: KeyboardEvent) => {
    if (root.hidden) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return true
    }
    return true
  }

  closeButton.addEventListener('click', close)
  search.addEventListener('input', refresh)
  hiddenFilter.addEventListener('click', () => {
    hiddenFilter.setAttribute('aria-pressed', onlyHidden() ? 'false' : 'true')
    refresh()
  })

  return {
    root,
    open,
    close,
    isOpen: () => !root.hidden,
    sync,
    onKey,
  }
}
