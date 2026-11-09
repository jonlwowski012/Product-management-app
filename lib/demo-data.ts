export const demoProducts = [
  "Platform trust",
  "Workflow automation",
  "Operational insights",
];
export const demoCustomers = [
  [
    "Alder Manufacturing",
    "Enterprise",
    "Mara Chen, Head of Operations",
    "Security approval is the final step in a multi-site rollout.",
  ],
  [
    "Briar Health Services",
    "Enterprise",
    "Leah Patel, Compliance Director",
    "Evaluating auditability and data residency before a pilot.",
  ],
  [
    "Cobalt Field Services",
    "Mid-Market",
    "Drew Santos, Operations Lead",
    "Scaling from one regional team to five.",
  ],
  [
    "Dovetail Studio",
    "SMB",
    "Ren Ellis, Founder",
    "A small team that values simplicity over governance overhead.",
  ],
  [
    "Elm Distribution",
    "Mid-Market",
    "Sofia Okafor, Analytics Manager",
    "Preparing reporting for weekly operating reviews.",
  ],
  [
    "Fern Advisory",
    "SMB",
    "Jules Rivera, Practice Manager",
    "Needs clear ownership across client workspaces.",
  ],
  [
    "Grove Utilities",
    "Enterprise",
    "Alex Morgan, Risk Manager",
    "Regional residency and access policies drive procurement.",
  ],
  [
    "Hearth Community Services",
    "Mid-Market",
    "Sam Taylor, Program Director",
    "Exploring a shared view of programs and delivery risks.",
  ],
];
export const demoFeatures = [
  {
    title: "Searchable audit history",
    product: 0,
    description:
      "Help operations and compliance teams explain who changed a workflow, when, and why. Scope: searchable history and a review-ready export, without expanding into a compliance suite.",
  },
  {
    title: "Workspace access controls",
    product: 0,
    description:
      "Separate workspace administration, approval, and contributor responsibilities. Discovery supports the problem; role definitions and a technical route still need review.",
  },
  {
    title: "Scheduled report exports",
    product: 1,
    description:
      "Deliver a chosen report on a schedule without creating unwanted email or exposing sensitive information. Preferences conflict within one customer account.",
  },
  {
    title: "Portfolio overview",
    product: 2,
    description:
      "Give program leaders a shared view of ownership, progress, and delivery risks across active workspaces.",
  },
  {
    title: "Guided onboarding",
    product: 1,
    description:
      "Preserve the clear setup checklist and approachable onboarding that customers already praise.",
  },
  {
    title: "Regional data residency",
    product: 0,
    description:
      "Understand regional storage requirements, legal review, and the exact scope customers need before committing to a delivery route.",
  },
  {
    title: "Targeted team alerts",
    product: 1,
    description:
      "Notify the right owner when a task needs attention while avoiding noisy channels and duplicate notifications.",
  },
  {
    title: "Predictive staffing forecasts",
    product: 2,
    description:
      "An early idea with prompted agreement and internal enthusiasm, but no approved T1–T3 demand. Keep researching before investment.",
  },
];
type Statement = {
  feature: number;
  title: string;
  quote: string;
  tier?: number;
  kind?: "strength";
  sentiment?: "against" | "neutral";
  commitments?: string[];
  review?: "pending" | "dismissed";
  internal?: boolean;
  humanEdited?: boolean;
  unverified?: boolean;
};
const s = (
  feature: number,
  title: string,
  quote: string,
  rest: Omit<Partial<Statement>, "feature" | "title" | "quote"> = {},
): Statement => ({ feature, title, quote, ...rest });
export const demoConversations: {
  customer: number;
  title: string;
  context: string;
  statements: Statement[];
}[] = [
  {
    customer: 0,
    title: "Alder · governance review",
    context:
      "The operations team is preparing a multi-site rollout and reviewing approval requirements.",
    statements: [
      s(
        0,
        "Searchable audit history for compliance review",
        "We would pay for searchable audit history because our compliance review cannot move forward without it.",
        { tier: 1, commitments: ["pay", "buy"], humanEdited: true },
      ),
      s(
        1,
        "Separate approvers from workspace administrators",
        "We need approval rights to be separate from workspace administration before the wider rollout.",
        { tier: 2 },
      ),
      s(
        2,
        "Finance wants a weekly report",
        "I would use a scheduled weekly export for our finance review.",
        { tier: 3 },
      ),
      s(
        4,
        "Setup checklist earns trust",
        "The setup checklist made our first workspace easy to launch.",
        { kind: "strength", tier: 2 },
      ),
    ],
  },
  {
    customer: 1,
    title: "Briar · security evaluation",
    context:
      "Compliance is assessing whether a pilot can proceed without adding manual evidence collection.",
    statements: [
      s(
        0,
        "Budget for review-ready history",
        "I would pay for an audit history that lets us answer exactly who changed an approval.",
        { tier: 2, commitments: ["pay"] },
      ),
      s(
        1,
        "Limit access to sensitive workflows",
        "We cannot start the pilot until we can restrict sensitive workflows to the right team.",
        { tier: 1, commitments: ["pilot"] },
      ),
      s(
        5,
        "Confirm storage boundaries",
        "Our legal team needs to know which region holds the workflow data before approving a pilot.",
        { tier: 1, commitments: ["pilot"] },
      ),
      s(
        4,
        "Clear setup reduces support needs",
        "The onboarding steps were clear enough that we did not need a training call.",
        { kind: "strength", tier: 2 },
      ),
    ],
  },
  {
    customer: 2,
    title: "Cobalt · regional expansion",
    context:
      "An operations lead is preparing a wider rollout across five regional teams.",
    statements: [
      s(
        0,
        "Purchase depends on change history",
        "We need change history before we can buy for all five regional teams.",
        { tier: 1, commitments: ["buy"] },
      ),
      s(
        1,
        "Regional ownership needs clear roles",
        "Yes, distinct approver and contributor roles would solve the ownership problem we described.",
        { tier: 3 },
      ),
      s(
        6,
        "Route urgent work to its owner",
        "I want an alert only when a task assigned to my region becomes blocked.",
        { tier: 2 },
      ),
      s(
        3,
        "See delivery risk across regions",
        "We need one view of delivery risks across all five regions.",
        { tier: 2 },
      ),
    ],
  },
  {
    customer: 3,
    title: "Dovetail · lightweight operations",
    context:
      "A small team explains which controls help and which would create overhead.",
    statements: [
      s(
        0,
        "Audit tooling is not a priority for a small team",
        "We do not need detailed audit history for our three-person team.",
        { sentiment: "against", tier: 2 },
      ),
      s(
        2,
        "Avoid automatic email reports",
        "Please do not send automatic report emails; we review the dashboard together.",
        { sentiment: "against", tier: 2 },
      ),
      s(
        4,
        "Onboarding works without a specialist",
        "I could set up our first process in an afternoon without an implementation specialist.",
        { kind: "strength", tier: 2 },
      ),
      s(
        7,
        "Forecast interest is only prompted agreement",
        "If you built a staffing forecast, I suppose we might look at it.",
        { tier: 4 },
      ),
    ],
  },
  {
    customer: 4,
    title: "Elm · weekly operating review",
    context:
      "An analytics manager explains current reporting work and evaluation questions.",
    statements: [
      s(
        2,
        "Replace manual weekly report preparation",
        "Every Monday I manually export the same report; a scheduled export would remove that repeated task.",
        { tier: 2 },
      ),
      s(
        3,
        "Compare ownership across workspaces",
        "I need to see which team owns each overdue action across our active workspaces.",
        { tier: 2 },
      ),
      s(
        5,
        "Residency question needs follow-up",
        "I need to check with procurement whether regional storage is a requirement for us.",
        { tier: 3, review: "pending" },
      ),
      s(
        7,
        "No established forecast problem",
        "We have not identified a staffing forecast problem that this product needs to solve.",
        { sentiment: "neutral", tier: 3 },
      ),
    ],
  },
  {
    customer: 5,
    title: "Fern · client workspace administration",
    context:
      "A practice manager separates current access needs from speculative feature ideas.",
    statements: [
      s(
        1,
        "Client teams need separate access",
        "We need client teams to see only their own workspace and approval queue.",
        { tier: 2 },
      ),
      s(
        6,
        "Alert channel needs discovery",
        "We might want notifications in our team channel, but I need to ask the delivery team.",
        { tier: 3, review: "pending" },
      ),
      s(
        7,
        "Internal forecast idea is not customer demand",
        "I think a predictive staffing dashboard would look impressive in the roadmap.",
        { tier: 5, internal: true, review: "dismissed" },
      ),
    ],
  },
  {
    customer: 6,
    title: "Grove · procurement requirements",
    context:
      "Risk management identifies a regional requirement and warns against excessive role complexity.",
    statements: [
      s(
        5,
        "Regional storage blocks procurement",
        "We cannot complete procurement unless our records remain in our approved region.",
        { tier: 1, commitments: ["buy"] },
      ),
      s(
        1,
        "Keep role setup manageable",
        "We do not want a complex role editor that requires a specialist to maintain.",
        { sentiment: "against", tier: 2 },
      ),
      s(
        2,
        "Export idea has not been validated",
        "Scheduled exports sound interesting, but we have not discussed who would use them.",
        { tier: 4 },
      ),
    ],
  },
  {
    customer: 7,
    title: "Hearth · program coordination",
    context:
      "A program director describes coordination work across community service teams.",
    statements: [
      s(
        4,
        "Clear onboarding supports adoption",
        "The guided setup helped our program coordinators get started without extra training.",
        { kind: "strength", tier: 2 },
      ),
      s(
        3,
        "Shared overview replaces status chasing",
        "We need a shared overview so I can stop asking every program lead for a separate update.",
        { tier: 2 },
      ),
      s(
        6,
        "Follow up on overdue approvals",
        "An alert to the owner of an overdue approval would help us catch delays earlier.",
        { tier: 2 },
      ),
    ],
  },
  {
    customer: 0,
    title: "Alder · reporting follow-up",
    context:
      "A second stakeholder raises concerns that conflict with the earlier export request.",
    statements: [
      s(
        2,
        "Unresolved export preferences inside Alder",
        "I do not want scheduled exports because those files would circulate outside our controlled workspace.",
        { sentiment: "against", tier: 2 },
      ),
      s(
        1,
        "Role granularity needs review",
        "We have not yet agreed which roles should be allowed to approve exceptions.",
        { tier: 3, sentiment: "neutral", review: "pending" },
      ),
      s(
        6,
        "Alerts need clear ownership",
        "We need to establish who owns an alert before choosing where it is delivered.",
        { tier: 3, sentiment: "neutral" },
      ),
    ],
  },
  {
    customer: 1,
    title: "Briar · audit scope follow-up",
    context:
      "The team clarifies its original request without creating an additional customer count.",
    statements: [
      s(
        0,
        "Searchable approval changes matter",
        "The same audit-history budget needs to cover searching approval changes, not just downloading a log.",
        { tier: 2, commitments: ["pay"] },
      ),
      s(
        5,
        "Verify the exact residency requirement",
        "Our legal reviewer still needs to confirm which records must stay in-region.",
        { tier: 3, review: "pending" },
      ),
      s(
        3,
        "Overview should expose approval risk",
        "We want the overview to show approvals that could delay a service launch.",
        { tier: 2 },
      ),
    ],
  },
  {
    customer: 2,
    title: "Cobalt · pilot planning",
    context:
      "A follow-up distinguishes open research questions from accepted scope.",
    statements: [
      s(
        0,
        "Audit retention period is still unknown",
        "We have not yet agreed how many months of audit history we need to retain.",
        { tier: 3, sentiment: "neutral", review: "pending" },
      ),
      s(
        6,
        "Do not notify every regional channel",
        "Please do not post every blocked task to all regional channels.",
        { tier: 2, sentiment: "against" },
      ),
      s(
        7,
        "Forecast proposal lacks a verified source",
        "A staffing forecast would replace our planning process.",
        { tier: 5, review: "dismissed", unverified: true },
      ),
    ],
  },
  {
    customer: 3,
    title: "Dovetail · adoption check-in",
    context:
      "The team reiterates what already works and gives tentative feedback on an early idea.",
    statements: [
      s(
        4,
        "Simple onboarding remains a strength",
        "The straightforward onboarding is still the part I recommend to other small teams.",
        { kind: "strength", tier: 2 },
      ),
      s(
        7,
        "Forecast follow-up has no commitment",
        "Perhaps a staffing forecast could be useful someday, but I cannot name a decision it would change.",
        { tier: 4, review: "pending" },
      ),
    ],
  },
];
export function demoTranscript(index: number) {
  const t = demoConversations[index];
  const contact = demoCustomers[t.customer][2];
  return (
    `Fictional sales demo · ${t.title}\n[00:00] Interviewer: ${t.context}\n` +
    t.statements
      .map((s, i) => {
        const spoken = s.unverified
          ? "We are still deciding which planning questions need more research."
          : s.quote;
        return `[${String(i + 1).padStart(2, "0")}:15] ${s.internal ? "Product manager (internal)" : contact}: ${spoken}`;
      })
      .join("\n")
  );
}
export const demoBriefs = [
  {
    title: "Invest in searchable audit history",
    feature: 0,
    status: "Approved",
    ask: "Approve a scoped audit-history initiative, subject to retention and access-policy review.",
    problem:
      "Compliance and operations teams cannot explain approval changes without assembling manual records.",
    audience:
      "Enterprise compliance leads and operations teams expanding across regions.",
    capability:
      "Search approval changes by actor, date, and workflow; export a review-ready history.",
    impact:
      "Remove an evidenced purchasing obstacle for three distinct customers. Two explicitly offered to pay; one small team does not need the capability.",
    unknowns: [
      "What audit retention period is required?",
      "Who may export approval history?",
      "Which workflow events must be captured first?",
    ],
  },
  {
    title: "Resolve scheduled export preferences",
    feature: 2,
    status: "In Review",
    ask: "Resolve the reporting and security needs before choosing whether to build scheduled exports.",
    problem:
      "Some teams manually prepare recurring reports, while others want to keep records inside the workspace.",
    audience:
      "Analytics managers, finance stakeholders, and workspace administrators.",
    capability:
      "Explore controlled recurring reporting with explicit delivery and access rules.",
    impact:
      "One customer has confirmed demand, one opposes exports, and Alder has an unresolved internal conflict.",
    unknowns: [
      "Can Alder agree on an acceptable delivery method?",
      "Could a shared dashboard replace file delivery?",
      "Who must approve report recipients?",
    ],
  },
  {
    title: "Define enterprise workspace roles",
    feature: 1,
    status: "Draft",
    ask: "Review the role model and technical route before promoting this candidate.",
    problem:
      "Growing teams need separate approval and administration responsibilities without an overly complex role editor.",
    audience: "Workspace administrators and compliance owners.",
    capability:
      "A small, understandable set of workspace roles with explicit approval rights.",
    impact:
      "Four distinct customers support the need; discovery still needs to settle role boundaries and setup complexity.",
    unknowns: [
      "Which roles cover the first supported workflows?",
      "How will permissions be reviewed over time?",
      "What is the simplest migration from existing access rules?",
    ],
  },
  {
    title: "Revisit predictive staffing after discovery",
    feature: 7,
    status: "Shelved",
    ask: "Keep the forecasting idea in discovery until customers identify a concrete planning decision.",
    problem:
      "Current evidence consists of prompted interest, an internal idea, and an unverified proposal.",
    audience: "Operations leaders responsible for staffing decisions.",
    capability:
      "No delivery commitment. Investigate the planning workflow first.",
    impact:
      "There are no approved T1–T3 positive customer signals supporting investment today.",
    unknowns: [
      "Which staffing decision would a forecast change?",
      "How do teams currently plan staffing?",
      "What evidence would justify revisiting this idea?",
    ],
  },
];
export function demoOptions(feature: number) {
  return [
    {
      name: "Do nothing",
      effort: 1,
      time: "No new delivery work",
      risk: "The documented customer problem remains unresolved.",
    },
    {
      name: "Maintain current approach",
      effort: 1,
      time: "Continue existing workflows",
      risk: "Manual effort and existing limitations continue.",
    },
    {
      name: "Build a focused capability",
      effort: 2,
      time: "Illustrative estimate; technical review required",
      risk: `Scope and adoption need review for ${demoFeatures[feature].title.toLowerCase()}.`,
    },
    {
      name: "Partner or integrate",
      effort: 2,
      time: "Illustrative estimate; partner review required",
      risk: "Access controls, ongoing support, and integration ownership remain open.",
    },
  ];
}
