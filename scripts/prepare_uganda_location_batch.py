"""Emit one validated SQL import call for uganda-locations-full.csv.

This helper never writes credentials or source data into the repository. It is
used by the controlled migration workflow to stream bounded JSON batches to the
service-role-only database importer.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

EXPECTED_COLUMNS = {
    "region",
    "sub_region",
    "district",
    "county",
    "subcounty",
}
IMPORT_COLUMNS = (
    "region",
    "sub_region",
    "district",
    "county",
    "subcounty",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("offset", type=int)
    parser.add_argument("limit", type=int)
    args = parser.parse_args()

    unique_paths: dict[tuple[str, ...], dict[str, str]] = {}
    with args.csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if set(reader.fieldnames or ()) != EXPECTED_COLUMNS:
            raise SystemExit("Unexpected CSV columns; import stopped safely")
        for index, row in enumerate(reader):
            cleaned = {column: row[column].strip() for column in IMPORT_COLUMNS}
            required = ("region", "sub_region", "district", "subcounty")
            if any(not cleaned[column] for column in required):
                raise SystemExit(f"Incomplete hierarchy at source line {index + 2}")
            key = tuple(cleaned[column].casefold() for column in IMPORT_COLUMNS)
            unique_paths.setdefault(key, cleaned)

    batch = list(unique_paths.values())[args.offset : args.offset + args.limit]

    payload = json.dumps(batch, ensure_ascii=False, separators=(",", ":"))
    escaped = payload.replace("'", "''")
    print(f"select public.import_uganda_location_paths('{escaped}'::jsonb) as imported;")


if __name__ == "__main__":
    main()
