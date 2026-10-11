# Estoria sign-in broker

A small server at `auth.labrarf.com` that keeps Estoria signed in to Google
Drive. It holds the OAuth client secret (which can't ship in a web page),
trades Google's sign-in codes for tokens, and keeps the refresh token in an
encrypted cookie on the user's own device.

It never sees a manuscript: the browser talks to Drive directly. It has no
database and no dependencies. Design and reasoning:
[`docs/PLAN-drive-sync.md`](../docs/PLAN-drive-sync.md), "The login server".

## Routes

| Route | Does |
| --- | --- |
| `GET /status` | `{ "drive": "on" \| "off" }`, the kill switch (`DRIVE_STATUS`) |
| `POST /auth/exchange` | Popup sign-in: `{ code }` → access token, sets the cookie |
| `POST /auth/token` | Fresh access token from the cookie; `401 reconnect` if revoked |
| `POST /auth/disconnect` | Revokes at Google, clears the cookie |
| `GET /auth/start?return=…` | Redirect sign-in (iPad home-screen app): off to Google |
| `GET /auth/callback` | Back from Google: sets the cookie, returns to the app with `#drive=connected` |

`POST` routes need an allowed `Origin` and the header `X-Estoria: 1`.

## Settings (host environment only)

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the `Estoria web` client ID |
| `GOOGLE_CLIENT_SECRET` | **secret**: paste straight from Google into the host |
| `TOKEN_KEY` | **secret**: `openssl rand -base64 32` |
| `BROKER_URL` | `https://auth.labrarf.com` |
| `ALLOWED_ORIGINS` | `https://www.labrarf.com,https://labrarf.com,http://localhost:5173` |
| `COOKIE_DOMAIN` | leave unset (cookie stays on this host only) |
| `DRIVE_STATUS` | `on`, or `off` to pause Drive for everyone without a redeploy |

Changing `TOKEN_KEY` signs everyone out (one tap to reconnect).

## Run and test

```bash
npm test       # node:test against a fake Google, no network
npm run dev    # http://localhost:3000, for the app on http://localhost:5173
```

`npm run dev` reads `auth-server/.env.local` (gitignored). Not part of the
app's `npm run deploy`: the broker is deployed on its own.
