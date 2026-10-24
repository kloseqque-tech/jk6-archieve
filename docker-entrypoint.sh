#!/bin/sh
set -eu

data_dir="${DATA_DIR:-/app/.data}"
mkdir -p "$data_dir/uploads"

if [ "$(id -u)" = "0" ]; then
  chown -R archive:archive "$data_dir"
  exec gosu archive "$@"
fi

exec "$@"
