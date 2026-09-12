import { useEffect } from 'react'
import { isAdUrlInSnapshot, reportCaughtUrls } from '../services/blocklist'
import './AdSlot.css'

const reportedCatches = new Set()

/**
 * Renders one ad slot. Checks the AD URL (not window.location).
 * If blocked → placeholder in the same slot; else → normal ad content.
 */
export default function AdSlot({
  label,
  adUrl,
  slotId,
  blocklistSnapshot,
  width = 300,
  height = 250,
  children,
}) {
  const blocked = isAdUrlInSnapshot(adUrl, blocklistSnapshot)
  const catchKey = slotId || `${label}:${adUrl}`

  useEffect(() => {
    if (!blocked || !adUrl) return undefined
    if (reportedCatches.has(catchKey)) return undefined
    reportedCatches.add(catchKey)
    reportCaughtUrls([adUrl])
    return () => {
      setTimeout(() => {
        reportedCatches.delete(catchKey)
      }, 0)
    }
  }, [blocked, adUrl, catchKey])

  return (
    <aside
      className={`ad-slot ${blocked ? 'ad-slot--blocked' : 'ad-slot--live'}`}
      style={{ width, height, minWidth: width, minHeight: height }}
      data-ad-url={adUrl}
      data-blocked={blocked ? 'true' : 'false'}
      aria-label={blocked ? 'Blocked advertisement' : `Advertisement: ${label}`}
    >
      <span className="ad-slot__badge">{label}</span>

      {blocked ? (
        <div className="ad-slot__caught">
          <span className="ad-slot__emoji" aria-hidden="true">
            🤡
          </span>
          <p className="ad-slot__caught-text">You Got Caught</p>
        </div>
      ) : (
        <div className="ad-slot__content">
          {children ?? (
            <>
              <p className="ad-slot__title">{label}</p>
              <a
                className="ad-slot__link"
                href={adUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.preventDefault()}
              >
                {adUrl}
              </a>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
