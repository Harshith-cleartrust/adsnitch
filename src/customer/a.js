/**
 * AdSnitch customer script. Readable source.
 * Production serves the minified build at /a.js?k=SITE_KEY.
 * AdSnitch script version: 0.3.1
 *
 * Does not contain policy rules, keywords, or credentials.
 * API origin is the script URL origin. There is no localhost fallback.
 */
;(function (global) {
  'use strict'

  var VERSION = '0.3.1'
  var ATTR = 'data-ad-url'
  var DONE = 'data-adpage-checked'
  var PLACEHOLDERS = [
    '/placeholders/landscape-01.png',
    '/placeholders/landscape-02.png',
    '/placeholders/landscape-03.png',
    '/placeholders/landscape-04.png',
    '/placeholders/landscape-05.png',
    '/placeholders/landscape-06.png',
    '/placeholders/landscape-07.png',
    '/placeholders/landscape-08.png',
  ]
  var pageLoadId =
    global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : String(Date.now())

  function scriptEl() {
    if (document.currentScript && document.currentScript.src.indexOf('/a.js') !== -1) {
      return document.currentScript
    }
    return document.querySelector('script[src*="/a.js"]')
  }

  function config() {
    var el = scriptEl()
    if (!el || !el.src) return null
    try {
      var parsed = new URL(el.src)
      var key = parsed.searchParams.get('k') || ''
      if (!key || parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      return { origin: parsed.origin, key: key }
    } catch (err) {
      return null
    }
  }

  function allow(slot) {
    slot.setAttribute(DONE, 'true')
  }

  function pickPlaceholder(seed) {
    var hash = 0
    var text = String(seed || '')
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    if (!text) hash = Math.floor(Math.random() * PLACEHOLDERS.length)
    return PLACEHOLDERS[hash % PLACEHOLDERS.length]
  }

  function replaceWithCaught(slot, origin, seed) {
    if (slot.getAttribute('data-adpage-blocked') === 'true') return false
    var src = String(origin || '') + pickPlaceholder(seed || slot.getAttribute(ATTR) || '')
    slot.style.display = slot.style.display || 'block'
    slot.style.boxSizing = 'border-box'
    slot.style.overflow = 'hidden'
    slot.style.padding = '0'
    slot.style.borderRadius = slot.style.borderRadius || '16px'
    slot.style.background = '#0b1a2c'
    slot.innerHTML =
      '<img src="' +
      src +
      '" alt="" ' +
      'style="display:block;width:100%;height:100%;object-fit:cover;object-position:center;" />'
    slot.setAttribute('data-adpage-blocked', 'true')
    slot.setAttribute(DONE, 'true')
    return true
  }

  function slotText(slot) {
    var explicit = slot.getAttribute('data-ad-text')
    var text = explicit != null ? explicit : slot.textContent || ''
    return String(text).replace(/\s+/g, ' ').trim().slice(0, 500)
  }

  function pendingSlots() {
    var nodes = document.querySelectorAll('[' + ATTR + ']')
    var pending = []
    for (var i = 0; i < nodes.length; i++) {
      var slot = nodes[i]
      if (slot.getAttribute(DONE) === 'true') continue
      if (!slot.getAttribute(ATTR)) {
        allow(slot)
        continue
      }
      pending.push(slot)
    }
    return pending
  }

  function report(cfg, caught) {
    if (!caught.length) return
    fetch(cfg.origin + '/api/site/caught?k=' + encodeURIComponent(cfg.key), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads: caught, page_load_id: pageLoadId }),
    }).catch(function () {})
  }

  var scanning = false

  function scan(cfg) {
    if (scanning) return Promise.resolve()
    var slots = pendingSlots()
    if (!slots.length) return Promise.resolve()
    scanning = true
    var batch = []
    for (var i = 0; i < slots.length && i < 80; i++) {
      batch.push({
        id: String(i),
        slot: slots[i],
        url: slots[i].getAttribute(ATTR),
        text: slotText(slots[i]),
      })
    }
    return fetch(cfg.origin + '/api/site/check?k=' + encodeURIComponent(cfg.key), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ads: batch.map(function (item) {
          return { id: item.id, url: item.url, text: item.text }
        }),
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('unavailable')
        return res.json()
      })
      .then(function (data) {
        var byId = Object.create(null)
        var list = (data && data.results) || []
        for (var n = 0; n < list.length; n++) byId[String(list[n].id)] = list[n]
        var caught = []
        for (var j = 0; j < batch.length; j++) {
          var match = byId[batch[j].id]
          if (match && match.matched) {
            if (replaceWithCaught(batch[j].slot, cfg.origin, batch[j].url)) {
              caught.push({ url: batch[j].url, text: batch[j].text })
            }
          } else {
            allow(batch[j].slot)
          }
        }
        report(cfg, caught)
      })
      .catch(function () {
        for (var j = 0; j < batch.length; j++) allow(batch[j].slot)
      })
      .then(function () {
        scanning = false
      })
  }

  function watch(cfg) {
    if (typeof MutationObserver === 'undefined') return
    var timer = null
    var obs = new MutationObserver(function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        scan(cfg)
      }, 80)
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }

  function boot() {
    var cfg = config()
    global.AdSnitch = { version: VERSION }
    if (!cfg) return
    scan(cfg).then(function () {
      watch(cfg)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})(typeof window !== 'undefined' ? window : this)
