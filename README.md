# The Emerging Generation — Website + Decap CMS

A static, no-build website (plain HTML/CSS/JS + Tailwind CDN) with a
Decap CMS admin panel so you can edit text, images, colors, and
speaker profiles without touching code.

## What you can edit from the CMS (`/admin`)

- **Site Settings** — logo (color + white versions), brand colors
  (primary/secondary/accent/yellow), footer text, contact email/location.
- **Home Page** — hero headline/image/button, the "Navigate / Grow /
  Give Back" cards, the "Why Newcomers Excel" cards, and the "Get
  Involved" cards.
- **About Page** — every section: hero, vision, mission, values,
  promise, who-we-serve, founder story, images included.
- **Speakers** — add, edit, or duplicate speaker profiles (name,
  title, photo, bio, experience, speaking topics). New speakers show
  up automatically on the Speakers page and (the newest 3) on Home.

Changing colors in Site Settings updates the whole site, since every
page reads its brand colors from `content/settings.json` at load time.

## How it works (no build step)

- All editable content lives in `/content` as JSON (`settings.json`,
  `home.json`, `about.json`) and Markdown (`content/speakers/*.md`).
- The HTML pages are static shells; `js/render.js` fetches that
  content at page-load and fills in the page. Duplicating a speaker
  or publishing an edit in the CMS just commits an updated file —
  Netlify redeploys, and the site picks it up on next visit.
- Decap CMS (`/admin`) is a git-backed CMS: every save is a commit to
  your repo, so you always have full version history.

## Deploying on Netlify

1. **Push this folder to a GitHub (or GitLab/Bitbucket) repo.**
2. **In Netlify:** "Add new site" → "Import an existing project" →
   connect the repo. Build command: leave blank. Publish directory: `.`
   (this repo has no build step — `netlify.toml` already sets this).
3. **Enable Identity:** Site configuration → Identity → Enable Identity.
4. **Enable Git Gateway:** Identity → Services → Git Gateway → Enable.
   This lets the CMS commit to your repo on behalf of logged-in editors
   without them needing their own GitHub account.
5. **Invite yourself/your client as an editor:** Identity → Invite users
   → enter the email. They'll get an email to set a password.
6. **Registration:** under Identity settings, set registration to
   "Invite only" so random people can't sign up.
7. Visit `https://yoursite.netlify.app/admin/` and log in — you're in.

## Images

- Upload new images (logo, speaker photos, section images) directly
  through the CMS media picker — they're saved to `/images` in the
  repo automatically and referenced by path.
- Placeholder logos are included at `images/site/logo-colored.svg`
  and `images/site/logo-white.svg` — replace these via the CMS with
  your real logo files (Settings → Header Logo / Footer Logo).
- A couple of speaker photos and section images currently point to
  Unsplash stock URLs from the original design — swap these for real
  photos any time via the CMS.

## Contact form

The "Get Involved" popup form currently just shows a success message
locally — it isn't wired to send anywhere yet. The easiest fix on
Netlify is **Netlify Forms**: add `data-netlify="true"` and a hidden
`form-name` input to the `<form id="involved-form">` in each HTML
page, and Netlify will capture submissions automatically (visible
under Site → Forms). I can wire this up for you if you'd like —
just ask.

## Local preview

No build tooling needed — just serve the folder statically, e.g.:

```
npx serve .
```

(Opening `index.html` directly via `file://` won't work because the
site fetches `/content/*.json` — it needs to be served over http.)
