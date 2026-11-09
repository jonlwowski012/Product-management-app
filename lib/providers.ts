export const providerIds = ["openai", "anthropic", "groq", "gemini"] as const;
export const groqDefaultModel = "openai/gpt-oss-20b";
export const geminiDefaultModel = "gemini-3.1-flash-lite";
// Groq's model catalog does not expose structured-output capabilities.
export const groqStructuredModels = new Set([
  groqDefaultModel,
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "meta-models/muse-spark-open",
]);
export function providerName(provider: string): string {
  return (
    (
      {
        openai: "OpenAI",
        anthropic: "Anthropic",
        groq: "Groq",
        gemini: "Google Gemini",
      } as Record<string, string>
    )[provider] ?? provider
  );
}
