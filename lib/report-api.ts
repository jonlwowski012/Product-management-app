import { hostedJobs } from "./job-runner";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { originalStream } from "./storage";
import type { NextRequest } from "next/server";
import { AppError, query, transaction, assertWritableUser } from "./db";
import {
  simpleMetadata,
  savedSources,
  discoverySource,
  createReport,
  reportDetail,
  retryOmittedMaterial,
} from "./reports";
import { opportunityId, validationWorkInput } from "./discovery-experience";
import { reportMarkdown } from "./opportunities";
import { discoveryFiles } from "./documents";

export async function reportApi(
  req: NextRequest,
  parts: string[],
  user: string,
  body: () => Promise<any>,
  bytes: () => Promise<Buffer>,
) {
  if (req.method !== "GET") await assertWritableUser(user);
  const route = parts.join("/");
  if (route === "flow" && req.method === "GET") return simpleMetadata(user);
  if (route === "sources" && req.method === "GET") {
    const input = z
      .object({
        q: z.string().max(200).default(""),
        offset: z.coerce.number().int().min(0).max(100000000).default(0),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return savedSources(user, input.q, input.offset);
  }
  if (route === "sources" && req.method === "POST") {
    const sources = [];
    const warnings: string[] = [];
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await new Response(new Uint8Array(await bytes()), {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      const files = form.getAll("files");
      if (!files.length || files.length > 30)
        throw new AppError("Select between 1 and 30 files.");
      let total = 0;
      const documents = [];
      for (const file of files) {
        if (!(file instanceof File)) throw new AppError("Invalid file");
        total += file.size;
        if (total > 10 * 1024 * 1024)
          throw new AppError("Combined uploads exceed 10 MB.");
        documents.push(
          ...discoveryFiles(
            file.name,
            Buffer.from(await file.arrayBuffer()),
            (warning) => warnings.push(warning),
          ),
        );
        if (documents.length > 30)
          throw new AppError(
            "Import at most 30 documents after expanding ZIPs.",
          );
        if (
          documents.reduce((n, d) => n + d.buffer.length, 0) >
          10 * 1024 * 1024
        )
          throw new AppError("Combined expanded uploads exceed 10 MB.");
      }
      for (const file of documents) {
        sources.push({
          ...(await discoverySource(user, file.name, file.buffer)),
          bytes: file.buffer.length,
        });
      }
    } else {
      const input = z
        .object({
          filename: z.string().min(1).max(200).default("Customer notes.txt"),
          content: z.string().min(5).max(500000),
        })
        .parse(await body());
      sources.push(
        await discoverySource(user, input.filename, Buffer.from(input.content)),
      );
    }
    return { sources, warnings };
  }
  if (parts[0] === "sources" && parts[1] && req.method === "GET") {
    const sid = z.uuid().parse(parts[1]);
    const [s] = await query(
      "SELECT id,filename,pages,warnings,storage_path FROM discovery_sources WHERE id=$1 AND user_id=$2",
      [sid, user],
    );
    if (!s) throw new AppError("Source not found", 404);
    if (parts[2] === "download") {
      const text = s.pages.map((p: { text: string }) => p.text).join("\n");
      const data =
        s.storage_path?.startsWith("blob:") ||
        s.storage_path?.startsWith("netlify:")
          ? await originalStream(s.storage_path, text)
          : s.storage_path
            ? new Blob([
                new Uint8Array(await readFile(s.storage_path)),
              ]).stream()
            : new Blob([text]).stream();
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(s.filename)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    const index = Number(req.nextUrl.searchParams.get("page") ?? 0);
    if (!Number.isSafeInteger(index) || index < 0 || index >= s.pages.length)
      throw new AppError("Source page not found", 404);
    return {
      id: s.id,
      filename: s.filename,
      warnings: s.warnings,
      page: s.pages[index],
      page_index: index,
      total: s.pages.length,
    };
  }
  if (route === "reports" && req.method === "POST")
    return createReport(user, await body());
  if (parts[0] === "reports" && parts[1]) {
    const rid = z.uuid().parse(parts[1]);
    const report = await reportDetail(user, rid);
    if (parts.length === 2 && req.method === "GET") return report;
    if (parts[2] === "retry-omitted" && req.method === "POST")
      return retryOmittedMaterial(user, rid);
    if (parts[2] === "validation" && parts[3] && req.method === "PATCH") {
      await assertWritableUser(user);
      const oid = z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .parse(parts[3]);
      const opportunity = report.result?.opportunities.find(
        (_: unknown, index: number) => opportunityId(rid, index) === oid,
      );
      if (!opportunity) throw new AppError("Opportunity not found", 404);
      const input = validationWorkInput.parse(await body());
      const outcome = input.status === "reviewed" ? input.outcome : null;
      const values = [
        user,
        rid,
        oid,
        input.status,
        input.activity,
        input.learning,
        outcome,
      ];
      const saved =
        input.version === 0
          ? await query(
              "INSERT INTO discovery_validation_work(user_id,report_id,opportunity_id,status,activity,learning,outcome,opportunity) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *",
              [...values, JSON.stringify(opportunity)],
            )
          : await query(
              "UPDATE discovery_validation_work SET status=$4,activity=$5,learning=$6,outcome=$7,version=version+1,updated_at=now() WHERE user_id=$1 AND report_id=$2 AND opportunity_id=$3 AND version=$8 RETURNING *",
              [...values, input.version],
            );
      if (!saved.length)
        throw new AppError(
          "This validation work changed. Refresh before saving.",
          409,
        );
      return saved[0];
    }
    if (parts[2] === "export" && req.method === "GET") {
      if (!report.result) throw new AppError("Your report is not ready yet.");
      return new Response(
        reportMarkdown(
          report.result,
          report.question,
          report.sources as { id: string; filename: string }[],
          report.validation_work,
        ),
        {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="discovery-opportunities.md"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (parts[2] === "retry" && req.method === "POST") {
      await assertWritableUser(user);
      if (report.job?.state !== "failed")
        throw new AppError("This analysis is not waiting for a retry.", 409);
      if (!report.job.can_retry)
        throw new AppError(
          "This analysis has reached its retry limit. Check your sources or provider settings before starting a new report.",
        );
      if (report.result)
        throw new AppError(
          "Use Retry omitted material to preserve this saved report.",
          409,
        );
      await transaction(async (c) => {
        const { rows } = await c.query(
          "UPDATE jobs SET state='queued',attempts=CASE WHEN attempts>=3 THEN 1 ELSE attempts+1 END,error=NULL,workflow_run_id=NULL,dispatch_after=now(),dispatch_token=NULL,finished_at=NULL,available_at=now() WHERE id=$1 AND user_id=$2 AND state='failed' AND (attempts<3 OR error=$3) RETURNING id",
          [
            report.job.id,
            user,
            report.job.attempts >= 3 ? report.job.error : null,
          ],
        );
        if (!rows.length)
          throw new AppError("This analysis is already retrying.", 409);
        await c.query(
          "DELETE FROM job_reductions WHERE job_id=$1 AND EXISTS(SELECT 1 FROM job_chunks WHERE job_id=$1 AND warning IS NOT NULL)",
          [report.job.id],
        );
        await c.query(
          "UPDATE job_chunks SET completed=false,attempts=0,warning=NULL,candidates=NULL,usage=NULL WHERE job_id=$1 AND warning IS NOT NULL",
          [report.job.id],
        );
      });
      if (hostedJobs()) {
        const { dispatchJob } = await import("./dispatch");
        await dispatchJob(report.job.id).catch(() => {});
      }
      return { ok: true };
    }
    if (parts[2] === "edit" && req.method === "PATCH") {
      await assertWritableUser(user);
      const input = z
        .object({
          version: z.number().int(),
          index: z.number().int().min(0).max(2),
          title: z.string().trim().min(1).max(150),
          problem: z.string().max(1200),
          uncertainty: z.string().max(1000),
          next_step: z.string().max(1000),
        })
        .parse(await body());
      if (!report.result?.opportunities[input.index])
        throw new AppError("Opportunity not found", 404);
      report.result.opportunities[input.index] = {
        ...report.result.opportunities[input.index],
        title: input.title,
        problem: input.problem,
        uncertainty: input.uncertainty,
        next_step: input.next_step,
      };
      const updated = await query(
        "UPDATE discovery_reports SET result=$1,version=version+1 WHERE id=$2 AND user_id=$3 AND version=$4 RETURNING id",
        [JSON.stringify(report.result), rid, user, input.version],
      );
      if (!updated.length)
        throw new AppError("This report changed. Refresh before saving.", 409);
      return { ok: true };
    }
  }
  throw new AppError("Page not found", 404);
}
