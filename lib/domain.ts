import { createHash } from "node:crypto";
export type Segment = {
  start: number;
  end: number;
  timestamp: string | null;
  speaker: string;
  text: string;
};
export function parseTranscript(raw: string): Segment[] {
  const lines = [...raw.matchAll(/[^\r\n]+(?:\r?\n|$)/g)];
  const out: Segment[] = [];
  let time: string | null = null;
  for (const line of lines) {
    const text = line[0].trim();
    const start = line.index!;
    if (!text || text === "WEBVTT" || /^\d+$/.test(text)) continue;
    const cue = text.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->/);
    if (cue) {
      time = cue[1].replace(",", ".");
      continue;
    }
    const inline = text.match(
      /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\]?\s*[-–]?\s*(.*)$/,
    );
    if (inline) time = inline[1].replace(",", ".");
    const content = inline ? inline[2] : text;
    const voice = content.match(/^<v\s+([^>]+)>(.*?)(?:<\/v>)?$/);
    const speaker =
      voice?.[1] ??
      content.match(/^([^:]{1,60}):\s*/)?.[1] ??
      "Unknown speaker";
    out.push({
      start,
      end: start + line[0].length,
      timestamp: time,
      speaker,
      text: content,
    });
  }
  return out;
}
export function verifyQuote(
  raw: string,
  quote: string,
  segments: Segment[],
  preferredStart?: number,
) {
  const occurrences: number[] = [];
  if (quote.length >= 5) {
    let at = raw.indexOf(quote);
    while (at >= 0) {
      occurrences.push(at);
      at = raw.indexOf(quote, at + 1);
    }
  }
  let at =
    preferredStart !== undefined && occurrences.includes(preferredStart)
      ? preferredStart
      : occurrences.length === 1
        ? occurrences[0]
        : -1;
  const segment = segments.find((s) => at >= s.start && at < s.end);
  const valid = at >= 0 && !!segment?.timestamp;
  return {
    verified: valid,
    start: at >= 0 ? at : null,
    end: at >= 0 ? at + quote.length : null,
    timestamp: segment?.timestamp ?? null,
    speaker: segment?.speaker ?? null,
    reason: !occurrences.length
      ? "Quote does not exactly match the original source"
      : at < 0
        ? "Quote occurs more than once; select the source location"
        : !segment?.timestamp
          ? "Source has no timestamp"
          : "Exact quote verified",
  };
}
export const fingerprint = (quote: string, kind: string) =>
  createHash("sha256")
    .update(kind + "\0" + quote)
    .digest("hex");
export { rollup, optionsValid } from "./metrics";
export type { Evidence } from "./metrics";
