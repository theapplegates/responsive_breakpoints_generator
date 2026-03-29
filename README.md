# Responsive Image Breakpoints Generator

A modernized, fully redesigned tool for generating optimal responsive image breakpoints. Upload a high-resolution image, configure breakpoint parameters, and get production-ready `<img>` and `<picture>` HTML5 code.

**Powered by [Cloudinary](https://cloudinary.com)'s** intelligent breakpoint algorithms — finds widths that offer meaningful file-size reductions rather than using arbitrary fixed widths.

## What Changed (2026 Modernization)

The original tool was built ~2016 with Ruby/Sinatra, jQuery, Bootstrap 3, and Grunt. This rewrite modernizes everything:

| Before | After |
|---|---|
| Ruby/Sinatra backend | Node.js/Express |
| jQuery + Bootstrap 3 | Vanilla JS (zero dependencies) |
| Grunt + SCSS build pipeline | No build step needed |
| Bootstrap CSS + custom SCSS | Modern CSS (custom properties, Grid, clamp()) |
| Google Fonts (Open Sans) | Fontshare (Satoshi + General Sans) |
| No dark mode | Full dark/light mode with system detection |
| Fixed-width layout | Fluid responsive design (375px–2560px) |
| Handlebars templates | Native DOM rendering |

## Setup

### 1. Clone & install

```bash
git clone https://github.com/theapplegates/responsive_breakpoints_generator.git
cd responsive_breakpoints_generator
npm install
```

### 2. Configure Cloudinary

Copy `.env.example` to `.env` and fill in your Cloudinary credentials:

```bash
cp .env.example .env
```

You also need an **unsigned upload preset** named `responsive_bp` in your Cloudinary account (Settings → Upload → Upload presets). Update the `cloud_name` and `upload_preset` in `app.js` to match your account.

### 3. Run

The Cloudinary Upload Widget requires HTTPS. Use `local-ssl-proxy` to proxy HTTPS → HTTP:

```bash
# Terminal 1: Start Express
node server.js

# Terminal 2: Start SSL proxy
npx local-ssl-proxy --source 3001 --target 3000
```

Then open `https://localhost:3001`.

Or use the combined start script:
```bash
node start.js
```

## Architecture

```
responsive-breakpoints/
├── server.js      ← Express backend (auth + zip endpoints)
├── start.js       ← Combined launcher (Express + SSL proxy)
├── index.html     ← Single-page app
├── base.css       ← CSS reset & foundations
├── style.css      ← Design tokens + all component styles
├── app.js         ← Vanilla JS application logic
├── .env.example   ← Environment variable template
└── package.json
```

### Backend endpoints

- `POST /authenticate` — Signs Cloudinary API params for the explicit (breakpoints) call
- `POST /zip_url` — Generates a signed ZIP download URL for all breakpoint images

### Frontend

- **Zero framework** — vanilla HTML/CSS/JS, no build step
- **Cloudinary Upload Widget** for image upload (requires HTTPS)
- **Dark/light mode** with system preference detection and manual toggle
- **Responsive** — works from 375px to 2560px+
- **Accessible** — semantic HTML, focus management, ARIA labels

## License

MIT
