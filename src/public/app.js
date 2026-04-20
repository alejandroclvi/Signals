const categories = {
  demand: { label: "demand", color: "#3e9558", soft: "#dff3e5" },
  frustration: { label: "frustration", color: "#de5c56", soft: "#f8dfdd" },
  adoption: { label: "adoption", color: "#2d6fbb", soft: "#dceafb" },
  comparison: { label: "comparison", color: "#bd842f", soft: "#f6ead7" },
  narrative: { label: "narrative", color: "#875fb4", soft: "#eadff7" },
  economic: { label: "economic", color: "#1b918d", soft: "#d8f0ef" }
};

// Load initial data injected by the server
const initialData = window.__SIGNALS_DATA__ || {};

let signals = initialData.signals || [];
let otherBubbles = initialData.otherBubbles || [];
let metrics = initialData.metrics || [];
let timeline = initialData.timeline || { posts: [], comments: [], authors: [] };
let heatmap = initialData.heatmap || [];
let intent = initialData.intent || [];
let evidenceLayers = initialData.evidenceLayers || [];
let sourceNodes = initialData.sourceNodes || [];
let enabledNodes = new Set(sourceNodes.filter((node) => node.state === "enabled").map((node) => node.id));
let selectedId = initialData.selectedId || (signals[0] && signals[0].id) || "";

// Fixture switching
const fixtureList = initialData.fixtures || [];
let activeFixtureId = initialData.activeFixtureId || "default";

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function setupFixtureSelector() {
  const select = document.getElementById("fixtureSelect");
  if (!select || !fixtureList.length) return;
  select.addEventListener("change", (event) => {
    loadFixture(event.target.value);
  });
}

async function loadFixture(fixtureId) {
  try {
    const resp = await fetch("/api/fixtures/" + encodeURIComponent(fixtureId) + "/load");
    if (!resp.ok) return;
    const data = await resp.json();
    applyData(data);
  } catch (err) {
    console.error("Failed to load fixture:", err);
  }
}

function applyData(data) {
  signals = data.signals || signals;
  otherBubbles = data.otherBubbles || otherBubbles;
  metrics = data.metrics || metrics;
  timeline = data.timeline || timeline;
  heatmap = data.heatmap || heatmap;
  intent = data.intent || intent;
  evidenceLayers = data.evidenceLayers || evidenceLayers;
  sourceNodes = data.sourceNodes || sourceNodes;
  enabledNodes = new Set(sourceNodes.filter((node) => node.state === "enabled").map((node) => node.id));
  selectedId = data.selectedId || (signals[0] && signals[0].id) || selectedId;
  activeFixtureId = data.activeFixtureId || activeFixtureId;

  const crumbs = document.getElementById("crumbs");
  if (crumbs && data.crumbs) crumbs.textContent = data.crumbs;

  const topicSummary = document.getElementById("topicSummary");
  if (topicSummary) topicSummary.textContent = (data.topicCount || signals.length) + " topics detected - " + (data.period || "last 30d");

  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";

  renderAll();
}

function selectedSignal() {
  return signals.find((signal) => signal.id === selectedId) || signals[0];
}

function tagHtml(tag) {
  const meta = categories[tag];
  return '<span class="tag ' + tag + '">' + (meta ? meta.label : tag) + '</span>';
}

