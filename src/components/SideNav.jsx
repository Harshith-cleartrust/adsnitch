import { NavLink } from 'react-router-dom'
import './SideNav.css'

const LINKS = [
  { to: '/admin/blocklist', label: 'Overview', end: true },
  { to: '/blocklist', label: 'Blocklist', end: true },
  { to: '/admin/policy', label: 'Policies', end: true },
  { to: '/admin/sites', label: 'Install', end: true },
]

export default function SideNav() {
  return (
    <aside className="sidenav" aria-label="Workspace">
      <p className="sidenav__label">Workspace</p>
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
