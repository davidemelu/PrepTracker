#!/bin/sh
# Backup service — nightly dump, weekly off-host copy, weekly restore check.
#
# This runs as a Compose service rather than a host cron entry on purpose. A
# cron line lives on one machine, is not in version control, and is the first
# thing forgotten when the server is rebuilt; a service ships with the
# deployment and is restored by the same `docker compose up` that restores
# everything else.
#
# Usage (the daemon is the default):
#
#   backup-entrypoint.sh daemon   schedule and run everything (the service)
#   backup-entrypoint.sh now      take a dump immediately and exit
#   backup-entrypoint.sh weekly   run the off-host copy and restore check now
#   backup-entrypoint.sh verify   restore the newest dump into a scratch database
#   backup-entrypoint.sh check    healthcheck: is the backup system actually working
#
# A dump contains every row, including users.passwordHash and every meal,
# supplement and check-in you have recorded. Treat one exactly as you treat the
# database itself: see docs/DEPLOYMENT.md.

set -u

BACKUP_DIR=${BACKUP_DIR:-/backups}
STATE_FILE="$BACKUP_DIR/.backup-status"

BACKUP_TIME=${BACKUP_TIME:-03:15}
BACKUP_WEEKLY_DAY=${BACKUP_WEEKLY_DAY:-7}      # 1 = Monday … 7 = Sunday
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
BACKUP_STALE_HOURS=${BACKUP_STALE_HOURS:-36}   # when the healthcheck goes red
BACKUP_VERIFY_DB=${BACKUP_VERIFY_DB:-preptracker_restore_check}

BACKUP_SECONDARY_DIR=${BACKUP_SECONDARY_DIR:-}
BACKUP_RSYNC_TARGET=${BACKUP_RSYNC_TARGET:-}
BACKUP_SSH_KEY=${BACKUP_SSH_KEY:-/run/secrets/backup_ssh_key}
BACKUP_KNOWN_HOSTS=${BACKUP_KNOWN_HOSTS:-/tmp/known_hosts}
BACKUP_AGE_RECIPIENT=${BACKUP_AGE_RECIPIENT:-}
BACKUP_ALLOW_UNENCRYPTED=${BACKUP_ALLOW_UNENCRYPTED:-0}

PGDATABASE=${PGDATABASE:-preptracker}
PGUSER=${PGUSER:-preptracker}
export PGDATABASE PGUSER

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') backup: $*"
}

fail() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') backup: ERROR: $*" >&2
}

# --- tiny key=value state file ---------------------------------------------
# Written next to the dumps so it survives a container rebuild, and dot-prefixed
# so it is never mistaken for one.

state_get() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" | tail -n 1
}

state_set() {
  key=$1
  value=$2
  tmp="$STATE_FILE.tmp"
  if [ -f "$STATE_FILE" ]; then
    grep -v "^$key=" "$STATE_FILE" > "$tmp" 2>/dev/null || true
  else
    : > "$tmp"
  fi
  echo "$key=$value" >> "$tmp"
  mv "$tmp" "$STATE_FILE"
}

newest_dump() {
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -n 1
}

# --- nightly dump -----------------------------------------------------------

run_dump() {
  target="$BACKUP_DIR/db-$(date +%F).sql.gz"
  partial="$target.partial"

  log "dumping $PGDATABASE to $target"

  # Written to a .partial name and renamed only on success. A truncated dump
  # that kept the real name would satisfy the migrate service's backup gate and
  # would restore into a half-empty database — the one failure mode a backup
  # system must not have.
  if ! pg_dump --no-owner --no-privileges --clean --if-exists | gzip -9 > "$partial"; then
    rm -f "$partial"
    fail "pg_dump failed; no dump written for today"
    state_set last_dump_result fail
    state_set last_dump_epoch "$(date +%s)"
    return 1
  fi

  mv "$partial" "$target"
  size=$(wc -c < "$target" | tr -d ' ')
  log "wrote $target ($size bytes)"

  state_set last_dump_date "$(date +%F)"
  state_set last_dump_epoch "$(date +%s)"
  state_set last_dump_result ok
  state_set last_dump_file "$target"

  prune_old
  return 0
}

prune_old() {
  removed=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' \
    -mtime +"$BACKUP_RETENTION_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')
  if [ "${removed:-0}" -gt 0 ]; then
    log "removed $removed dump(s) older than $BACKUP_RETENTION_DAYS days"
  fi
}

# --- off-host copy ----------------------------------------------------------