function linePoints(values, width, height, pad) {
  if (pad === undefined) pad = 8;
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const span = max - min || 1;
  return values.map(function(value, index) {
    var x = pad + index * ((width - pad * 2) / (values.length - 1));
    var y = height - pad - ((value - min) / span) * (height - pad * 2);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
}

function renderMetrics() {
  var root = document.getElementById("metrics");
  root.innerHTML = metrics.map(function(metric) {
    return '<div class="metric">' +
      '<div class="metric-title">' + metric.title + '</div>' +
      '<div class="metric-value-row">' +
        '<div class="metric-number">' + metric.value + '</div>' +
        '<span class="delta">' + metric.delta + '</span>' +
      '</div>' +
      '<div class="metric-caption">' +
        '<span>' + metric.caption + '</span>' +
        '<svg class="spark" viewBox="0 0 94 28" aria-hidden="true">' +
          '<polyline points="' + linePoints(metric.spark, 94, 28, 2) + '" fill="none" stroke="#3e9558" stroke-width="1.7"></polyline>' +
          '<path d="M2 26 L' + linePoints(metric.spark, 94, 28, 2).split(" ").join(" L") + ' L92 26 Z" fill="rgba(62,149,88,.10)"></path>' +
        '</svg>' +
      '</div>' +
    '</div>';
  }).join("");
}

function renderBubbleChart() {
  var svg = document.getElementById("bubbleSvg");
  var width = 860;
  var height = 526;
  svg.innerHTML =
    '<line x1="430" y1="0" x2="430" y2="' + height + '" stroke="#dfe4ea"></line>' +
    '<line x1="0" y1="263" x2="' + width + '" y2="263" stroke="#dfe4ea"></line>';

  otherBubbles.forEach(function(bubble) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", bubble.x);
    node.setAttribute("cy", bubble.y);
    node.setAttribute("r", bubble.r);
    node.setAttribute("fill", bubble.color);
    node.setAttribute("fill-opacity", bubble.opacity);
    node.setAttribute("stroke", bubble.color);
    node.setAttribute("stroke-dasharray", "3 3");
    svg.appendChild(node);
  });

  signals.forEach(function(signal) {
    var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-signal", signal.id);
    group.setAttribute("class", "bubble " + (signal.id === selectedId ? "selected" : ""));
    var tag = (signal.tags && signal.tags[0]) ? signal.tags[0] : "demand";
    var cat = categories[tag] || categories.demand;
    var color = cat.color;
    var fill = cat.soft;
    var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", signal.x);
    circle.setAttribute("cy", signal.y);
    circle.setAttribute("r", signal.r);
    circle.setAttribute("fill", fill);
    circle.setAttribute("fill-opacity", signal.id === selectedId ? ".9" : ".62");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", signal.id === selectedId ? "2.2" : "1.2");
    group.appendChild(circle);

    if (signal.rank <= 4) {
      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", signal.x - 92);
      label.setAttribute("y", signal.y - signal.r - 12);
      label.setAttribute("class", "bubble-label");
      label.textContent = signal.title;
      group.appendChild(label);

      var meta = document.createElementNS("http://www.w3.org/2000/svg", "text");
      meta.setAttribute("x", signal.x - 92);
      meta.setAttribute("y", signal.y - signal.r + 4);
      meta.setAttribute("class", "bubble-meta");
      meta.textContent = "vol " + signal.volume + " \u00b7 " + signal.confidence.toLowerCase();
      group.appendChild(meta);
    }

    group.addEventListener("click", function() {
      selectedId = signal.id;
      renderAll();
    });
    svg.appendChild(group);
  });
}

function renderSignalList() {
  var list = document.getElementById("signalList");
  list.innerHTML = signals.map(function(signal) {
    return '<article class="signal-item ' + (signal.id === selectedId ? "selected" : "") + '" data-signal="' + signal.id + '">' +
      '<div class="signal-top">' +
        '<span><span class="rank">#' + String(signal.rank).padStart(2, "0") + '</span> <span class="signal-state">' + signal.status + '</span></span>' +
        '<span class="signal-growth">' + signal.growth + '</span>' +
      '</div>' +
      '<div class="signal-title">' + signal.title + '</div>' +
      '<div class="tags">' + signal.tags.map(tagHtml).join("") + '</div>' +
      '<div class="signal-summary">' + signal.summary + '</div>' +
      '<div class="signal-meta">' +
        '<span>' + signal.communities.join(" \u00b7 ") + '</span>' +
        '<span class="confidence"><span class="bars"><i></i><i></i><i style="opacity:' + (signal.confidence === "High" ? "1" : ".32") + '"></i></span>' + signal.confidence + '</span>' +
      '</div>' +
    '</article>';
  }).join("");

  list.querySelectorAll(".signal-item").forEach(function(item) {
    item.addEventListener("click", function() {
      selectedId = item.dataset.signal;
      renderAll();
    });
  });
}

function renderLineChart() {
  var svg = document.getElementById("timelineSvg");
  svg.innerHTML = "";
  var width = 430;
  var height = 142;
  [0, 34, 69].forEach(function(value, index) {
    var y = 126 - index * 48;
    svg.innerHTML += '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="#edf1f5"></line><text x="0" y="' + (y - 4) + '" fill="#9aa3ad" font-size="9">' + value + '</text>';
  });
  svg.innerHTML +=
    '<rect x="236" y="12" width="194" height="116" fill="rgba(62,149,88,.07)"></rect>' +
    '<text x="242" y="21" fill="#3e9558" font-size="9" font-weight="700">ACCELERATION - DAY 18</text>' +
    '<polyline points="' + linePoints(timeline.posts, width, height, 18) + '" fill="none" stroke="#2d6fbb" stroke-width="2"></polyline>' +
    '<polyline points="' + linePoints(timeline.comments, width, height, 18) + '" fill="none" stroke="#111820" stroke-width="2"></polyline>' +
    '<polyline points="' + linePoints(timeline.authors, width, height, 18) + '" fill="none" stroke="#3e9558" stroke-width="1.7" stroke-dasharray="4 4"></polyline>';
}

function renderHeatmap() {
  var svg = document.getElementById("heatmapSvg");
  svg.innerHTML = "";
  var cellW = 54;
  var cellH = 22;
  var max = Math.max.apply(null, heatmap.reduce(function(acc, row) { return acc.concat(row[1]); }, []));
  ["W1", "W2", "W3", "W4"].forEach(function(label, index) {
    svg.innerHTML += '<text x="' + (112 + index * cellW + 22) + '" y="11" text-anchor="middle" fill="#68717d" font-size="9">' + label + '</text>';
  });
  heatmap.forEach(function(entry, row) {
    var label = entry[0];
    var values = entry[1];
    var y = 23 + row * cellH;
    svg.innerHTML += '<text x="0" y="' + (y + 15) + '" fill="#3a444f" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">' + label + '</text>';
    values.forEach(function(value, col) {
      var opacity = .12 + (value / max) * .78;
      var x = 112 + col * cellW;
      svg.innerHTML += '<rect x="' + x + '" y="' + y + '" width="' + (cellW - 2) + '" height="' + (cellH - 2) + '" fill="#2d6fbb" fill-opacity="' + opacity.toFixed(2) + '"></rect>';
      svg.innerHTML += '<text x="' + (x + 25) + '" y="' + (y + 14) + '" text-anchor="middle" fill="' + (opacity > .55 ? "#fff" : "#334155") + '" font-size="10">' + value + '</text>';
    });
  });
}

function renderIntentBars() {
  var root = document.getElementById("intentBars");
  root.innerHTML = intent.map(function(entry) {
    var label = entry[0], value = entry[1], color = entry[2];
    return '<div class="intent-row">' +
      '<span><i class="dot" style="background:' + color + '"></i>' + label + '</span>' +
      '<div class="intent-track"><div class="intent-fill" style="background:' + color + ';width:' + value + '%"></div></div>' +
      '<span>' + value + '%</span>' +
    '</div>';
  }).join("");
}

function activeNodeNamesForLayer(layerId) {
  return sourceNodes
    .filter(function(node) { return enabledNodes.has(node.id) && node.layers.includes(layerId); })
    .map(function(node) { return node.name; });
}

function layerStatus(layer) {
  var candidates = sourceNodes.filter(function(node) { return node.layers.includes(layer.id); });
  var active = candidates.filter(function(node) { return enabledNodes.has(node.id); });
  if (active.length) {
    return {
      state: "active",
      label: "active",
      note: active.map(function(node) { return node.name; }).join(" + ") + " supplying " + layer.label.toLowerCase() + " evidence."
    };
  }
  var available = candidates.filter(function(node) { return node.state !== "gated"; });
  if (available.length) {
    return {
      state: "available",
      label: "available",
      note: available.map(function(node) { return node.name; }).join(" / ") + " can add this layer."
    };
  }
  var gated = candidates.filter(function(node) { return node.state === "gated"; });
  if (gated.length) {
    return {
      state: "gated",
      label: "gated",
      note: gated.map(function(node) { return node.name; }).join(" / ") + " needs access before this layer can be used."
    };
  }
  return {
    state: "missing",
    label: "missing",
    note: "No configured local node currently provides this layer."
  };
}

function nodeVisualState(node) {
  if (enabledNodes.has(node.id)) return "enabled";
  return node.state;
}

function recommendationScore(node, signal) {
  var text = (signal.title + " " + signal.summary + " " + signal.next + " " + signal.tags.join(" ")).toLowerCase();
  var score = node.lift;
  if (text.includes("google") && node.id === "google-search") score += 12;
  if (text.includes("search") && node.id === "google-search") score += 6;
  if (text.includes("g2") && node.id === "g2-jobs") score += 8;
  if (text.includes("jobs") && node.id === "g2-jobs") score += 8;
  if (text.includes("github") && node.id === "github") score += 8;
  if (text.includes("primary") && node.id === "primary") score += 8;
  if (text.includes("vendor") && node.id === "primary") score += 5;
  if (signal.tags.includes("comparison") && node.id === "google-search") score += 7;
  if (signal.tags.includes("economic") && node.layers.includes("economic")) score += 8;
  if (signal.tags.includes("adoption") && node.id === "github") score += 3;
  if (signal.tags.includes("narrative") && node.id === "primary") score += 4;
  if (node.state === "gated") score -= 4;
  return score;
}

function recommendationReason(node) {
  var reasons = {
    "google-search": "Validates whether Reddit pain has turned into active discovery, comparison, or vendor-search intent.",
    "primary": "Checks official claims, policies, filings, docs, and vendor pages so the signal is not only social interpretation.",
    "github": "Looks for developer behavior and implementation artifacts that would move the signal beyond conversation.",
    "g2-jobs": "Adds buyer reviews and hiring commitment, which are stronger but later economic validation layers.",
    "hacker-news": "Adds technical skepticism and builder-facing corroboration when the category is developer or AI-tooling heavy.",
    "polymarket": "Adds money-backed expectation movement when the signal maps to an event or forecastable market.",
    "stocks": "Adds public-market response when the signal maps to listed companies, ETFs, or sectors.",
    "google-trends": "Adds broad demand direction, but it may miss small early signals and needs access handling."
  };
  return reasons[node.id] || node.adds;
}

function rankedRecommendations(signal) {
  return sourceNodes
    .filter(function(node) { return !enabledNodes.has(node.id); })
    .map(function(node) { return { node: node, score: recommendationScore(node, signal) }; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 4);
}

function toggleNode(nodeId) {
  var node = sourceNodes.find(function(item) { return item.id === nodeId; });
  if (!node || node.state === "gated") return;
  if (enabledNodes.has(nodeId)) {
    enabledNodes.delete(nodeId);
    node.state = "available";
  } else {
    enabledNodes.add(nodeId);
    node.state = "enabled";
  }
  renderControlPlane();
  renderDetail();

  // Persist to server
  fetch("/api/source-nodes/" + encodeURIComponent(nodeId) + "/toggle", { method: "POST" })
    .then(function(r) { if (!r.ok) throw new Error("Toggle failed"); return r.json(); })
    .then(function(data) { showToast(node.name + " " + data.state); })
    .catch(function(err) { showToast("Failed to toggle " + node.name, true); });
}

function renderControlPlane() {
  var signal = selectedSignal();
  var activeLayers = evidenceLayers.filter(function(layer) { return activeNodeNamesForLayer(layer.id).length; });
  document.getElementById("coverageCaption").textContent = activeLayers.length + "/" + evidenceLayers.length + " active for selected signal";

  document.getElementById("layerLadder").innerHTML = evidenceLayers.map(function(layer) {
    var status = layerStatus(layer);
    var mark = status.state === "active" ? "\u2713" : status.state === "available" ? "+" : status.state === "gated" ? "!" : "-";
    return '<div class="layer-row ' + status.state + '">' +
      '<span class="layer-mark">' + mark + '</span>' +
      '<div>' +
        '<div class="layer-name">' + layer.label + '</div>' +
        '<div class="layer-note">' + status.note + '</div>' +
      '</div>' +
      '<span class="layer-status">' + status.label + '</span>' +
    '</div>';
  }).join("");

  document.getElementById("sourceNodeGrid").innerHTML = sourceNodes.map(function(node) {
    var visualState = nodeVisualState(node);
    var action = node.state === "gated" ? "access" : enabledNodes.has(node.id) ? "disable" : "enable";
    return '<button class="source-node ' + visualState + '" type="button" data-node="' + node.id + '"' + (node.state === "gated" ? ' aria-disabled="true"' : '') + '>' +
      '<span class="node-top">' +
        '<span class="node-title">' + node.name + '</span>' +
        '<span class="node-state">' + visualState + '</span>' +
      '</span>' +
      '<span class="node-meta">' + node.adds + '</span>' +
      '<span class="node-layers">' + node.layers.map(function(layer) { return '<span class="mini-chip">' + layer + '</span>'; }).join("") + '</span>' +
      '<span class="node-meta">' + action + ' node</span>' +
    '</button>';
  }).join("");

  document.querySelectorAll(".source-node").forEach(function(nodeButton) {
    nodeButton.addEventListener("click", function() { toggleNode(nodeButton.dataset.node); });
  });

  document.getElementById("recommendationList").innerHTML = rankedRecommendations(signal).map(function(entry, index) {
    var node = entry.node, score = entry.score;
    var gated = node.state === "gated";
    return '<article class="recommendation ' + (index === 0 ? "best" : "") + '">' +
      '<div class="rec-top">' +
        '<div class="rec-title">' + (index + 1) + ". " + node.name + '</div>' +
        '<div class="rec-lift">+' + Math.max(1, Math.round(score)) + ' pts</div>' +
      '</div>' +
      '<div class="rec-reason">' + recommendationReason(node) + '</div>' +
      '<div class="rec-action">' +
        '<span>' + node.layers.join(" + ") + ' \u00b7 ' + (gated ? "access needed" : "available now") + '</span>' +
        '<button type="button" data-node="' + node.id + '"' + (gated ? " disabled" : "") + '>' + (gated ? "Access" : "Enable") + '</button>' +
      '</div>' +
    '</article>';
  }).join("");

  document.querySelectorAll(".recommendation button:not([disabled])").forEach(function(button) {
    button.addEventListener("click", function() { toggleNode(button.dataset.node); });
  });
}

function isMarketSignal(signal) {
  return signal.communities.some(function(c) {
    return c === "Polymarket" || c === "NASDAQ" || c === "NYSE";
  });
}

function scoreComponents(signal) {
  var activeLayerCount = evidenceLayers.filter(function(layer) { return activeNodeNamesForLayer(layer.id).length; }).length;
  var phraseWeight = signal.phrases.reduce(function(sum, phrase) { return sum + phrase[1]; }, 0);

  if (isMarketSignal(signal)) {
    // Market signal scoring — different dimensions than Reddit pain
    var layerCount = signal.communities.length;
    var hasExpectation = signal.communities.includes("Polymarket");
    var hasCapital = signal.communities.includes("NASDAQ") || signal.communities.includes("NYSE");
    return [
      ["Evidence breadth", Math.min(100, signal.mentions * 20)],
      ["Conviction strength", Math.min(100, hasExpectation ? 78 : 32)],
      ["Market confirmation", Math.min(100, (hasExpectation && hasCapital) ? 85 : hasCapital ? 45 : 20)],
      ["Phrase density", Math.min(100, Math.round(phraseWeight / 1.7))],
      ["Cross-layer coverage", Math.min(100, layerCount * 40)],
      ["Freshness", Math.max(42, 96 - signal.rank * 8)],
      ["Missing evidence penalty", Math.max(8, 78 - activeLayerCount * 10)]
    ];
  }

  return [
    ["Repetition", Math.min(100, Math.round(signal.mentions * 4.3))],
    ["Pain intensity", Math.min(100, signal.tags.includes("frustration") ? 82 : signal.tags.includes("demand") ? 74 : 62)],
    ["Cross-community", Math.min(100, signal.communities.length * 24)],
    ["Tool request", Math.min(100, Math.round(phraseWeight / 1.7))],
    ["Engagement quality", Math.min(100, Math.round(signal.comments / 1.65))],
    ["Freshness", Math.max(42, 96 - signal.rank * 8)],
    ["Missing evidence penalty", Math.max(8, 78 - activeLayerCount * 10)]
  ];
}

function renderDetail() {
  var signal = selectedSignal();
  if (!signal) return;
  document.getElementById("detailKicker").innerHTML = 'SIGNAL DETAIL \u00b7 first detected Mar 28 2026 \u00b7 <span style="color:var(--green);font-family:inherit;font-weight:760">' + signal.status + '</span>';
  document.getElementById("detailTitle").textContent = signal.title;
  document.getElementById("detailTags").innerHTML = signal.tags.map(tagHtml).join("") + ' <span class="confidence"><span class="bars"><i></i><i></i><i style="opacity:' + (signal.confidence === "High" ? "1" : ".32") + '"></i></span>' + signal.confidence + ' confidence</span>';

  // Wire detail action buttons
  var actionsContainer = document.querySelector(".detail-actions");
  if (actionsContainer) {
    actionsContainer.innerHTML =
      '<button class="button' + (signal.saved ? " active" : "") + '" type="button" id="btnSave">' + (signal.saved ? "\u2611 Saved" : "\u2610 Save") + '</button>' +
      '<button class="button' + (signal.dismissed ? " active" : "") + '" type="button" id="btnDismiss">' + (signal.dismissed ? "\u2612 Dismissed" : "\u2612 Dismiss") + '</button>' +
      '<button class="button" type="button">\u26a1 Alert</button>';
    document.getElementById("btnSave").addEventListener("click", function() { saveSignal(signal.id); });
    document.getElementById("btnDismiss").addEventListener("click", function() { dismissSignal(signal.id); });
  }
  document.getElementById("momentumText").textContent = signal.growth + " vs 14-day rolling baseline";
  document.getElementById("drivenBy").textContent = (signal.volume / 100).toFixed(1) + "x post volume \u00b7 " + signal.communities.length + " communities";
  document.getElementById("whyBox").textContent = signal.why;
  document.getElementById("detailSpark").innerHTML = '<polyline points="' + linePoints([3, 4, 4, 5, 6, 8, 11, 15, 22], 120, 28, 2) + '" fill="none" stroke="#3e9558" stroke-width="1.7"></polyline>';

  document.getElementById("evidenceList").innerHTML = signal.evidence.map(function(item) {
    var hasUrl = item.url && item.url !== "#";
    return '<article class="evidence">' +
      '<div class="evidence-id">' + item.id + '</div>' +
      '<div>' +
        '<div class="quote">"' + item.quote + '"</div>' +
        '<div class="evidence-meta">' + item.source + ' \u00b7 ' + item.author + ' \u00b7 ' + item.age + ' \u00b7 \u25b2 ' + item.score + ' \u00b7 ' + item.replies + ' replies</div>' +
      '</div>' +
      (hasUrl
        ? '<a class="open-link" href="' + item.url + '" target="_blank" rel="noopener">open \u203a</a>'
        : '<span class="open-link disabled">replay</span>') +
    '</article>';
  }).join("");

  document.getElementById("phraseGrid").innerHTML = signal.phrases.map(function(entry) {
    return '<span class="phrase">' + entry[0] + ' <b>' + entry[1] + '</b></span>';
  }).join("");

  document.getElementById("communityBars").innerHTML = signal.spread.map(function(entry) {
    return '<div class="community-row">' +
      '<span>' + entry[0] + '</span>' +
      '<div class="community-track"><div class="community-fill" style="width:' + entry[1] + '%"></div></div>' +
      '<span>' + entry[1] + '%</span>' +
    '</div>';
  }).join("");

  document.getElementById("relatedSignals").innerHTML = signal.related.map(function(entry) {
    var catColor = categories[entry[1]] ? categories[entry[1]].color : "#68717d";
    return '<div class="related-row">' +
      '<i class="dot" style="background:' + catColor + '"></i>' +
      '<span>' + entry[0] + '</span>' +
      '<span>' + entry[2] + ' \u203a</span>' +
    '</div>';
  }).join("");

  document.getElementById("scoreComponents").innerHTML = scoreComponents(signal).map(function(entry) {
    return '<div class="score-row">' +
      '<span class="score-label">' + entry[0] + '</span>' +
      '<div class="score-track"><div class="score-fill" style="width:' + entry[1] + '%"></div></div>' +
      '<span class="score-value">' + entry[1] + '</span>' +
    '</div>';
  }).join("");

  // Evidence layer coverage — based on actual evidence layers present in this signal
  var layerCoverageEl = document.getElementById("layerCoverage");
  if (layerCoverageEl) {
    var coveredLayers = new Set();
    // Check actual evidence source_layer values
    if (signal.evidence) {
      signal.evidence.forEach(function(e) {
        if (e.source_layer) {
          coveredLayers.add(e.source_layer);
        }
      });
    }
    // Also include layers from enabled source nodes
    evidenceLayers.forEach(function(layer) {
      if (activeNodeNamesForLayer(layer.id).length) {
        coveredLayers.add(layer.id);
      }
    });
    layerCoverageEl.innerHTML = evidenceLayers.map(function(layer) {
      var covered = coveredLayers.has(layer.id);
      return '<span class="layer-chip ' + (covered ? "covered" : "missing") + '">' +
        (covered ? "\u2713 " : "\u2013 ") + layer.label +
      '</span>';
    }).join("");
  }

  document.getElementById("suggestTitle").textContent = signal.suggested.title;
  document.getElementById("suggestSub").textContent = signal.suggested.sub + " " + signal.next;
}

function renderAll() {
  renderMetrics();
  renderBubbleChart();
  renderSignalList();
  if (timeline.posts && timeline.posts.length) renderLineChart();
  if (heatmap.length) renderHeatmap();
  renderIntentBars();
  renderControlPlane();
  if (signals.length) renderDetail();
}

// Context switching
var contextSelect = document.getElementById("contextSelect");
if (contextSelect) {
  contextSelect.addEventListener("change", function(event) {
    window.location.href = "/?context=" + encodeURIComponent(event.target.value);
  });
}

// Search filter
document.getElementById("searchInput").addEventListener("input", function(event) {
  var term = event.target.value.trim().toLowerCase();
  var items = document.querySelectorAll(".signal-item");
  items.forEach(function(item) {
    var haystack = item.textContent.toLowerCase();
    item.style.display = haystack.includes(term) ? "grid" : "none";
  });
});

// --- Toast notifications ---

function showToast(message, isError) {
  var container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  var toast = document.createElement("div");
  toast.className = "toast" + (isError ? " toast-error" : "");
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add("toast-visible"); }, 10);
  setTimeout(function() {
    toast.classList.remove("toast-visible");
    setTimeout(function() { toast.remove(); }, 300);
  }, 2400);
}

