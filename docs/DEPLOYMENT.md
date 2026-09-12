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
docker compose logs migrate
docker compose logs -f app
```

You are looking for this from `migrate`, which runs to completion before the app
starts at all:

```
PrepTracker/migrate: waiting for the database…
PrepTracker/migrate: applying migrations…
PrepTracker/migrate: empty database, seeding initial data…
Seed complete.
PrepTracker/migrate: done.
```

and then this from `app`:

```
PrepTracker: starting on port 3000 (TZ=America/Los_Angeles, …)
✓ Ready
```

Then:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","database":"up"}

docker compose ps
# db, app and backup running and healthy; migrate exited 0
```

---

## How the stack is put together

Four services, because the four jobs have different lifetimes and different
risks. It is worth ten minutes to understand this before something goes wrong.

| Service | Lifetime | What it holds | Image |
| --- | --- | --- | --- |
| `db` | always | the data, in the `preptracker_db` volume | `postgres:16-alpine` |
| `migrate` | one shot per deployment | the Prisma CLI, the migrations, the compiled seed | `preptracker-migrate` |
| `app` | always | the Next.js server and nothing else | `preptracker` |
| `backup` | always | `pg_dump`, `age`, `rsync`, the schedule | `preptracker-backup` |

The app **used** to apply migrations and seed itself on boot. That is why the old
image was 1.31 GB: it had to carry the Prisma CLI and `tsx` to do it. Splitting the
job out has three consequences worth knowing:

1. **The app image is now 290 MB** and contains no Prisma CLI, no `npm`, no
   `psql` and no source. There is nothing in it to run but the server.
2. **A failed migration stops the deployment.** Compose starts `app` only when
   `migrate` has exited 0, so a broken migration leaves the old container running
   and the app never starts against a schema it does not understand.
3. **Schema work happens in the `migrate` container**, not in `app`:

   ```bash
   docker compose run --rm migrate status   # what is applied and what is pending
   docker compose run --rm migrate seed     # re-run the idempotent seed
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

### Headers, cookies and the proxy

Three things belong at the proxy rather than in the app, because the app is also
served over plain HTTP on a LAN and must not assume otherwise.

**`COOKIE_SECURE` is a manual step, and it has to match reality.** Set it to
`true` the moment you put HTTPS in front of the app, and leave it `false` while
you are on plain HTTP. Getting it wrong in either direction is the same symptom:
the browser silently drops the session cookie and you are signed out the instant
you sign in.

> Planned (remediation task 5.3): with `TRUST_PROXY=true` the app will derive
> `secure` from the `X-Forwarded-Proto` header the proxy already sends, so this
> stops being something to remember. Until that lands, set it by hand.

**HSTS belongs at the proxy.** `Strict-Transport-Security` tells a browser never
to speak HTTP to that hostname again, which is correct for
`preptracker.home.example.com` behind Caddy and wrong for `192.168.1.20:3000`.
The app never sends it; the Caddyfile above does. Add `includeSubDomains` only if
every other name under that domain is also HTTPS, and be aware that the header is
sticky: a browser that has seen it will refuse plain HTTP to that name for a year.

**`Permissions-Policy` is worth adding at the proxy.** The app asks for no
camera, microphone, geolocation or payment API, so denying them costs nothing and
means a compromised dependency cannot quietly start asking:

```caddy
header {
    Strict-Transport-Security "max-age=31536000;"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "same-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
}
```

`X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` are already sent
by the app itself (`next.config.ts`), so setting them at the proxy is belt and
braces rather than a requirement.

**Websockets must be proxied** for the Next.js error overlay and for any future
streaming. Caddy does it automatically; Nginx Proxy Manager needs the
*Websockets support* toggle.

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

> **A dump is a credential.** Both the Postgres dump and the JSON export contain
> `users.passwordHash` and every meal, supplement, water and check-in row you have
> ever recorded. Anyone who has one can read your entire history offline and attack
> the password hash at their leisure. Store them the way you store the database.

### What runs by itself

The `backup` service ships with the deployment. There is no host cron entry to
forget, and nothing to re-create when the server is rebuilt.

| When | What |
| --- | --- |
| Nightly, `BACKUP_TIME` (default 03:15 local) | `pg_dump \| gzip` into `./backups/db-<date>.sql.gz` |
| After each dump | delete dumps older than `BACKUP_RETENTION_DAYS` (default 30) |
| Weekly, `BACKUP_WEEKLY_DAY` (default Sunday) | restore the newest dump into a scratch database and count rows |
| Weekly, same day | encrypt the newest dump and copy it off this machine |
| On first start | take a dump immediately if `./backups` has none |

The dump is written to `db-<date>.sql.gz.partial` and renamed only after `pg_dump`
exits 0, so a dump interrupted half-way never leaves a file that looks valid.

Check it is actually working:

```bash
docker compose ps backup                 # healthy means a dump inside the last 36 h
docker compose logs --tail=40 backup
cat backups/.backup-status               # last dump, last verification, last copy
```

The healthcheck goes red when the newest dump is stale, when the last dump failed,
or when the last restore verification failed — so `docker compose ps` is enough to
notice that backups stopped, which is the failure mode that otherwise goes
unnoticed for months.

### Permissions on `./backups`

The backup service runs as uid 1001, the same uid as the app, so that everything in
the directory has one owner and the container needs no capabilities:

```bash
mkdir -p /srv/preptracker/backups
sudo chown -R 1001:1001 /srv/preptracker/backups
```

If you skip this the container refuses to start and says so.

### Getting a copy off the machine

Until you do this, every backup is on the same disk as the database it protects,
and one dead drive loses both. The service says so loudly on every start. Two
options; pick whichever you already have.

**1. Generate an encryption key.** The copy leaves this machine, so it is
encrypted before it goes.

```bash
docker compose run --rm --entrypoint age-keygen backup -o /backups/age-key.txt
cat backups/age-key.txt        # public key line: "# public key: age1..."
```

Put the **public** key in `.env` and then move the private key somewhere that is
not this server — a password manager is ideal:

```dotenv
BACKUP_AGE_RECIPIENT="age1qz…"
```

> Without the private key the off-host copies are unreadable, including by you.
> Store it before you need it, not after.

**2a. A second disk, NAS mount or USB drive.** Add the mount to the `backup`
service in `docker-compose.yml` and point the service at it:

```yaml
    volumes:
      - ./backups:/backups
      - /mnt/backup-drive/preptracker:/backups-secondary
