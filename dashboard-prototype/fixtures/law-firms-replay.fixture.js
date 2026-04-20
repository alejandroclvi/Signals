window.signalRadarFixtures = window.signalRadarFixtures || [];
window.signalRadarFixtures.push({
  id: "default",
  label: "Law firms replay",
  context: "AI tools for small law firms",
  crumbs: "Radar / Law firms",
  period: "last 30d",
  topicCount: 6,
  selectedId: "ai-discovery",
  evidenceLayers: [
    { id: "conversation", label: "Conversation", note: "raw pain language, repeated complaints, community recurrence" },
    { id: "intent", label: "Intent", note: "active discovery, search demand, vendor comparison" },
    { id: "behavior", label: "Behavior", note: "build activity, usage traces, workflow artifacts" },
    { id: "expectation", label: "Expectation", note: "money-backed forecasts and probability repricing" },
    { id: "economic", label: "Economic commitment", note: "reviews, hiring, procurement, budget allocation" },
    { id: "capital", label: "Capital-market response", note: "public market price, volume, volatility, sector movement" },
    { id: "truth", label: "Primary truth", note: "official sources, filings, docs, vendor claims, fact checks" }
  ],
  metrics: [
    { title: "Emerging signals", value: "24", delta: "+6", caption: "detected this period", spark: [12, 13, 16, 18, 23, 26, 31] },
    { title: "High-confidence", value: "7", delta: "+2", caption: "evidence >= 3 sources", spark: [4, 5, 6, 8, 9, 11, 12] },
    { title: "Communities monitored", value: "38", delta: "-", caption: "in active context", spark: [19, 19, 24, 24, 24, 24, 24] },
    { title: "Saved evidence", value: "156", delta: "+34", caption: "threads + comments", spark: [76, 88, 104, 121, 139, 151, 156] }
  ],
  timeline: {
    posts: [17, 18, 15, 17, 18, 16, 19, 16, 17, 19, 18, 19, 17, 18, 19, 18, 18, 20, 22, 25, 29, 35, 39, 46, 58, 69],
    comments: [14, 13, 12, 14, 15, 14, 15, 14, 13, 15, 15, 16, 14, 15, 16, 15, 14, 16, 18, 20, 24, 27, 31, 36, 41, 44],
    authors: [9, 9, 8, 10, 9, 10, 9, 11, 10, 10, 11, 11, 10, 12, 11, 12, 12, 13, 13, 14, 15, 16, 18, 20, 22, 24]
  },
  heatmap: [
    ["r/LawFirm", [16, 23, 5, 29]],
    ["r/legaltech", [9, 17, 22, 25]],
    ["r/solo_practice", [10, 10, 14, 23]],
    ["r/paralegal", [14, 15, 5, 23]],
    ["r/LawSchool", [0, 10, 7, 18]]
  ],
  intent: [
    ["Tool search", 31, "#3e9558"],
    ["Frustration", 26, "#de5c56"],
    ["Adoption", 18, "#2d6fbb"],
    ["Comparison", 15, "#bd842f"],
    ["Education", 7, "#875fb4"],
    ["Speculation", 3, "#1b918d"]
  ],
  sourceNodes: [
    {
      id: "reddit",
      name: "Reddit",
      state: "enabled",
      layers: ["conversation"],
      lift: 0,
      adds: "Pain language and repeated complaints.",
      cannot: "Cannot prove buying intent, budget, or adoption."
    },
    {
      id: "google-search",
      name: "Google Search",
      state: "available",
      layers: ["intent"],
      lift: 11,
      adds: "Active discovery and comparison intent.",
      cannot: "Cannot prove purchase or retention."
    },
    {
      id: "google-trends",
      name: "Google Trends",
      state: "gated",
      layers: ["intent"],
      lift: 8,
      adds: "Broad search-demand direction.",
      cannot: "Weak for very early small signals."
    },
    {
      id: "hacker-news",
      name: "Hacker News",
      state: "available",
      layers: ["conversation"],
      lift: 7,
      adds: "Builder debate and technical skepticism.",
      cannot: "Narrow audience, not broad demand."
    },
    {
      id: "github",
      name: "GitHub",
      state: "available",
      layers: ["behavior"],
      lift: 9,
      adds: "Implementation artifacts and developer adoption.",
      cannot: "Cannot prove buyer budget."
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      state: "gated",
      layers: ["conversation", "economic"],
      lift: 8,
      adds: "Professional normalization and hiring signals.",
      cannot: "Access constraints limit full public coverage."
    },
    {
      id: "g2-jobs",
      name: "G2 / Jobs",
      state: "gated",
      layers: ["economic"],
      lift: 10,
      adds: "Buyer reviews, categories, and hiring commitment.",
      cannot: "Usually later than early pain signals."
    },
    {
      id: "polymarket",
      name: "Polymarket",
      state: "available",
      layers: ["expectation"],
      lift: 6,
      adds: "Money-backed probability movement.",
      cannot: "Not useful for every product-category question."
    },
    {
      id: "stocks",
      name: "Stock Prices",
      state: "available",
      layers: ["capital"],
      lift: 6,
      adds: "Capital-market response and divergence.",
      cannot: "Cannot prove causality by itself."
    },
    {
      id: "primary",
      name: "Primary Sources",
      state: "available",
      layers: ["truth"],
      lift: 10,
      adds: "Official confirmation, filings, docs, vendor claims.",
      cannot: "Often validates later than social discovery."
    }
  ],
  otherBubbles: [
    { x: 390, y: 143, r: 14, color: "#1b918d", opacity: .25 },
    { x: 251, y: 245, r: 10, color: "#875fb4", opacity: .15 },
    { x: 317, y: 318, r: 10, color: "#de5c56", opacity: .13 },
    { x: 462, y: 275, r: 13, color: "#2d6fbb", opacity: .25 },
    { x: 359, y: 210, r: 14, color: "#1b918d", opacity: .22 },
    { x: 488, y: 337, r: 13, color: "#875fb4", opacity: .24 },
    { x: 244, y: 416, r: 10, color: "#3e9558", opacity: .14 },
    { x: 335, y: 397, r: 9, color: "#2d6fbb", opacity: .18 },
    { x: 536, y: 306, r: 14, color: "#3e9558", opacity: .2 }
  ],
  evidencePackets: [],
  signals: [
    {
      id: "ai-discovery",
      rank: 1,
      status: "Emerging",
      title: "AI discovery summaries",
      growth: "+312%",
      tags: ["demand", "adoption"],
      summary: "Solo attorneys are asking how to summarize discovery documents while preserving confidentiality.",
      communities: ["r/LawFirm", "r/legaltech", "r/paralegal"],
      mentions: 21,
      comments: 188,
      confidence: "High",
      x: 704,
      y: 93,
      r: 41,
      volume: 289,
      evidence: [
        {
          id: "81",
          quote: "Has anyone used AI to summarize discovery docs without uploading client data?",
          source: "r/LawFirm",
          author: "u/solopractice_atl",
          age: "2d",
          score: 147,
          replies: 62
        },
        {
          id: "82",
          quote: "I need something cheaper than hiring extra review help. We are drowning in exhibits.",
          source: "r/legaltech",
          author: "u/partner_ops",
          age: "4d",
          score: 89,
          replies: 31
        },
        {
          id: "83",
          quote: "We tried using a general AI tool, but confidentiality is the blocker.",
          source: "r/paralegal",
          author: "u/para_j",
          age: "6d",
          score: 213,
          replies: 94
        },
        {
          id: "84",
          quote: "Looking for on-prem or SOC 2 options that can handle 10k+ page productions.",
          source: "r/LawFirm",
          author: "u/litigator_nm",
          age: "7d",
          score: 76,
          replies: 28
        }
      ],
      phrases: [
        ["summarize discovery", 47],
        ["client confidentiality", 38],
        ["legal document review", 31],
        ["AI for case prep", 24],
        ["alternative to manual review", 19],
        ["SOC 2 legal AI", 14],
        ["on-prem summarization", 11]
      ],
      spread: [
        ["r/LawFirm", 42],
        ["r/legaltech", 28],
        ["r/paralegal", 18],
        ["r/solo_practice", 12]
      ],
      related: [
        ["Confidentiality concerns", "narrative", "r=0.84"],
        ["Legal document review", "demand", "r=0.71"],
        ["Paralegal workflow AI", "adoption", "r=0.62"]
      ],
      why: "Conversation is moving from curiosity to workflow-specific adoption. Users are asking about confidentiality, document volume, and how to integrate AI into legal review, shifting from \"is this possible\" toward \"which tool handles my caseload.\"",
      suggested: {
        title: "Suggested action",
        sub: "Create alert for confidentiality + discovery summary discussions."
      },
      next: "Enable Google Search next to validate active discovery and vendor comparison intent."
    },
    {
      id: "alternative-clio",
      rank: 2,
      status: "Growing",
      title: "Alternative to Clio",
      growth: "+146%",
      tags: ["frustration", "comparison"],
      summary: "Users are comparing legal practice tools around cost, complexity, and automation gaps.",
      communities: ["r/solo_practice", "r/LawFirm"],
      mentions: 14,
      comments: 96,
      confidence: "Medium",
      x: 641,
      y: 169,
      r: 24,
      volume: 110,
      evidence: [
        { id: "91", quote: "Clio is fine but feels too heavy for a two-person practice.", source: "r/solo_practice", author: "u/founder_attorney", age: "1d", score: 64, replies: 18 },
        { id: "92", quote: "I want intake, billing, and follow-up automation without paying for the whole suite.", source: "r/LawFirm", author: "u/smallfirm_ops", age: "5d", score: 52, replies: 17 }
      ],
      phrases: [["alternative to Clio", 29], ["practice management too expensive", 17], ["small firm automation", 14]],
      spread: [["r/solo_practice", 48], ["r/LawFirm", 34], ["r/legaltech", 18]],
      related: [["Client intake automation", "demand", "r=0.68"], ["Billable hour compression", "economic", "r=0.52"]],
      why: "The signal is less about replacing a brand and more about small firms wanting narrower automation without large-suite overhead.",
      suggested: { title: "Suggested action", sub: "Enable HN or GitHub only if this becomes a technical tooling signal." },
      next: "Enable Google Search to check comparison and alternative queries."
    },
    {
      id: "client-intake",
      rank: 3,
      status: "Watch",
      title: "Client intake automation",
      growth: "+88%",
      tags: ["demand"],
      summary: "Small firms are asking for intake workflows that connect forms, email, and document generation.",
      communities: ["r/legaltech", "r/smallbusiness"],
      mentions: 9,
      comments: 61,
      confidence: "Medium",
      x: 602,
      y: 305,
      r: 23,
      volume: 88,
      evidence: [
        { id: "101", quote: "Is there a simple intake form that creates the first email and document checklist?", source: "r/legaltech", author: "u/intake_ops", age: "3d", score: 41, replies: 19 },
        { id: "102", quote: "We lose too much time copying client answers into templates.", source: "r/smallbusiness", author: "u/localfirm", age: "8d", score: 37, replies: 12 }
      ],
      phrases: [["client intake automation", 18], ["forms to docs", 12], ["intake follow-up", 9]],
      spread: [["r/legaltech", 43], ["r/smallbusiness", 34], ["r/LawFirm", 23]],
      related: [["AI discovery summaries", "demand", "r=0.46"], ["Alternative to Clio", "comparison", "r=0.48"]],
      why: "The pain is operational and repetitive. Evidence is still early but practical enough to justify watching intent sources.",
      suggested: { title: "Suggested action", sub: "Create alert for intake + forms + document generation." },
      next: "Enable Google Search to validate active intent."
    },
    {
      id: "confidentiality",
      rank: 4,
      status: "Growing",
      title: "Confidentiality concerns",
      growth: "+127%",
      tags: ["narrative"],
      summary: "Threads debate where client data can safely flow through AI tools, especially for litigation prep.",
      communities: ["r/LawFirm", "r/lawyertalk"],
      mentions: 18,
      comments: 142,
      confidence: "High",
      x: 670,
      y: 178,
      r: 26,
      volume: 92,
      evidence: [
        { id: "111", quote: "The feature is useful, but where does the client data go?", source: "r/LawFirm", author: "u/riskpartner", age: "2d", score: 128, replies: 44 },
        { id: "112", quote: "I need a vendor answer on retention before I let staff use AI on case material.", source: "r/lawyertalk", author: "u/legaladmin", age: "9d", score: 77, replies: 27 }
      ],
      phrases: [["client data", 42], ["AI retention policy", 21], ["confidentiality blocker", 18]],
      spread: [["r/LawFirm", 52], ["r/lawyertalk", 30], ["r/paralegal", 18]],
      related: [["AI discovery summaries", "adoption", "r=0.84"], ["SOC 2 legal AI", "narrative", "r=0.69"]],
      why: "Confidentiality is becoming a category constraint. This can shape vendor selection and product requirements before buying intent is visible.",
      suggested: { title: "Suggested action", sub: "Create a watchlist for security-language acceleration." },
      next: "Enable primary-source/vendor pages to compare security claims."
    },
    {
      id: "billable-compression",
      rank: 5,
      status: "Watch",
      title: "Billable hour compression",
      growth: "+74%",
      tags: ["economic"],
      summary: "Partners note clients pushing back on research hours as AI shortens review time.",
      communities: ["r/BigLaw", "r/LawFirm"],
      mentions: 11,
      comments: 74,
      confidence: "Medium",
      x: 528,
      y: 270,
      r: 19,
      volume: 77,
      evidence: [
        { id: "121", quote: "Clients are asking why research hours are still high if we use AI tools.", source: "r/BigLaw", author: "u/seniorassoc", age: "6d", score: 53, replies: 22 },
        { id: "122", quote: "Flat-fee pressure is becoming part of every tech conversation.", source: "r/LawFirm", author: "u/managingpartner", age: "12d", score: 31, replies: 11 }
      ],
      phrases: [["billable compression", 11], ["research hours", 19], ["flat fee pressure", 8]],
      spread: [["r/BigLaw", 50], ["r/LawFirm", 34], ["r/legaltech", 16]],
      related: [["Alternative to Clio", "comparison", "r=0.39"], ["AI discovery summaries", "economic", "r=0.44"]],
      why: "The discussion connects workflow automation to pricing pressure. It is not yet product demand, but it points to economic commitment questions.",
      suggested: { title: "Suggested action", sub: "Watch for jobs and buyer-review evidence later." },
      next: "Enable G2 or jobs data later to validate economic commitment."
    },
    {
      id: "legal-doc-review",
      rank: 6,
      status: "Steady",
      title: "Legal document review",
      growth: "+54%",
      tags: ["demand"],
      summary: "Ongoing demand for batch-review tools that handle PDFs, contracts, and exhibits.",
      communities: ["r/paralegal", "r/LawFirm"],
      mentions: 16,
      comments: 112,
      confidence: "High",
      x: 575,
      y: 236,
      r: 22,
      volume: 138,
      evidence: [
        { id: "131", quote: "I need batch review for PDFs, not another chat box.", source: "r/paralegal", author: "u/docreview", age: "10d", score: 88, replies: 36 },
        { id: "132", quote: "Contract review is useful, discovery review is where the time goes.", source: "r/LawFirm", author: "u/litigationops", age: "14d", score: 67, replies: 24 }
      ],
      phrases: [["batch PDF review", 22], ["legal document review", 31], ["not another chatbot", 13]],
      spread: [["r/paralegal", 45], ["r/LawFirm", 39], ["r/legaltech", 16]],
      related: [["AI discovery summaries", "demand", "r=0.71"], ["Confidentiality concerns", "narrative", "r=0.53"]],
      why: "The pain is well-defined but broader than the strongest emerging category. It provides supporting evidence for discovery-summary demand.",
      suggested: { title: "Suggested action", sub: "Attach as supporting evidence to discovery summaries." },
      next: "Enable GitHub only if open tooling becomes visible."
    }
  ]
});
