import type { RemoteCommand, RemoteSlide } from '../presenter/protocol'
import type { Deck, LibraryGroup, StudioImage, StudioSlide } from './deck'
import { el } from '@zero-dependency/dom'
import presentationCss from '../presentation.scss?inline'
import { CREASE, FONT_HREF, STAGE_HEIGHT, STAGE_WIDTH } from '../presentation/dom'
import { createLightbox } from '../presentation/lightbox'
import { slideMarkup } from '../presentation/overview'
import { attachStage, presenterHref } from '../presentation/sync'
import { clampIndex } from '../presenter/protocol'
import {
  blankCard,
  blankSlide,
  isLayout,
  LAYOUT_LABEL,
  LAYOUTS,
  parseDeck,
  parseDeckList,
  parseLibrary,
} from './deck'
import { renderStudioSlide, slideImages, slidePhotos } from './render'
import './studio.scss'

const SAVE_MS = 400
let publish = () => {}

const root = document.querySelector('#studio')
if (!root) throw new Error('missing studio')
const app = root
app.className = 'studio'

const head = el('header', { className: 'studio-head' })
const tabs = el('div', { className: 'studio-tabs' })
const titleInput = el('input', { className: 'studio-title' })
titleInput.type = 'text'
titleInput.placeholder = 'Название презентации'
titleInput.setAttribute('aria-label', 'Название презентации')
const status = el('span', { className: 'studio-status' })
status.setAttribute('aria-live', 'polite')
status.textContent = 'Загрузка…'
const presentButton = el('button', { className: 'studio-present' }, 'Показать')
presentButton.type = 'button'
const remoteButton = el('button', { className: 'studio-remote' }, 'Ведущий')
remoteButton.type = 'button'
head.append(tabs, titleInput, status, remoteButton, presentButton)

const work = el('div', { className: 'studio-work' })
const rail = el('nav', { className: 'studio-rail' })
rail.setAttribute('aria-label', 'Слайды')
const actions = el('div', { className: 'studio-actions' })
const addButton = toolButton('Добавить')
const counter = el('span', { className: 'studio-count' })
actions.append(addButton, counter)
const slideList = el('div', { className: 'studio-slides' })
const slideMenu = el('div', { className: 'studio-menu' })
slideMenu.setAttribute('role', 'menu')
slideMenu.hidden = true
rail.append(actions, slideList)

const host = el('div', { className: 'studio-stage' })
placeHost(false)
host.style.width = '100%'
host.style.height = '100%'
host.style.setProperty('--stage-w', String(STAGE_WIDTH))
host.style.setProperty('--stage-h', String(STAGE_HEIGHT))
const shadow = host.attachShadow({ mode: 'open' })
const style = el('style', presentationCss)
const fonts = el('link')
fonts.rel = 'stylesheet'
fonts.href = FONT_HREF
const overlay = el('div', { className: 'overlay' })
const field = el('div', { className: 'crease-field' })
field.innerHTML = CREASE
const viewport = el('div', { className: 'viewport' })
const slot = el('div', { className: 'stage-slot' })
const stage = el('div', { className: 'stage' })
slot.append(stage)
viewport.append(slot)
const photo = createLightbox(overlay, () => {})
overlay.append(field, viewport, photo.root)
shadow.append(style, fonts, overlay)
photo.watch(() => publish())

const inspector = el('aside', { className: 'studio-inspector' })
inspector.setAttribute('aria-label', 'Слайд')
work.append(rail, host, inspector)
app.append(head, work, slideMenu)

const state: {
  decks: { id: string, title: string }[]
  library: LibraryGroup[]
  deck: Deck | null
  index: number
  presenting: boolean
  pendingCard: number | null
  dirty: boolean
  inspectorStamp: string
  libraryQuery: string
} = {
  decks: [],
  library: [],
  deck: null,
  index: 0,
  presenting: false,
  pendingCard: null,
  dirty: false,
  inspectorStamp: '',
  libraryQuery: '',
}

