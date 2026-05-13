# Telegram Click Tracking

This repo now includes:

- `public/scripts/tracking.js`: frontend click tracking
- `public/scripts/tracking-config.js`: public config file for the worker URL
- `tracking/cloudflare-worker.js`: server-side worker that forwards click events to Telegram

## Why this setup

Your site is deployed as static GitHub Pages, so the Telegram bot token must never be placed in browser code.

The browser sends click events to a small worker endpoint.
The worker keeps the Telegram bot token secret and sends you the message.

## Recommended deploy target

Deploy `tracking/cloudflare-worker.js` as a Cloudflare Worker.

Set these Worker secrets/vars:

- `BOT_TOKEN`: your Telegram bot token
- `CHAT_ID`: the chat or user ID that should receive the alerts
- `ALLOWED_ORIGIN`: `https://armita.me`

## Frontend config

After the worker is deployed, edit:

- `public/scripts/tracking-config.js`

Change it to something like:

```js
window.PORTFOLIO_TRACKING = {
  enabled: true,
  endpoint: "https://your-worker-name.your-subdomain.workers.dev/track",
  siteName: "armita.me"
};
```

## What gets tracked

The frontend script tracks:

- top-left logo clicks
- nav tab clicks
- project links
- note links
- book links
- blog back links
- project filter buttons
- clickable book headers

## Security note

If you previously exposed a Telegram URL that contained your bot token in any public page, rotate the bot token with BotFather before using this setup.