# Prints the path of the file to ship, encrypting it first when a recipient is
# configured. Refuses rather than quietly shipping plaintext: the copy leaves
# this machine, and it carries the password hash and every diet record.
prepare_payload() {
  source_file=$1

  if [ -n "$BACKUP_AGE_RECIPIENT" ]; then
    encrypted="/tmp/$(basename "$source_file").age"
    if ! age -r "$BACKUP_AGE_RECIPIENT" -o "$encrypted" "$source_file"; then
      fail "age encryption failed; nothing was copied off this host"
      return 1
    fi
    echo "$encrypted"
    return 0
  fi

  if [ "$BACKUP_ALLOW_UNENCRYPTED" = "1" ]; then
    fail "copying an UNENCRYPTED dump off this host. It contains the password"
    fail "hash and every record. Set BACKUP_AGE_RECIPIENT to stop doing this."
    echo "$source_file"
    return 0
  fi

  fail "off-host copy is configured but BACKUP_AGE_RECIPIENT is not set."
  fail "Generate a key with 'age-keygen -o backup-key.txt', put the public key"
  fail "in BACKUP_AGE_RECIPIENT, and keep the private key somewhere that is not"
  fail "this machine. To copy in the clear anyway, set BACKUP_ALLOW_UNENCRYPTED=1."
  return 1
}

