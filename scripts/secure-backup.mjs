import "dotenv/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, open, mkdtemp, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function backupKey(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || ""))
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters",
    );
  return Buffer.from(value, "hex");
}
export async function encryptArchive(source, target, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(key), iv);
  const file = await open(target, "wx", 0o600);
  const output = file.createWriteStream();
  output.write(Buffer.concat([Buffer.from("EVB1"), iv]));
  try {
    await pipeline(createReadStream(source), cipher, output);
    await appendFile(target, cipher.getAuthTag());
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
export async function decryptArchive(source, target, key) {
  const input = await open(source, "r");
  let decipher;
  let size;
  try {
    size = (await input.stat()).size;
    const header = Buffer.alloc(16),
      tag = Buffer.alloc(16);
    await input.read(header, 0, 16, 0);
    await input.read(tag, 0, 16, size - 16);
    if (size < 32 || header.subarray(0, 4).toString() !== "EVB1")
      throw new Error("Invalid encrypted backup");
    decipher = createDecipheriv(
      "aes-256-gcm",
      backupKey(key),
      header.subarray(4),
    );
    decipher.setAuthTag(tag);
  } finally {
    await input.close();
  }
  const output = await open(target, "wx", 0o600);
  try {
    await pipeline(
      createReadStream(source, { start: 16, end: size - 17 }),
      decipher,
      output.createWriteStream(),
    );
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
async function main() {
  const [mode, filename] = process.argv.slice(2);
  if (!["backup", "restore"].includes(mode) || !filename)
    throw new Error(
      "Usage: secure-backup.mjs backup|restore /absolute/path/backup.evb",
    );
  backupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const temporary = await mkdtemp(path.join(tmpdir(), "evidence-backup-"));
  const archive = path.join(temporary, "archive.tar.gz"),
    folder = path.join(temporary, "workspace");
  try {
    if (mode === "backup") {
      execFileSync(process.execPath, ["scripts/backup.mjs", folder], {
        stdio: "inherit",
      });
      execFileSync("tar", ["-czf", archive, "-C", temporary, "workspace"]);
      await encryptArchive(
        archive,
        path.resolve(filename),
        process.env.BACKUP_ENCRYPTION_KEY,
      );
      console.log("Encrypted backup saved");
    } else {
      await decryptArchive(
        path.resolve(filename),
        archive,
        process.env.BACKUP_ENCRYPTION_KEY,
      );
      // Authenticate the entire archive before allowing extraction or a database restore.
      execFileSync("tar", ["-xzf", archive, "-C", temporary]);
      execFileSync(process.execPath, ["scripts/restore.mjs", folder], {
        stdio: "inherit",
      });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.error(
      "Secure backup/restore failed. Check configuration, keys, and the operations runbook.",
    );
    process.exitCode = 1;
  });
