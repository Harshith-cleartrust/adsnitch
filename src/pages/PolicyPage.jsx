import { useEffect, useState } from 'react'
import { getUsername } from '../services/auth'
import {
  addPolicyDomain,
  addPolicyKeyword,
  addPolicyUrl,
  deletePolicyDomain,
  deletePolicyKeyword,
  deletePolicyUrl,
  createPolicy,
  getPolicy,
  listPolicies,
  previewPolicyMatch,
  setPolicyCategory,
  updatePolicy,
} from '../services/policy'
import './AdminBlocklist.css'
import './PolicyPage.css'

function languageLabel(code) {
  if (code === 'de') return 'German'
  if (code === 'en') return 'English'
  return code
}

function PackKeywords({ pack, busy, onDelete }) {
  if (!pack) return null
  const keywords = pack.keywords || []
  return (
    <div className="pack-keywords">
      <div className="admin__list-head">
        <h3>{pack.name} keywords</h3>
        <span className="count">{keywords.length}</span>
      </div>
      {keywords.length === 0 ? (
        <p className="empty">No keywords in this pack yet.</p>
      ) : (
        <ul className="rule-list">
          {keywords.map((row) => (
            <li key={row.id}>
              <span>
                <code>{row.keyword}</code> · {languageLabel(row.language)}
              </span>
              <button
                type="button"
                className="btn-danger"
                disabled={busy}
                onClick={() => onDelete(row.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PolicyPage() {
  const username = getUsername()
  const [policies, setPolicies] = useState([])
  const [mode, setMode] = useState('list')
  const [policy, setPolicy] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [domain, setDomain] = useState('')
  const [packKeyword, setPackKeyword] = useState('')
  const [packLanguage, setPackLanguage] = useState('en')
  const [packId, setPackId] = useState('GAMBLING')
  const [openPack, setOpenPack] = useState(null)
  const [sampleUrl, setSampleUrl] = useState('')
  const [sampleText, setSampleText] = useState('')
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const showMessage = (type, text) => setMessage({ type, text })

  const refreshList = async () => {
    const listed = await listPolicies()
    if (!listed.ok) {
      showMessage('error', listed.error)
      return []
    }
    setPolicies(listed.policies || [])
    return listed.policies || []
  }

  const openPolicy = async (id) => {
    const detail = await getPolicy(id)
    if (!detail.ok) {
      showMessage('error', detail.error)
      return
    }
    setPolicy(detail.policy)
    setName(detail.policy.name)
    setDescription(detail.policy.description || '')
    setMode('edit')
  }

  useEffect(() => {
    refreshList().then((rows) => {
      if (rows[0]?.id) openPolicy(rows[0].id)
    })
  }, [])

  const reload = async () => {
    if (!policy?.id) return
    const detail = await getPolicy(policy.id)
    if (!detail.ok) {
      showMessage('error', detail.error)
      return
    }
    setPolicy(detail.policy)
    setName(detail.policy.name)
    setDescription(detail.policy.description || '')
  }

  const run = async (action, onOk) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok && result.code !== 'DUPLICATE') {
      showMessage('error', result.error)
      return
    }
    if (policy?.id) await reload()
    if (onOk) onOk(result.ok ? result : { ...result, code: 'DUPLICATE' })
  }

  const addWithoutBlocking = (action, clear, addedText) => {
    run(action, (result) => {
      clear()
      showMessage('success', result.code === 'DUPLICATE' ? 'Already added.' : addedText)
    })
  }

  const saveDetails = async (e) => {
    e.preventDefault()
    setBusy(true)
    const result = policy?.id
      ? await updatePolicy(policy.id, { name, description })
      : await createPolicy({ name, description, enabled: true })
    setBusy(false)
    if (!result.ok) {
      showMessage('error', result.error)
      return
    }
    await refreshList()
    if (result.policy?.id) await openPolicy(result.policy.id)
    showMessage('success', 'Policy saved. You can keep adding rules.')
  }

  const togglePolicy = () => {
    run(() => updatePolicy(policy.id, { enabled: !policy.enabled }), (result) => {
      showMessage('success', result.policy?.enabled ? 'Policy enabled.' : 'Policy disabled.')
    })
  }

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <p className="eyebrow">Ad quality</p>
          <h1>Policy</h1>
          <p className="tagline">See a sus ad? Snitch on it.</p>
          <p className="lede">
            Signed in as <strong>{username || 'admin'}</strong>. Rules match the
            advertisement URL and optional ad text, not the visitor page.
          </p>
        </div>
      </header>

      {message && (
        <p className={`flash flash--${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <section className="panel">
        <div className="admin__list-head">
          <h2>Saved policies</h2>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setPolicy(null)
              setName('')
              setDescription('')
              setMode('new')
              setMessage(null)
            }}
          >
            New policy
          </button>
        </div>
        {policies.length === 0 ? (
          <p className="empty">No policies yet.</p>
        ) : (
          <ul className="rule-list">
            {policies.map((row) => (
              <li key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  {' · '}
                  {row.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button type="button" className="btn-primary" onClick={() => openPolicy(row.id)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === 'new' && !policy && (
        <form className="admin__form panel" onSubmit={saveDetails}>
          <label htmlFor="new-policy-name">Policy name</label>
          <input
            id="new-policy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <label htmlFor="new-policy-description">Description</label>
          <input
            id="new-policy-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
          <div className="admin__row" style={{ marginTop: '0.85rem' }}>
            <button type="submit" className="btn-primary" disabled={busy}>
              Save policy
            </button>
          </div>
        </form>
      )}

      {!policy && mode !== 'new' ? (
        <p className="empty">Opening policy…</p>
      ) : policy ? (
      <>
      <form className="admin__form panel" onSubmit={saveDetails}>
        <div className="policy-status">
          <div className="policy-fields">
            <label htmlFor="policy-name">Policy name</label>
            <input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <label htmlFor="policy-description">Description</label>
            <input
              id="policy-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </div>
          <label className="policy-switch">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={togglePolicy}
              disabled={busy}
            />
            {policy.enabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>
        <div className="admin__row" style={{ marginTop: '0.85rem' }}>
          <button type="submit" className="btn-primary" disabled={busy}>
            Save policy
          </button>
        </div>
      </form>

      <div className="policy-grid">
        <section className="panel">
          <h2>Exact URLs</h2>
          <form
            className="admin__row"
            onSubmit={(e) => {
              e.preventDefault()
              addWithoutBlocking(() => addPolicyUrl(policy.id, url), () => setUrl(''), 'Exact URL added.')
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/bad-ad"
              disabled={busy}
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              Add URL
            </button>
          </form>
          <ul className="rule-list">
            {policy.urls.map((row) => (
              <li key={row.id}>
                <code>{row.url}</code>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() =>
                    run(() => deletePolicyUrl(policy.id, row.id), () => {
                      showMessage('success', 'URL removed.')
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {policy.urls.length === 0 && <p className="empty">No exact URLs yet.</p>}
        </section>

        <section className="panel">
          <h2>Domains</h2>
          <form
            className="admin__row"
            onSubmit={(e) => {
              e.preventDefault()
              addWithoutBlocking(
                () => addPolicyDomain(policy.id, domain),
                () => setDomain(''),
                'Domain added.',
              )
            }}
          >
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="badcasino.com"
              disabled={busy}
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              Add domain
            </button>
          </form>
          <ul className="rule-list">
            {policy.domains.map((row) => (
              <li key={row.id}>
                <code>{row.domain}</code>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() =>
                    run(() => deletePolicyDomain(policy.id, row.id), () => {
                      showMessage('success', 'Domain removed.')
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {policy.domains.length === 0 && <p className="empty">No domains yet.</p>}
        </section>

        <section className="panel">
          <h2>Check an ad</h2>
          <p className="lede" style={{ color: 'var(--muted)' }}>
            Uses the same rules as the live embed: exact URL, domain, keyword, then category pack.
          </p>
          <form
            className="admin__row"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              const result = await previewPolicyMatch(policy.id, sampleUrl, sampleText)
              setBusy(false)
              if (!result.ok && result.error) {
                showMessage('error', result.error)
                return
              }
              setPreview(
                result.matched
                  ? `Matched ${result.ruleType}${result.domain ? `: ${result.domain}` : ''}${result.keyword ? `: ${result.keyword}` : ''}${result.category ? ` (${result.category})` : ''}`
                  : 'No match. The ad would be allowed.',
              )
            }}
          >
            <input
              value={sampleUrl}
              onChange={(e) => setSampleUrl(e.target.value)}
              placeholder="https://offers.badcasino.com/ad"
              disabled={busy}
            />
            <input
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Optional ad text"
              disabled={busy}
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              Check
            </button>
          </form>
          {preview && <p className="match-result">{preview}</p>}
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Category packs</h2>
        <p className="lede" style={{ color: 'var(--muted)' }}>
          Gambling starts enabled on the default policy. The other packs stay off until you enable them.
        </p>
        <form
          className="admin__row"
          onSubmit={(e) => {
            e.preventDefault()
            addWithoutBlocking(
              () => addPolicyKeyword(policy.id, packKeyword, packLanguage, packId),
              () => setPackKeyword(''),
              'Keyword added.',
            )
          }}
        >
          <input
            value={packKeyword}
            onChange={(e) => setPackKeyword(e.target.value)}
            placeholder="Add a keyword"
            aria-label="New pack keyword"
            disabled={busy}
          />
          <select
            value={packLanguage}
            onChange={(e) => setPackLanguage(e.target.value)}
            aria-label="Keyword language"
            disabled={busy}
          >
            <option value="en">English</option>
            <option value="de">German</option>
          </select>
          <select
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            aria-label="Category pack"
            disabled={busy}
          >
            {policy.categories.map((pack) => (
              <option key={pack.category} value={pack.category}>
                {pack.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={busy}>
            Add keyword
          </button>
        </form>
        <div className="pack-list">
          {policy.categories.map((pack) => (
            <article
              key={pack.category}
              className={openPack === pack.category ? 'pack-card is-open' : 'pack-card'}
            >
              <button
                type="button"
                className="pack-card__open"
                onClick={() => {
                  setOpenPack((current) => (current === pack.category ? null : pack.category))
                  setPackId(pack.category)
                }}
              >
                <strong>{pack.name}</strong>
                <span>
                  {pack.enabled ? 'Enabled' : 'Disabled'}
                  {pack.keyword_count
                    ? ` · ${pack.keyword_count} keywords`
                    : ' · no keywords yet'}
                </span>
              </button>
              <button
                type="button"
                className={pack.enabled ? 'btn-danger' : 'btn-primary'}
                disabled={busy}
                onClick={() =>
                  run(
                    () => setPolicyCategory(policy.id, pack.category, !pack.enabled),
                    () => {
                      showMessage(
                        'success',
                        pack.enabled ? `${pack.name} disabled.` : `${pack.name} enabled.`,
                      )
                    },
                  )
                }
              >
                {pack.enabled ? 'Disable' : 'Enable'}
              </button>
            </article>
          ))}
        </div>
        {openPack && (
          <PackKeywords
            pack={policy.categories.find((row) => row.category === openPack)}
            busy={busy}
            onDelete={(id) =>
              run(() => deletePolicyKeyword(policy.id, id), () => {
                showMessage('success', 'Keyword removed.')
              })
            }
          />
        )}
      </section>
      </>
      ) : null}
    </div>
  )
}
