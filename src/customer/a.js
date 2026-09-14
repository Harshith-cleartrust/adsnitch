/**
 * AdSnitch customer script. Readable source.
 * Production serves the minified build at /a.js?k=SITE_KEY.
 * AdSnitch script version: 0.3.0
 *
 * Does not contain policy rules, keywords, or credentials.
 * API origin is the script URL origin. There is no localhost fallback.
 */
;(function (global) {
  'use strict'

  var VERSION = '0.3.0'
  var ATTR = 'data-ad-url'
  var DONE = 'data-adpage-checked'
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

  function replaceWithCaught(slot) {
    if (slot.getAttribute('data-adpage-blocked') === 'true') return false
    slot.style.display = slot.style.display || 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.boxSizing = 'border-box'
    slot.style.overflow = 'hidden'
    slot.style.borderRadius = slot.style.borderRadius || '16px'
    slot.style.background =
      'radial-gradient(180px 120px at 50% 12%, rgba(28,141,255,0.28), transparent 70%), linear-gradient(165deg, #05080e 0%, #0b2a55 100%)'
    slot.style.color = '#f4f8ff'
    slot.style.textAlign = 'center'
    slot.style.fontFamily = 'Georgia, "Times New Roman", serif'
    slot.innerHTML =
      '<div style="padding:1rem;line-height:1.25">' +
      '<div style="font-size:2.6rem;line-height:1" aria-hidden="true">🤡</div>' +
      '<div style="margin-top:0.4rem;font-size:1.15rem;font-weight:600">You Got Caught</div>' +
      '</div>'
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
            if (replaceWithCaught(batch[j].slot)) {
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
