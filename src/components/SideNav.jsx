import { NavLink } from 'react-router-dom'
import './SideNav.css'

const LINKS = [
  { to: '/admin/blocklist', label: 'Home', end: false },
  { to: '/blocklist', label: 'Blocklist', end: true },
]

export default function SideNav() {
  return (
    <aside className="sidenav" aria-label="Pages">
      <p className="sidenav__label">Menu</p>
      <nav>
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              isActive ? 'sidenav__link is-active' : 'sidenav__link'
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