let timer = 0
let chain = Promise.resolve()
let menuIndex: number | null = null
let menuAnchor: HTMLElement | null = null
let listedRaw = ''
let listedSlides: RemoteSlide[] = []

function toolButton(label: string) {
  const button = el('button', { className: 'studio-tool' }, label)
  button.type = 'button'
  return button
}

function miniButton(label: string) {
  const button = el('button', { className: 'studio-mini' }, label)
  button.type = 'button'
  return button
}

function placeHost(presenting: boolean) {
  host.style.position = presenting ? 'fixed' : 'relative'
  host.style.zIndex = presenting ? '30' : '0'
  host.style.inset = presenting ? '0' : 'auto'
}

function placeRemote(presenting: boolean) {
  remoteButton.classList.toggle('studio-remote-float', presenting)
  if (presenting) app.append(remoteButton)
  else head.insertBefore(remoteButton, presentButton)
}

function deckKey() {
  return state.deck ? `studio:${state.deck.id}` : 'studio:'
}

function listedDeck(deck: Deck) {
  const raw = JSON.stringify(deck.slides)
  if (raw === listedRaw) return listedSlides
  listedRaw = raw
  listedSlides = deck.slides.map((slide) => {
    const root = renderStudioSlide(slide)
    return {
      title: root.querySelector('h1')?.textContent?.trim() ?? '',
      step: '',
      images: slidePhotos(root),
      markup: slideMarkup(root),
    }
  })
  return listedSlides
}

function readState() {
  const deck = state.deck
  return {
    key: deckKey(),
    open: state.presenting && Boolean(deck),
    index: state.index,
    slides: deck ? listedDeck(deck) : [],
    lightbox: photo.isOpen()
      ? { index: photo.index(), view: photo.getView() }
      : null,
  }
}

function openAt(images: HTMLImageElement[], index: number) {
  if (!images.length) return
  photo.open(
    images.map(image => ({ src: image.currentSrc || image.src, alt: image.alt })),
    clampIndex(index, images.length),
  )
}

function scrollCopy(index: number, top: number) {
  if (!state.presenting || index !== state.index) return
  const body = stage.querySelector('.copy-body')
  if (!(body instanceof HTMLElement)) return
  const room = body.scrollHeight - body.clientHeight
  body.scrollTop = top * Math.max(0, room)
}

function showAt(index: number) {
  if (!state.deck) return
  if (photo.isOpen()) photo.close()
  const next = clampIndex(index, state.deck.slides.length)
  const moved = next !== state.index
  state.index = next
  state.pendingCard = null
  if (!state.presenting) setPresenting(true)
  if (!moved) return
  paintStage()
  paintRail()
  paintInspector(true)
}

function applyCommand(command: RemoteCommand) {
  if (command.type === 'text-save' || command.type === 'text-reset' || command.type === 'text-hide') return
  if (!state.deck) return
  if (command.type === 'show') {
    showAt(command.index)
    return
  }
  if (command.type === 'copy-scroll') {
    scrollCopy(command.index, command.top)
    return
  }
  if (command.type === 'lightbox-close') {
    photo.close()
    return
  }
  if (command.type === 'lightbox-view') {
    if (photo.isOpen()) photo.setView(command.view)
    return
  }
  if (command.type === 'lightbox-photo') {
    if (photo.isOpen()) photo.select(command.index)
    return
  }
  const images = slideImages(stage)
  if (!images.length) return
  if (!state.presenting) setPresenting(true)
  openAt(images, command.index)
}

function openRemote() {
  setPresenting(true)
  const opened = window.open(presenterHref(), 'origami-presenter')
  opened?.focus()
}

