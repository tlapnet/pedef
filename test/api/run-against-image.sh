#!/usr/bin/env bash
# Runs the black-box API test suite (test/api/*.test.mjs) against a docker image.
#
# Usage: test/api/run-against-image.sh <image> [port]
#
# Env:
#   PEDEF_PORT              port for the service (default: arg 2, else a free port)
#   PEDEF_STARTUP_TIMEOUT   seconds to wait for GET /ping (default 300; the legacy
#                           image runs `npm install && build` on start)
#   PEDEF_CONTAINER_NAME    container name (default pedef-apitest-<port>)
#   PEDEF_DOCKER_ARGS       extra `docker run` args (word-split)
#   PEDEF_FIXTURE_HOST, PEDEF_REQUEST_TIMEOUT_MS, PEDEF_PDF_TOOL - passed to the tests
#
# The container runs with --network host so it can reach the fixture HTTP server
# that the from-url tests start on 127.0.0.1. Exit code = test result.
set -uo pipefail

IMAGE="${1:-}"
if [[ -z "$IMAGE" ]]; then
    echo "usage: $0 <image> [port]" >&2
    exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

free_port() {
    node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

PORT="${2:-${PEDEF_PORT:-$(free_port)}}"
NAME="${PEDEF_CONTAINER_NAME:-pedef-apitest-$PORT}"
TIMEOUT="${PEDEF_STARTUP_TIMEOUT:-300}"
BASE="http://127.0.0.1:$PORT"

cleanup() {
    docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

show_logs() {
    echo "----- container logs ($NAME, last 200 lines) -----" >&2
    docker logs --tail 200 "$NAME" >&2 2>&1 || true
    echo "----- end of container logs -----" >&2
}

ping_ok() {
    node -e '
        fetch(process.argv[1] + "/ping", { signal: AbortSignal.timeout(3000) })
            .then(async (r) => process.exit(r.status === 200 && (await r.text()) === "pong" ? 0 : 1))
            .catch(() => process.exit(1));
    ' "$BASE"
}

if ping_ok; then
    echo "error: something already answers on $BASE/ping - pick another port" >&2
    trap - EXIT
    exit 2
fi

echo "Starting $IMAGE as $NAME on port $PORT ..."
# shellcheck disable=SC2086
if ! docker run -d --name "$NAME" --network host -e PORT="$PORT" ${PEDEF_DOCKER_ARGS:-} "$IMAGE" >/dev/null; then
    echo "error: docker run failed" >&2
    exit 2
fi

echo "Waiting up to ${TIMEOUT}s for $BASE/ping ..."
start=$(date +%s)
until ping_ok; do
    if ! docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null | grep -q true; then
        echo "error: container exited before becoming ready" >&2
        show_logs
        exit 1
    fi
    if (( $(date +%s) - start >= TIMEOUT )); then
        echo "error: $BASE/ping not ready after ${TIMEOUT}s" >&2
        show_logs
        exit 1
    fi
    sleep 1
done
echo "Ready after $(( $(date +%s) - start ))s."

cd "$REPO_ROOT" || exit 2
PEDEF_URL="$BASE" node --test test/api/*.test.mjs
rc=$?

if (( rc != 0 )); then
    show_logs
fi
exit $rc
