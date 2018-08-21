#!/usr/bin/env bash

# Check if user exist or create new user
getent passwd dev || groupadd dev -g $(id -g) && useradd -m -u $(id -u) -g $(id -g) dev

export HOME=/home/dev

exec "$@"
