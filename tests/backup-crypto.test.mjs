import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { encryptArchive, decryptArchive } from "../scripts/secure-backup.mjs";
test("backups authenticate before restoring and reject tampering without leaving plaintext", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "evidence-crypto-test-"));
  const key = "ab".repeat(32),
    source = path.join(folder, "source"),
    encrypted = path.join(folder, "encrypted"),
    restored = path.join(folder, "restored");
  try {
    await writeFile(source, "private source and API key ciphertext");
    await encryptArchive(source, encrypted, key);
    await decryptArchive(encrypted, restored, key);
    assert.deepEqual(await readFile(restored), await readFile(source));
    await assert.rejects(() => encryptArchive(source, restored, key));
    assert.deepEqual(await readFile(restored), await readFile(source));
    await assert.rejects(() => decryptArchive(encrypted, restored, key));
    assert.deepEqual(await readFile(restored), await readFile(source));
    const corrupted = await readFile(encrypted);
    corrupted[18] ^= 1;
    await writeFile(encrypted, corrupted);
    const rejected = path.join(folder, "rejected");
    await assert.rejects(() => decryptArchive(encrypted, rejected, key));
    await assert.rejects(() => access(rejected));
    await assert.rejects(() =>
      decryptArchive(encrypted, rejected, "wrong-key"),
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