```

```dotenv
BACKUP_SECONDARY_DIR="/backups-secondary"
```

**2b. Another machine on the tailnet.** Create a key with no passphrase, install
the public half on the target, then mount the private half read-only:

```bash
ssh-keygen -t ed25519 -N '' -f secrets/backup_ssh_key
ssh-copy-id -i secrets/backup_ssh_key.pub backups@other-machine
sudo chown 1001:1001 secrets/backup_ssh_key && chmod 600 secrets/backup_ssh_key
```

```yaml
    volumes:
      - ./backups:/backups
      - ./secrets/backup_ssh_key:/run/secrets/backup_ssh_key:ro
```

```dotenv
BACKUP_RSYNC_TARGET="backups@other-machine:/srv/preptracker-backups"
```

Then prove it works rather than waiting a week:

```bash
docker compose up -d backup
docker compose exec backup /usr/local/bin/backup-entrypoint.sh weekly
```

If you genuinely want to copy in the clear — to a disk that never leaves the house,
say — set `BACKUP_ALLOW_UNENCRYPTED=1`. The service will do it and warn every time.
It will not do it silently.

### Doing it by hand

```bash
docker compose run --rm backup now       # dump now, e.g. before an upgrade
docker compose run --rm backup verify    # restore the newest dump into a scratch DB
docker compose run --rm backup weekly    # verification and off-host copy
```

`verify` creates `preptracker_restore_check`, restores into it, counts rows in
`users`, `meals` and `daily_meals`, prints them and drops the database again. It
never touches the live one.

### The backup gate

A migration is the only routine operation that can destroy history, so the
`migrate` service refuses to apply a pending migration to a database that already
holds data unless a dump newer than `BACKUP_MAX_AGE_HOURS` (default 48) exists in
`./backups`. The refusal tells you exactly what to run. To override it for one
deployment — when the dump is somewhere the container cannot see, for instance:

```bash
SKIP_BACKUP_GATE=1 docker compose up -d
```

The gate does not apply to an empty database, so a first install is never blocked.

### Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_TIME` | `03:15` | local time of the nightly dump |
| `BACKUP_WEEKLY_DAY` | `7` | day for the weekly tasks, 1 = Monday |
| `BACKUP_RETENTION_DAYS` | `30` | how long local dumps are kept |
| `BACKUP_SECONDARY_DIR` | *(unset)* | path inside the container to copy to |
| `BACKUP_RSYNC_TARGET` | *(unset)* | `user@host:/path` to rsync to over ssh |
| `BACKUP_AGE_RECIPIENT` | *(unset)* | age public key; required for any off-host copy |
| `BACKUP_ALLOW_UNENCRYPTED` | `0` | `1` copies in the clear, loudly |
| `BACKUP_MAX_AGE_HOURS` | `48` | how fresh a dump must be to satisfy the migrate gate |
| `BACKUP_STALE_HOURS` | `36` | how old a dump has to be before the healthcheck goes red |

