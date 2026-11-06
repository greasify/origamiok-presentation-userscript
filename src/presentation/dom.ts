import type { Photo } from '../parse-page'
import type { CoverFactKind } from '../parse/cover'
import { el } from '@zero-dependency/dom'

export const STAGE_WIDTH = 1024
export const STAGE_HEIGHT = 600
export const LAUNCH_LABEL = 'Открыть презентацию'
export const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@600&display=swap'

export const CREASE = `<svg class="crease-grid" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="#8d7358" stroke-width="1.5">
    <rect x="0" y="0" width="1600" height="900" opacity="0.35" />
    <path d="M0 0 L1600 900 M1600 0 L0 900" opacity="0.45" />
    <path d="M800 0 V900 M0 450 H1600" opacity="0.28" />
    <path d="M0 0 L800 450 L1600 0 M0 900 L800 450 L1600 900" opacity="0.2" />
  </g>
</svg>`

function strokeIcon(path: string) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="${path}"/></svg>`
}

const ZOOM_ICON = strokeIcon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')
export const CLOSE_ICON = strokeIcon('M6 6l12 12M18 6L6 18')
export const EXIT_ICON = strokeIcon('M9 4H5v16h4M10 12h10M16 8l4 4-4 4')
export const PREV_ICON = strokeIcon('M14 6 8 12l6 6')
export const NEXT_ICON = strokeIcon('M10 6l6 6-6 6')
export const OVERVIEW_ICON = strokeIcon('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z')
export const EDIT_ICON = strokeIcon('M4 20l4.5-1.2L19 8.3 15.7 5 5.2 15.5 4 20zM14.5 6.2l3.3 3.3')
export const MAGNIFY_ICON = strokeIcon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3')

function factIcon(markup: string) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`
}

export const FACT_ICONS: Record<CoverFactKind, string> = {
  time: factIcon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l2.5 2"/>'),
  paper: factIcon('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/>'),
  steps: factIcon('<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17" r="1.2" fill="currentColor" stroke="none"/>'),
  level: factIcon('<path d="m12 3 8 9-8 9-8-9z"/>'),
  scissors: factIcon('<circle cx="6" cy="6.5" r="2.4"/><circle cx="6" cy="17.5" r="2.4"/><path d="M8.2 8.2 20 18.5M8.2 15.8 20 5.5"/>'),
  glue: factIcon('<path d="M9 8.5h6V11l1.4 2.2V20.5H7.6V13.2L9 11z"/><path d="M10.2 8.5V5.2h3.6v3.3"/><path d="M11 5.2V3.5h2"/>'),
}

export function sealButton(className: string, label: string, icon: string) {
  const button = el('button', { className: className ? `seal-button ${className}` : 'seal-button' })
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.innerHTML = icon
  return button
}

export function photoFrame(image: Photo, label: string) {
  const slot = el('div', { className: 'photo-slot' })
  const frame = el('div', { className: 'photo-frame' })
  const img = el('img', { className: 'sheet-photo' })
  img.src = image.url
  img.alt = image.alt || label
  img.decoding = 'async'
  frame.append(img, sealButton('photo-zoom', 'На весь экран', ZOOM_ICON))
  slot.append(frame)
  return slot
}
