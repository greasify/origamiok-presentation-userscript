import type { PageModel } from '../parse-page'
import { el } from '@zero-dependency/dom'
import presentationCss from '../presentation.scss?inline'
import { beginTranslation, cachedTranslation, translatorAvailability } from '../translate'
import {
  CLOSE_ICON,
  CREASE,
  FONT_HREF,
  LAUNCH_LABEL,
  NEXT_ICON,
  PREV_ICON,
  sealButton,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './dom'
import {
  bindFullscreen,
  bindKey,
  holdOverflow,
  HOST_ID,
  lockEscape,
  releaseOverflow,
  unbindKey,
  unlockEscape,
  unmountPresentation,
} from './host'
import { createLightbox } from './lightbox'
import { createOverview } from './overview'
import { applyText, renderSlides } from './slides'

export function mountPresentation(page: PageModel) {
  unmountPresentation()

  const host = el('div')
  host.id = HOST_ID
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.zIndex = '2147483646'
  host.style.pointerEvents = 'none'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = el('style', presentationCss)
  const fonts = el('link')
  fonts.rel = 'stylesheet'
  fonts.href = FONT_HREF

  const launch = el('button', { className: 'launch' }, LAUNCH_LABEL)
  launch.type = 'button'

  const overlay = el('div', { className: 'overlay' })
  overlay.hidden = true
  overlay.tabIndex = -1
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Презентация')

  const field = el('div', { className: 'crease-field' })
  field.innerHTML = CREASE
  const viewport = el('div', { className: 'viewport' })
  const slot = el('div', { className: 'stage-slot' })
  const stage = el('div', { className: 'stage' })
  const { rendered, bindings } = renderSlides(page)
  for (const slide of rendered) stage.append(slide.root)
  slot.append(stage)
  viewport.append(slot)

  const bar = el('div', { className: 'bar' })
  const pager = el('div', { className: 'pager' })
  const prev = sealButton('', 'Назад', PREV_ICON)
  const counter = el('button', { className: 'counter' })
  counter.type = 'button'
  counter.setAttribute('aria-expanded', 'false')
  const next = sealButton('', 'Дальше', NEXT_ICON)
  const status = el('span', { className: 'status' })
  const closeButton = sealButton('', 'Закрыть', CLOSE_ICON)
  status.setAttribute('aria-live', 'polite')
  pager.append(prev, counter, next)
  bar.append(pager, status, closeButton)

  const photo = createLightbox(overlay, unlockEscape)

  overlay.append(field, viewport, bar, photo.root)
  shadow.append(style, fonts, launch, overlay)
  document.documentElement.append(host)

  let index = 0
  let session: { prioritize: (texts: readonly string[]) => void } | null = null
  let wired = false
  let listening = false
  const total = rendered.length
  const todo = [...new Set(rendered.flatMap(slide => slide.texts))].filter(text => !cachedTranslation(text))

  const updateFit = () => {
    const styles = getComputedStyle(viewport)
    const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
    const padY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
    const width = Math.max(0, viewport.clientWidth - padX)
    const height = Math.max(0, viewport.clientHeight - padY)
    const fit = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT)
    slot.style.setProperty('--fit', String(Number.isFinite(fit) && fit > 0 ? fit : 0.2))
  }

  const show = (nextIndex: number) => {
    index = Math.min(total - 1, Math.max(0, nextIndex))
    rendered.forEach((slide, slideIndex) => {
      const active = slideIndex === index
      slide.root.classList.toggle('is-active', active)
      slide.root.setAttribute('aria-hidden', active ? 'false' : 'true')
    })
    counter.textContent = `${index + 1} / ${total}`
    counter.setAttribute('aria-label', `Все слайды, ${index + 1} из ${total}`)
    prev.disabled = index === 0
    next.disabled = index === total - 1
    stage.setAttribute('aria-label', `Слайд ${index + 1} из ${total}`)
    session?.prioritize(rendered.slice(index, index + 4).flatMap(slide => slide.texts))
  }

  const go = (delta: number) => show(index + delta)

  const overview = createOverview(rendered.map(slide => slide.root), (picked) => {
    show(picked)
  }, () => {
    counter.setAttribute('aria-expanded', 'false')
  })
  overlay.insertBefore(overview.root, photo.root)

  let onKey: (event: KeyboardEvent) => void = () => {}
  let suppressFullscreenExit = false

  const presentationIsFullscreen = () => document.fullscreenElement === host

  const holdEscape = () => {
    if (!presentationIsFullscreen()) return
    lockEscape()
  }

  const onFullscreenChange = () => {
    const fullscreen = presentationIsFullscreen()
    overlay.classList.toggle('is-fullscreen', fullscreen)
    if (fullscreen) {
      if (photo.isOpen()) holdEscape()
      return
    }
    if (!suppressFullscreenExit) return
    suppressFullscreenExit = false
    void host.requestFullscreen().catch(() => {})
  }

  const close = () => {
    photo.close()
    overview.close()
    unlockEscape()
    overlay.hidden = true
    launch.hidden = false
    releaseOverflow()
    if (document.fullscreenElement === host) void document.exitFullscreen()
    if (listening) {
      unbindKey(onKey)
      listening = false
    }
    launch.focus()
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void host.requestFullscreen().then(() => {
      if (photo.isOpen()) holdEscape()
    }).catch(() => {})
  }

  onKey = (event: KeyboardEvent) => {
    const key = event.key
    if (key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (photo.isOpen()) {
        event.stopImmediatePropagation()
        suppressFullscreenExit = presentationIsFullscreen()
        photo.close()
        queueMicrotask(() => {
          suppressFullscreenExit = false
          unlockEscape()
        })
        return
      }
      if (overview.onKey(event)) return
      close()
      return
    }
    if (photo.onKey(event)) return
    if (overview.onKey(event)) return
    if (event.code === 'KeyF') {
      event.preventDefault()
      toggleFullscreen()
      return
    }
    if (key === 'Home') {
      event.preventDefault()
      show(0)
      return
    }
    if (key === 'End') {
      event.preventDefault()
      show(total - 1)
      return
    }
    const typingOnButton = event.target instanceof HTMLButtonElement
    if (key === 'ArrowRight' || key === 'PageDown' || (key === ' ' && !event.shiftKey)) {
      if (key === ' ' && typingOnButton) return
      event.preventDefault()
      go(1)
      return
    }
    if (key === 'ArrowLeft' || key === 'PageUp' || (key === ' ' && event.shiftKey)) {
      event.preventDefault()
      go(-1)
    }
  }

  const open = () => {
    if (!overlay.hidden) return
    launch.hidden = true
    overlay.hidden = false
    holdOverflow()
    if (!listening) {
      bindKey(onKey)
      listening = true
    }
    overlay.focus()
    requestAnimationFrame(updateFit)
  }

  bindFullscreen(onFullscreenChange)

  const watch = new ResizeObserver(() => updateFit())
  watch.observe(viewport)
  show(0)

  stage.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const frame = event.target.closest('.photo-frame')
    const img = frame?.querySelector('img')
    if (!img?.src) return
    photo.open(img.currentSrc || img.src, img.alt)
    holdEscape()
  })
  prev.addEventListener('click', () => go(-1))
  next.addEventListener('click', () => go(1))
  counter.addEventListener('click', () => {
    if (overview.isOpen()) {
      overview.close()
      return
    }
    counter.setAttribute('aria-expanded', 'true')
    overview.open(index)
  })
  closeButton.addEventListener('click', close)

  const enqueue = (translator: NonNullable<Awaited<ReturnType<typeof beginTranslation>>>) => {
    session = translator
    let left = todo.length
    if (!left) {
      status.textContent = ''
      return
    }
    status.textContent = 'Переводим…'
    const windowTexts = rendered.slice(0, 4).flatMap(slide => slide.texts)
    for (const text of todo) {
      const found = windowTexts.indexOf(text)
      const priority = found === -1 ? 0 : 1000 - found
      void translator.translate(text, priority).then((translated) => {
        applyText(bindings, text, translated)
        left -= 1
        if (left <= 0) status.textContent = ''
      })
    }
    translator.prioritize(windowTexts)
  }

  let awaitingTranslator = false
  let stallTimer = 0
  const stopStall = () => {
    window.clearTimeout(stallTimer)
    stallTimer = 0
  }
  const armStall = () => {
    stopStall()
    stallTimer = window.setTimeout(() => {
      if (wired) return
      launch.textContent = LAUNCH_LABEL
      status.textContent = 'Переводчик Chrome не отвечает, текст на языке страницы'
    }, 15_000)
  }
  launch.addEventListener('click', () => {
    open()
    if (wired || awaitingTranslator) return
    awaitingTranslator = true
    if (todo.length) {
      status.textContent = 'Готовим перевод…'
      armStall()
    }
    const pending = beginTranslation((loaded) => {
      armStall()
      const label = `Модель перевода ${Math.round(loaded * 100)}%`
      launch.textContent = label
      status.textContent = label
    })
    void pending.then((translator) => {
      stopStall()
      awaitingTranslator = false
      launch.textContent = LAUNCH_LABEL
      if (!translator) {
        if (todo.length) status.textContent = 'Переводчик Chrome недоступен, текст на языке страницы'
        return
      }
      if (wired) return
      wired = true
      enqueue(translator)
    })
  })

  void translatorAvailability().then((state) => {
    if (state === 'download') launch.title = 'При первом запуске Chrome скачает языковую модель'
    if (state === 'missing') launch.title = 'Переводчик Chrome недоступен, слайды откроются на языке страницы'
  })
}
