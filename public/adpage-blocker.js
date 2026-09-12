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
 *   - Fetches blocklist ONCE, checks each slot's data-ad-url
 *   - If blocked → replace slot content with 🤡 You Got Caught (keeps size)
 *   - If API fails → fail open (ads stay visible)
 *   - Does NOT use window.location
 */
;(function (global) {
  'use strict'

  var ATTR = 'data-ad-url'
  var DONE = 'data-adpage-checked'
  var DEFAULT_API = 'http://localhost:5173'
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

  function normalizeAdUrl(raw) {
    var trimmed = String(raw || '').trim()
    if (!trimmed) return ''
    var withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
      ? trimmed
      : 'https://' + trimmed
    var parsed = new URL(withProtocol)
    parsed.hostname = parsed.hostname.toLowerCase()
    parsed.hash = ''
    var pathname = parsed.pathname
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }
    parsed.pathname = pathname || '/'
    return parsed.toString()
  }

  function applyCaughtStyles(slot) {
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
    slot.style.boxShadow = '0 12px 28px rgba(23, 20, 28, 0.18)'
  }

  function replaceWithCaught(slot) {
    if (slot.getAttribute('data-adpage-blocked') === 'true') return false
    applyCaughtStyles(slot)
    slot.setAttribute('data-adpage-blocked', 'true')
    slot.setAttribute(DONE, 'true')
    slot.innerHTML =
      '<div style="padding:1rem;line-height:1.25">' +
      '<div style="font-size:2.6rem;line-height:1" aria-hidden="true">🤡</div>' +
      '<div style="margin-top:0.4rem;font-size:1.15rem;font-weight:600;letter-spacing:-0.02em">You Got Caught</div>' +
      '</div>'
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

  function scan(snapshot) {
    var nodes = document.querySelectorAll('[' + ATTR + ']')
    var caught = []
    for (var i = 0; i < nodes.length; i++) {
      var slot = nodes[i]
      if (slot.getAttribute(DONE) === 'true') continue
      var adUrl = slot.getAttribute(ATTR)
      if (!adUrl) {
        slot.setAttribute(DONE, 'true')
        continue
      }
      try {
        var normalized = normalizeAdUrl(adUrl)
        if (snapshot[normalized]) {
          if (replaceWithCaught(slot)) caught.push(normalized)
        } else {
          slot.setAttribute(DONE, 'true')
        }
      } catch (err) {
        console.error('[adpage-blocker] slot check failed — allowing ad', err)
        slot.setAttribute(DONE, 'true')
      }
    }
    reportCaught(caught)
  }

  function fetchBlocklist() {
    var url = apiBase() + '/api/blocklist'
    return fetch(url, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then(function (data) {
        var map = Object.create(null)
        var urls = (data && data.urls) || []
        for (var i = 0; i < urls.length; i++) {
          try {
            map[normalizeAdUrl(urls[i])] = true
          } catch (_) {}
        }
        return map
      })
  }

  function boot() {
    fetchBlocklist()
      .then(function (snapshot) {
        scan(snapshot)
        // Watch for late-injected ad slots
        if (typeof MutationObserver !== 'undefined') {
          var timer = null
          var obs = new MutationObserver(function () {
            clearTimeout(timer)
            timer = setTimeout(function () {
              scan(snapshot)
            }, 50)
          })
          obs.observe(document.documentElement, {
            childList: true,
            subtree: true,
          })
        }
        global.AdPageBlocker = {
          rescan: function () {
            return fetchBlocklist().then(function (fresh) {
              // allow re-check of unchecked nodes only; clear DONE to force
              var nodes = document.querySelectorAll('[' + ATTR + ']')
              for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('data-adpage-blocked') !== 'true') {
                  nodes[i].removeAttribute(DONE)
                }
              }
              scan(fresh)
            })
          },
          apiBase: apiBase(),
        }
      })
      .catch(function (err) {
        console.error('[adpage-blocker] blocklist unavailable — allowing ads', err)
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})(typeof window !== 'undefined' ? window : this)
