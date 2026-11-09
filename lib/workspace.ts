import { rollup } from "./metrics";
type Row = Record<string, any>;
export function hydrateWorkspace(data: Record<string, any>) {
  const {
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
  } = data as Record<string, Row[]>;
  function targetMetrics(type: string, target: string, signalIds: string[]) {
    const overrides = Object.fromEntries(
      stances
        .filter((s) => s.target_type === type && s.target_id === target)
        .map((s) => [s.customer_id, s.stance]),
    );
    return rollup(
      signals.filter((s) => signalIds.includes(s.id)) as Parameters<
        typeof rollup
      >[0],
      overrides,
    );
  }
  const enrichedFeatures: Row[] = features.map((f) => {
    const ids = featureSignals
      .filter((l) => l.feature_id === f.id)
      .map((l) => l.signal_id);
    return {
      ...f,
      signal_ids: ids,
      metrics: targetMetrics("feature", f.id, ids),
    };
  });
  const enrichedBriefs: Row[] = briefs.map((b) => {
    const fids = briefFeatures
      .filter((l) => l.brief_id === b.id)
      .map((l) => l.feature_id);
    const ids = [
      ...new Set([
        ...briefSignals
          .filter((l) => l.brief_id === b.id)
          .map((l) => l.signal_id),
        ...featureSignals
          .filter((l) => fids.includes(l.feature_id))
          .map((l) => l.signal_id),
      ]),
    ];
    return {
      ...b,
      feature_ids: fids,
      direct_signal_ids: briefSignals
        .filter((l) => l.brief_id === b.id)
        .map((l) => l.signal_id),
      signal_ids: ids,
      metrics: targetMetrics("brief", b.id, ids),
    };
  });
  return {
    customers,
    products,
    transcripts,
    signals,
    features: enrichedFeatures,
    briefs: enrichedBriefs,
    assessments,
    questions,
    jobs,
    curation,
    stances,
    audit,
    settings: settings[0],
    user: data.user,
    uploadMode: data.uploadMode,
    metrics: rollup(signals as Parameters<typeof rollup>[0]),
  };
}
