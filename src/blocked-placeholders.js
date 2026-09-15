/** Shared blocked-ad landscape placeholders (served from /placeholders). */
export const BLOCKED_PLACEHOLDERS = [
  '/placeholders/landscape-01.png',
  '/placeholders/landscape-02.png',
  '/placeholders/landscape-03.png',
  '/placeholders/landscape-04.png',
  '/placeholders/landscape-05.png',
  '/placeholders/landscape-06.png',
  '/placeholders/landscape-07.png',
  '/placeholders/landscape-08.png',
]

export function pickBlockedPlaceholder(seed = '') {
  const list = BLOCKED_PLACEHOLDERS
  if (!list.length) return ''
  let hash = 0
  const text = String(seed || '')
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  if (!text) hash = Math.floor(Math.random() * list.length)
  return list[hash % list.length]
}
