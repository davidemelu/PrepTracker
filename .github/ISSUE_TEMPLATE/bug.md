---
name: Bug
about: Something behaves differently from what it should
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- What you did, what you saw. One paragraph is enough. -->

## What should have happened

## How to reproduce

1.
2.
3.

## Where

- Screen or command:
- Device and browser (or "server"):
- Date the problem is about, if it is about a particular day:

## Version

<!-- `git describe --tags` on the server, or the image tag it is running. -->

## Does it involve data that must not be lost

- [ ] No — a display or navigation problem
- [ ] Yes — a meal, completion, water, supplement, yield or check-in row looks
      wrong, is missing, or changed on its own. Take a dump before touching
      anything: `docker compose run --rm backup now`

## Logs

<!--
docker compose logs --tail=100 app
Redact nothing except the database password; the app logs error names and codes
rather than message text, so log lines are safe to paste.
-->
