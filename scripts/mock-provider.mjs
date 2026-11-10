import { createServer } from "node:http";
export function mockProvider(port = 3101, onGeneration = async () => {}) {
  const calls = [];
  const attempts = new Map();
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/__requests") {
        res.end(JSON.stringify(calls));
        return;
      }
      const provider = req.url?.split("/")[1];
      const key =
        provider !== "anthropic"
          ? req.headers.authorization?.replace("Bearer ", "")
          : req.headers["x-api-key"];
      if (!key || String(key).includes("invalid")) {
        res.writeHead(401);
        res.end('{"error":"Invalid key"}');
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.endsWith("/models")) {
        const cursor = url.searchParams.get("after_id");
        calls.push({ provider, kind: "models", cursor });
        if (String(key).includes("catalog-slow"))
          await new Promise((r) => setTimeout(r, 600));
        if (String(key).includes("catalog-error")) {
          res.writeHead(503);
          res.end("{}");
          return;
        }
        if (String(key).includes("catalog-malformed")) {
          res.end('{"data":[{"wrong":"shape"}]}');
          return;
        }
        if (String(key).includes("catalog-empty")) {
          res.end('{"data":[],"has_more":false}');
          return;
        }
        if (String(key).includes("catalog-loop")) {
          res.end('{"data":[],"has_more":true,"last_id":"same-cursor"}');
          return;
        }
        if (String(key).includes("restricted")) {
          res.end(
            '{"data":[{"id":"restricted-account-model"}],"has_more":false}',
          );
          return;
        }
        if (provider === "gemini") {
          res.end(
            JSON.stringify({
              data: [
                "models/gemini-3.1-flash-lite",
                "gemini-2.5-flash",
                "gemini-2.5-flash-image",
                "gemini-embedding-001",
                "veo-3",
              ].map((id) => ({ id })),
            }),
          );
          return;
        }
        if (provider === "groq") {
          res.end(
            JSON.stringify({
              data: [
                "openai/gpt-oss-20b",
                "openai/gpt-oss-120b",
                "qwen/qwen3.8-27b",
                "whisper-large-v3",
              ].map((id) => ({ id })),
            }),
          );
          return;
        }
        res.end(
          JSON.stringify(
            provider !== "anthropic"
              ? {
                  data: [
                    "gpt-4.1-mini",
                    "gpt-4.1",
                    "gpt-5-mini",
                    "openai-account-model",
                  ].map((id) => ({ id })),
                }
              : cursor
                ? {
                    data: [
                      {
                        id: "claude-account-model",
                        display_name: "Account Claude",
                      },
                    ],
                    has_more: false,
                    last_id: "claude-account-model",
                  }
                : {
                    data: [
                      "claude-sonnet-4-5-20250929",
                      "claude-haiku-4-5-20251001",
                    ].map((id) => ({ id })),
                    has_more: true,
                    last_id: "claude-haiku-4-5-20251001",
                  },
          ),
        );
        return;
      }
      let raw = "";
      for await (const part of req) raw += part;
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      await onGeneration({ provider, key, model: body.model });
      const chat =
        ["groq", "gemini"].includes(provider) &&
        url.pathname.endsWith("/chat/completions");
      if (chat) {
        body.input = body.messages?.find((m) => m.role === "user")?.content;
        body.max_output_tokens = body.max_completion_tokens;
        body.reasoning = { effort: body.reasoning_effort };
        body.text = {
          format: {
            ...body.response_format?.json_schema,
            type: body.response_format?.type,
          },
        };
      }
      if (
        provider === "gemini" &&
        (!chat ||
          body.max_completion_tokens !== 10000 ||
          body.reasoning_effort !== "low" ||
          body.response_format?.json_schema?.strict !== true)
      ) {
        res.writeHead(400);
        res.end('{"error":{"code":"wrong_gemini_request"}}');
        return;
      }
      const schema =
        provider !== "anthropic"
          ? body.text?.format
          : body.output_config?.format;
      if (schema?.type !== "json_schema" || !schema.schema) {
        res.writeHead(400);
        res.end('{"error":"Missing structured schema"}');
        return;
      }
      calls.push({
        provider,
        model: body.model,
        kind: chat
          ? "chat-completions"
          : req.url?.endsWith("/responses")
            ? "responses"
            : "messages",
        at: Date.now(),
        max_output_tokens: body.max_output_tokens,
        reasoning: body.reasoning,
        strict: schema.strict,
        schemaHasBounds:
          /"(?:minLength|maxLength|minItems|maxItems|minimum|maximum)":/.test(
            JSON.stringify(schema.schema),
          ),
        schemaKind: schema.schema.properties?.findings
          ? "findings"
          : schema.schema.properties?.opportunities
            ? "report"
            : schema.schema.properties?.supporting_ids
              ? "evidence-selection"
              : "legacy",
        inputCharacters:
          typeof body.input === "string" ? body.input.length : undefined,
      });
      if (
        provider === "groq" &&
        (req.headers["x-api-key"] ||
          body.max_output_tokens !== 2048 ||
          (!chat && body.store !== false) ||
          schema.strict !== true)
      ) {
        res.writeHead(400);
        res.end('{"error":{"code":"wrong_groq_request"}}');
        return;
      }
      if (
        body.model === "mock-groq-schema-boundary" &&
        provider === "groq" &&
        !chat
      ) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            error: {
              code: "json_validate_failed",
              type: "invalid_request_error",
              message: "Generated findings exceed maxItems.",
              failed_generation: "Private source text must never be logged.",
            },
          }),
        );
        return;
      }
      if (body.model.startsWith("mock-groq-json-error")) {
        const count = attempts.get(key) || 0;
        attempts.set(key, count + 1);
        if (count === 0 || body.model.endsWith("always")) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: {
                code: "json_validate_failed",
                type: "invalid_request_error",
                message: "Private provider details: " + key,
                failed_generation: "Private source text must never be logged.",
              },
            }),
          );
          return;
        }
      }
      if (
        body.model.startsWith("mock-source-errors") &&
        schema.schema.properties?.findings
      ) {
        const input = JSON.parse(
          provider !== "anthropic" ? body.input : body.messages[0].content,
        );
        const failed = input.find((p) => p.filename.startsWith("Failed"));
        if (failed) {
          const retryKey = key + failed.source_id;
          const count = attempts.get(retryKey) || 0;
          attempts.set(retryKey, count + 1);
          if (count < 3 || body.model === "mock-source-errors-always") {
            res.writeHead(provider === "groq" ? 400 : 503);
            res.end(
              JSON.stringify({
                error: {
                  code: "json_validate_failed",
                  message: "Private provider details",
                  failed_generation:
                    "Private source text must never be logged.",
                },
              }),
            );
            return;
          }
        }
      }
      if (body.model === "mock-quota") {
        res.writeHead(429);
        res.end(
          '{"error":{"code":"credit_balance_exhausted","type":"insufficient_quota"}}',
        );
        return;
      }
      if (body.model === "mock-groq-throttle") {
        const count = attempts.get(key) || 0;
        attempts.set(key, count + 1);
        if (count === 0) {
          res.writeHead(429, { "retry-after": "3" });
          res.end('{"error":{"code":"rate_limit_exceeded"}}');
          return;
        }
      }
      if (body.model === "mock-checkpoint") {
        const count = attempts.get(key) || 0;
        attempts.set(key, count + 1);
        if (count === 1) {
          res.writeHead(429);
          res.end("{}");
          return;
        }
      }
      if (body.model === "mock-transient") {
        const count = attempts.get(key) || 0;
        attempts.set(key, count + 1);
        if (count === 0) {
          res.writeHead(429);
          res.end("{}");
          return;
        }
      }
      if (body.model === "mock-error") {
        res.writeHead(500);
        res.end("{}");
        return;
      }
      if (body.model === "mock-slow")
        await new Promise((r) => setTimeout(r, 2000));
      if (
        body.model === "mock-reduce-once" &&
        schema.schema.properties?.supporting_ids
      ) {
        const retryKey = key + "-reduction";
        const count = attempts.get(retryKey) || 0;
        attempts.set(retryKey, count + 1);
        if (count === 0) {
          res.writeHead(429, { "retry-after": "3" });
          res.end('{"error":{"code":"rate_limit_exceeded"}}');
          return;
        }
      }
      if (
        body.model === "mock-reduce-checkpoint" &&
        schema.schema.properties?.supporting_ids
      ) {
        const retryKey = key + "-checkpoint";
        const count = attempts.get(retryKey) || 0;
        attempts.set(retryKey, count + 1);
        if (count === 1) {
          res.writeHead(400);
          res.end('{"error":{"code":"invalid_parameter"}}');
          return;
        }
      }
      const isBrief = schema.schema.properties?.ask !== undefined;
      let data;
      if (
        schema.schema.properties?.supporting_ids &&
        !schema.schema.properties?.opportunities
      ) {
        const input = JSON.parse(
          provider !== "anthropic" ? body.input : body.messages[0].content,
        );
        const findings = input.findings;
        data = {
          supporting_ids: findings
            .filter((f) => f.origin === "customer" && f.stance === "supports")
            .slice(0, input.selection_limits?.supporting_ids ?? 3)
            .map((f) => f.id),
          opposing_ids: findings
            .filter((f) => f.origin === "customer" && f.stance === "opposes")
            .slice(0, input.selection_limits?.opposing_ids ?? 2)
            .map((f) => f.id),
          context_ids: findings
            .filter((f) => f.origin !== "customer" || f.stance === "context")
            .slice(0, input.selection_limits?.context_ids ?? 1)
            .map((f) => f.id),
          risk_ids: findings
            .filter((f) => f.stance === "risk")
            .slice(0, input.selection_limits?.risk_ids ?? 1)
            .map((f) => f.id),
        };
      } else if (schema.schema.properties?.findings) {
        const item = schema.schema.properties.findings.items;
        const grounded = item.properties?.passage_id?.enum;
        const passages = JSON.parse(
          provider !== "anthropic" ? body.input : body.messages[0].content,
        );
        const definitions = [
          [
            "We have to move workloads when nodes are removed for maintenance.",
            "risk",
            "customer",
          ],
          [
            "Snapshots cannot include the customer's network buffers.",
            "risk",
            "customer",
          ],
          ["We need audit logs before we can buy.", "supports", "customer"],
          ["I would pay for searchable audit history.", "supports", "customer"],
          [
            "We do not need detailed audit history for our three-person team.",
            "opposes",
            "customer",
          ],
          [
            "Our internal roadmap says audit logs are important.",
            "supports",
            "customer",
          ],
        ];
        data = {
          findings: passages
            .flatMap((p) =>
              definitions
                .filter((d) =>
                  grounded
                    ? p.quotes.some((q) => q.text.includes(d[0]))
                    : p.text.includes(d[0]),
                )
                .map((d) => ({
                  ...(grounded
                    ? {
                        passage_id:
                          body.model === "mock-bad-citation"
                            ? "invented"
                            : p.quotes.find((q) => q.text.includes(d[0]))
                                .passage_id,
                      }
                    : {
                        source_id: p.source_id,
                        page_index: p.page_index,
                        quote:
                          body.model === "mock-bad-citation"
                            ? "A fabricated quote that is not in the source."
                            : body.model === "mock-groq-verbatim"
                              ? "We need audit logs... before we buy."
                              : d[0],
                      }),
                  problem: "Explaining approval changes",
                  consequence: "Customer evaluation is delayed",
                  customer: "Customer in source",
                  origin: d[2],
                  stance: d[1],
                })),
            )
            .slice(0, 6),
        };
      } else if (schema.schema.properties?.opportunities) {
        const input = JSON.parse(
          provider !== "anthropic" ? body.input : body.messages[0].content,
        );
        const supporting = input.findings
          .filter((f) => f.origin === "customer" && f.stance === "supports")
          .map((f) => f.id);
        const opposing = input.findings
          .filter((f) => f.origin === "customer" && f.stance === "opposes")
          .map((f) => f.id);
        const context = input.findings
          .filter((f) => f.origin !== "customer")
          .map((f) => f.id);
        const risks = input.findings
          .filter((f) => f.stance === "risk")
          .map((f) => f.id);
        const wrongCategory =
          body.model === "mock-groq-citation-roles" &&
          !schema.schema.properties.opportunities.items.properties
            .supporting_ids.items.enum;
        data = {
          summary: supporting.length
            ? "Customer material suggests exploring auditability while testing the opposing view."
            : "Company context alone cannot establish customer demand. Add customer conversations.",
          opportunities:
            supporting.length || body.model === "mock-context-leak"
              ? [
                  {
                    title: "Make approval changes easier to explain",
                    problem:
                      "Teams need to understand changes before adopting the product.",
                    audience: "Customers evaluating auditability",
                    importance:
                      "The uploaded sources describe an adoption obstacle.",
                    rationale:
                      "Customer passages support investigating the problem; the sample remains limited.",
                    supporting_ids:
                      body.model === "mock-context-leak" || wrongCategory
                        ? context
                        : supporting,
                    opposing_ids: opposing,
                    context_ids: context,
                    risk_ids: risks,
                    evidence_reasons: [
                      ...opposing.map((id) => ({
                        finding_id: id,
                        reason:
                          "This customer explicitly says detailed audit history is unnecessary for their team, challenging this opportunity for that audience.",
                      })),
                      ...risks.map((id) => ({
                        finding_id: id,
                        reason:
                          "This operational constraint affects delivery and recovery; it does not contradict the need for the opportunity.",
                      })),
                    ],
                    uncertainty:
                      "Frequency and required retention are unknown.",
                    next_step:
                      "Interview three customer owners about their most recent audit review.",
                    questions: [
                      "Walk me through your most recent audit review.",
                      "What records did you gather?",
                    ],
                  },
                ]
              : [],
          changes: input.previous
            ? [
                "New source material was added; review how it changes the opportunity.",
              ]
            : [],
        };
      } else if (isBrief) {
        const input = JSON.parse(
          provider !== "anthropic" ? body.input : body.messages[0].content,
        );
        data = {
          ask: "Decide whether to invest in audit history.",
          problem: "Customers need audit history to evaluate adoption.",
          audience: "Customers requesting auditability",
          capability: "Searchable audit history",
          impact: "Support customer evaluation",
          options: [
            {
              name: "Do nothing",
              effort: 1,
              time: "No build",
              risk: "The need remains unresolved",
            },
            {
              name: "Maintain current approach",
              effort: 1,
              time: "Ongoing",
              risk: "Manual process remains",
            },
            {
              name: "Build audit history",
              effort: 2,
              time: "Estimate pending technical review",
              risk: "Scope and retention requirements need validation",
            },
          ],
          unknowns: ["What retention period do customers require?"],
          evidence_ids: input.evidence.map((e) => e.id),
        };
      } else {
        const input =
          provider !== "anthropic" ? body.input : body.messages[0].content;
        const definitions = [
          [
            "Audit logs are a deal blocker",
            "We need audit logs before we can buy.",
            "gap",
            "for",
            1,
            ["buy"],
            5,
          ],
          [
            "Searchable audit history",
            "I would pay for searchable audit history.",
            "gap",
            "for",
            2,
            ["pay"],
            5,
          ],
          [
            "Onboarding wins customers",
            "Your onboarding is the reason we chose you.",
            "strength",
            "for",
            2,
            [],
            null,
          ],
          [
            "Automated exports are unwanted",
            "I do not want automated exports.",
            "gap",
            "against",
            3,
            [],
            2,
          ],
          [
            "Prompted agreement",
            "We agree with that suggestion.",
            "gap",
            "for",
            4,
            [],
            2,
          ],
          [
            "Internal platform suggestion",
            "We should rebuild the platform.",
            "gap",
            "neutral",
            5,
            [],
            null,
          ],
        ];
        const signals = definitions
          .filter((d) => input.includes(d[1]))
          .map((d) => ({
            title: d[0],
            suggested_feature:
              d[2] === "gap" && d[4] <= 3 ? "Audit history" : "",
            quote: d[1],
            kind: d[2],
            sentiment: d[3],
            tier: d[4],
            commitments: d[5],
            awareness: d[6],
            business_purpose: d[6] ? "Revenue driver" : "",
            constraints: d[6] ? "Retention requirements need discovery" : "",
            buying_authority: "",
          }));
        signals.push({
          title: "Altered quote rejected",
          suggested_feature: "",
          quote: "The customer definitely needs blockchain.",
          kind: "gap",
          sentiment: "for",
          tier: 1,
          commitments: [],
          awareness: null,
          business_purpose: "",
          constraints: "",
          buying_authority: "",
        });
        data = { signals };
      }
      let text =
        body.model === "mock-malformed" ? "not JSON" : JSON.stringify(data);
      if (chat)
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason:
                  body.model === "mock-incomplete" ? "length" : "stop",
                message: {
                  content: body.model === "mock-refusal" ? null : text,
                  refusal: body.model === "mock-refusal" ? "Declined" : null,
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
            },
          }),
        );
      else if (provider !== "anthropic")
        res.end(
          JSON.stringify({
            status:
              body.model === "mock-incomplete" ? "incomplete" : "completed",
            output: [
              {
                content:
                  body.model === "mock-refusal"
                    ? [{ type: "refusal", refusal: "Declined" }]
                    : [{ type: "output_text", text }],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 200 },
          }),
        );
      else
        res.end(
          JSON.stringify({
            stop_reason:
              body.model === "mock-incomplete"
                ? "max_tokens"
                : body.model === "mock-refusal"
                  ? "refusal"
                  : "end_turn",
            content: [{ type: "text", text }],
            usage: { input_tokens: 100, output_tokens: 200 },
          }),
        );
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
