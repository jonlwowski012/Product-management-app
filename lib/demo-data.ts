// Anonymized, curated snapshot for the public read-only demo. No private originals.
export const demoData = {
  question: "Is simulation as a service a good product idea?",
  provenance:
    "Anonymized snapshot of the saved report used in the sales-demo PDF. Company and product names are fictional. Only the 10 selected passages are published. Coverage describes the original saved run, not a new analysis.",
  sources: [
    {
      id: "d3e00000-0000-4000-8000-00000000044c",
      company: "Aster Robotics",
      filename: "Aster Robotics - customer interview 1.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Aster Robotics\n\nNo representative passages from this source were selected for the saved report.\n",
    },
    {
      id: "d3e00000-0000-4000-8000-00000000044d",
      company: "Birch AI",
      filename: "Birch AI - customer interview 2.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Birch AI\n\nthis is the first time they said, no, we want to do simulation, go to training, then more simulation, then fine-tuning\n\n",
    },
    {
      id: "d3e00000-0000-4000-8000-00000000044e",
      company: "Aster Robotics",
      filename: "Aster Robotics - customer interview 3.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Aster Robotics\n\ntoday, we're, like, a fairly small team having to manage, like, dozens of different Kubernetes clusters and and and all these types of things. So, like, it it'd be much easier to just pull us an API\n\nwithout fail, like, every every couple of days, we're getting a node or two pulled. For maintenance or something, and we'll just have to move customer workloads across.\n\nwe can snapshot our stuff like gas simulation. That's no problem. But to snapshot, like, the state of the customer's own know, on device raw stack or something, including all the network buffers and, like, all those kind of stuff. It's just a that's a that's a big job.\n\n",
    },
    {
      id: "d3e00000-0000-4000-8000-00000000044f",
      company: "Cedar Research",
      filename: "Cedar Research - customer interview 4.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Cedar Research\n\nthey're technologically competitive, but they have no go-to-market interest effectively, or like actual deployment interest. So it's a bit more of like an academic lab than it is like a Hard to charge a commercial organization\n\neval is also the most important bottleneck when it comes to deployment in the enterprise space.\n\n",
    },
    {
      id: "d3e00000-0000-4000-8000-000000000450",
      company: "Dune Systems",
      filename: "Dune Systems - customer interview 5.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Dune Systems\n\nHeadless: CI/CD pipelines, agent-driven runs, ML training loops, A/B testing at scale\n\n",
    },
    {
      id: "d3e00000-0000-4000-8000-000000000451",
      company: "Aster Robotics",
      filename: "Aster Robotics - customer interview 6.txt",
      role: "auto",
      text: "Anonymized sales demo. Selected excerpts only; complete original documents are not published.\nCompany: Aster Robotics\n\nI think it's really around this idea of making simulation a far more sort of like ephemeral functional thing so that it can be called by other services, whether that's, you know, MCPs on our side.\n\nSo it'll be just starting to sort of standardize the, the API interface effectively for, you know, what the unit of work and Aster Robotics looks like\n\na lot of companies were talking to are pretty new with synthetic data and even, like, trusting the fidelity of, like, simulation or SDG. So a lot of times, like, instead of building out this, like, whole end to end loop, they just want us to build, like, a piece of it so they can see, will that work and then go from there.\n\n",
    },
  ],
  result: {
    changes: [],
    summary:
      "Simulation as a service shows significant potential as a product, provided the solution addresses operational bottlenecks and integration rather than purely research. There is strong evidence of a need for programmatic (API-driven), ephemeral infrastructure to support CI/CD and training workflows. However, user trust in synthetic fidelity is currently a barrier to enterprise adoption, suggesting a strategy of modular, incremental feature delivery is more viable than an all-in-one platform. Technical risks regarding state persistence (snapshotting) and infrastructure reliability remain primary challenges.",
    coverage: {
      batches: 18,
      sources: 6,
      skipped_batches: 10,
      analyzed_sources: 2,
      selected_findings: 10,
      verified_findings: 45,
    },
    findings: [
      {
        id: "d3e00000-0000-4000-8000-00000000012c",
        quote:
          "they're technologically competitive, but they have no go-to-market interest effectively, or like actual deployment interest. So it's a bit more of like an academic lab than it is like a Hard to charge a commercial organization",
        origin: "customer",
        stance: "supports",
        problem:
          "Potential industry competitors focus on academic research rather than practical, commercial deployment of their technology.",
        customer: "Cedar Research",
        source_id: "d3e00000-0000-4000-8000-00000000044f",
        page_index: 0,
        consequence:
          "There is a gap in the market for commercially-oriented, deployable simulation tools, leaving an opening for vendors who prioritize enterprise needs.",
        source_label: "Anonymized excerpt",
        source_start: 119,
      },
      {
        id: "d3e00000-0000-4000-8000-00000000012d",
        quote:
          "this is the first time they said, no, we want to do simulation, go to training, then more simulation, then fine-tuning",
        origin: "customer",
        stance: "supports",
        problem:
          "The workflow between simulation output and downstream training/fine-tuning is disconnected.",
        customer: "Birch AI",
        source_id: "d3e00000-0000-4000-8000-00000000044d",
        page_index: 0,
        consequence:
          "Users cannot execute continuous automated iterative cycles without disjointed manual handoffs.",
        source_label: "Anonymized excerpt",
        source_start: 113,
      },
      {
        id: "d3e00000-0000-4000-8000-00000000012e",
        quote:
          "today, we're, like, a fairly small team having to manage, like, dozens of different Kubernetes clusters and and and all these types of things. So, like, it it'd be much easier to just pull us an API",
        origin: "customer",
        stance: "supports",
        problem:
          "High operational overhead from manually managing many individual Kubernetes clusters.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-00000000044e",
        page_index: 0,
        consequence:
          "Resource inefficiency and operational complexity for small engineering teams.",
        source_label: "Anonymized excerpt",
        source_start: 119,
      },
      {
        id: "d3e00000-0000-4000-8000-00000000012f",
        quote:
          "without fail, like, every every couple of days, we're getting a node or two pulled. For maintenance or something, and we'll just have to move customer workloads across.",
        origin: "customer",
        stance: "opposes",
        problem:
          "Frequent, predictable infrastructure node maintenance interrupts workload continuity.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-00000000044e",
        page_index: 0,
        consequence:
          "Platform requires manual development of graceful shutdown and migration capabilities to maintain robustness.",
        source_label: "Anonymized excerpt",
        source_start: 319,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000130",
        quote:
          "we can snapshot our stuff like gas simulation. That's no problem. But to snapshot, like, the state of the customer's own know, on device raw stack or something, including all the network buffers and, like, all those kind of stuff. It's just a that's a that's a big job.",
        origin: "customer",
        stance: "opposes",
        problem:
          "Inability to perform comprehensive snapshots of guest/customer-defined simulation stacks.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-00000000044e",
        page_index: 0,
        consequence:
          "Workloads cannot easily resume from interruption, making long-running simulations difficult to manage.",
        source_label: "Anonymized excerpt",
        source_start: 489,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000131",
        quote:
          "eval is also the most important bottleneck when it comes to deployment in the enterprise space.",
        origin: "internal",
        stance: "context",
        problem:
          "Evaluation of physical AI models is the critical bottleneck preventing wider adoption in enterprise deployments.",
        customer: "Cedar Research",
        source_id: "d3e00000-0000-4000-8000-00000000044f",
        page_index: 0,
        consequence:
          "Enterprise users are unable to scale deployment of physical AI because current evaluation stages are disconnected and lack cohesion.",
        source_label: "Anonymized excerpt",
        source_start: 347,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000132",
        quote:
          "I think it's really around this idea of making simulation a far more sort of like ephemeral functional thing so that it can be called by other services, whether that's, you know, MCPs on our side.",
        origin: "customer",
        stance: "supports",
        problem:
          "Simulation workloads are currently not ephemeral or functional enough to be triggered programmatically by other services.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-000000000451",
        page_index: 0,
        consequence:
          "External services cannot easily integrate or use simulation as an on-demand workload.",
        source_label: "Anonymized excerpt",
        source_start: 119,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000133",
        quote:
          "So it'll be just starting to sort of standardize the, the API interface effectively for, you know, what the unit of work and Aster Robotics looks like",
        origin: "customer",
        stance: "supports",
        problem:
          "Lack of a standardized API interface to define the 'unit of work' for simulation.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-000000000451",
        page_index: 0,
        consequence:
          "Difficulty in exposing simulation workloads to other products or platforms (like workbench) in a co-sell environment.",
        source_label: "Anonymized excerpt",
        source_start: 317,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000134",
        quote:
          "a lot of companies were talking to are pretty new with synthetic data and even, like, trusting the fidelity of, like, simulation or SDG. So a lot of times, like, instead of building out this, like, whole end to end loop, they just want us to build, like, a piece of it so they can see, will that work and then go from there.",
        origin: "customer",
        stance: "supports",
        problem:
          "Customers lack trust in the fidelity of synthetic data generation and simulation.",
        customer: "Aster Robotics",
        source_id: "d3e00000-0000-4000-8000-000000000451",
        page_index: 0,
        consequence:
          "Customers prefer modular, piece-by-piece adoption rather than committing to a comprehensive end-to-end platform.",
        source_label: "Anonymized excerpt",
        source_start: 469,
      },
      {
        id: "d3e00000-0000-4000-8000-000000000135",
        quote:
          "Headless: CI/CD pipelines, agent-driven runs, ML training loops, A/B testing at scale",
        origin: "uncertain",
        stance: "context",
        problem:
          "Users need to run simulations programmatically for scale (CI/CD, ML training) rather than interactively.",
        customer: "Dune Systems",
        source_id: "d3e00000-0000-4000-8000-000000000450",
        page_index: 0,
        consequence:
          "Without headless capability, users cannot integrate the simulation platform into their automated development workflows.",
        source_label: "Anonymized excerpt",
        source_start: 117,
      },
    ],
    opportunities: [
      {
        title: "API-First, Ephemeral Simulation Infrastructure",
        problem:
          "Engineering teams struggle with high operational overhead when manually managing simulation environments (e.g., K8s clusters) and lack the ability to trigger simulation workloads programmatically.",
        audience:
          "Small to mid-sized engineering teams and AI developers integrating simulations into automation pipelines.",
        next_step:
          "Conduct technical feasibility interviews with infrastructure engineers regarding their current requirements for state persistence and recovery in simulation jobs.",
        questions: [
          "How do you currently handle long-running simulations that are interrupted by infrastructure maintenance?",
          "What is the biggest technical hurdle preventing you from treating simulation as a stateless API call?",
          "If you could move one part of your simulation workflow to a managed service, which component would provide the most immediate relief?",
        ],
        rationale:
          "Customers report that manually managing infrastructure is inefficient and requires a shift to API-based, ephemeral execution models.",
        importance:
          "Enables scaling by removing manual management of clusters and allowing simulation to be treated as a functional service for CI/CD and ML training loops.",
        context_ids: ["d3e00000-0000-4000-8000-000000000135"],
        uncertainty:
          "It is unclear if a platform can reliably support the state snapshotting required for long-running simulations, given current technical limitations in capturing raw stack state.",
        opposing_ids: [
          "d3e00000-0000-4000-8000-00000000012f",
          "d3e00000-0000-4000-8000-000000000130",
        ],
        supporting_ids: [
          "d3e00000-0000-4000-8000-00000000012e",
          "d3e00000-0000-4000-8000-000000000132",
          "d3e00000-0000-4000-8000-000000000133",
        ],
      },
      {
        title: "Integrated Simulation-to-Training Pipeline",
        problem:
          "The workflow between simulation output, model training, and fine-tuning is disjointed, causing manual handoffs that hinder automated iterative cycles.",
        audience:
          "MLOps and AI research teams focused on deploying physical models.",
        next_step:
          "Map the specific hand-off points in the customer's current training pipeline to identify the highest-friction manual process.",
        questions: [
          "What specific manual steps exist between your simulation results and model fine-tuning?",
          "How do you currently validate the output of your simulation before it reaches training?",
          "What tools currently sit between your simulation engine and your training environment?",
        ],
        rationale:
          "Users explicitly demand continuous, automated cycles from simulation to training, rather than isolated simulation tasks.",
        importance:
          "Evaluation and iterative training are identified as the primary bottlenecks for physical AI deployment; seamless integration is critical for scaling.",
        context_ids: ["d3e00000-0000-4000-8000-000000000131"],
        uncertainty:
          "The degree to which teams prioritize a unified vendor solution versus 'best-of-breed' tools for each stage remains unconfirmed.",
        opposing_ids: [],
        supporting_ids: ["d3e00000-0000-4000-8000-00000000012d"],
      },
      {
        title: "Modular Entry Points to Build Trust",
        problem:
          "New enterprise customers lack trust in the fidelity of synthetic data and simulation outcomes, creating friction for adopting end-to-end platforms.",
        audience:
          "Enterprises new to synthetic data and simulation technologies.",
        next_step:
          "Identify the smallest, most impactful 'pilot' module that could be decoupled from a full simulation suite for early deployment.",
        questions: [
          "What specific fidelity issues have you encountered with simulation tools in the past?",
          "What single outcome would convince you that our simulation fidelity is sufficient for your production use case?",
          "Would you prefer a platform that handles the entire simulation stack, or one that integrates into your existing tools for specific tasks?",
        ],
        rationale:
          "Market feedback suggests that forced end-to-end adoption is less effective than offering piece-by-piece integration that demonstrates value early.",
        importance:
          "High-fidelity simulation is unproven to these users; modular adoption allows them to build trust and validate effectiveness incrementally.",
        context_ids: ["d3e00000-0000-4000-8000-00000000012c"],
        uncertainty:
          "It is unclear which specific 'piece' of the simulation pipeline provides the most reliable signal of trust for new users.",
        opposing_ids: [],
        supporting_ids: ["d3e00000-0000-4000-8000-000000000134"],
      },
    ],
    analysis_warnings: [
      {
        batch: 1,
        source_ids: ["d3e00000-0000-4000-8000-00000000044c"],
        filenames: ["Aster Robotics - customer interview 1.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 3,
        source_ids: ["d3e00000-0000-4000-8000-00000000044e"],
        filenames: ["Aster Robotics - customer interview 3.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 5,
        source_ids: ["d3e00000-0000-4000-8000-00000000044e"],
        filenames: ["Aster Robotics - customer interview 3.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 7,
        source_ids: ["d3e00000-0000-4000-8000-00000000044e"],
        filenames: ["Aster Robotics - customer interview 3.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 9,
        source_ids: ["d3e00000-0000-4000-8000-00000000044f"],
        filenames: ["Cedar Research - customer interview 4.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 10,
        source_ids: ["d3e00000-0000-4000-8000-00000000044f"],
        filenames: ["Cedar Research - customer interview 4.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 11,
        source_ids: ["d3e00000-0000-4000-8000-00000000044f"],
        filenames: ["Cedar Research - customer interview 4.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 15,
        source_ids: ["d3e00000-0000-4000-8000-000000000451"],
        filenames: ["Aster Robotics - customer interview 6.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 16,
        source_ids: ["d3e00000-0000-4000-8000-000000000451"],
        filenames: ["Aster Robotics - customer interview 6.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
      {
        batch: 18,
        source_ids: ["d3e00000-0000-4000-8000-000000000451"],
        filenames: ["Aster Robotics - customer interview 6.txt"],
        message:
          "This source batch was omitted from the saved analysis. Prerecorded demo; no live retry is available.",
      },
    ],
  },
};
