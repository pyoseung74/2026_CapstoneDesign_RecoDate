#!/usr/bin/env python3
"""Create a bounded RecoDate data backup without leaving stale work copies."""

import shutil
import sqlite3
import tarfile
import time
from pathlib import Path


DATA = Path("/opt/recodate/data")
DEST = Path("/opt/recodate/backups")
KEEP_COUNT = 7
MIN_FREE_BYTES = 500_000_000
STATIC_DATABASES = {"recodate_places.db"}


def remove_stale_work_dirs():
    for path in DEST.glob("work_*"):
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)


def rotate_archives():
    archives = sorted(
        DEST.glob("recodate_backup_*.tar.gz"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for old in archives[KEEP_COUNT:]:
        old.unlink(missing_ok=True)


def main():
    DEST.mkdir(exist_ok=True)
    remove_stale_work_dirs()
    rotate_archives()

    free_bytes = shutil.disk_usage(DEST).free
    if free_bytes < MIN_FREE_BYTES:
        raise RuntimeError(
            f"backup skipped: only {free_bytes} bytes free; "
            f"{MIN_FREE_BYTES} bytes required"
        )

    stamp = time.strftime("%Y%m%d_%H%M%S")
    work = DEST / f"work_{stamp}"
    archive = DEST / f"recodate_backup_{stamp}.tar.gz"
    work.mkdir()
    try:
        for db in DATA.glob("*.db"):
            if db.name in STATIC_DATABASES:
                continue
            source = sqlite3.connect(db)
            target = sqlite3.connect(work / db.name)
            try:
                source.backup(target)
            finally:
                target.close()
                source.close()

        for extra in DATA.glob("*.json"):
            shutil.copy2(extra, work / extra.name)
        if (DATA / "uploads").exists():
            shutil.copytree(DATA / "uploads", work / "uploads")

        with tarfile.open(archive, "w:gz") as bundle:
            bundle.add(work, arcname=f"recodate_backup_{stamp}")
    except Exception:
        archive.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)

    rotate_archives()
    print(f"backup ok: {archive} ({archive.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
