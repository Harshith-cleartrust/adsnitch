import { useEffect, useMemo, useRef, useState } from 'react'
import CatchLight from '../components/CatchLight'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  deleteBlocklistedUrl,
  listBlocklistedUrls,
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

export default function BlocklistPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('id')
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const focusedRef = useRef(false)

  const refresh = async () => {
    const next = await listBlocklistedUrls()
    syncDismissedCatchLights(next)
    setEntries((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    )
  }

  useEffect(() => {
    refresh()
    return subscribeBlocklist(refresh)
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => entry.url.toLowerCase().includes(needle))
  }, [entries, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageEntries = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    if (!focusId || !entries.length || focusedRef.current) return
    const index = entries.findIndex((entry) => entry.id === focusId)
    if (index === -1) return
    focusedRef.current = true
    setQuery('')
    setPage(Math.floor(index / PAGE_SIZE) + 1)
    setHighlightId(focusId)
  }, [focusId, entries])

  useEffect(() => {
    if (!highlightId) return undefined
    document.getElementById(`blocked-${highlightId}`)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, [highlightId, safePage])

  useEffect(() => {
    if (!pendingRemove) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setPendingRemove(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingRemove])

  const confirmRemove = async () => {
    if (!pendingRemove) return
    setBusy(true)
    const result = await deleteBlocklistedUrl(pendingRemove.id)
    setBusy(false)
    if (!result.ok) {
      setPendingRemove(null)
      setMessage({ type: 'error', text: result.error })
      return
    }
    setPendingRemove(null)
    setHighlightId(null)
    await refresh()
    setMessage({ type: 'success', text: 'URL removed from the blocklist.' })
  }

  return (
    <div className="admin admin--fill">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        Back
      </button>

      <header className="admin__header">
        <div>
          <p className="eyebrow">AdSnitch</p>
          <h1>Blocked URLs</h1>
          <p className="tagline">See a sus ad? Snitch on it.</p>
          <p className="lede">
            Search the blocklist. Each page shows up to 10 URLs. Counts update
            without a reload.
          </p>
        </div>
      </header>

      {message && (
        <p className={`flash flash--${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <section className="admin__list panel" aria-labelledby="blocklist-heading">
        <div className="admin__list-head">
          <h2 id="blocklist-heading">Blocked URLs</h2>
          <span className="count">{filtered.length}</span>
          <Link className="list-add" to="/admin/blocklist">
            Add URL
          </Link>
        </div>

        <label className="sr-only" htmlFor="blocklist-search">
          Search blocked URLs
        </label>
        <input
          id="blocklist-search"
          className="list-search"
          type="search"
          placeholder="Search URLs"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
            setHighlightId(null)
          }}
        />

        {entries.length === 0 ? (
          <p className="empty">
            No URLs yet. <Link to="/admin/blocklist">Add a URL</Link>.
          </p>
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
                      <span className="sr-only">Actions</span>
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
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={busy}
                          onClick={() => setPendingRemove(entry)}
                        >
                          Remove
                        </button>
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
                onClick={() => {
                  setHighlightId(null)
                  setPage(safePage - 1)
                }}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => {
                  setHighlightId(null)
                  setPage(safePage + 1)
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      {pendingRemove && (
        <div
          className="confirm"
          role="presentation"
          onClick={() => {
            if (!busy) setPendingRemove(null)
          }}
        >
          <div
            className="confirm__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title">Remove this URL?</h2>
            <p>It will no longer be blocked.</p>
            <code>{pendingRemove.url}</code>
            <div className="confirm__actions">
              <button
                type="button"
                className="confirm__cancel"
                disabled={busy}
                onClick={() => setPendingRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger confirm__remove"
                disabled={busy}
                onClick={confirmRemove}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
