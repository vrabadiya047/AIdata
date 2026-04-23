#!/usr/bin/env python3
"""
One-shot migration: copies all rows from the SQLite database into PostgreSQL.

Usage:
    python scripts/migrate_sqlite_to_pg.py \
        --sqlite  logs/sovereign_projects.db \
        --pg      postgresql://sovereign:sovereign@localhost:5432/sovereign

After the migration, start the backend normally — it will use PostgreSQL from
that point on.  The SQLite file is left untouched (rename/delete it yourself
once you are satisfied).

Re-indexing documents into Qdrant is NOT done here; the engine rebuilds the
Qdrant index automatically on the first query to each project.
"""

import argparse
import sqlite3
import sys

import psycopg2


# ── Tables in the order they must be inserted (no FK cycles in our schema) ───
TABLES = [
    "users",
    "custom_projects",
    "file_metadata",
    "chat_history",
    "project_shares",
    "groups",
    "group_members",
    "project_group_shares",
    "system_state",
]


def migrate(sqlite_path: str, pg_dsn: str, dry_run: bool = False) -> None:
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row

    dst = psycopg2.connect(pg_dsn)
    dst_cur = dst.cursor()

    total = 0
    for table in TABLES:
        src_cur = src.execute(f"SELECT * FROM {table}")   # noqa: S608
        rows = src_cur.fetchall()
        if not rows:
            print(f"  {table}: (empty)")
            continue

        cols = [d[0] for d in src_cur.description]
        placeholders = ", ".join(["%s"] * len(cols))
        col_list     = ", ".join(cols)

        # Build ON CONFLICT clause so reruns are idempotent
        # system_state has a PK on 'key'; users on 'username'; others on composite
        conflict_clause = "ON CONFLICT DO NOTHING"

        sql = (
            f"INSERT INTO {table} ({col_list}) "
            f"VALUES ({placeholders}) {conflict_clause}"
        )

        if not dry_run:
            dst_cur.executemany(sql, [tuple(r) for r in rows])

        print(f"  {table}: {len(rows):>6} rows {'(dry-run)' if dry_run else 'migrated'}")
        total += len(rows)

    if not dry_run:
        dst.commit()
        print(f"\n✅  {total} total rows committed to PostgreSQL.")
    else:
        print(f"\n(dry-run) {total} total rows would be migrated.")

    src.close()
    dst_cur.close()
    dst.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Sovereign SQLite → PostgreSQL")
    parser.add_argument("--sqlite",   required=True, help="Path to the SQLite .db file")
    parser.add_argument("--pg",       required=True, help="PostgreSQL DSN, e.g. postgresql://user:pass@host/db")
    parser.add_argument("--dry-run",  action="store_true", help="Print row counts without writing")
    args = parser.parse_args()

    print(f"Source : {args.sqlite}")
    print(f"Target : {args.pg}")
    print(f"Mode   : {'dry-run' if args.dry_run else 'LIVE'}\n")

    try:
        migrate(args.sqlite, args.pg, dry_run=args.dry_run)
    except Exception as exc:
        print(f"\n❌  Migration failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
