/**
 * AdSnitch — drop this on ANY landing page.
 * Tagline: See a sus ad? Snitch on it.
 *
 * Usage:
 *   1. Mark each ad slot with data-ad-url (the AD URL, not the page URL):
 *        <div class="adpage-slot" data-ad-url="https://example.com/bad-ad" ...>ad</div>
 *
 *   2. Include this script (point api-base at your AdSnitch server):
 *        <script
 *          src="http://localhost:5173/adpage-blocker.js"
 *          data-api-base="http://localhost:5173"
 *          defer></script>
 *
 * Behavior:
 *   - One request per scan. The server matches exact URL, domain, keyword, and packs.
 *   - Keywords stay on the server. This file does not contain the keyword list.
 *   - If blocked → replace slot with a landscape placeholder image (keeps size)
 *   - If API fails → fail open (ads stay visible)
 *   - Does NOT use window.location, the page URL, or the referrer
 */
;(function (global) {
  'use strict'

  var ATTR = 'data-ad-url'
  var DONE = 'data-adpage-checked'
  var DEFAULT_API = 'http://localhost:5173'
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
    return document.currentScript || document.querySelector('script[src*="adpage-blocker"]')
  }

  function apiBase() {
    var el = scriptEl()
    var fromAttr = el && el.getAttribute('data-api-base')
    if (fromAttr) return fromAttr.replace(/\/$/, '')
    if (global.ADPAGE_API_BASE) return String(global.ADPAGE_API_BASE).replace(/\/$/, '')
    try {
      var src = el && el.src
      if (src) return new URL(src).origin
    } catch (_) {}
    return DEFAULT_API
  }

  function pickPlaceholder(seed) {
    var hash = 0
    var text = String(seed || '')
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    if (!text) hash = Math.floor(Math.random() * PLACEHOLDERS.length)
    return PLACEHOLDERS[hash % PLACEHOLDERS.length]
  }

  function replaceWithCaught(slot) {
    if (slot.getAttribute('data-adpage-blocked') === 'true') return false
    var src = apiBase() + pickPlaceholder(slot.getAttribute(ATTR) || '')
    slot.style.display = slot.style.display || 'block'
    slot.style.boxSizing = 'border-box'
    slot.style.overflow = 'hidden'
    slot.style.padding = '0'
    slot.style.borderRadius = slot.style.borderRadius || '16px'
    slot.style.background = '#0b1a2c'
    slot.setAttribute('data-adpage-blocked', 'true')
    slot.setAttribute(DONE, 'true')
    slot.innerHTML =
      '<img src="' +
      src +
      '" alt="" style="display:block;width:100%;height:100%;object-fit:cover;object-position:center;" />'
    return true
  }

  function reportCaught(urls) {
    if (!urls.length) return
    fetch(apiBase() + '/api/blocklist/caught', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: urls, page_load_id: pageLoadId }),
    })
      .then(function (res) {
        if (!res.ok || typeof BroadcastChannel === 'undefined') return
        var channel = new BroadcastChannel('adpage-blocklist')
        channel.postMessage('changed')
        channel.close()
      })
      .catch(function (err) {
        console.error('[adpage-blocker] caught report failed', err)
      })
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
      var adUrl = slot.getAttribute(ATTR)
      if (!adUrl) {
        slot.setAttribute(DONE, 'true')
        continue
      }
      pending.push(slot)
    }
    return pending
  }

  function applyResults(batch, results) {
    var byId = Object.create(null)
    var list = (results && results.results) || []
    for (var i = 0; i < list.length; i++) byId[String(list[i].id)] = list[i]
    var caught = []
    for (var n = 0; n < batch.length; n++) {
      var item = batch[n]
      var match = byId[item.id]
      if (match && match.matched) {
        if (replaceWithCaught(item.slot)) caught.push(match.input || item.url)
      } else {
        item.slot.setAttribute(DONE, 'true')
      }
    }
    reportCaught(caught)
  }

  function scan() {
    var slots = pendingSlots()
    if (!slots.length) return Promise.resolve()
    var batch = slots.map(function (slot, index) {
      return {
        id: String(index),
        slot: slot,
        url: slot.getAttribute(ATTR),
        text: slotText(slot),
      }
    })
    return fetch(apiBase() + '/api/blocklist/check', {
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
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then(function (data) {
        applyResults(batch, data)
      })
      .catch(function (err) {
        console.error('[adpage-blocker] policy check unavailable — allowing ads', err)
        for (var i = 0; i < batch.length; i++) batch[i].slot.setAttribute(DONE, 'true')
      })
  }

  function watch() {
    if (typeof MutationObserver === 'undefined') return
    var timer = null
    var obs = new MutationObserver(function () {
      clearTimeout(timer)
      timer = setTimeout(scan, 50)
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }

  function boot() {
    scan().then(function () {
      watch()
      global.AdPageBlocker = {
        rescan: function () {
          var nodes = document.querySelectorAll('[' + ATTR + ']')
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('data-adpage-blocked') !== 'true') {
              nodes[i].removeAttribute(DONE)
            }
          }
          return scan()
        },
        apiBase: apiBase(),
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})(typeof window !== 'undefined' ? window : this)
