import * as actions from "../job-steps";
export async function prepare(jid: string, attempt: string) {
  "use step";
  return actions.prepare(jid, attempt);
}
export async function extract(
  jid: string,
  index: number,
  count: number,
  attempt: string,
) {
  "use step";
  return actions.extract(jid, index, count, attempt);
}
export async function publish(jid: string, attempt: string) {
  "use step";
  return actions.publish(jid, attempt);
}
export async function failed(jid: string, attempt: string) {
  "use step";
  return actions.failed(jid, attempt);
}
export async function planReduction(
  jid: string,
  level: number,
  attempt: string,
) {
  "use step";
  return actions.planReduction(jid, level, attempt);
}
export async function reduce(
  jid: string,
  level: number,
  index: number,
  count: number,
  attempt: string,
) {
  "use step";
  return actions.reduce(jid, level, index, count, attempt);
}
prepare.maxRetries =
  extract.maxRetries =
  publish.maxRetries =
  planReduction.maxRetries =
  reduce.maxRetries =
    2;
