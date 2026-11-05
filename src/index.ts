import { pageHasSlides, parsePage } from './parse-page'
import { mountPresentation, unmountPresentation } from './presentation'
import './page.scss'

const STEP_HEADING = /^step\s+\d+\b/i
const CATALOG_HEADINGS = 8

let seenRoute = ''
let wrappedHistory = false

function pathOf(value: string) {
  try {
    return new URL(value, location.origin).pathname
  } catch {
    return value
  }
}

function routeKey() {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? ''
  return `${location.pathname}|${canonical ? pathOf(canonical) : ''}`
}

function internalLinks(content: Element) {
  return [...content.querySelectorAll('a[href]')].filter((anchor) => {
    const href = anchor.getAttribute('href') ?? ''
    if (!href || href.startsWith('#')) return false
    if (href.startsWith('/') && !href.startsWith('//')) return true
    return href.includes('origamiok.com/')
  }).length
}

function isCatalog(content: Element) {
  const headings = [...content.querySelectorAll('h2, h3, h4')]
  if (headings.some(node => STEP_HEADING.test((node.textContent ?? '').trim()))) return false
  if (content.querySelector('.kadence-query-init, .wp-block-kadence-query')) return true
  const counted = headings.filter(node => node.tagName !== 'H4')
  return counted.length > CATALOG_HEADINGS && internalLinks(content) >= counted.length
}

function sync() {
  const body = document.body
  if (!body) return
  const key = routeKey()
  if (key === seenRoute) return
  seenRoute = key

  const preview = body.dataset.origamiPreview === 'true'
  if (body.matches('.home, .blog, .archive, .search') && !preview) {
    unmountPresentation()
    return
  }

  const content = document.querySelector('article .entry-content')
  if (!content || (!preview && isCatalog(content))) {
    unmountPresentation()
    return
  }

  const page = parsePage(document, content)
  if (!pageHasSlides(page)) {
    unmountPresentation()
    return
  }
  mountPresentation(page)
}

function scheduleSync() {
  requestAnimationFrame(() => sync())
}

function watchHistory() {
  if (wrappedHistory) return
  wrappedHistory = true
  let path = location.pathname
  const follow = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      if (location.pathname === path) return
      path = location.pathname
      scheduleSync()
    }
  }
  follow('pushState')
  follow('replaceState')
  window.addEventListener('popstate', () => {
    if (location.pathname === path) return
    path = location.pathname
    scheduleSync()
  })
  window.addEventListener('pageshow', () => {
    path = location.pathname
    scheduleSync()
  })
}

watchHistory()
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => sync(), { once: true })
} else {
  sync()
}
