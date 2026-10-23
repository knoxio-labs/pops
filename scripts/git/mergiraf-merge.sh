#!/bin/sh
# The driver behind `merge=mergiraf` in .gitattributes, installed per clone by
# scripts/git/install-merge-drivers.mjs. Git runs it from the top of the work
# tree as: mergiraf-merge.sh %O %A %B %L %P %S %X %Y
#
# Git reports a failed driver as a conflict but keeps whatever is in %A, which
# for a driver that never ran is our side with no conflict markers: their side
# of every hunk would vanish into a file that looks resolved. Whenever mergiraf
# cannot be found or crashes, this falls back to `git merge-file`, git's own
# line merge, which writes ordinary markers.
set -u

base=$1
current=$2
other=$3
marker_size=$4
path=$5
base_label=$6
current_label=$7
other_label=$8

resolve_mergiraf() {
  if command -v mergiraf >/dev/null 2>&1; then
    command -v mergiraf
    return 0
  fi
  # Git started from an IDE or a GUI often lacks mise's shims on PATH while
  # the pinned binary is still installed.
  if command -v mise >/dev/null 2>&1; then
    found=$(mise which mergiraf 2>/dev/null) || return 1
    if [ -x "$found" ]; then
      printf '%s\n' "$found"
      return 0
    fi
  fi
  return 1
}

if mergiraf_bin=$(resolve_mergiraf); then
  # 0 is a clean merge and 1 a conflict mergiraf has already written into %A.
  # Anything else is mergiraf itself failing, possibly after a partial write,
  # so %A is restored and merged as text.
  ours_copy=$(mktemp) || exit 2
  cp "$current" "$ours_copy" || exit 2
  "$mergiraf_bin" merge --git "$base" "$current" "$other" \
    -s "$base_label" -x "$current_label" -y "$other_label" \
    -p "$path" -l "$marker_size"
  status=$?
  if [ "$status" -le 1 ]; then
    rm -f "$ours_copy"
    exit "$status"
  fi
  echo "mergiraf exited $status on $path; falling back to a line merge." >&2
  cp "$ours_copy" "$current" || exit 2
  rm -f "$ours_copy"
fi

exec git merge-file -L "$current_label" -L "$base_label" -L "$other_label" \
  --marker-size="$marker_size" "$current" "$base" "$other"