// --- Save / Dismiss ---

function saveSignal(signalId) {
  fetch("/api/signals/" + encodeURIComponent(signalId) + "/save", { method: "POST" })
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function(data) {
      var s = signals.find(function(sig) { return sig.id === signalId; });
      if (s) s.saved = data.saved;
      showToast(data.saved ? "Signal saved" : "Signal unsaved");
      renderDetail();
    })
    .catch(function() { showToast("Failed to save", true); });
}

function dismissSignal(signalId) {
  fetch("/api/signals/" + encodeURIComponent(signalId) + "/dismiss", { method: "POST" })
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function(data) {
      var s = signals.find(function(sig) { return sig.id === signalId; });
      if (s) s.dismissed = data.dismissed;
      showToast(data.dismissed ? "Signal dismissed" : "Signal restored");
      renderDetail();
    })
    .catch(function() { showToast("Failed to dismiss", true); });
}

// --- New context modal ---

function openNewContextModal() {
  if (document.getElementById("contextModal")) return;
  var overlay = document.createElement("div");
  overlay.id = "contextModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    '<div class="modal">' +
      '<div class="modal-head">' +
        '<h3>New monitoring context</h3>' +
        '<button type="button" class="modal-close" id="modalClose">&times;</button>' +
      '</div>' +
      '<form id="newContextForm">' +
        '<label class="form-label">Label<input type="text" name="label" class="form-input" placeholder="e.g. AI tools for small law firms" required></label>' +
        '<label class="form-label">Description<input type="text" name="description" class="form-input" placeholder="What are you monitoring?"></label>' +
        '<label class="form-label">Subreddits <span class="form-hint">comma-separated</span><input type="text" name="subreddits" class="form-input" placeholder="r/startups, r/SaaS, r/Entrepreneur"></label>' +
        '<label class="form-label">Search queries <span class="form-hint">comma-separated</span><input type="text" name="queries" class="form-input" placeholder="AI research agent, competitor monitoring"></label>' +
        '<label class="form-label">High-intent phrases <span class="form-hint">comma-separated</span><input type="text" name="high_intent" class="form-input" placeholder="alternative to, would pay for"></label>' +
        '<div class="modal-actions">' +
          '<button type="button" class="button" id="modalCancel">Cancel</button>' +
          '<button type="submit" class="button primary">Create context</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  document.getElementById("modalClose").addEventListener("click", close);
  document.getElementById("modalCancel").addEventListener("click", close);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) close(); });

  document.getElementById("newContextForm").addEventListener("submit", function(e) {
    e.preventDefault();
    var form = e.target;
    var splitCsv = function(val) { return val ? val.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : []; };
    var body = {
      label: form.label.value.trim(),
      description: form.description.value.trim(),
      subreddits: splitCsv(form.subreddits.value),
      queries: splitCsv(form.queries.value),
      high_intent: splitCsv(form.high_intent.value),
    };
    fetch("/api/contexts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function(r) { if (!r.ok) return r.json().then(function(d) { throw new Error(d.error); }); return r.json(); })
      .then(function(data) {
        showToast("Context created: " + data.label);
        close();
        window.location.href = "/?context=" + encodeURIComponent(data.id);
      })
      .catch(function(err) { showToast(err.message || "Failed to create context", true); });
  });
}

