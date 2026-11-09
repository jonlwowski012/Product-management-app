import {
  mkdtemp,
  readFile,
  mkdir,
  copyFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pdfFixture } from "../tests/fixtures/documents";

// Exercise only the dependencies Next actually ships, without node_modules fallbacks.
const root = await mkdtemp(path.join(tmpdir(), "evidence-pdf-package-"));
try {
  for (const route of ["[...path]", "uploads/complete"]) {
    const trace = `.next/server/app/api/${route}/route.js.nft.json`;
    const { files } = JSON.parse(await readFile(trace, "utf8"));
    for (const file of files as string[]) {
      const source = path.resolve(path.dirname(trace), file);
      const relative = path.relative(process.cwd(), source);
      if (
        !/^node_modules\/(pdf-parse\/|pdfjs-dist\/|@napi-rs\/canvas[^/]*\/)/.test(
          relative,
        )
      )
        continue;
      const destination = path.join(root, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    await writeFile(
      path.join(root, "fixture.pdf"),
      pdfFixture(["Synthetic customer feedback: We need audit history."]),
    );
    await writeFile(
      path.join(root, "check.mjs"),
      `import {readFile} from 'node:fs/promises';
const {PDFParse}=await import('./node_modules/pdf-parse/dist/pdf-parse/esm/index.js');
const parser=new PDFParse({data:new Uint8Array(await readFile(new URL('./fixture.pdf',import.meta.url))),isEvalSupported:false});
try {const result=await parser.getText();if(!result.text.includes('We need audit history.'))throw Error('Packaged PDF text missing');}finally {await parser.destroy();}`,
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "check.mjs")], {
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Packaged PDF parsing failed: ${route}`)),
      );
    });
    await rm(path.join(root, "node_modules"), { recursive: true });
  }
  console.log("PDF parsing passed with isolated deployment dependencies.");
} finally {
  await rm(root, { recursive: true, force: true });
}