### What backups do not cover

A dump restores the *data*. Rebuilding the system also needs the code (the git
remote) and `.env`, which holds `AUTH_SECRET` and the database password and is
deliberately never committed. Keep a copy of `.env` in a password manager.
[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) is the runbook for actually doing it.

---

## Troubleshooting

**`AUTH_SECRET must be set to at least 32 characters`**
The entrypoint refuses to start without it. Set it in `.env` and recreate the container.

**The app never starts and `docker compose ps` shows `migrate` as exited non-zero**

```bash
docker compose logs migrate
```

That is the design working: `app` waits for `migrate` to exit 0, so a migration
that failed, or a backup gate that refused, stops the deployment instead of
starting the app against a schema it does not understand. The old containers keep
running until you fix it. The three usual causes are the backup gate (below), a
migration that genuinely failed, and `DATABASE_URL` pointing somewhere wrong —
inside compose the host is `db`, not `localhost`.

**`refusing to migrate a database that has data without a recent backup`**

The backup gate. Take a dump and try again:

```bash
docker compose run --rm backup now
docker compose up -d
```

If the dump lives somewhere this container cannot see, and you accept the risk:
`SKIP_BACKUP_GATE=1 docker compose up -d`.

**App restarts in a loop**

```bash
docker compose logs --tail=80 app
docker compose ps
```

With migrations moved out of the app, this is almost always the database becoming
unreachable after start, or `AUTH_SECRET` missing.

**`backup` is unhealthy**

```bash
docker compose logs --tail=40 backup
cat backups/.backup-status
```

Unhealthy means one of: no dump has ever been taken, the newest dump is more than
`BACKUP_STALE_HOURS` old, the last dump failed, or the last restore verification
failed. The last of those is the one to act on immediately — it means the backups
you have would not bring the app back.

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
docker compose run --rm migrate seed
```

It upserts reference data and leaves your meal plan, supplements and history untouched.

**Migrations failed on upgrade**

```bash
docker compose run --rm migrate status
```

Restore the pre-upgrade dump, check out the previous tag, and open an issue with
that output. [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) § *A migration failed
half-way* has the steps.

**Reset everything (destroys all data)**

```bash
docker compose run --rm backup now     # you will want this more often than you think
docker compose down -v
docker compose up -d --build
```

---

## Resource use

Idle, on a small home server:

| | Memory | Disk |
| --- | --- | --- |
| `app` | ~120–200 MB | 290 MB image |
| `db` | ~30–60 MB | a few MB per year of history |
| `backup` | ~10 MB | 444 MB image; ~20 KB per nightly dump today |
| `migrate` | only while it runs | 632 MB image, sharing base layers with `app` |

The app image was 1.31 GB before the migration and seeding moved out of it. The
`migrate` image is the big one now, because it carries the Prisma CLI and its
engines — but it runs for about five seconds per deployment and is idle disk the
rest of the time, which is the right place for the weight to sit.

Compose limits each service (`deploy.resources.limits`) so one of them cannot take
the host down, and caps Docker's json-file logs at 5 × 10 MB per service. Both are
in `docker-compose.yml`; raise them there if you run something heavier alongside.

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