function updateFit() {
  const styles = getComputedStyle(viewport)
  const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
  const padY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
  const width = Math.max(0, viewport.clientWidth - padX)
  const height = Math.max(0, viewport.clientHeight - padY)
  const fit = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT)
  slot.style.setProperty('--fit', String(Number.isFinite(fit) && fit > 0 ? fit : 0.2))
}

function current() {
  return state.deck?.slides[state.index] ?? null
}

function imageName(src: string) {
  try {
    const path = src.startsWith('/') ? src : new URL(src).pathname
    return decodeURIComponent(path.split('/').pop() || src)
  } catch {
    return src
  }
}

function enqueueSave() {
  chain = chain.then(() => writeDeck()).catch(() => {
    status.textContent = 'Не записалось'
  })
  return chain
}

function scheduleSave() {
  state.dirty = true
  status.textContent = 'Запись…'
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void enqueueSave()
  }, SAVE_MS)
}

async function flushSave() {
  window.clearTimeout(timer)
  await enqueueSave()
}

async function writeDeck() {
  const deck = state.deck
  if (!deck || !state.dirty) return
  const payload = JSON.stringify(deck)
  state.dirty = false
  const response = await fetch(`/studio/api/decks/${deck.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: payload,
  })
  if (!response.ok) {
    state.dirty = true
    status.textContent = 'Не записалось'
    return
  }
  const summary = state.decks.find(item => item.id === deck.id)
  if (summary) summary.title = deck.title
  paintTabs()
  status.textContent = state.dirty ? 'Запись…' : 'Сохранено'
}

function paintTabs() {
  tabs.replaceChildren()
  for (const item of state.decks) {
    const button = el('button', { className: 'studio-tab' }, item.title)
    button.type = 'button'
    button.classList.toggle('is-current', item.id === state.deck?.id)
    button.setAttribute('aria-pressed', item.id === state.deck?.id ? 'true' : 'false')
    button.addEventListener('click', () => {
      void openDeck(item.id)
    })
    tabs.append(button)
  }
}

function paintActions() {
  const total = state.deck?.slides.length ?? 0
  addButton.disabled = !state.deck
  presentButton.disabled = total === 0
  remoteButton.disabled = total === 0
  counter.textContent = total ? `${state.index + 1} / ${total}` : ''
}

function closeSlideMenu() {
  slideMenu.hidden = true
  menuAnchor?.setAttribute('aria-expanded', 'false')
  menuIndex = null
  menuAnchor = null
}

function placeSlideMenu(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect()
  const menu = slideMenu.getBoundingClientRect()
  let left = rect.right - menu.width
  if (left < 8) left = 8
  if (left + menu.width > window.innerWidth - 8) left = window.innerWidth - menu.width - 8
  let top = rect.bottom + 4
  if (top + menu.height > window.innerHeight - 8) top = rect.top - menu.height - 4
  slideMenu.style.left = `${Math.max(8, left)}px`
  slideMenu.style.top = `${Math.max(8, top)}px`
}

function menuItem(label: string, disabled: boolean, run: () => void) {
  const button = el('button', { className: 'studio-menu-item' }, label)
  button.type = 'button'
  button.setAttribute('role', 'menuitem')
  button.disabled = disabled
  button.addEventListener('click', () => {
    closeSlideMenu()
    run()
  })
  return button
}

function openSlideMenu(index: number, anchor: HTMLElement) {
  const deck = state.deck
  if (!deck) return
  closeSlideMenu()
  menuIndex = index
  menuAnchor = anchor
  const total = deck.slides.length
  const remove = menuItem('Удалить', total < 2, () => deleteSlide(index))
  remove.classList.add('is-danger')
  slideMenu.replaceChildren(
    menuItem('Вверх', index <= 0, () => moveSlide(index, -1)),
    menuItem('Вниз', index >= total - 1, () => moveSlide(index, 1)),
    menuItem('Дублировать', false, () => duplicateSlide(index)),
    el('div', { className: 'studio-menu-sep' }),
    remove,
  )
  slideMenu.hidden = false
  anchor.setAttribute('aria-expanded', 'true')
  placeSlideMenu(anchor)
}

function toggleSlideMenu(index: number, anchor: HTMLElement) {
  if (menuIndex === index && !slideMenu.hidden) {
    closeSlideMenu()
    return
  }
  openSlideMenu(index, anchor)
}

function moreIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('aria-hidden', 'true')
  for (const cy of ['3.2', '8', '12.8']) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', '8')
    circle.setAttribute('cy', cy)
    circle.setAttribute('r', '1.25')
    circle.setAttribute('fill', 'currentColor')
    svg.append(circle)
  }
  return svg
}

function paintRail() {
  closeSlideMenu()
  slideList.replaceChildren()
  const deck = state.deck
  if (!deck) {
    paintActions()
    return
  }
  deck.slides.forEach((slide, index) => {
    const row = el('div', { className: 'studio-slide' })
    row.classList.toggle('is-current', index === state.index)
    const button = el('button', { className: 'studio-slide-main' })
    button.type = 'button'
    if (index === state.index) button.setAttribute('aria-current', 'true')
    const number = el('span', { className: 'studio-num' }, String(index + 1).padStart(2, '0'))
    const text = el('span', { className: 'studio-slide-text' })
    const name = el('strong')
    name.textContent = slide.title.trim() || 'Без названия'
    const kind = el('small')
    kind.textContent = LAYOUT_LABEL[slide.layout]
    text.append(name, kind)
    button.append(number, text)
    button.addEventListener('click', () => selectSlide(index))
    const more = el('button', { className: 'studio-more' })
    more.type = 'button'
    more.setAttribute('aria-label', 'Действия слайда')
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.append(moreIcon())
    more.addEventListener('click', () => toggleSlideMenu(index, more))
    row.append(button, more)
    slideList.append(row)
  })
  slideList.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' })
  paintActions()
}

function paintStage() {
  const slide = current()
  stage.replaceChildren()
  if (!slide || !state.deck) return
  stage.append(renderStudioSlide(slide))
  stage.setAttribute('aria-label', `Слайд ${state.index + 1} из ${state.deck.slides.length}`)
  requestAnimationFrame(updateFit)
  publish()
}

function syncTitle() {
  if (!state.deck || document.activeElement === titleInput) return
  titleInput.value = state.deck.title
}

function stampOf(slide: StudioSlide) {
  const images = slide.images.map(image => image.src).join('|')
  const cards = slide.cards.map(card => card.image?.src ?? '').join('|')
  return `${slide.id}|${slide.layout}|${slide.cards.length}|${images}|${cards}|${state.pendingCard}`
}

function labeled(caption: string, control: HTMLElement) {
  const wrap = el('label', { className: 'studio-field' })
  const span = el('span')
  span.textContent = caption
  wrap.append(span, control)
  return wrap
}

function textField(value: string, onInput: (value: string) => void) {
  const input = el('input', { className: 'studio-input' })
  input.type = 'text'
  input.value = value
  input.addEventListener('input', () => onInput(input.value))
  return input
}

function areaField(value: string, rows: number, onInput: (value: string) => void) {
  const area = el('textarea', { className: 'studio-input studio-area' })
  area.rows = rows
  area.value = value
  area.addEventListener('input', () => onInput(area.value))
  return area
}

function layoutField(slide: StudioSlide) {
  const select = el('select', { className: 'studio-input' })
  for (const layout of LAYOUTS) {
    const option = el('option')
    option.value = layout
    option.textContent = LAYOUT_LABEL[layout]
    option.selected = layout === slide.layout
    select.append(option)
  }
  select.addEventListener('change', () => {
    if (!isLayout(select.value)) return
    slide.layout = select.value
    if (slide.layout === 'cards' && slide.cards.length === 0) {
      slide.cards.push(blankCard(), blankCard())
    }
    state.pendingCard = null
    retarget()
  })
  return labeled('Макет', select)
}

function sideField(slide: StudioSlide) {
  const row = el('div', { className: 'studio-row' })
  const right = el('button', { className: 'studio-side' }, 'Фото справа')
  const left = el('button', { className: 'studio-side' }, 'Фото слева')
  right.type = 'button'
  left.type = 'button'
  const paint = () => {
    right.setAttribute('aria-pressed', slide.imageSide === 'right' ? 'true' : 'false')
    left.setAttribute('aria-pressed', slide.imageSide === 'left' ? 'true' : 'false')
  }
  right.addEventListener('click', () => {
    slide.imageSide = 'right'
    paint()
    paintStage()
    scheduleSave()
  })
  left.addEventListener('click', () => {
    slide.imageSide = 'left'
    paint()
    paintStage()
    scheduleSave()
  })
  paint()
  row.append(right, left)
  return row
}

function imageNote(slide: StudioSlide) {
  const note = el('p', { className: 'studio-note' })
  if (slide.layout === 'grid') note.textContent = 'На слайде видны первые шесть фото, в этом порядке.'
  else if (slide.layout === 'cards') note.textContent = 'У карточек свои фото. Этот список остаётся для других макетов.'
  else if (slide.layout === 'chapter' || slide.layout === 'end') note.textContent = 'На этом макете фото не показывается, но остается на презентации.'
  else note.textContent = 'На слайде видно первое фото. Порядок меняет, какое именно.'
  return note
}

function imageList(slide: StudioSlide) {
  const block = el('div', { className: 'studio-images' })
  const heading = el('p', { className: 'studio-note' })
  heading.textContent = 'Фото слайда'
  block.append(heading, imageNote(slide))
  slide.images.forEach((image, index) => {
    block.append(imageRow(slide, image, index))
  })
  return block
}

function imageRow(slide: StudioSlide, image: StudioImage, index: number) {
  const row = el('div', { className: 'studio-image' })
  const preview = el('img')
  preview.src = image.src
  preview.alt = ''
  const body = el('div')
  const name = el('p', { className: 'studio-note' })
  name.textContent = imageName(image.src)
  const alt = textField(image.alt, (value) => {
    image.alt = value
    paintStage()
    scheduleSave()
  })
  alt.placeholder = 'Подпись'
  alt.setAttribute('aria-label', 'Подпись фото')
  const tools = el('div', { className: 'studio-image-tools' })
  const up = miniButton('Выше')
  const down = miniButton('Ниже')
  const remove = miniButton('Убрать')
  up.disabled = index === 0
  down.disabled = index === slide.images.length - 1
  up.addEventListener('click', () => moveImage(index, -1))
  down.addEventListener('click', () => moveImage(index, 1))
  remove.addEventListener('click', () => removeImage(index))
  tools.append(up, down, remove)
  body.append(name, alt, tools)
  row.append(preview, body)
  return row
}

function cardList(slide: StudioSlide) {
  const block = el('div', { className: 'studio-cards' })
  const heading = el('p', { className: 'studio-note' })
  heading.textContent = 'Карточки'
  block.append(heading)
  slide.cards.forEach((card, index) => {
    const box = el('div', { className: 'studio-card' })
    box.classList.toggle('is-armed', state.pendingCard === index)
    const title = textField(card.title, (value) => {
      card.title = value
      paintStage()
      scheduleSave()
    })
    title.setAttribute('aria-label', 'Заголовок карточки')
    const body = areaField(card.body, 2, (value) => {
      card.body = value
      paintStage()
      scheduleSave()
    })
    body.setAttribute('aria-label', 'Текст карточки')
    const tools = el('div', { className: 'studio-card-tools' })
    if (card.image?.src) {
      const preview = el('img', { className: 'studio-card-photo' })
      preview.src = card.image.src
      preview.alt = ''
      box.append(preview)
    }
    const pick = miniButton(state.pendingCard === index ? 'Отмена' : 'Поставить фото')
    pick.addEventListener('click', () => {
      state.pendingCard = state.pendingCard === index ? null : index
      paintInspector(true)
    })
    const clear = miniButton('Убрать фото')
    clear.disabled = !card.image
    clear.addEventListener('click', () => {
      card.image = null
      state.pendingCard = null
      retarget()
    })
    const remove = miniButton('Убрать карточку')
    remove.disabled = slide.cards.length < 2
    remove.addEventListener('click', () => {
      slide.cards.splice(index, 1)
      if (state.pendingCard === index) state.pendingCard = null
      else if (state.pendingCard !== null && state.pendingCard > index) state.pendingCard -= 1
      retarget()
    })
    tools.append(pick, clear, remove)
    box.append(title, body, tools)
    block.append(box)
  })
  const add = toolButton('Добавить карточку')
  add.disabled = slide.cards.length >= 4
  add.addEventListener('click', () => {
    slide.cards.push(blankCard())
    retarget()
  })
  block.append(add)
  return block
}

function libraryBlock() {
  const block = el('div', { className: 'studio-library' })
  block.classList.toggle('is-armed', state.pendingCard !== null)
  const heading = el('p', { className: 'studio-group' })
  heading.textContent = 'Библиотека'
  const filter = el('input', { className: 'studio-input' })
  filter.type = 'search'
  filter.placeholder = 'Найти снимок'
  filter.value = state.libraryQuery
  filter.setAttribute('aria-label', 'Найти снимок')
  filter.addEventListener('input', () => {
    state.libraryQuery = filter.value
    applyLibraryFilter(block)
  })
  const form = el('form', { className: 'studio-row' })
  const url = el('input', { className: 'studio-input' })
  url.type = 'url'
  url.placeholder = 'https://…'
  url.setAttribute('aria-label', 'Адрес снимка')
  const submit = toolButton('Добавить')
  submit.type = 'submit'
  form.append(url, submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    addImage(url.value)
    url.value = ''
  })
  block.append(heading, filter, form)
  if (state.pendingCard !== null) {
    const banner = el('p', { className: 'studio-note' })
    banner.textContent = 'Следующий снимок встанет на выбранную карточку.'
    block.append(banner)
  }
  if (!state.library.length) {
    const empty = el('p', { className: 'studio-note' })
    empty.textContent = 'Папки с фото не найдены. Можно вставить адрес снимка.'
    block.append(empty)
  }
  for (const group of state.library) {
    const title = el('h2', { className: 'studio-group' })
    title.textContent = group.title
    const grid = el('div', { className: 'studio-library-grid' })
    for (const image of group.images) {
      const thumb = el('button', { className: 'studio-thumb' })
      thumb.type = 'button'
      thumb.dataset.name = image.name
      thumb.setAttribute('aria-label', image.name)
      const img = el('img')
      img.src = image.src
      img.alt = ''
      thumb.append(img)
      thumb.addEventListener('click', () => addImage(image.src, image.name))
      grid.append(thumb)
    }
    block.append(title, grid)
  }
  applyLibraryFilter(block)
  return block
}

function applyLibraryFilter(block: HTMLElement) {
  const query = state.libraryQuery.trim().toLowerCase()
  for (const thumb of block.querySelectorAll<HTMLElement>('.studio-thumb')) {
    const name = thumb.dataset.name?.toLowerCase() ?? ''
    thumb.hidden = query.length > 0 && !name.includes(query)
  }
}

function paintInspector(force = false) {
  const slide = current()
  if (!slide) {
    inspector.replaceChildren()
    state.inspectorStamp = ''
    return
  }
  const stamp = stampOf(slide)
  if (!force && stamp === state.inspectorStamp) return
  state.inspectorStamp = stamp
  const title = textField(slide.title, (value) => {
    slide.title = value
    paintStage()
    paintRail()
    scheduleSave()
  })
  title.setAttribute('aria-label', 'Заголовок слайда')
  inspector.replaceChildren(layoutField(slide), labeled('Заголовок', title))
  if (slide.layout === 'split') inspector.append(sideField(slide))
  if (slide.layout === 'cover' || slide.layout === 'quote') {
    inspector.append(labeled('Подпись', areaField(slide.body.join('\n'), 3, (value) => {
      slide.body = value.split('\n')
      paintStage()
      scheduleSave()
    })))
  }
  if (slide.layout === 'split') {
    inspector.append(labeled('Абзацы', areaField(slide.body.join('\n'), 6, (value) => {
      slide.body = value.split('\n')
      paintStage()
      scheduleSave()
    })))
  }
  if (slide.layout === 'end') {
    inspector.append(labeled('Ссылка', textField(slide.href, (value) => {
      slide.href = value
      paintStage()
      scheduleSave()
    })))
    inspector.append(labeled('Видео', textField(slide.youtubeId, (value) => {
      slide.youtubeId = value
      paintStage()
      scheduleSave()
    })))
  }
  if (slide.layout === 'cards') inspector.append(cardList(slide))
  inspector.append(imageList(slide), libraryBlock())
}

function paint() {
  syncTitle()
  paintTabs()
  paintRail()
  paintStage()
  paintInspector()
}

function selectSlide(index: number) {
  if (!state.deck || index === state.index) return
  state.index = index
  state.pendingCard = null
  paintStage()
  paintRail()
  paintInspector(true)
}

function retarget() {
  paintStage()
  paintRail()
  paintInspector(true)
  scheduleSave()
}

function addImage(src: string, alt = '') {
  const slide = current()
  const trimmed = src.trim()
  if (!slide || !trimmed) return
  if (state.pendingCard !== null) {
    const card = slide.cards[state.pendingCard]
    if (!card) return
    card.image = { src: trimmed, alt: card.title.trim() || alt }
    state.pendingCard = null
    retarget()
    return
  }
  if (slide.images.some(image => image.src === trimmed)) {
    status.textContent = 'Уже на слайде'
    return
  }
  slide.images.push({ src: trimmed, alt })
  retarget()
}

function moveImage(index: number, delta: number) {
  const slide = current()
  if (!slide) return
  const next = index + delta
  if (next < 0 || next >= slide.images.length) return
  const [image] = slide.images.splice(index, 1)
  if (!image) return
  slide.images.splice(next, 0, image)
  retarget()
}

function removeImage(index: number) {
  const slide = current()
  if (!slide) return
  slide.images.splice(index, 1)
  retarget()
}

function addSlide() {
  if (!state.deck) return
  state.deck.slides.splice(state.index + 1, 0, blankSlide())
  state.index += 1
  state.pendingCard = null
  retarget()
}

function duplicateSlide(index = state.index) {
  const slide = state.deck?.slides[index]
  if (!state.deck || !slide) return
  const copy = structuredClone(slide)
  copy.id = crypto.randomUUID()
  state.deck.slides.splice(index + 1, 0, copy)
  state.index = index + 1
  state.pendingCard = null
  retarget()
}

function deleteSlide(index = state.index) {
  if (!state.deck || state.deck.slides.length < 2) return
  state.deck.slides.splice(index, 1)
  if (state.index > index) state.index -= 1
  else if (state.index === index) state.index = Math.min(index, state.deck.slides.length - 1)
  state.pendingCard = null
  retarget()
}

function moveSlide(index: number, delta: number) {
  if (!state.deck) return
  const next = index + delta
  if (next < 0 || next >= state.deck.slides.length) return
  const [slide] = state.deck.slides.splice(index, 1)
  if (!slide) return
  state.deck.slides.splice(next, 0, slide)
  if (state.index === index) state.index = next
  else if (index < state.index && next >= state.index) state.index -= 1
  else if (index > state.index && next <= state.index) state.index += 1
  retarget()
}

function setPresenting(on: boolean) {
  if (on) closeSlideMenu()
  state.presenting = on
  if (!on && photo.isOpen()) photo.close()
  app.classList.toggle('is-presenting', on)
  overlay.classList.toggle('is-showing', on)
  placeHost(on)
  placeRemote(on)
  requestAnimationFrame(updateFit)
  publish()
}

async function openDeck(id: string) {
  if (state.deck?.id === id) return
  await flushSave()
  const response = await fetch(`/studio/api/decks/${id}`)
  const deck = parseDeck(await response.json() as unknown)
  if (!response.ok || !deck) {
    status.textContent = 'Презентация не читается'
    return
  }
  state.deck = deck
  state.index = 0
  state.pendingCard = null
  state.inspectorStamp = ''
  const url = new URL(location.href)
  url.searchParams.set('deck', id)
  history.replaceState(null, '', url)
  titleInput.value = deck.title
  paint()
  status.textContent = 'Сохранено'
}

addButton.addEventListener('click', addSlide)
presentButton.addEventListener('click', () => setPresenting(true))
remoteButton.addEventListener('click', openRemote)
stage.addEventListener('click', (event) => {
  if (!state.presenting || !(event.target instanceof Element)) return
  const frame = event.target.closest('.photo-frame, .card-photo')
  const img = frame?.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  const images = slideImages(stage)
  const index = images.indexOf(img)
  if (index < 0) return
  openAt(images, index)
})
titleInput.addEventListener('input', () => {
  if (!state.deck) return
  state.deck.title = titleInput.value
  const summary = state.decks.find(item => item.id === state.deck?.id)
  if (summary) summary.title = state.deck.title
  paintTabs()
  scheduleSave()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !slideMenu.hidden) {
    event.preventDefault()
    closeSlideMenu()
    return
  }
  if (state.presenting && photo.isOpen() && event.key === 'Escape') {
    event.preventDefault()
    photo.close()
    return
  }
  if (state.presenting && photo.onKey(event)) return
  if (event.key === 'Escape' && state.presenting) {
    event.preventDefault()
    setPresenting(false)
    return
  }
  if (!state.presenting) return
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault()
    moveSlideView(1)
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    moveSlideView(-1)
  }
})

function moveSlideView(delta: number) {
  if (!state.deck) return
  const next = Math.min(state.deck.slides.length - 1, Math.max(0, state.index + delta))
  if (next === state.index) return
  state.index = next
  state.pendingCard = null
  paintStage()
  paintRail()
  paintInspector(true)
}

document.addEventListener('pointerdown', (event) => {
  if (slideMenu.hidden) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (slideMenu.contains(target) || menuAnchor?.contains(target)) return
  closeSlideMenu()
})

slideList.addEventListener('scroll', () => closeSlideMenu(), { passive: true })

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushSave()
})

new ResizeObserver(() => updateFit()).observe(viewport)

async function boot() {
  const [libraryResponse, listResponse] = await Promise.all([
    fetch('/studio/api/library'),
    fetch('/studio/api/decks'),
  ])
  state.library = parseLibrary(await libraryResponse.json() as unknown)
  state.decks = parseDeckList(await listResponse.json() as unknown)
  const requested = new URLSearchParams(location.search).get('deck')
  const known = state.decks.some(item => item.id === requested)
  const id = known ? requested : state.decks[0]?.id
  if (!id) {
    status.textContent = 'Презентаций отсутствуют'
    paint()
    return
  }
  state.deck = null
  await openDeck(id)
}

if (import.meta.env.DEV) {
  const sync = attachStage({
    get key() {
      return deckKey()
    },
    read: readState,
    apply: applyCommand,
  })
  publish = sync.publish
  publish()
}

void boot().catch(() => {
  status.textContent = 'Редактор не открылся'
})
