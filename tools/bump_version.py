#!/usr/bin/env python3
"""
bump_version.py <short-sha>

Replace ?v=... query strings in app/index.html and app/app.js
with ?v=<short-sha> so browsers always fetch the latest files after a push.
"""

import re
import sys
from pathlib import Path

TARGETS = [
    Path("app/index.html"),
    Path("app/app.js"),
]

VER_RE = re.compile(r'\?v=[A-Za-z0-9_.\-]+')


def bump(path: Path, ver: str) -> bool:
    text = path.read_text(encoding="utf-8")
    new_text = VER_RE.sub(f"?v={ver}", text)
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    print(f"  updated: {path}")
    return True


def main():
    if len(sys.argv) < 2:
        print("usage: bump_version.py <version>", file=sys.stderr)
        sys.exit(1)
    ver = sys.argv[1]
    changed = False
    for p in TARGETS:
        if not p.exists():
            print(f"  skip (not found): {p}")
            continue
        changed |= bump(p, ver)
    if not changed:
        print("  nothing to update")
    else:
        print(f"  version set to: ?v={ver}")


if __name__ == "__main__":
    main()
