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

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <img
            className="admin__logo"
            src="/adsnitch-logo.png"
            alt="AdSnitch, a Cleartrust product"
          />
          <h1>Overview</h1>
          <p className="tagline">Ad quality control for every page</p>
          <p className="lede">
            Signed in as <strong>{username || 'admin'}</strong>. Add exact ad URLs to block,
            then install the customer script from Install. Use an HTTPS host in production —
            never a localhost script on an HTTPS page.
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
          <h2 id="embed-heading">Deploy on any landing page</h2>
        </div>
        <p className="embed__lede">
          Mark each ad slot with <code>data-ad-url</code>, then copy the minimized
          install script. Production pages must load the script over HTTPS.
          Local sample:{' '}
          <a href="/sample-landing.html" target="_blank" rel="noreferrer">
            /sample-landing.html
          </a>
        </p>
        <a className="btn-primary" href="/admin/sites" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Open Install
        </a>
      </section>
    </div>
  )
}
