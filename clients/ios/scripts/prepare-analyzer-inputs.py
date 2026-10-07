#!/usr/bin/env python3

import re
import shlex
import sys
from pathlib import Path


SHELL_WORD = re.compile(
    r'''(?<!\S)(?P<word>(?:\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'\\])+)(?=\s|$)'''
)


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def prepare_inputs(
    compiler_log: Path,
    normalized_log: Path,
    filelist_directory: Path,
    source_root: Path,
) -> None:
    root = source_root.resolve(strict=True)
    filelist_directory.mkdir(parents=True, exist_ok=True)
    replacements: dict[Path, Path] = {}

    def copy_filelist(reference: str) -> Path:
        source = Path(reference)
        if not source.is_absolute():
            source = Path.cwd() / source
        source = source.resolve(strict=True)
        if source not in replacements:
            destination = filelist_directory / f"{len(replacements):03d}-{source.name}"
            normalized_lines = []
            for line in source.read_text().splitlines(keepends=True):
                value = line.rstrip("\r\n")
                source_path = Path(value)
                if source_path.is_absolute():
                    resolved = source_path.resolve()
                    if is_within(resolved, root):
                        ending = line[len(value):]
                        line = f"{resolved}{ending}"
                normalized_lines.append(line)
            destination.write_text("".join(normalized_lines))
            replacements[source] = destination.resolve()
        return replacements[source]

    def replace_reference(match: re.Match[str]) -> str:
        raw_word = match.group("word")
        try:
            words = shlex.split(raw_word)
        except ValueError:
            return raw_word
        if len(words) != 1:
            return raw_word
        word = words[0]
        if not word.startswith("@") or not word.endswith(".SwiftFileList"):
            return raw_word
        destination = copy_filelist(word[1:])
        return shlex.quote(f"@{destination}")

    content = compiler_log.read_text()
    normalized_log.write_text(SHELL_WORD.sub(replace_reference, content))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: prepare-analyzer-inputs.py COMPILER_LOG NORMALIZED_LOG "
            "FILELIST_DIRECTORY SOURCE_ROOT"
        )
    prepare_inputs(*(Path(value) for value in sys.argv[1:]))