run_offsite() {
  if [ -z "$BACKUP_SECONDARY_DIR" ] && [ -z "$BACKUP_RSYNC_TARGET" ]; then
    fail "no second location configured. Every backup is on the same host and"
    fail "the same disk as the database, so one hardware failure loses both."
    fail "Set BACKUP_SECONDARY_DIR or BACKUP_RSYNC_TARGET — see docs/DEPLOYMENT.md."
    state_set last_offsite_result unconfigured
    return 1
  fi

  dump=$(newest_dump)
  if [ -z "$dump" ]; then
    fail "no dump to copy off this host"
    state_set last_offsite_result fail
    return 1
  fi

  payload=$(prepare_payload "$dump") || {
    state_set last_offsite_result fail
    return 1
  }

  status=0

  if [ -n "$BACKUP_SECONDARY_DIR" ]; then
    if mkdir -p "$BACKUP_SECONDARY_DIR" && cp "$payload" "$BACKUP_SECONDARY_DIR/"; then
      log "copied $(basename "$payload") to $BACKUP_SECONDARY_DIR"
    else
      fail "could not copy to $BACKUP_SECONDARY_DIR"
      status=1
    fi
  fi

  if [ -n "$BACKUP_RSYNC_TARGET" ]; then
    if [ ! -r "$BACKUP_SSH_KEY" ]; then
      fail "BACKUP_RSYNC_TARGET is set but $BACKUP_SSH_KEY is not readable"
      status=1
    elif rsync -a --timeout=120 \
        -e "ssh -i $BACKUP_SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$BACKUP_KNOWN_HOSTS" \
        "$payload" "$BACKUP_RSYNC_TARGET"; then
      log "rsynced $(basename "$payload") to $BACKUP_RSYNC_TARGET"
    else
      fail "rsync to $BACKUP_RSYNC_TARGET failed"
      status=1
    fi
  fi

  # The encrypted temporary never stays on this host.
  case "$payload" in /tmp/*) rm -f "$payload" ;; esac

  if [ "$status" -eq 0 ]; then
    state_set last_offsite_epoch "$(date +%s)"
    state_set last_offsite_result ok
  else
    state_set last_offsite_result fail
  fi
  return "$status"
}

# --- restore verification ---------------------------------------------------

run_verify() {
  dump=$(newest_dump)
  if [ -z "$dump" ]; then
    fail "no dump to verify"
    state_set last_verify_result fail
    return 1
  fi

  log "restoring $dump into scratch database $BACKUP_VERIFY_DB"

  dropdb --maintenance-db=postgres --if-exists "$BACKUP_VERIFY_DB" || true
  if ! createdb --maintenance-db=postgres "$BACKUP_VERIFY_DB"; then
    fail "could not create the scratch database"
    state_set last_verify_result fail
    return 1
  fi

  if ! gunzip -c "$dump" | psql -q -v ON_ERROR_STOP=1 -d "$BACKUP_VERIFY_DB" > /dev/null; then
    fail "restore of $dump FAILED. This backup would not have brought the app back."
    state_set last_verify_result fail
    dropdb --maintenance-db=postgres --if-exists "$BACKUP_VERIFY_DB" || true
    return 1
  fi

  # A restore that produces an empty database is a failure that reports success
  # unless something counts rows, so count them, in the tables that matter.
  counts=$(psql -Atq -v ON_ERROR_STOP=1 -d "$BACKUP_VERIFY_DB" -c \
    "SELECT (SELECT count(*) FROM users) || ' ' || (SELECT count(*) FROM meals) || ' ' || (SELECT count(*) FROM daily_meals)" 2>/dev/null) || counts=''

  if [ -z "$counts" ]; then
    fail "restored database does not have the expected tables"
    state_set last_verify_result fail
    dropdb --maintenance-db=postgres --if-exists "$BACKUP_VERIFY_DB" || true
    return 1
  fi

  users=$(echo "$counts" | cut -d' ' -f1)
  meals=$(echo "$counts" | cut -d' ' -f2)
  daily=$(echo "$counts" | cut -d' ' -f3)

  dropdb --maintenance-db=postgres --if-exists "$BACKUP_VERIFY_DB" || true

  if [ "${users:-0}" -lt 1 ] || [ "${meals:-0}" -lt 1 ]; then
    fail "restored database is empty (users=$users meals=$meals daily_meals=$daily)"
    state_set last_verify_result fail
    return 1
  fi

  log "restore verified: users=$users meals=$meals daily_meals=$daily"
  state_set last_verify_epoch "$(date +%s)"
  state_set last_verify_result ok
  state_set last_verify_counts "users=$users meals=$meals daily_meals=$daily"
  return 0
}

# --- healthcheck ------------------------------------------------------------
#
# `docker compose ps` is the only place anyone looks. A backup system that has
# quietly stopped working must show up there, so the container reports unhealthy
# when the newest dump is stale or the last verification failed.

run_check() {
  result=$(state_get last_dump_result)
  epoch=$(state_get last_dump_epoch)
  verify=$(state_get last_verify_result)

  if [ -z "$epoch" ]; then
    echo "no backup has been taken yet"
    return 1
  fi

  age_hours=$(( ( $(date +%s) - epoch ) / 3600 ))

  if [ "$result" != "ok" ]; then
    echo "last dump failed"
    return 1
  fi

  if [ "$age_hours" -gt "$BACKUP_STALE_HOURS" ]; then
    echo "newest dump is ${age_hours}h old (limit ${BACKUP_STALE_HOURS}h)"
    return 1
  fi

  if [ "$verify" = "fail" ]; then
    echo "last restore verification failed"
    return 1
  fi

  echo "ok: dump ${age_hours}h old, verify=${verify:-never}"
  return 0
}

# --- startup summary --------------------------------------------------------
#
# Printed once, so `docker compose logs backup` answers "is this actually
# protecting me?" without anyone having to read the compose file.

print_configuration() {
  log "backup directory:   $BACKUP_DIR (retention ${BACKUP_RETENTION_DAYS} days)"
  log "nightly dump at:    $BACKUP_TIME local ($(date '+%Z %z'))"
  log "weekly tasks on:    day $BACKUP_WEEKLY_DAY of the week (1=Mon, 7=Sun)"

  if [ -n "$BACKUP_SECONDARY_DIR" ] || [ -n "$BACKUP_RSYNC_TARGET" ]; then
    log "off-host copy to:   ${BACKUP_SECONDARY_DIR:-}${BACKUP_RSYNC_TARGET:+ $BACKUP_RSYNC_TARGET}"
    if [ -n "$BACKUP_AGE_RECIPIENT" ]; then
      log "off-host copy is encrypted to $BACKUP_AGE_RECIPIENT"
    elif [ "$BACKUP_ALLOW_UNENCRYPTED" = "1" ]; then
      fail "off-host copy is UNENCRYPTED (BACKUP_ALLOW_UNENCRYPTED=1)"
    else
      fail "off-host copy will be REFUSED: BACKUP_AGE_RECIPIENT is not set"
    fi
  else
    fail "no off-host copy configured — backups exist only on this machine"
  fi
}

# --- scheduler --------------------------------------------------------------
#
# A polling loop rather than cron: busybox crond wants to run as root and to own
# a crontab outside the image, and this needs neither. One minute of drift on a
# nightly backup does not matter, and the loop survives clock changes and DST
# without arithmetic, because it only ever compares the current date with the
# date of the last run.

run_daemon() {
  print_configuration

  # A brand-new deployment should not wait until tomorrow morning for its first
  # protection — and the migrate service's backup gate needs something to find.
  if [ -z "$(newest_dump)" ]; then
    log "no dump exists yet; taking one now"
    run_dump || true
  fi

  while true; do
    today=$(date +%F)
    now=$(date +%H:%M)
    weekday=$(date +%u)

    if [ "$now" \> "$BACKUP_TIME" ] || [ "$now" = "$BACKUP_TIME" ]; then
      if [ "$(state_get last_dump_date)" != "$today" ]; then
        run_dump || true

        if [ "$weekday" = "$BACKUP_WEEKLY_DAY" ]; then
          log "weekly tasks"
          run_verify || true
          run_offsite || true
        fi
      fi
    fi

    sleep 60
  done
}

# --- dispatch ---------------------------------------------------------------

mkdir -p "$BACKUP_DIR" 2>/dev/null || true

if [ ! -w "$BACKUP_DIR" ]; then
  fail "$BACKUP_DIR is not writable by uid $(id -u). On the host, run:"
  fail "  sudo chown -R 1001:1001 ./backups"
  exit 1
fi

case "${1:-daemon}" in
  daemon) run_daemon ;;
  now) run_dump ;;
  weekly)
    status=0
    run_verify || status=1
    run_offsite || status=1
    exit "$status"
    ;;
  verify) run_verify ;;
  offsite) run_offsite ;;
  check) run_check ;;
  *)
    fail "unknown command: $1"
    exit 64
    ;;
esac
