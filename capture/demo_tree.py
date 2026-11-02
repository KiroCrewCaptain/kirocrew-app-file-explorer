"""Write the fictional home folder the README pictures browse.

Files is a read-only browser: it has no API that creates a file, so its demo
data cannot be seeded through ``scenes.json``'s ``setup`` calls the way an app
with a store is. This script writes a small, entirely made-up home folder
instead (a gardener named Sam and a vegetable-garden planner project with a git
history), and ``capture.py`` is run with ``HOME`` pointing at it, so the page
opens there and no real user name or path can reach a picture.

    python capture/demo_tree.py /tmp/kc-files-demo
    HOME=/tmp/kc-files-demo/sam python capture/capture.py --kirocrew ...

The folder is rebuilt from scratch on every run, git included (author and dates
are fixed), so two runs photograph the same tree.
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

README = """# Garden planner

A small planner for a four-bed vegetable garden: what goes where, when to sow,
and which plots need water this week.

## Beds

| Bed | Spring | Summer | Autumn |
|-----|--------|--------|--------|
| A   | peas   | tomatoes | garlic |
| B   | lettuce | beans  | kale   |
| C   | radish | squash  | leeks  |
| D   | herbs  | herbs   | herbs  |

## Before the last frost

- Start tomatoes indoors six weeks before the last frost date.
- Keep the cold frame shut on nights below 4 °C.
- Sow peas directly once the soil is workable.

## Running it

```bash
python src/planner.py --season spring
```

The planner reads `data/plots.csv` and prints this week's jobs.
"""

PLANNER = '''"""Print this week's garden jobs from data/plots.csv."""

import csv
import sys
from pathlib import Path

FROST_SAFE_MONTH = 5  # tender plants go out after the last frost


def jobs(season: str) -> list[str]:
    rows = csv.DictReader(Path("data/plots.csv").open(encoding="utf-8"))
    out = []
    for row in rows:
        if row["season"] == season:
            out.append(f"Bed {row['bed']}: {row['task']} {row['crop']}")
    return out


if __name__ == "__main__":
    season = sys.argv[-1] if len(sys.argv) > 1 else "spring"
    print("\\n".join(jobs(season)))
'''

SEASONS = """export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Months (1-12) that start each season in a temperate northern garden. */
export const SEASON_START: Record<Season, number> = {
  spring: 3,
  summer: 6,
  autumn: 9,
  winter: 12,
}

export function seasonOf(month: number): Season {
  if (month >= 12 || month < 3) return 'winter'
  if (month >= 9) return 'autumn'
  if (month >= 6) return 'summer'
  return 'spring'
}
"""

PLOTS = """bed,season,task,crop
A,spring,sow,peas
A,summer,plant out,tomatoes
B,spring,sow,lettuce
B,summer,sow,beans
C,spring,sow,radish
C,summer,plant out,squash
D,spring,divide,herbs
"""

TODO = """# This week

- [x] Turn the compost
- [ ] Mend the cold frame lid before the next frost
- [ ] Order seed potatoes
- [ ] Ask Robin about the spare water butt
"""

WATERING = """# Watering log

| Day | Beds | Notes |
|-----|------|-------|
| Mon | A, B | dry, gave extra to the peas |
| Wed | C    | squash seedlings wilting at noon |
| Fri | A–D  | light rain in the evening |
"""

RECIPES = """# Green tomato chutney

For the tomatoes that will not ripen before the first frost.

1. Chop 1 kg green tomatoes and 2 onions.
2. Simmer with 250 g sugar and 300 ml cider vinegar for an hour.
3. Jar while hot.
"""


def _png(width: int, height: int) -> bytes:
    """A small bed-layout picture: four coloured beds on soil, no dependencies."""
    soil, colours = (120, 86, 60), [(110, 170, 90), (150, 200, 90), (220, 170, 60), (90, 150, 120)]
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            bed = (x * 2 // width) + 2 * (y * 2 // height)
            inside = (x % (width // 2)) > 6 and (y % (height // 2)) > 6
            row += bytes(colours[bed] if inside else soil)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _git(repo: Path, *args: str, when: str) -> None:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Sam Gardener",
        "GIT_AUTHOR_EMAIL": "sam@example.com",
        "GIT_COMMITTER_NAME": "Sam Gardener",
        "GIT_COMMITTER_EMAIL": "sam@example.com",
        "GIT_AUTHOR_DATE": when,
        "GIT_COMMITTER_DATE": when,
        "GIT_CONFIG_NOSYSTEM": "1",
        "HOME": str(repo),
    }
    subprocess.run(["git", "-C", str(repo), *args], check=True, env=env, capture_output=True)


def build(root: Path) -> Path:
    home = root / "sam"
    if root.exists():
        shutil.rmtree(root)
    project = home / "projects" / "garden-planner"
    files = {
        project / "README.md": README,
        project / "src" / "planner.py": PLANNER,
        project / "src" / "seasons.ts": SEASONS,
        project / "data" / "plots.csv": PLOTS,
        project / "notes" / "todo.md": TODO,
        home / "notes" / "watering-log.md": WATERING,
        home / "recipes" / "green-tomato-chutney.md": RECIPES,
    }
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (project / "docs").mkdir()
    (project / "docs" / "bed-layout.png").write_bytes(_png(240, 160))

    _git(project, "init", "-q", "-b", "main", when="2026-03-01T09:00:00Z")
    _git(project, "add", "-A", when="2026-03-01T09:00:00Z")
    _git(project, "commit", "-q", "-m", "Plan the spring beds", when="2026-03-01T09:00:00Z")
    # Work in progress, so the tree shows git badges: one edit, one new file.
    (project / "notes" / "todo.md").write_text(
        TODO + "- [ ] Net the brassicas against pigeons\n", encoding="utf-8"
    )
    (project / "notes" / "frost-dates.md").write_text(
        "# Frost dates\n\nLast spring frost: around 10 May.\n"
        "First autumn frost: around 15 October.\n",
        encoding="utf-8",
    )
    return home


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/kc-files-demo")
    print(build(target.resolve()))
