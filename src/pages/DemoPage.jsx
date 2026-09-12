import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdSlot from '../components/AdSlot'
import { getBlocklistSnapshot } from '../services/blocklist'
import './DemoPage.css'

const DEMO_ADS = [
  {
    id: 'slot-1',
    label: 'Ad Slot 1',
    adUrl: 'https://example.com/bad-ad',
    width: 300,
    height: 250,
    headline: 'Summer Sale 40% Off',
  },
  {
    id: 'slot-2',
    label: 'Ad Slot 2',
    adUrl: 'https://example.com/good-ad',
    width: 300,
    height: 250,
    headline: 'Fresh Coffee Delivered',
  },
  {
    id: 'slot-3',
    label: 'Ad Slot 3',
    adUrl: 'https://example.com/bad-ad',
    width: 728,
    height: 90,
    headline: 'Win a Free Trip',
  },
  {
    id: 'slot-4',
    label: 'Ad Slot 4',
    adUrl: 'https://ads.example.com/banner/123',
    width: 300,
    height: 250,
    headline: 'New Sneakers Drop',
  },
  {
    id: 'slot-5',
    label: 'Ad Slot 5',
    adUrl: 'https://promo.test/offer',
    width: 160,
    height: 600,
    headline: 'Skyscraper Deal',
  },
  {
    id: 'slot-6',
    label: 'Ad Slot 6',
    adUrl: 'https://tracker.badads.net/click?id=99',
    width: 320,
    height: 50,
    headline: 'Flash Mobile Offer',
  },
  {
    id: 'slot-7',
    label: 'Ad Slot 7',
    adUrl: 'https://example.com/good-ad',
    width: 336,
    height: 280,
    headline: 'Learn Coding Online',
  },
  {
    id: 'slot-8',
    label: 'Ad Slot 8',
    adUrl: 'https://cdn.ads.example/creative/summer',
    width: 728,
    height: 90,
    headline: 'Travel This Weekend',
  },
]

export default function DemoPage() {
  const [snapshot, setSnapshot] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const next = await getBlocklistSnapshot()
      if (!cancelled) setSnapshot(next)
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('adpage:blocklist-changed', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      window.removeEventListener('adpage:blocklist-changed', refresh)
    }
  }, [])

  return (
    <div className="demo">
      <header className="demo__hero">
        <img
          className="demo__logo"
          src="/adsnitch-logo.png"
          alt="AdSnitch, a Cleartrust product"
        />
        <h1>See a sus ad? Snitch on it.</h1>
        <p className="demo__kicker">Ad slots demo</p>
        <p className="demo__sub">
          Each slot checks its own ad URL. Blocklisted ads are replaced in-place
          with “You Got Caught”.
        </p>
        <p className="demo__hint">
          Manage the list on{' '}
          <Link to="/admin/blocklist">Ad URL Blocklist</Link>. Also works on{' '}
          <a href="/sample-landing.html" target="_blank" rel="noreferrer">
            any landing page
          </a>{' '}
          via <code>adpage-blocker.js</code>.
        </p>
      </header>

      <div className="demo__stage">
      <div className="demo__slots">
        {DEMO_ADS.map((ad) => (
          <AdSlot
            key={ad.id}
            slotId={ad.id}
            label={ad.label}
            adUrl={ad.adUrl}
            width={ad.width}
            height={ad.height}
            blocklistSnapshot={snapshot}
          >
            <p className="ad-slot__title">{ad.headline}</p>
            <a
              className="ad-slot__link"
              href={ad.adUrl}
              onClick={(e) => e.preventDefault()}
            >
              {ad.adUrl}
            </a>
          </AdSlot>
        ))}
      </div>
      </div>
    </div>
  )
}
