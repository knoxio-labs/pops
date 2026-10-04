#!/usr/bin/env bash
set -euo pipefail

pops_ios_simulator_lock_release() {
  local current_token script_path
  [ -n "${POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH:-}" ] || return 0
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  pops_ios_simulator_lock_gate "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH" "$script_path" \
    --release-under-gate "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH" \
    "$POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN" || true
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH=''
  POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN=''
}

pops_ios_simulator_lock_gate() {
  local path=$1 script_path=$2
  shift 2
  lockf -k -t 1 "${path}.gate" /bin/bash "$script_path" "$@"
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

pops_ios_simulator_lock_acquire_under_gate() {
  local path=$1 local_host=$2 owner_pid=$3 owner_label=$4 token=$5 worktree=$6
  local owner_tmp
  if [ -e "$path" ]; then
    pops_ios_simulator_lock_recover "$path" "$local_host" || return 10
  fi
  mkdir "$path" 2>/dev/null || return 10
  owner_tmp="$path/owner.$$.$RANDOM"
  if ! printf '%s\n%s\n%s\n%s\n%s\n' "$owner_pid" "$local_host" \
    "$owner_label" "$token" "$worktree" > "$owner_tmp" ||
    ! mv "$owner_tmp" "$path/owner"; then
    rm -f "$owner_tmp"
    rmdir "$path" 2>/dev/null || true
    printf 'simulator-lock: could not record lock ownership at %s.\n' "$path" >&2
    return 1
  fi
}

pops_ios_simulator_lock_release_under_gate() {
  local path=$1 token=$2 current_token
  current_token=$(sed -n '4p' "$path/owner" 2>/dev/null || true)
  if [ "$current_token" = "$token" ]; then
    rm -f "$path/owner"
    rmdir "$path" 2>/dev/null || true
  fi
}

pops_ios_simulator_lock_acquire() {
  local common_dir path timeout_seconds local_host started_at elapsed next_notice
  local owner_pid owner_host owner_label token worktree script_path gate_status
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
  mkdir -p "$(dirname "$path")"
  local_host=$(hostname)
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  started_at=$SECONDS
  next_notice=0

  token="$$.$RANDOM.$RANDOM"
  worktree=$(git rev-parse --show-toplevel)
  while true; do
    if pops_ios_simulator_lock_gate "$path" "$script_path" \
      --acquire-under-gate "$path" "$local_host" "$$" \
      "${POPS_IOS_SIMULATOR_RUN_LABEL:-${MISE_TASK:-iOS simulator run}}" \
      "$token" "$worktree"; then
      POPS_IOS_SIMULATOR_LOCK_ACTIVE_PATH=$path
      POPS_IOS_SIMULATOR_LOCK_ACTIVE_TOKEN=$token
      trap pops_ios_simulator_lock_release EXIT
      trap 'pops_ios_simulator_lock_release; exit 130' INT
      trap 'pops_ios_simulator_lock_release; exit 143' TERM
      return 0
    else
      gate_status=$?
    fi
    if [ "$gate_status" -ne 10 ] && [ "$gate_status" -ne 75 ]; then
      printf 'simulator-lock: could not update lock state at %s (status %s).\n' \
        "$path" "$gate_status" >&2
      return "$gate_status"
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
    sleep 0.25
  done
}

pops_ios_simulator_lock_dispatch() {
  case "${1:-}" in
    --acquire-under-gate)
      shift
      pops_ios_simulator_lock_acquire_under_gate "$@"
      ;;
    --release-under-gate)
      shift
      pops_ios_simulator_lock_release_under_gate "$@"
      ;;
    *)
      printf 'simulator-lock: invalid internal operation.\n' >&2
      return 64
      ;;
  esac
}

pops_ios_simulator_lock_test_cleanup() {
  local worker_pid
  if [ -n "${POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER:-}" ] &&
    kill -0 "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null; then
    kill "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null || true
    wait "$POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER" 2>/dev/null || true
  fi
  for worker_pid in ${POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS:-}; do
    if kill -0 "$worker_pid" 2>/dev/null; then
      kill "$worker_pid" 2>/dev/null || true
      wait "$worker_pid" 2>/dev/null || true
    fi
  done
  if [ -n "${POPS_IOS_SIMULATOR_LOCK_TEST_DIR:-}" ]; then
    rm -rf "$POPS_IOS_SIMULATOR_LOCK_TEST_DIR"
  fi
}

