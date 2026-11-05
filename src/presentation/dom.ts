import type { Photo } from '../parse-page'
import { el } from '@zero-dependency/dom'

export const STAGE_WIDTH = 980
export const STAGE_HEIGHT = 551
export const LAUNCH_LABEL = 'Открыть презентацию'
export const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@600&display=swap'

export const CREASE = `<svg class="crease-grid" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g fill="none" stroke="#8d7358" stroke-width="1.5">
    <rect x="180" y="70" width="1240" height="760" opacity="0.35" />
    <path d="M180 70 L1420 830 M1420 70 L180 830" opacity="0.45" />
    <path d="M800 70 V830 M180 450 H1420" opacity="0.28" />
    <path d="M180 70 L800 450 L1420 70 M180 830 L800 450 L1420 830" opacity="0.2" />
  </g>
</svg>`

function strokeIcon(path: string) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="${path}"/></svg>`
}

const ZOOM_ICON = strokeIcon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')
export const CLOSE_ICON = strokeIcon('M6 6l12 12M18 6L6 18')
export const PREV_ICON = strokeIcon('M14 6 8 12l6 6')
export const NEXT_ICON = strokeIcon('M10 6l6 6-6 6')
export const PLUS_ICON = strokeIcon('M12 6v12M6 12h12')
export const MINUS_ICON = strokeIcon('M6 12h12')

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
