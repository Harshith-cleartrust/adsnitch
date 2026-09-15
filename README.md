# AdSnitch — See a sus ad? Snitch on it.

Block ads by **ad URL** (not page URL). Admin UI + embed script for any landing page.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/

## Pages

| URL | Purpose |
| --- | --- |
| `/login` | Admin login (demo: `admin` / `admin123`) |
| `/admin/blocklist` | Add / list / remove blocked ad URLs + embed snippet (login required) |
| `/demo` | React ad-slots demo |
| `/sample-landing.html` | Example **non-React** landing page using the embed script |

## Use on any landing page

1. Mark each ad slot with the **ad URL**:

```html
<div class="adpage-slot" data-ad-url="https://example.com/bad-ad" style="width:300px;height:250px">
  Your ad HTML
</div>
```

2. Load the blocker (keep `npm run dev` running, or host these files):

```html
<script
  src="http://localhost:5173/adpage-blocker.js"
  data-api-base="http://localhost:5173"
  defer
></script>
```

The script fetches `/api/blocklist` **once**, then checks each slot’s `data-ad-url`.
Blocked slots show a landscape placeholder image. If the API is down, ads keep showing (fail open).

## API

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/blocklist` | Public (for embed) |
| `POST` | `/api/blocklist` | Header `X-Adpage-Admin: true` |
| `DELETE` | `/api/blocklist/:id` | Header `X-Adpage-Admin: true` |

Data is stored in `data/blocklist.json`.

## Test

1. Add `https://example.com/bad-ad` on `/admin/blocklist`
2. Open `/sample-landing.html` → Sidebar Ad A is caught; Ad B stays normal
3. Open `/demo` → matching React slots are caught too
