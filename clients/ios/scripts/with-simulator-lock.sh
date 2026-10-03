#!/usr/bin/env bash
set -euo pipefail

pops_ios_simulator_lock_release() {
  local current_token
  [ -n "${POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH:-}" ] || return 0
  current_token=$(sed -n '4p' "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH/owner" 2>/dev/null || true)
  if [ "$current_token" = "${POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN:-}" ]; then
    rm -f "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH/owner"
    rmdir "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH" 2>/dev/null || true
  fi
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH=''
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN=''
}

pops_ios_simulator_lock_recover() {
  local path=$1
  local local_host=$2
  local owner_pid owner_host stale_path
  owner_pid=$(sed -n '1p' "$path/owner" 2>/dev/null || true)
  owner_host=$(sed -n '2p' "$path/owner" 2>/dev/null || true)
  case "$owner_pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$owner_pid" -gt 0 ] || return 1
  [ "$owner_host" = "$local_host" ] || return 1
  kill -0 "$owner_pid" 2>/dev/null && return 1
  stale_path="${path}.stale.$$.$RANDOM"
  if mv "$path" "$stale_path" 2>/dev/null; then
    rm -f "$stale_path/owner"
    rmdir "$stale_path" 2>/dev/null || true
    return 0
  fi
  return 1
}

pops_ios_simulator_lock_acquire() {
  local common_dir path timeout_seconds local_host started_at elapsed next_notice
  local owner_pid owner_host owner_label token worktree
  timeout_seconds=${POPS_IOS_SIMULATOR_LOCK_TIMEOUT_SECONDS:-1800}
  case "$timeout_seconds" in
    ''|*[!0-9]*)
      printf 'simulator-lock: POPS_IOS_SIMULATOR_LOCK_TIMEOUT_SECONDS must be a non-negative integer.\n' >&2
      return 2
      ;;
  esac
  common_dir=$(git rev-parse --path-format=absolute --git-common-dir) || {
    printf 'simulator-lock: could not locate the shared Git directory.\n' >&2
    return 1
  }
  path=${POPS_IOS_SIMULATOR_LOCK_PATH:-"$common_dir/ios-simulator.lock"}
  local_host=$(hostname)
  started_at=$SECONDS
  next_notice=0

  while ! mkdir "$path" 2>/dev/null; do
    if pops_ios_simulator_lock_recover "$path" "$local_host"; then
      continue
    fi
    owner_pid=$(sed -n '1p' "$path/owner" 2>/dev/null || true)
    owner_host=$(sed -n '2p' "$path/owner" 2>/dev/null || true)
    owner_label=$(sed -n '3p' "$path/owner" 2>/dev/null || true)
    worktree=$(sed -n '5p' "$path/owner" 2>/dev/null || true)
    elapsed=$((SECONDS - started_at))
    if [ "$elapsed" -ge "$timeout_seconds" ]; then
      printf 'simulator-lock: timed out after %s seconds; %s owns the simulator (PID %s on %s, worktree %s). Lock: %s\n' \
        "$timeout_seconds" "${owner_label:-another local run}" "${owner_pid:-unknown}" \
        "${owner_host:-unknown host}" "${worktree:-unknown}" "$path" >&2
      return 1
    fi
    if [ "$elapsed" -ge "$next_notice" ]; then
      printf 'simulator-lock: waiting for %s (PID %s on %s, worktree %s); waited %s of %s seconds.\n' \
        "${owner_label:-another local run}" "${owner_pid:-unknown}" \
        "${owner_host:-unknown host}" "${worktree:-unknown}" "$elapsed" "$timeout_seconds" >&2
      next_notice=$((elapsed + 30))
    fi
    sleep 1
  done

  token="$$.$RANDOM.$RANDOM"
  worktree=$(git rev-parse --show-toplevel)
  if ! printf '%s\n%s\n%s\n%s\n%s\n' "$$" "$local_host" \
    "${POPS_IOS_SIMULATOR_RUN_LABEL:-${MISE_TASK:-iOS simulator run}}" \
    "$token" "$worktree" > "$path/owner"; then
    rmdir "$path" 2>/dev/null || true
    printf 'simulator-lock: could not record lock ownership at %s.\n' "$path" >&2
    return 1
  fi
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH=$path
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN=$token
  trap pops_ios_simulator_lock_release EXIT
  trap 'pops_ios_simulator_lock_release; exit 130' INT
  trap 'pops_ios_simulator_lock_release; exit 143' TERM
}

pops_ios_simulator_lock_test_cleanup() {
  if [ -n "${POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER:-}" ] &&
    kill -0 "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null; then
    kill "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null || true
    wait "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null || true
  fi
  if [ -n "${POPS_IOS_SIMULATOR_LOCK_TEST_DIR:-}" ]; then
    rm -rf "$POPS_IOS_SIMULATOR_LOCK_TEST_DIR"
  fi
}

pops_ios_simulator_lock_self_test() {
  local script_path repo_root lock_path marker sentinel output
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  repo_root=$(git rev-parse --show-toplevel)
  mkdir -p "$repo_root/tmp"
  POPS_IOS_SIMULATOR_LOCK_TEST_DIR=$(mktemp -d "$repo_root/tmp/ios-simulator-lock.XXXXXX")
  POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER=''
  trap pops_ios_simulator_lock_test_cleanup EXIT
  lock_path="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/lock"
  marker="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/held"
  sentinel="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/second-invocation-ran"

  env \
    POPS_IOS_SIMULATOR_LOCK_PATH="$lock_path" \
    POPS_IOS_SIMULATOR_RUN_LABEL='self-test holder' \
    bash "$script_path" -- sh -c 'touch "$1"; sleep 2' sh "$marker" \
    > "$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/holder.log" 2>&1 &
  POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER=$!

  attempts=0
  while [ ! -f "$marker" ] && [ "$attempts" -lt 100 ]; do
    sleep 0.05
    attempts=$((attempts + 1))
  done
  if [ ! -f "$marker" ]; then
    printf 'simulator-lock self-test: first invocation did not acquire the lock.\n' >&2
    return 1
  fi

  if output=$(env \
    POPS_IOS_SIMULATOR_LOCK_PATH="$lock_path" \
    POPS_IOS_SIMULATOR_LOCK_TIMEOUT_SECONDS=0 \
    bash "$script_path" -- sh -c 'touch "$1"' sh "$sentinel" 2>&1); then
    printf 'simulator-lock self-test: concurrent invocation unexpectedly acquired the lock.\n' >&2
    return 1
  fi
  case "$output" in
    *"PID $POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER"*) ;;
    *)
      printf 'simulator-lock self-test: wait failure did not identify the current owner.\n' >&2
      return 1
      ;;
  esac
  if [ -e "$sentinel" ]; then
    printf 'simulator-lock self-test: rejected invocation still ran its command.\n' >&2
    return 1
  fi
  wait "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER"
  POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER=''
  if [ -d "$lock_path" ]; then
    printf 'simulator-lock self-test: completed invocation left a stale lock.\n' >&2
    return 1
  fi
  printf 'simulator-lock self-test: concurrent invocations report the owner and cannot enter together.\n'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  if [ "${1:-}" = '--self-test' ] && [ "$#" -eq 1 ]; then
    pops_ios_simulator_lock_self_test
    exit $?
  fi
  if [ "${1:-}" != '--' ] || [ "$#" -lt 2 ]; then
    printf 'usage: with-simulator-lock.sh --self-test | -- <command> [arguments...]\n' >&2
    exit 64
  fi
  shift
  pops_ios_simulator_lock_acquire
  "$@"
  exit $?
fi

pops_ios_simulator_lock_acquire
