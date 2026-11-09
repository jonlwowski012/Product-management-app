export type Evidence = {
  id: string;
  customer_id: string;
  verified: boolean;
  review: string;
  stage: string;
  kind: string;
  sentiment: string;
  tier: number;
  commitments: string[];
};
export function rollup(
  signals: Evidence[],
  overrides: Record<string, string> = {},
) {
  const unique = [...new Map(signals.map((s) => [s.id, s])).values()];
  const valid = unique.filter(
    (s) => s.verified && s.review === "approved" && s.stage === "signal",
  );
  const accounts = [
    ...new Set(valid.filter((s) => s.kind === "gap").map((s) => s.customer_id)),
  ];
  const forIds: string[] = [],
    againstIds: string[] = [],
    mixedIds: string[] = [],
    neutralIds: string[] = [],
    payIds: string[] = [];
  for (const account of accounts) {
    const ss = valid.filter(
      (s) => s.customer_id === account && s.kind === "gap",
    );
    const pos = ss.some((s) => s.sentiment === "for" && s.tier <= 3);
    const neg = ss.some((s) => s.sentiment === "against");
    const stance =
      overrides[account] ??
      (pos && neg ? "mixed" : pos ? "for" : neg ? "against" : "neutral");
    if (stance === "for" && pos) {
      forIds.push(account);
      if (
        ss.some(
          (s) =>
            s.sentiment === "for" &&
            s.tier <= 3 &&
            s.commitments.includes("pay"),
        )
      )
        payIds.push(account);
    } else if (stance === "against") againstIds.push(account);
    else if (stance === "mixed") mixedIds.push(account);
    else neutralIds.push(account);
  }
  return {
    for: forIds.length,
    against: againstIds.length,
    mixed: mixedIds.length,
    neutral: neutralIds.length,
    wouldPay: payIds.length,
    verified: valid.length,
    forIds,
    againstIds,
    mixedIds,
    neutralIds,
    payIds,
  };
}
export function optionsValid(options: { name: string }[]) {
  return (
    options.length >= 2 &&
    options.length <= 4 &&
    options.some((o) => o.name.trim().toLowerCase() === "do nothing") &&
    options.some(
      (o) => o.name.trim().toLowerCase() === "maintain current approach",
    )
  );
}
