import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confluenceAddress,
  downloadConfluence,
  downloadGoogleDrive,
  downloadGranola,
  downloadOneDrive,
  listGranola,
  listOneDrive,
  previewConfluence,
} from "../lib/connected-source-providers";

const fromJson = (data: unknown) => Response.json(data);

test("OneDrive browses supported items and strips Graph credentials from file downloads", async (t) => {
  const headerAuth: (string | null)[] = [];
  const response = [
    fromJson({
      value: [
        { id: "a!1", name: "Interviews", folder: {} },
        { id: "abc", name: "Voice.wav", file: {} },
      ],
      "@odata.nextLink":
        "https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next",
    }),
    fromJson({
      id: "abcd",
      name: "Call.txt",
      file: {},
      webUrl: "https://org.sharepoint.com/file",
    }),
    new Response(null, {
      status: 302,
      headers: { location: "https://org.sharepoint.com/signed-download" },
    }),
    new Response("I need the report every week."),
    fromJson({ id: "abcd", name: "Call.txt", file: {} }),
    new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/signed-download" },
    }),
  ];
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      headerAuth.push(new Headers(init.headers).get("authorization"));
      return response.shift()!;
    },
  );
  assert.deepEqual(await listOneDrive("test"), {
    items: [{ id: "a!1", title: "Interviews", folder: true }],
    cursor: "next",
  });
  const file = await downloadOneDrive("test", "abcd");
  assert.equal(file.bytes.toString(), "I need the report every week.");
  assert.equal(file.url, "https://org.sharepoint.com/file");
  assert.deepEqual(headerAuth, [
    "Bearer test",
    "Bearer test",
    "Bearer test",
    null,
  ]);
  await assert.rejects(
    downloadOneDrive("test", "abcd"),
    /unexpected download address/,
  );
  assert.equal(fetchMock.mock.callCount(), 6);
});

test("Confluence reads only the authorized site's selected page and saves plain text as context", async (t) => {
  const link = "https://acme.atlassian.net/wiki/spaces/DISC/pages/123/Roadmap";
  assert.deepEqual(confluenceAddress(link), {
    site: "https://acme.atlassian.net",
    id: "123",
  });
  assert.throws(
    () =>
      confluenceAddress(
        "https://acme.atlassian.net.example.com/wiki/spaces/A/pages/123",
      ),
    /page link/,
  );
  const cloudId = "defe90be-6d04-4c95-8cec-837d90316603";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url === "https://api.atlassian.com/oauth/token/accessible-resources")
      return fromJson([{ id: cloudId, url: "https://acme.atlassian.net" }]);
    const pageUrl = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/123`;
    if (url === pageUrl) return fromJson({ title: "Roadmap" });
    assert.equal(url, pageUrl + "?body-format=atlas_doc_format");
    return fromJson({
      title: "Roadmap",
      body: {
        atlas_doc_format: {
          value: JSON.stringify({
            type: "doc",
            content: [
              {
                type: "heading",
                content: [{ type: "text", text: "Research" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "Audit log priority." }],
              },
            ],
          }),
        },
      },
    });
  });
  assert.deepEqual(await previewConfluence("test", link), {
    items: [{ id: link, title: "Roadmap" }],
  });
  const file = await downloadConfluence("test", link);
  assert.equal(file.role, "context");
  assert.equal(file.bytes.toString(), "Research\nAudit log priority.");
  await assert.rejects(
    downloadConfluence("test", link.replace("acme", "other")),
    /Authorize this Confluence site/,
  );
});

test("Google Docs are exported as text and oversized downloads are rejected", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    if (url.includes("fields="))
      return fromJson({
        name: "Interview",
        mimeType: "application/vnd.google-apps.document",
        webViewLink: "https://docs.google.com/document/d/Doc-42/edit",
      });
    if (urls.length === 2) return new Response("Please add CSV exports.");
    return new Response("large", { headers: { "content-length": "10485761" } });
  });
  const file = await downloadGoogleDrive("test", "Doc-42");
  assert.equal(file.name, "Interview.txt");
  assert.equal(file.bytes.toString(), "Please add CSV exports.");
  assert.match(urls[1], /\/export\?mimeType=text%2Fplain$/);
  await assert.rejects(downloadGoogleDrive("test", "Doc-42"), /size limit/);
});

test("Granola notes and transcripts use different read tools and evidence roles", async (t) => {
  const meeting = "1d2fcfd0-7d53-4799-9c10-bc715c8afceb";
  const completed: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(String(url), "https://mcp.granola.ai/mcp");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer test");
    if (init.method !== "POST") return new Response(null, { status: 405 });
    const req = JSON.parse(String(init.body));
    const respond = (result: object) =>
      fromJson({ jsonrpc: "2.0", id: req.id, result });
    if (req.method === "initialize")
      return respond({
        protocolVersion: req.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "Granola", version: "1" },
      });
    if (req.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    assert.equal(req.method, "tools/call");
    const { name, arguments: args } = req.params;
    completed.push(name);
    if (name === "list_meetings") {
      assert.equal(args.time_range, "last_30_days");
      return respond({
        content: [
          {
            type: "text",
            text: `<meetings_data count="1"><meeting id="${meeting}" title="Research &amp; Discovery" date="Today"><known_participants>Pat <pat@example.com></known_participants></meeting></meetings_data>`,
          },
        ],
      });
    }
    if (name === "get_meetings") {
      assert.deepEqual(args.meeting_ids, [meeting]);
      return respond({
        content: [
          {
            type: "text",
            text: `<meetings_data><meeting id="${meeting}"><known_participants>Pat <pat@example.com></known_participants><summary>AI summary text.</summary></meeting></meetings_data>`,
          },
        ],
      });
    }
    assert.equal(name, "get_meeting_transcript");
    assert.equal(args.meeting_id, meeting);
    if (completed.length > 3)
      return respond({
        isError: true,
        content: [
          {
            type: "text",
            text: "Transcripts are only available to paid Granola tiers.",
          },
        ],
      });
    return respond({
      content: [
        {
          type: "text",
          text: `<transcript meeting_id="${meeting}">[00:01] Pat: I need automatic exports.</transcript>`,
        },
      ],
    });
  });
  assert.deepEqual(await listGranola("test"), {
    items: [{ id: meeting, title: "Research & Discovery", date: "Today" }],
  });
  const note = await downloadGranola("test", meeting, "Interview", false);
  assert.equal(note.role, "context");
  assert.equal(note.bytes.toString(), "AI summary text.");
  const transcript = await downloadGranola("test", meeting, "Interview", true);
  assert.equal(transcript.role, "auto");
  assert.equal(
    transcript.bytes.toString(),
    "[00:01] Pat: I need automatic exports.",
  );
  await assert.rejects(
    downloadGranola("test", meeting, "Interview", true),
    /paid plan/,
  );
  assert.deepEqual(completed, [
    "list_meetings",
    "get_meetings",
    "get_meeting_transcript",
    "get_meeting_transcript",
  ]);
});
