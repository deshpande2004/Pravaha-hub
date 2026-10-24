# Pravahahub

Fifty open-source apps (office, business, creative, engineering and games) in one launcher, hosted on a single Cloudflare Worker.

- `site/` — the static apps and launcher. Every app loads `site/everything-core.js`, the app engine (`window.ehub`): files and app data live in the browser (localStorage + IndexedDB).
- `worker/` — the backend on the same Worker (`/api/*`): built-in AI (Workers AI), team servers for shared spaces/docs/chat (Durable Objects running each app's own server script from `worker/apps/`), WebRTC signalling for online play and meetings, a fetch proxy, and optional email.
- `wrangler.jsonc` — Worker config. Workers Builds deploys on every push to `main` (`npx wrangler deploy`). No secrets are required.

Optional: email delivery. In the Cloudflare dashboard → Workers & Pages → pravahax-hub → Settings → Variables and Secrets, add a secret `RESEND_API_KEY` (from resend.com) and, once you have verified a sending domain there, a variable `EMAIL_FROM` such as `Pravahahub <hub@yourdomain.com>`. Without it, apps keep mail in a local Outbox.

Health check: `GET /api/health`.

The apps are MIT-licensed open source; see `LICENSE`.
