import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrations = [
  ["supabase/migrations/20261008110000_teacher_multi_subject_allocation.sql", "database/migrations/073_teacher_multi_subject_allocation.sql"],
  ["supabase/migrations/20261008120000_teacher_allocation_lifecycle_security.sql", "database/migrations/074_teacher_allocation_lifecycle_security.sql"],
];

for (const [sourcePath, destinationPath] of migrations) {
  const source = await readFile(resolve(sourcePath));
  const destination = resolve(destinationPath);
  let existing;
  try { existing = await readFile(destination); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (!existing || !source.equals(existing)) await writeFile(destination, source);
  console.log(`${sourcePath} -> ${destinationPath} (${createHash("sha256").update(source).digest("hex")})`);
}
