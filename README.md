# Portfolio Structure

This project is organized into a clean active app structure plus separate legacy snapshots.

## Active App

- `public/`: active static site files served by the project
- `public/posts/`: post pages
- `public/scripts/`: first-party JavaScript modules
- `public/vendor/`: third-party browser libraries
- `public/data/`: static JSON and data assets
- `public/images/`: image assets
- `pages/`: minimal Next.js fallback page
- `server.js`: local server entry point with automatic port fallback

## Legacy Copies

- `legacy-root-static/`: the old root-level `html/js/assets` files that were previously restored
- `legacy-static/`: a separately organized legacy copy grouped into folders

## Runtime

- The current project serves files from `public/`
- Existing URLs like `/index.html`, `/books.html`, and `/posts/whats-behind-the-glass.html` are preserved
- Clean aliases like `/`, `/books`, and `/posts/whats-behind-the-glass` also work
- If the requested port is busy, the server automatically selects the next available port
