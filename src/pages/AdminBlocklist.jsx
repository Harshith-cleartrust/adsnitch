import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CatchLight from '../components/CatchLight'
import { getUsername } from '../services/auth'
import {
  addBlocklistedUrl,
  listBlocklistedUrls,
  normalizeAdUrl,
  subscribeBlocklist,
  syncDismissedCatchLights,
} from '../services/blocklist'
import './AdminBlocklist.css'

const PAGE_SIZE = 10

function formatWhen(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function AdminBlocklist() {
  const [url, setUrl] = useState('')
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const username = getUsername()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  const embedSnippet = `<!-- 1) Mark each ad slot with the AD URL -->
<div class="adpage-slot" data-ad-url="https://example.com/bad-ad" style="width:300px;height:250px">
  Your ad HTML here
</div>

<!-- 2) Load the blocker (any landing page) -->
<script
  src="${origin}/adpage-blocker.js"
  data-api-base="${origin}"
  defer
></script>`

  const refresh = async () => {
    const next = await listBlocklistedUrls()
    syncDismissedCatchLights(next)
    setEntries((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    )
  }

  useEffect(() => {
    refresh()
    const resetForm = () => {
      setUrl('')
      setMessage(null)
    }
    window.addEventListener('pageshow', resetForm)
    const unsubscribe = subscribeBlocklist(refresh)
    return () => {
      window.removeEventListener('pageshow', resetForm)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!highlightId) return undefined
    const row = document.getElementById(`blocked-${highlightId}`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const timer = setTimeout(() => setHighlightId(null), 2200)
    return () => clearTimeout(timer)
  }, [highlightId])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => entry.url.toLowerCase().includes(needle))
  }, [entries, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageEntries = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const showMessage = (type, text) => setMessage({ type, text })

  const handleAdd = async (e) => {
    e.preventDefault()
    setBusy(true)
    const result = await addBlocklistedUrl(url)
    setBusy(false)
    if (!result.ok) {
      if (result.code === 'DUPLICATE') {
        const normalized = normalizeAdUrl(url)
        const existing =
          result.entry || entries.find((entry) => entry.url === normalized)
        setUrl('')
        setQuery('')
        setPage(1)
        setMessage(null)
        if (existing?.id) setHighlightId(existing.id)
        return
      }
      showMessage('error', result.error)
      return
    }
    setUrl('')
    await refresh()
    showMessage('success', 'URL added. Use Blocklist to remove it.')
  }

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet)
      showMessage('success', 'Embed snippet copied.')
    } catch {
      showMessage('error', 'Could not copy — select the snippet manually.')
    }
  }

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <img
            className="admin__logo"
            src="/adsnitch-logo.png"
            alt="AdSnitch, a Cleartrust product"
          />
          <h1>Ad URL Blocklist</h1>
          <p className="tagline">See a sus ad? Snitch on it.</p>
          <p className="lede">
            Signed in as <strong>{username || 'admin'}</strong>. Block ads by
            their ad URL. The same list is used by the React demo and by{' '}
            <code>adpage-blocker.js</code> on any landing page.
          </p>
        </div>
      </header>

      <form className="admin__form panel" onSubmit={handleAdd} noValidate>
        <label htmlFor="blocklist-url">Ad URL</label>
        <div className="admin__row">
          <input
            id="blocklist-url"
            type="url"
            name="url"
            placeholder="https://example.com/bad-ad"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setMessage(null)
            }}
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            Add URL
          </button>
        </div>
      </form>

      {message && (
        <p
          className={`flash flash--${message.type}`}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
      )}

      <section className="admin__list panel" aria-labelledby="blocked-heading">
        <div className="admin__list-head">
          <h2 id="blocked-heading">Blocked URLs</h2>
          <span className="count">{filtered.length}</span>
        </div>

        <label className="sr-only" htmlFor="home-url-search">
          Search blocked URLs
        </label>
        <input
          id="home-url-search"
          className="list-search"
          type="search"
          placeholder="Search URLs"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />

        {entries.length === 0 ? (
          <p className="empty">No URLs are blocked yet.</p>
        ) : filtered.length === 0 ? (
          <p className="empty">No URLs match that search.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">URL</th>
                    <th scope="col">Created</th>
                    <th scope="col">Last 24 hours</th>
                    <th scope="col">
                      <span className="sr-only">Shortcut</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      id={`blocked-${entry.id}`}
                      className={highlightId === entry.id ? 'is-highlight' : undefined}
                    >
                      <td className="url-cell">
                        <span className="url-name">
                          <CatchLight id={entry.id} count={entry.caught_24h} />
                          <code>{entry.url}</code>
                        </span>
                      </td>
                      <td className="date-cell">{formatWhen(entry.created_at)}</td>
                      <td className="count-cell">{entry.caught_24h || 0}</td>
                      <td className="action-cell">
                        <Link
                          className="list-shortcut"
                          to={`/blocklist?id=${encodeURIComponent(entry.id)}`}
                          onClick={() => {
                            setUrl('')
                            setMessage(null)
                          }}
                        >
                          Blocklist
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      <section className="embed panel" aria-labelledby="embed-heading">
        <div className="admin__list-head">
          <h2 id="embed-heading">Use on any landing page</h2>
        </div>
        <p className="embed__lede">
          Add <code>data-ad-url</code> on each ad slot, then paste this script.
          Try the sample page:{' '}
          <a href="/sample-landing.html" target="_blank" rel="noreferrer">
            /sample-landing.html
          </a>
        </p>
        <pre className="embed__code">{embedSnippet}</pre>
        <button type="button" className="btn-primary" onClick={copyEmbed}>
          Copy embed snippet
        </button>
      </section>
    </div>
  )
}