pops_ios_simulator_lock_self_test() {
  local script_path repo_root lock_path marker sentinel output stale_marker active_guard collision
  local worker_pid worker_number status
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  repo_root=$(git rev-parse --show-toplevel)
  mkdir -p "$repo_root/tmp"
  POPS_IOS_SIMULATOR_LOCK_TEST_DIR=$(mktemp -d "$repo_root/tmp/ios-simulator-lock.XXXXXX")
  POPS_IOS_SIMULATOR_LOCK_TEST_HOLDER=''
  trap pops_ios_simulator_lock_test_cleanup EXIT
  lock_path="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/lock"
  marker="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/held"
  sentinel="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/second-invocation-ran"
  POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS=''

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

  stale_marker="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/stale-reclaimed"
  mkdir "$lock_path"
  printf '%s\n%s\n%s\n%s\n%s\n' 99999999 "$(hostname)" \
    'self-test stale owner' 'stale-token' "$repo_root" > "$lock_path/owner"
  if ! env POPS_IOS_SIMULATOR_LOCK_PATH="$lock_path" \
    POPS_IOS_SIMULATOR_RUN_LABEL='self-test recovery' \
    bash "$script_path" -- sh -c 'touch "$1"' sh "$stale_marker"; then
    printf 'simulator-lock self-test: stale owner was not recovered.\n' >&2
    return 1
  fi
  if [ ! -f "$stale_marker" ] || [ -d "$lock_path" ]; then
    printf 'simulator-lock self-test: stale lock recovery or release failed.\n' >&2
    return 1
  fi

  active_guard="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/active"
  collision="$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/collision"
  mkdir "$lock_path"
  printf '%s\n%s\n%s\n%s\n%s\n' 99999999 "$(hostname)" \
    'self-test stale owner' 'stale-token' "$repo_root" > "$lock_path/owner"
  status=0
  for worker_number in 1 2 3 4 5 6 7 8 9 10 11 12; do
    env POPS_IOS_SIMULATOR_LOCK_PATH="$lock_path" \
      POPS_IOS_SIMULATOR_LOCK_TIMEOUT_SECONDS=30 \
      bash "$script_path" -- sh -c \
      'if ! mkdir "$1" 2>/dev/null; then touch "$2"; exit 1; fi; sleep 0.1; rmdir "$1"' \
      sh "$active_guard" "$collision" \
      > "$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/worker.$worker_number.log" 2>&1 &
    worker_pid=$!
    POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS="$POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS $worker_pid"
  done
  for worker_pid in $POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS; do
    if ! wait "$worker_pid"; then
      status=1
    fi
  done
  POPS_IOS_SIMULATOR_LOCK_TEST_WORKERS=''
  if [ "$status" -ne 0 ] || [ -e "$collision" ] || [ -d "$lock_path" ]; then
    printf 'simulator-lock self-test: stale recovery allowed overlapping owners or failed to release.\n' >&2
    for worker_number in 1 2 3 4 5 6 7 8 9 10 11 12; do
      cat "$POPS_IOS_SIMULATOR_LOCK_TEST_DIR/worker.$worker_number.log" >&2
    done
    return 1
  fi
  printf 'simulator-lock self-test: concurrent invocations serialize stale recovery and release their locks.\n'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --self-test)
      [ "$#" -eq 1 ] || exit 64
      pops_ios_simulator_lock_self_test
      exit $?
      ;;
    --acquire-under-gate|--release-under-gate)
      operation=$1
      shift
      pops_ios_simulator_lock_dispatch "$operation" "$@"
      exit $?
      ;;
    --)
      [ "$#" -ge 2 ] || {
        printf 'usage: with-simulator-lock.sh --self-test | -- <command> [arguments...]\n' >&2
        exit 64
      }
      shift
      pops_ios_simulator_lock_acquire
      "$@"
      exit $?
      ;;
    *)
      printf 'usage: with-simulator-lock.sh --self-test | -- <command> [arguments...]\n' >&2
      exit 64
      ;;
  esac
fi

pops_ios_simulator_lock_acquire