// Wire refresh button
var btnRefresh = document.getElementById("btnRefresh");
if (btnRefresh) {
  btnRefresh.addEventListener("click", function() {
    if (btnRefresh.disabled) return;
    btnRefresh.disabled = true;
    btnRefresh.textContent = "\u21bb Pulling...";
    showToast("Pulling Reddit data...");

    fetch("/api/ingest/reddit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_id: initialData.contextId }),
    })
      .then(function(r) { if (!r.ok) return r.json().then(function(d) { throw new Error(d.error); }); return r.json(); })
      .then(function(data) {
        showToast(data.evidenceCount + " packets, " + data.signalCount + " signals extracted");
        // Reload the page to show new data
        setTimeout(function() { window.location.reload(); }, 800);
      })
      .catch(function(err) {
        showToast(err.message || "Ingestion failed", true);
        btnRefresh.disabled = false;
        btnRefresh.textContent = "\u21bb Refresh";
      });
  });
}

// Wire new context button
var btnNewContext = document.getElementById("btnNewContext");
if (btnNewContext) {
  btnNewContext.addEventListener("click", function() { openNewContextModal(); });
}

// Wire delete context button
var btnDeleteContext = document.getElementById("btnDeleteContext");
if (btnDeleteContext) {
  btnDeleteContext.addEventListener("click", function() {
    var contextId = initialData.contextId;
    if (!contextId) return;
    if (!confirm("Delete this context and all its signals, evidence, and source nodes?")) return;
    fetch("/api/contexts/" + encodeURIComponent(contextId), { method: "DELETE" })
      .then(function(r) { if (!r.ok) throw new Error("Delete failed"); return r.json(); })
      .then(function() {
        showToast("Context deleted");
        setTimeout(function() { window.location.href = "/"; }, 600);
      })
      .catch(function(err) { showToast(err.message || "Failed to delete context", true); });
  });
}

setupFixtureSelector();
renderAll();
