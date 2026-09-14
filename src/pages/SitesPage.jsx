import { useEffect, useState } from 'react'
import { getPolicy, listPolicies } from '../services/policy'
import { scriptForPolicy } from '../services/sites'
import './AdminBlocklist.css'
import './PolicyPage.css'

export default function SitesPage() {
  const [policies, setPolicies] = useState([])
  const [policyId, setPolicyId] = useState('')
  const [policy, setPolicy] = useState(null)
  const [snippet, setSnippet] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => {
    listPolicies().then((result) => {
      if (!result.ok) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      const rows = result.policies || []
      setPolicies(rows)
      setPolicyId((current) => current || rows[0]?.id || '')
    })
  }, [])

  useEffect(() => {
    if (!policyId) return undefined
    let cancelled = false
    Promise.all([getPolicy(policyId), scriptForPolicy(policyId)]).then(([detail, script]) => {
      if (cancelled) return
      if (!detail.ok) {
        setMessage({ type: 'error', text: detail.error })
        return
      }
      if (!script.ok) {
        setMessage({ type: 'error', text: script.error })
        return
      }
      setPolicy(detail.policy)
      setSnippet(script.snippet || '')
    })
    return () => {
      cancelled = true
    }
  }, [policyId])

  const copy = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setMessage({ type: 'success', text: 'Script copied.' })
    } catch {
      setMessage({ type: 'error', text: 'Could not copy. Select the script instead.' })
    }
  }

  const enabledPacks = (policy?.categories || []).filter((pack) => pack.enabled)

  return (
    <div className="admin">
      <header className="admin__header">
        <p className="eyebrow">Install</p>
        <h1>Script</h1>
        <p className="lede">
          Choose a policy. The script below uses only what is selected in that policy.
        </p>
      </header>

      {message && <p className={`flash flash--${message.type}`}>{message.text}</p>}

      <section className="embed panel">
        <label htmlFor="script-policy">Policy</label>
        <select
          id="script-policy"
          value={policyId}
          onChange={(e) => {
            setPolicyId(e.target.value)
            setMessage(null)
          }}
        >
          {policies.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        {snippet ? (
          <>
            <pre className="embed__code">{snippet}</pre>
            <button type="button" className="btn-primary" onClick={copy}>
              Copy script
            </button>
          </>
        ) : (
          <p className="empty">Script is not ready yet.</p>
        )}

        {policy && (
          <div className="policy-script-rules">
            <h2>In this policy</h2>
            <p>{policy.enabled ? 'Policy enabled' : 'Policy disabled — this script will not block'}</p>
            <h3>Exact URLs</h3>
            {policy.urls.length === 0 ? (
              <p className="empty">None</p>
            ) : (
              <ul>
                {policy.urls.map((row) => (
                  <li key={row.id}>
                    <code>{row.url}</code>
                  </li>
                ))}
              </ul>
            )}
            <h3>Domains</h3>
            {policy.domains.length === 0 ? (
              <p className="empty">None</p>
            ) : (
              <ul>
                {policy.domains.map((row) => (
                  <li key={row.id}>
                    <code>{row.domain}</code>
                  </li>
                ))}
              </ul>
            )}
            <h3>Keywords</h3>
            {(policy.keywords || []).length === 0 ? (
              <p className="empty">None</p>
            ) : (
              <ul>
                {policy.keywords.map((row) => (
                  <li key={row.id}>
                    <code>{row.keyword}</code>
                  </li>
                ))}
              </ul>
            )}
            <h3>Category packs</h3>
            {enabledPacks.length === 0 ? (
              <p className="empty">None enabled</p>
            ) : (
              <ul>
                {enabledPacks.map((pack) => (
                  <li key={pack.category}>
                    {pack.name} · {pack.keyword_count} keywords
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
