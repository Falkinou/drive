#!/bin/sh
set -eu

umask 077
retention_days="${BACKUP_RETENTION_DAYS:-30}"

while true; do
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  target="/backups/drive-${stamp}.dump"
  uploads_target="/backups/drive-uploads-${stamp}.tar.gz"
  pg_dump --format=custom --compress=6 --file="$target"
  tar -czf "$uploads_target" -C /uploads .
  find /backups -type f -name 'drive-*.dump' -mtime "+${retention_days}" -delete
  find /backups -type f -name 'drive-uploads-*.tar.gz' -mtime "+${retention_days}" -delete
  sleep 86400
done
