import { readdir, readFile } from "node:fs/promises";
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const secrets = [
  "DATABASE_URL",
  "ADMIN_DATABASE_URL",
  "password_hash",
  "SUPABASE_SERVICE_ROLE_KEY",
  "postgresql://",
  "browser-test-only",
];
for (const file of await files(".next/static")) {
  const content = await readFile(file, "utf8");
  for (const secret of secrets)
    if (content.includes(secret))
      throw new Error(`Server-only marker found in client asset: ${file}`);
}
console.log(
  "Client bundle check passed: no database URLs, credential hashes or server secret markers.",
);
