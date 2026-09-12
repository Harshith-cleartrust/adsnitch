import { useEffect, useState } from 'react'
import { dismissCatchLight, isCatchLightDismissed } from '../services/blocklist'

export default function CatchLight({ id, count }) {
  const [off, setOff] = useState(() => isCatchLightDismissed(id))

  useEffect(() => {
    const showAgain = (event) => {
      if (event.detail?.includes(id)) setOff(false)
    }
    window.addEventListener('adpage:catch-lights-reset', showAgain)
    return () => window.removeEventListener('adpage:catch-lights-reset', showAgain)
  }, [id])

  if ((count || 0) <= 10 || off) return null

  return (
    <button
      type="button"
      className="catch-light"
      title="Caught more than 10 times. Click to hide until the list updates."
      aria-label="Hide alert until the list updates"
      onClick={() => {
        dismissCatchLight(id, count)
        setOff(true)
      }}
    />
  )
}
