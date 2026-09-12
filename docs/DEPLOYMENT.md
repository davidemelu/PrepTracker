# Home-lab deployment

Operational detail that would clutter the README. Start there for the overview; this
covers the things you only care about once it is actually running.

---

## First run, step by step

```bash
git clone <your-repo> /srv/preptracker
cd /srv/preptracker

cp .env.example .env
```

Edit `.env`:

```dotenv
AUTH_SECRET="<openssl rand -base64 32>"
POSTGRES_PASSWORD="<a long random password>"
TZ="Europe/London"          # your zone, so "today" flips at your midnight

# Optional: set the first password yourself instead of using the default.
ADMIN_USERNAME="david"
ADMIN_PASSWORD="<a password you will change anyway>"
```

```bash
docker compose up -d --build
docker compose logs -f app
```

You are looking for:

```
PrepTracker: applying migrations…
PrepTracker: empty database, seeding initial data…
Seed complete.
PrepTracker: starting on port 3000
✓ Ready
```

Then:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","database":"up"}
```

---

## Choosing how to reach it

| | LAN only | Tailscale | Reverse proxy |
| --- | --- | --- | --- |
| Setup effort | lowest | low | medium |
| HTTPS | no | yes, automatic | yes |
| Installs as a PWA on iPhone | no | yes | yes |
| Reachable away from home | no | yes | only if you expose it |
| Ports open to the internet | none | none | 80/443 if public |

**Recommendation: Tailscale.** Real HTTPS, works away from home, nothing exposed.

### LAN only

```dotenv
APP_BIND="0.0.0.0"
```

```bash
docker compose up -d
ip -4 addr show | grep inet     # find the server's LAN address
```

Reach it at `http://192.168.x.x:3000`.

### Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh   # Linux/macOS; on Windows use the installer
tailscale up

# Serve the app over HTTPS on your tailnet only.
tailscale serve --bg 3000
tailscale serve status
```

Keep `APP_BIND="127.0.0.1"` — `tailscale serve` proxies to it on the machine itself, so
the container never needs to listen on a network interface. Set `COOKIE_SECURE="true"`
because you are now on HTTPS, then restart:

```bash
docker compose up -d
```

Install Tailscale on your phone, sign in, and open the
`https://<machine>.<tailnet>.ts.net` address.

> **Use the MagicDNS name, not the `100.x` IP.** The IP is plain HTTP and the container
> is not listening on it; the HTTPS name is what `tailscale serve` publishes. Getting a
> certificate is also what lets iOS offer *Add to Home Screen*.

To undo it: `tailscale serve --https=443 off`.

> Do **not** use `tailscale funnel` unless you genuinely want this on the public
> internet.

### Caddy

`/etc/caddy/Caddyfile`:

```caddy
preptracker.home.example.com {
    reverse_proxy 127.0.0.1:3000

    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "same-origin"
    }
}
```

For a LAN-only name with no public DNS, use Caddy's own CA:

```caddy
preptracker.lan {
    tls internal
    reverse_proxy 127.0.0.1:3000
}
```

You will need to trust Caddy's root certificate on each device, or use a DNS-01
challenge with a real domain instead.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Set `COOKIE_SECURE="true"` and restart the app.

### Nginx Proxy Manager

Proxy host:

- Domain: `preptracker.home.example.com`
- Scheme `http`, forward host `127.0.0.1`, port `3000`
- **Websockets support: on**
- SSL tab: request a certificate, force SSL, HSTS on

Then `COOKIE_SECURE="true"` and restart.

---

## Timezone

**Set this correctly before anything else.** `TZ` decides what the app thinks the time
is, which drives what counts as overdue, which meal is next, and when "today" rolls
over. Leave it at `UTC` while living anywhere else and meals appear overdue by exactly
your UTC offset.

```dotenv
TZ="America/Los_Angeles"
```

```bash
docker compose up -d
docker compose exec app date        # must show YOUR local time, not UTC
```

If `date` still says UTC, the image is missing the timezone database — `tzdata` must be
installed in the runtime image, or Alpine silently ignores `TZ` and stays on UTC. It is
in the Dockerfile; if you have customised it, check that first.

Days already stored keep their dates; only new days are affected.

---

## Backups

The app writes a JSON backup that restores exactly. A Postgres dump is the safety net
underneath it. Do both.

```bash
mkdir -p /srv/preptracker/backups
```

`/etc/cron.d/preptracker-backup`:

```cron
# Nightly dump at 03:15, keeping 30 days.
15 3 * * * root cd /srv/preptracker && docker compose exec -T db pg_dump -U preptracker preptracker | gzip > backups/db-$(date +\%F).sql.gz
30 3 * * * root find /srv/preptracker/backups -name 'db-*.sql.gz' -mtime +30 -delete
```

**Test the restore at least once**, into a scratch database, before you need it:

```bash
docker compose exec -T db createdb -U preptracker restore_test
gunzip -c backups/db-2026-09-11.sql.gz | docker compose exec -T db psql -U preptracker -d restore_test
docker compose exec -T db psql -U preptracker -d restore_test -c 'SELECT count(*) FROM daily_meals;'
docker compose exec -T db dropdb -U preptracker restore_test
```

---

## Troubleshooting

**`AUTH_SECRET must be set to at least 32 characters`**
The entrypoint refuses to start without it. Set it in `.env` and recreate the container.

**App restarts in a loop**

```bash
docker compose logs --tail=80 app
docker compose ps
```

Usually the database is not healthy yet, or `DATABASE_URL` points somewhere wrong.
Inside compose the host is `db`, not `localhost`.

**"Add to Home Screen" missing on iPhone**
iOS requires HTTPS. Use Tailscale or a reverse proxy.

**Signed out immediately after signing in**
`COOKIE_SECURE="true"` while serving plain HTTP. The browser drops the cookie. Set it
to `false`, or serve HTTPS.

**"Failed to find Server Action" after signing in**
The browser is running JavaScript from a different build than the server. Two causes:

1. *You are talking to the dev server by accident.* `next dev` binds every interface,
   so a phone reaching `http://<host>:3000` can land on it while your desktop on
   `localhost:3000` reaches the container — two apps, two databases, one port. Dev now
   runs on **3001** to prevent this; if you see it, check what is listening:

   ```bash
   # Linux/macOS
   ss -ltnp | grep -E '300[01]'
   # Windows (PowerShell)
   Get-NetTCPConnection -State Listen -LocalPort 3000,3001 |
     Select-Object LocalAddress,LocalPort,OwningProcess
   ```

2. *A stale service worker.* A worker installed by a production build keeps serving its
   own cached bundle, even after the server moves on. The app now unregisters any
   worker when it detects a dev build, but to clear one by hand:

   - **iPhone:** Settings → Safari → Advanced → Website Data → remove the entry, or
     Settings → Safari → Clear History and Website Data.
   - **Android/Chrome:** site menu (ⓘ next to the address) → Cookies and site data →
     Manage → Delete, then reload.
   - **Desktop:** DevTools → Application → Service Workers → *Unregister*, then
     Application → Storage → *Clear site data*.

   After clearing, close every tab on that origin and reopen it.

**Hot reload does not work from your phone**
`next dev` blocks cross-origin dev resources. Add the host to `DEV_ORIGINS` in `.env`.
Tailscale (`*.ts.net`, `100.x`), `*.local` and private LAN ranges are allowed already.

**The day shows the wrong meals after a plan change**
That is deliberate — stored days keep their snapshot. To pull changes into today, open
the day type badge on Today and choose *Rebuild this day from the plan*. Completions are
preserved.

**Meals look overdue when they are not**
Almost always the container timezone. Compare `docker compose exec app date` with your
watch. See [Timezone](#timezone).

Failing that, a day's stored times can drift from the plan if you have used *Reschedule*
with "move later meals" — the day keeps that snapshot on purpose. Open the day type badge
on Today and choose *Rebuild this day from the plan* to reset the times; completions and
recorded eaten times are preserved.

**New reference data is missing after an upgrade**
The container seeds only when the database is empty, so it never overwrites your edits.
When a release adds new catalogue rows — the workout focuses, for instance — pick them
up with a single idempotent run:

```bash
docker compose exec app npx --no-install tsx prisma/seed.ts
```

It upserts reference data and leaves your meal plan, supplements and history untouched.

**Migrations failed on upgrade**

```bash
docker compose exec app npx prisma migrate status
```

Restore the pre-upgrade dump, then open an issue with that output.

**Reset everything (destroys all data)**

```bash
docker compose down -v
docker compose up -d --build
```

---

## Resource use

Idle, on a small home server:

| | Memory | Disk |
| --- | --- | --- |
| `app` | ~120–200 MB | ~350 MB image |
| `db` | ~30–60 MB | a few MB per year of history |

A Raspberry Pi 4 or any x86 mini-PC handles it comfortably. Build the image on the
target architecture, or use `docker buildx` for arm64.

---

## What is deliberately not here

- **Multi-user.** The schema carries `userId` everywhere, so it is a routing change
  rather than a migration, but nothing in the UI exposes it.
- **Server-driven push notifications.** Reminders are in-app, with optional foreground
  browser notifications. Web Push would need VAPID keys and a background scheduler; the
  descriptors in `lib/domain/reminders.ts` are ready for it.
- **Store aisle mapping.** Shopping Mode groups by `department`, which is the field
  aisle ordering would key off.
- **An external food database.** Nutrition is entered by hand. `Food.externalSource` and
  `Food.externalId` exist so an importer can backfill without a migration.
