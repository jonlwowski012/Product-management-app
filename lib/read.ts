import { query } from "./db";
import { hydrateWorkspace } from "./workspace";
export async function bootstrap(user: string) {
  const [
    customers,
    products,
    transcripts,
    signals,
    features,
    featureSignals,
    briefs,
    briefFeatures,
    briefSignals,
    assessments,
    questions,
    jobs,
    stances,
    curation,
    audit,
    settings,
  ] = await Promise.all([
    query("SELECT * FROM customers WHERE user_id=$1 ORDER BY name", [user]),
    query("SELECT * FROM products WHERE user_id=$1 ORDER BY name", [user]),
    query(
      "SELECT id,customer_id,title,filename,sha256,created_at FROM transcripts WHERE user_id=$1 ORDER BY created_at DESC",
      [user],
    ),
    query("SELECT * FROM signals WHERE user_id=$1 ORDER BY created_at DESC", [
      user,
    ]),
    query("SELECT * FROM features WHERE user_id=$1 ORDER BY created_at DESC", [
      user,
    ]),
    query("SELECT * FROM feature_signals WHERE user_id=$1", [user]),
    query("SELECT * FROM briefs WHERE user_id=$1 ORDER BY created_at DESC", [
      user,
    ]),
    query("SELECT * FROM brief_features WHERE user_id=$1", [user]),
    query("SELECT * FROM brief_signals WHERE user_id=$1", [user]),
    query(
      "SELECT * FROM assessments WHERE user_id=$1 ORDER BY created_at DESC",
      [user],
    ),
    query("SELECT * FROM questions WHERE user_id=$1 ORDER BY created_at", [
      user,
    ]),
    query(
      "SELECT id,transcript_id,brief_id,report_id,purpose,provider,model,prompt_version,source_hash,state,attempts,error,usage,created_at,finished_at FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [user],
    ),
    query("SELECT * FROM stances WHERE user_id=$1", [user]),
    query("SELECT * FROM curation WHERE user_id=$1", [user]),
    query(
      "SELECT * FROM audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80",
      [user],
    ),
    query(
      "SELECT provider,model,validation_threshold,product_context,openai_key IS NOT NULL AS has_openai_key,anthropic_key IS NOT NULL AS has_anthropic_key,groq_key IS NOT NULL AS has_groq_key,gemini_key IS NOT NULL AS has_gemini_key FROM settings WHERE user_id=$1",
      [user],
    ),
  ]);
  return hydrateWorkspace({
    customers,
    products,
    transcripts,
    signals,
    features,
    briefs,
    assessments,
    questions,
    jobs,
    curation,
    stances,
    audit,
    settings,
    featureSignals,
    briefFeatures,
    briefSignals,
  });
}
