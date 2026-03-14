# 343Cinema

A unified production suite — Write · Prep · Produce.

## Repository structure

```
343cinema/
├── index.html          ← Shell (this is your homepage)
├── suite.js            ← Shared handoff protocol
├── wrotenote.html      ← WroteNote: Write + Break Down
├── mediumshot.html     ← MediumShot: Shot Listing
└── 80ad.html           ← 80AD: Production Management
```

## GitHub Pages setup

1. Create a new GitHub repo named `343cinema` (or any name)
2. Upload all files to the root of the repo
3. Go to **Settings → Pages → Source → Deploy from branch → main → / (root)**
4. Your suite will be live at `https://[your-username].github.io/343cinema/`

## Custom domain (optional)

1. Go to Settings → Pages → Custom domain
2. Enter `343cinema.com` (or your domain)
3. Add a CNAME record at your DNS provider pointing to `[your-username].github.io`

## Editing individual apps

Each app is a standalone `.html` file. Edit it, push to GitHub, it's live.  
The shell (`index.html`) and `suite.js` are completely separate.

- Edit WroteNote → edit `wrotenote.html` only
- Edit MediumShot → edit `mediumshot.html` only  
- Edit 80AD → edit `80ad.html` only
- Edit the shell nav/branding → edit `index.html` only

## Adding suite.js to each app

Add this line just before `</body>` in each of the three apps:

```html
<script src="suite.js"></script>
<script>
  suite.init('write');   // or 'prep' or 'produce'

  // WroteNote — add Send to Suite button:
  suite.onProjectChange(proj => {
    // Project switched — update UI
  });
</script>
```

## How the workflow works

1. **Write panel (WroteNote)**: Write script + run breakdown (tag props, costumes, characters, shots)
2. Click **"Send to Suite →"** → choose MediumShot or 80AD direct
3. **Prep panel (MediumShot)**: Shot list auto-populated from annotations
4. Click **"Send to 80AD →"** → shot list goes to shooting schedule
5. **Produce panel (80AD)**: Schedule, call sheets, budget, costumes all pre-populated

## localStorage keys used

All three apps share the same origin so localStorage is natively shared:

| Key | Owner | Purpose |
|-----|-------|---------|
| `suite_343cinema` | Shell | Active project, completed steps |
| `suite_projects` | Shell | Master project list |
| `suite_handoff` | suite.js | Current handoff payload |
| `suite_theme` | Shell | Light/dark preference |
| `ad_productions` | 80AD | Production list |
| `ad_active_prod` | 80AD | Active production ID |
| `mediumshot` | MediumShot | All MS data |
| `ss_[prodId]` | 80AD | Shooting schedule |
| `costume_[prodId]` | 80AD | Props + costumes |
| `budget_[prodId]` | 80AD | Budget entries |
| `contacts_global` | 80AD | Cast + crew |
| `wrotenote_scripts` | WroteNote | Scripts |
