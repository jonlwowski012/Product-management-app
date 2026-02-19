export function computePriorityScore(phases: Record<number, Record<string, unknown>>): number | null {
  const p1 = phases[1];
  const p2 = phases[2];
  const p4 = phases[4];
  const p8 = phases[8];

  if (!p1 || !p2 || !p4 || !p8) return null;

  const pressureMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const metrics = p1.business_metrics_impacted as string[] | undefined;
  const businessImpact = (pressureMap[p1.deadline_pressure as string] || 1) + (metrics?.length || 0);

  const rewardScore = (p2.reward_score as number) || 1;
  const riskScore = (p2.risk_score as number) || 1;
  const riskRewardRatio = riskScore > 0 ? rewardScore / riskScore : rewardScore;

  const dataReadiness = ((p4.data_readiness_score as number) || 1) / 10;

  const effort = Math.max(((p8.estimated_dev_weeks as number) || 1) * ((p8.team_size_needed as number) || 1), 1);
  const normalizedEffort = effort / 10;

  const successFactor = Math.max(1 - ((p8.likelihood_of_success as number) || 5) / 10, 0.1);

  const score = (businessImpact * riskRewardRatio * dataReadiness) / (normalizedEffort * successFactor);

  return Math.round(score * 100) / 100;
}
