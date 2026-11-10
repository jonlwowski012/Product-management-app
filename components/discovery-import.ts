"use client";
import { upload } from "@vercel/blob/client";
import { request } from "./ui";
import { uniqueSourceSelections } from "@/lib/source-deduplication";
export type ImportedSource = { id: string; role: string };
export type ImportProgress = {
  total: number;
  completed: number;
  saved: number;
  duplicates: number;
  failed: number;
  uploadedBytes: number;
  totalBytes: number;
  fraction: number;
  active: string[];
};
export async function importDiscoveryFiles(
  files: File[],
  roles: Record<string, string>,
  blob: boolean,
  signal: AbortSignal,
  onProgress: (progress: ImportProgress) => void,
  onSaved: (sources: ImportedSource[]) => void,
  warn: (message: string) => void,
) {
  const seen = new Set<string>();
  const sources: ImportedSource[] = [],
    successful = new Set<number>();
  const loaded = files.map(() => 0),
    finished = files.map(() => false);
  const active = new Map<number, string>();
  const totalBytes = files.reduce((n, file) => n + file.size, 0);
  let cursor = 0,
    completed = 0,
    saved = 0,
    duplicates = 0,
    failed = 0;
  function progress() {
    onProgress({
      total: files.length,
      completed,
      saved,
      duplicates,
      failed,
      totalBytes,
      uploadedBytes: loaded.reduce((n, size) => n + size, 0),
      fraction:
        files.reduce(
          (n, file, i) => n + (finished[i] ? 1 : (0.9 * loaded[i]) / file.size),
          0,
        ) / files.length,
      active: [...active.values()],
    });
  }
  progress();
  async function worker() {
    while (!signal.aborted) {
      const index = cursor++;
      if (index >= files.length) return;
      const file = files[index];
      active.set(index, file.name);
      progress();
      try {
        let result;
        if (blob) {
          const {
            reservations: [r],
          } = await request("uploads/reserve", {
            discovery: true,
            files: [{ name: file.name, size: file.size }],
          });
          signal.throwIfAborted();
          if (r.uploadToken)
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              const abort = () => xhr.abort();
              const finish = (error?: Error) => {
                signal.removeEventListener("abort", abort);
                error ? reject(error) : resolve();
              };
              xhr.open("PUT", "/api/uploads/direct");
              xhr.timeout = 120000;
              xhr.setRequestHeader("Authorization", "Bearer " + r.uploadToken);
              xhr.upload.onprogress = (event) => {
                loaded[index] = Math.min(file.size, event.loaded);
                progress();
              };
              xhr.onload = () =>
                finish(
                  xhr.status >= 200 && xhr.status < 300
                    ? undefined
                    : new Error("Upload failed; select the file again"),
                );
              xhr.onerror = () =>
                finish(new Error("Upload connection interrupted"));
              xhr.ontimeout = () =>
                finish(new Error("Upload timed out; select the file again"));
              xhr.onabort = () =>
                finish(new DOMException("Upload cancelled", "AbortError"));
              signal.addEventListener("abort", abort, { once: true });
              if (signal.aborted) {
                finish(new DOMException("Upload cancelled", "AbortError"));
                return;
              }
              xhr.send(file);
            });
          else
            await upload(r.pathname, file, {
              access: "private",
              handleUploadUrl: "/api/uploads/token",
              clientPayload: r.id,
              contentType: file.type || "application/octet-stream",
              abortSignal: signal,
              // Streaming fetch progress requires HTTP/2; the local Blob double uses HTTP/1.
              ...(process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL?.startsWith(
                "http:",
              )
                ? {}
                : {
                    onUploadProgress: ({
                      loaded: bytes,
                    }: {
                      loaded: number;
                    }) => {
                      loaded[index] = Math.min(file.size, bytes);
                      progress();
                    },
                  }),
            });
          loaded[index] = file.size;
          progress();
          for (let attempt = 0; attempt < 30; attempt++) {
            signal.throwIfAborted();
            try {
              result = await request("uploads/complete", { id: r.id });
              break;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !error.message.includes("being processed")
              )
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          if (!result)
            throw new Error(
              "Still processing; check saved sources before retrying.",
            );
        } else {
          const form = new FormData();
          form.append("files", file);
          result = await request("sources", form);
          loaded[index] = file.size;
        }
        for (const warning of result.warnings ?? []) warn(warning);
        const imported = result.sources.map((s: { id: string }) => ({
          id: s.id,
          role: roles[String(index)] ?? "auto",
        }));
        sources.push(...imported);
        onSaved(imported);
        successful.add(index);
        let fresh = false;
        for (const source of result.sources) {
          if (source.duplicate || seen.has(source.id)) duplicates++;
          else fresh = true;
          seen.add(source.id);
        }
        if (fresh) saved++;
      } catch (error) {
        if (!signal.aborted) {
          failed++;
          warn(
            `Skipped ${file.name}: ${error instanceof Error ? error.message : "import failed"}`,
          );
        }
      } finally {
        if (!signal.aborted || successful.has(index)) {
          finished[index] = true;
          completed++;
        }
        active.delete(index);
        progress();
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, files.length) }, () => worker()),
  );
  return {
    sources: uniqueSourceSelections(sources),
    successful,
    cancelled: signal.aborted,
  };
}
