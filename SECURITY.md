# Security

## What this is

PrepTracker is a single-user application running on one home server, reached over
Tailscale from one phone. It is not a service, it has no customers, and it is not
meant to be reachable from the public internet. Everything below follows from that.

## Threat model

**Defended against**

- Anyone on the local network reaching the app without the password. There is one
  account, protected by a scrypt hash and a signed session cookie.
- Another device on the tailnet reading the database directly. Postgres is never
  published to a host port; it is reachable only over the Compose network.
- A backup leaking the database contents on its way somewhere else. The weekly
  off-host copy is encrypted with `age` before it leaves the machine, and the
  backup service refuses to copy in the clear unless you explicitly allow it.
- Losing the data. Nightly dumps, a weekly copy elsewhere, a weekly restore that is
  actually verified, and a migration that refuses to run without a recent dump.

**Not defended against, deliberately**

- Anyone with root on the server, or with the disk in their hand. `.env` holds
  `AUTH_SECRET` and the database password in plain text, and the dumps in
  `./backups` are unencrypted at rest on that machine.
- Exposure to the public internet. Port-forwarding this to the world, or using
  `tailscale funnel`, moves it outside everything this design assumes. Do not.
- A malicious authenticated user. There is one user and it is you; the code checks
  that every row belongs to the requesting user, but the model has no notion of a
  user who should be limited further.
- Denial of service. There is per-account login throttling and nothing else; a
  single-user home-lab app on a private network does not need rate limiting in
  front of every route.
- Supply-chain compromise of a dependency. Dependencies are pinned exactly,
  Dependabot proposes updates weekly, CI runs `npm audit` against the production
  tree and Trivy against the image. None of that stops a determined attack on an
  upstream package.

## Things worth knowing

- **A backup file is a credential.** Both the JSON export and the Postgres dump
  contain `users.passwordHash` and every meal, supplement, water and check-in row.
  Treat one exactly as you treat the database.
- **`COOKIE_SECURE` must be `true` once you serve HTTPS**, and stays `false` while
  you are on plain HTTP, or the browser drops the session cookie.
- **Changing your password invalidates every other session.** That is the way to
  respond to a lost or stolen phone; nothing of value is stored on the device.

## Reporting something

This is a personal project with one maintainer. Open a GitHub issue for anything
that is not itself sensitive. For something that should not be public — a way to
read another account's data, to bypass the login, or to reach the database — open a
[private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository instead of an issue.

There is no bounty, no service-level agreement, and no guaranteed response time.
Fixes land in `main` and in the next tag.

## Supported versions

The tip of `main` and the most recent tag. Nothing older is patched.
