import { Suspense } from "react";
import { redirect } from "next/navigation";
import DiscoveryApp from "@/components/discovery-app";
import { LaunchInfo } from "@/components/launch-info";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  if (
    path?.length === 1 &&
    ["pricing", "privacy", "terms", "help"].includes(path[0])
  )
    return <LaunchInfo page={path[0]} />;
  const route = path?.[0] === "demo" ? path.slice(1) : (path ?? []);
  if (
    route.length &&
    !["reports", "settings", "customers", "signals"].includes(route[0])
  )
    redirect(path?.[0] === "demo" ? "/demo" : "/");
  return (
    <Suspense fallback={<div className="loading">Opening your workspace…</div>}>
      <DiscoveryApp key={path?.[0] === "demo" ? "demo" : "personal"} />
    </Suspense>
  );
}
