export type SourceSelection = { id: string; role: string };
export function uniqueSourceSelections(sources: SourceSelection[]) {
  const selected = new Map<string, SourceSelection>();
  const priority: Record<string, number> = { auto: 0, customer: 1, context: 2 };
  for (const source of sources) {
    const previous = selected.get(source.id);
    if (!previous || priority[source.role] > priority[previous.role])
      selected.set(source.id, source);
  }
  return [...selected.values()];
}
const fingerprints = new WeakMap<File, Promise<string>>();
export function discoveryFileFingerprint(file: File) {
  let pending = fingerprints.get(file);
  if (!pending) {
    pending = (async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const chunks: string[] = [];
      for (let start = 0; start < bytes.length; start += 32768)
        chunks.push(
          String.fromCharCode(...bytes.subarray(start, start + 32768)),
        );
      // Match the server's existing SHA-256 of base64 bytes; filenames are excluded.
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(btoa(chunks.join(""))),
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    })();
    fingerprints.set(file, pending);
  }
  return pending;
}
