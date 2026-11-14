import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { mockBlob } from "../scripts/mock-blob.mjs";
test("backup restores a consistent database and verified original files into an empty database", async () => {
  const token = randomUUID().replaceAll("-", "");
  const sourceName = "ops_" + token + "_e2e",
    restoreName = "restore_" + token + "_e2e",
    cloudName = "blob_restore_" + token + "_e2e";
  const sourceUrl = new URL(process.env.DATABASE_URL!);
  const restoreUrl = new URL(sourceUrl);
  const cloudUrl = new URL(sourceUrl);
  cloudUrl.pathname = "/" + cloudName;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  sourceUrl.pathname = "/" + sourceName;
  restoreUrl.pathname = "/" + restoreName;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${sourceName}"`);
  await admin.query(`CREATE DATABASE "${restoreName}"`);
  await admin.query(`CREATE DATABASE "${cloudName}"`);
  const source = new pg.Client({ connectionString: sourceUrl.toString() });
  const restored = new pg.Client({ connectionString: restoreUrl.toString() });
  const cloud = new pg.Client({ connectionString: cloudUrl.toString() });
  const blob = await mockBlob(3104);
  try {
    await source.connect();
    await source.query(
      (await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8")) +
        "\n" +
        (await readFile(
          new URL("../lib/hosting.sql", import.meta.url),
          "utf8",
        )),
    );
    const migrationEnv = {
      ...process.env,
      DATABASE_URL: sourceUrl.toString(),
      DIRECT_DATABASE_URL: sourceUrl.toString(),
    };
    const preview = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      {
        encoding: "utf8",
        env: {
          ...migrationEnv,
          DEPLOY_ENV: "preview",
          PRODUCTION_DATABASE_URL: sourceUrl.toString(),
        },
      },
    );
    assert.notEqual(preview.status, 0);
    assert.match(
      preview.stderr,
      /Preview cannot migrate the production database/,
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      const migration = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/migrate.ts"],
        { encoding: "utf8", env: migrationEnv },
      );
      assert.equal(migration.status, 0, migration.stderr);
    }
    const {
      rows: [ledger],
    } = await source.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.equal(ledger.n, 17);
    const user = randomUUID(),
      customer = randomUUID(),
      tid = randomUUID();
    const raw = "[00:12] Customer: We need an audit trail.";
    const hash = createHash("sha256").update(raw).digest("hex");
    const dir = path.resolve(".local", "ops-" + token),
      dataDir = path.join(dir, "source"),
      restoreDir = path.join(dir, "restored"),
      backupDir = path.join(dir, "backup");
    await mkdir(path.join(dataDir, "uploads", user), { recursive: true });
    const file = path.join(dataDir, "uploads", user, hash + ".txt");
    await writeFile(file, raw);
    await source.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [user, "ops@example.com", "Operations", "fixture-not-for-login"],
    );
    await source.query(
      "INSERT INTO settings(user_id,product_context) VALUES($1,$2)",
      [user, "A simple project tracker for small teams."],
    );
    await source.query(
      "INSERT INTO customers(id,user_id,name) VALUES($1,$2,$3)",
      [customer, user, "Backup customer"],
    );
    await source.query(
      "INSERT INTO transcripts(id,user_id,customer_id,title,filename,sha256,raw_text,segments,storage_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [tid, user, customer, "Original", "original.txt", hash, raw, "[]", file],
    );
    await source.query(
      "INSERT INTO jobs(id,user_id,transcript_id,purpose,provider,model,workflow_run_id) VALUES($1,$2,$3,'extract','openai','fixture','wrun_old_deployment')",
      [randomUUID(), user, tid],
    );
    const reportId = randomUUID();
    await source.query(
      "INSERT INTO discovery_reports(id,user_id,input_hash) VALUES($1,$2,'backup-report')",
      [reportId, user],
    );
    await source.query(
      "INSERT INTO discovery_validation_work(user_id,report_id,opportunity_id,opportunity,status,activity,learning,outcome) VALUES($1,$2,'backup-opportunity',$3,'reviewed','Interview the owner','Retention remains uncertain','inconclusive')",
      [user, reportId, JSON.stringify({ title: "Backup opportunity" })],
    );
    const sourceId = randomUUID();
    const document = Buffer.from(
      "%PDF-1.4\nOriginal binary bytes \u0000\u0001 preserved.",
    );
    const documentPath = path.join(dataDir, "sources", user, sourceId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(documentPath, document);
    await source.query(
      "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,storage_path) VALUES($1,$2,'Research.pdf',$3,$4,$5)",
      [
        sourceId,
        user,
        createHash("sha256").update(document.toString("base64")).digest("hex"),
        JSON.stringify([{ label: "Page 1", text: "Customer research" }]),
        documentPath,
      ],
    );
    const wrapperDir = path.join(dir, "bin"),
      marker = path.join(dir, "dump-complete"),
      release = path.join(dir, "release-dump");
    await mkdir(wrapperDir);
    await writeFile(
      path.join(wrapperDir, "pg_dump"),
      '#!/bin/sh\n"$REAL_PG_DUMP" "$@" || exit $?\ntouch "$BACKUP_MARKER"\nwhile [ ! -f "$BACKUP_RELEASE" ]; do sleep 0.02; done\n',
      { mode: 0o700 },
    );
    const dumpBinary = spawnSync("which", ["pg_dump"], { encoding: "utf8" });
    assert.equal(dumpBinary.status, 0);
    const backup = spawn(process.execPath, ["scripts/backup.mjs", backupDir], {
      env: {
        ...process.env,
        DATABASE_URL: sourceUrl.toString(),
        DATA_DIR: dataDir,
        PATH: wrapperDir + path.delimiter + process.env.PATH,
        REAL_PG_DUMP: dumpBinary.stdout.trim(),
        BACKUP_MARKER: marker,
        BACKUP_RELEASE: release,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let backupError = "";
    backup.stderr.on("data", (value) => {
      backupError += value;
    });
    const backedUp = new Promise((resolve, reject) => {
      backup.on("error", reject);
      backup.on("exit", resolve);
    });
    let ready = false;
    for (let i = 0; i < 500; i++) {
      ready = await access(marker).then(
        () => true,
        () => false,
      );
      if (ready || backup.exitCode !== null) break;
      await delay(20);
    }
    if (!ready) {
      await writeFile(release, "release");
      assert.fail("Backup did not reach the snapshot marker: " + backupError);
    }
    const deleting = new pg.Client({ connectionString: sourceUrl.toString() });
    await deleting.connect();
    const {
      rows: [backend],
    } = await deleting.query("SELECT pg_backend_pid() AS id");
    let deleted = false,
      blocked = false;
    const deletion = deleting
      .query("DELETE FROM users WHERE id=$1", [user])
      .then(() => {
        deleted = true;
      });
    for (let i = 0; i < 100 && !deleted; i++) {
      blocked = (
        await source.query(
          "SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",
          [backend.id],
        )
      ).rows[0]?.blocked;
      if (blocked) break;
      await delay(20);
    }
    await writeFile(release, "release");
    const backupStatus = await backedUp;
    await deletion;
    await deleting.end();
    assert.equal(backupStatus, 0, backupError);
    assert.equal(
      blocked,
      true,
      "Deletion must wait until snapshot originals have been copied",
    );
    let run = spawnSync(process.execPath, ["scripts/restore.mjs", backupDir], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: restoreUrl.toString(),
        DATA_DIR: restoreDir,
      },
    });
    assert.equal(run.status, 0, run.stderr);
    await restored.connect();
    assert.equal(
      (
        await restored.query(
          "SELECT product_context FROM settings WHERE user_id=$1",
          [user],
        )
      ).rows[0].product_context,
      "A simple project tracker for small teams.",
    );
    const { rows } = await restored.query(
      "SELECT raw_text,sha256,storage_path FROM transcripts",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].raw_text, raw);
    assert.equal(rows[0].sha256, hash);
    assert.equal(await readFile(rows[0].storage_path, "utf8"), raw);
    assert.ok(rows[0].storage_path.startsWith(restoreDir));
    const {
      rows: [work],
    } = await restored.query(
      "SELECT * FROM discovery_validation_work WHERE user_id=$1",
      [user],
    );
    assert.equal(work.report_id, reportId);
    assert.equal(work.learning, "Retention remains uncertain");
    assert.equal(work.outcome, "inconclusive");
    const {
      rows: [restoredSource],
    } = await restored.query(
      "SELECT storage_path FROM discovery_sources WHERE id=$1",
      [sourceId],
    );
    assert.deepEqual(await readFile(restoredSource.storage_path), document);
    const again = spawnSync(
      process.execPath,
      ["scripts/restore.mjs", backupDir],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: restoreUrl.toString(),
          DATA_DIR: restoreDir,
        },
      },
    );
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /empty database/);
    assert.equal(
      (await restored.query("SELECT count(*)::int AS count FROM transcripts"))
        .rows[0].count,
      1,
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/restore.mjs", backupDir],
        {
          env: {
            ...process.env,
            DATABASE_URL: cloudUrl.toString(),
            BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_test-secret",
            VERCEL_BLOB_API_URL: "http://127.0.0.1:3104",
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let error = "";
      child.stderr.on("data", (value) => {
        error += value;
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(error)),
      );
    });
    await cloud.connect();
    const {
      rows: [original],
    } = await cloud.query("SELECT storage_path FROM transcripts");
    assert.match(original.storage_path, /^blob:http:/);
    const url = original.storage_path.slice(5);
    assert.equal((await fetch(url)).status, 403);
    const downloaded = await fetch(url, {
      headers: { Authorization: "Bearer vercel_blob_rw_e2estore_test-secret" },
    });
    assert.equal(await downloaded.text(), raw);
    const {
      rows: [cloudSource],
    } = await cloud.query(
      "SELECT storage_path FROM discovery_sources WHERE id=$1",
      [sourceId],
    );
    const originalDocument = await fetch(cloudSource.storage_path.slice(5), {
      headers: { Authorization: "Bearer vercel_blob_rw_e2estore_test-secret" },
    });
    assert.deepEqual(
      Buffer.from(await originalDocument.arrayBuffer()),
      document,
    );
    const {
      rows: [restoredJob],
    } = await cloud.query("SELECT state,workflow_run_id FROM jobs");
    assert.equal(restoredJob.state, "failed");
    assert.equal(restoredJob.workflow_run_id, null);
  } finally {
    blob.close();
    await cloud.end();
    await source.end();
    await restored.end();
    await admin.query(`DROP DATABASE "${sourceName}"`);
    await admin.query(`DROP DATABASE "${restoreName}"`);
    await admin.query(`DROP DATABASE "${cloudName}"`);
    await admin.end();
  }
});
