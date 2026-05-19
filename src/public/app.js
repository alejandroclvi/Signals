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
let pipelineHealth = initialData.pipelineHealth || null;
let enabledNodes = new Set(sourceNodes.filter((node) => node.state === "enabled").map((node) => node.id));
let selectedId = initialData.selectedId || (signals[0] && signals[0].id) || "";
let activeIntentFilter = "all";
let activeInboxTab = "ranked"; // ranked | new | saved
let activeTagFilter = null; // null = all, or "demand", "frustration", etc.

var intentColors = {
  pain: "#de5c56",
  question: "#2d6fbb",
  insight: "#3e9558",
  comparison: "#bd842f",
  promotion: "#9aa3ad"
};

var awarenessColors = {
  unaware: "#9aa3ad",
  problem_aware: "#de5c56",
  solution_aware: "#bd842f",
  product_aware: "#2d6fbb",
  most_aware: "#875fb4"
};

var awarenessLabels = {
  unaware: "Unaware",
  problem_aware: "Problem Aware",
  solution_aware: "Solution Aware",
  product_aware: "Product Aware",
  most_aware: "Most Aware"
};

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

function tagHtml(tag, signalId) {
  const meta = categories[tag];
  return '<span class="tag ' + tag + '" data-facet-tag="' + tag + '"' +
    (signalId ? ' data-facet-signal="' + signalId + '"' : '') +
    '>' + (meta ? meta.label : tag) + '</span>';
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

  // Pipeline health indicator
  var healthEl = document.getElementById("pipelineHealth");
  if (healthEl && pipelineHealth) {
    var gates = pipelineHealth.gates || {};
    var gateHtml = Object.entries(gates).map(function(entry) {
      var name = entry[0];
      var gate = entry[1];
      var color = gate.passed ? "var(--green)" : "var(--red)";
      var icon = gate.passed ? "\u2713" : "\u2717";
      return '<span class="gate-indicator" style="color:' + color + '" title="' + (gate.reason || "") + '">' +
        icon + ' ' + name +
      '</span>';
    }).join("");
    var ago = pipelineHealth.completedAt ? relativeTime(pipelineHealth.completedAt) : "running";
    healthEl.innerHTML =
      '<span class="pipeline-label">Pipeline</span>' +
      '<span class="pipeline-status ' + pipelineHealth.status + '">' + pipelineHealth.status + '</span>' +
      gateHtml +
      '<span class="pipeline-meta">' + (pipelineHealth.evidenceIn || 0) + ' in \u2192 ' + (pipelineHealth.signalsProduced || 0) + ' signals \u00b7 ' + ago + '</span>';
  }
}

function relativeTime(iso) {
  if (!iso) return "";
  var ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "just now";
  if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
  if (ms < 86400000) return Math.round(ms / 3600000) + "h ago";
  return Math.round(ms / 86400000) + "d ago";
}

// --- Interactive Bubble Chart ---
var chartState = { scale: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0 };
var bubblePositions = {}; // signalId → {x, y, r}
var CHART_W = 860, CHART_H = 500, CHART_PAD = 50;

function renderBubbleChart() {
  var svg = document.getElementById("bubbleSvg");
  if (!svg) return;

  svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);

  if (!signals.length) {
    svg.innerHTML = '<text x="' + CHART_W/2 + '" y="' + CHART_H/2 + '" text-anchor="middle" fill="#9aa3ad">No signals to display</text>';
    return;
  }

  // --- Scatter plot: Relevance (X) vs Momentum (Y) ---
  // Use rank-based normalization so signals spread evenly regardless of data skew
  var pad = CHART_PAD;
  var plotW = CHART_W - pad * 2;
  var plotH = CHART_H - pad * 2;

  // Rank-normalize: sort by volume for X, by mentions for Y
  var byVolume = signals.slice().sort(function(a, b) { return (a.volume || 0) - (b.volume || 0); });
  var byMentions = signals.slice().sort(function(a, b) { return (a.mentions || 0) - (b.mentions || 0); });
  var volRank = {}; byVolume.forEach(function(s, i) { volRank[s.id] = i / Math.max(1, byVolume.length - 1); });
  var menRank = {}; byMentions.forEach(function(s, i) { menRank[s.id] = i / Math.max(1, byMentions.length - 1); });

  var positioned = signals.map(function(signal) {
    var xRatio = volRank[signal.id] || 0;
    var yRatio = menRank[signal.id] || 0;
    var x = pad + xRatio * plotW;
    var y = pad + (1 - yRatio) * plotH; // invert Y so high = top
    var r = Math.max(12, Math.min(36, 8 + Math.sqrt(signal.mentions || 1) * 2.5));
    bubblePositions[signal.id] = { x: x, y: y, r: r };
    return { signal: signal, x: x, y: y, r: r };
  });

  var content = '';
  // Background
  content += '<rect x="0" y="0" width="' + CHART_W + '" height="' + CHART_H + '" fill="white"/>';
  // Right half tint (high relevance zone)
  var mx = pad + plotW / 2;
  var my = pad + plotH / 2;
  content += '<rect x="' + mx + '" y="' + pad + '" width="' + (plotW / 2) + '" height="' + (plotH / 2) + '" fill="rgba(249,229,215,.25)"/>';
  // Grid
  content += '<line x1="' + mx + '" y1="' + pad + '" x2="' + mx + '" y2="' + (CHART_H - pad) + '" stroke="#e8eaee" stroke-dasharray="4 3"/>';
  content += '<line x1="' + pad + '" y1="' + my + '" x2="' + (CHART_W - pad) + '" y2="' + my + '" stroke="#e8eaee" stroke-dasharray="4 3"/>';
  // Axes
  content += '<line x1="' + pad + '" y1="' + (CHART_H - pad) + '" x2="' + (CHART_W - pad) + '" y2="' + (CHART_H - pad) + '" stroke="#dfe4ea"/>';
  content += '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (CHART_H - pad) + '" stroke="#dfe4ea"/>';
  // Quadrant labels
  content += '<text x="' + (pad + 6) + '" y="' + (pad + 14) + '" class="quadrant-text">Interesting \u00b7 uncertain</text>';
  content += '<text x="' + (CHART_W - pad - 4) + '" y="' + (pad + 14) + '" text-anchor="end" class="quadrant-text" fill="#c45a54">Urgent signals</text>';
  content += '<text x="' + (pad + 6) + '" y="' + (CHART_H - pad - 6) + '" class="quadrant-text">Ignore / noise</text>';
  content += '<text x="' + (CHART_W - pad - 4) + '" y="' + (CHART_H - pad - 6) + '" text-anchor="end" class="quadrant-text">Watchlist</text>';
  // Axis labels
  content += '<text x="' + (CHART_W / 2) + '" y="' + (CHART_H - 8) + '" text-anchor="middle" class="axis-text">Relevance \u2192</text>';
  content += '<text x="14" y="' + (CHART_H / 2) + '" text-anchor="middle" transform="rotate(-90 14 ' + (CHART_H / 2) + ')" class="axis-text">Momentum \u2192</text>';

  // Bubbles
  positioned.forEach(function(p) {
    var signal = p.signal;
    var tag = (signal.tags && signal.tags[0]) ? signal.tags[0] : "demand";
    var cat = categories[tag] || categories.demand;
    var sel = signal.id === selectedId;

    content += '<g class="bubble' + (sel ? ' selected' : '') + '" data-signal="' + signal.id + '">';
    content += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + p.r + '" fill="' + cat.soft + '" fill-opacity="' + (sel ? '.95' : '.7') + '" stroke="' + cat.color + '" stroke-width="' + (sel ? '2.5' : '1') + '"/>';
    // Rank inside bubble
    content += '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" class="bubble-rank">' + signal.rank + '</text>';
    // Label — only for top 5 or selected, hidden by default on others (show on hover via CSS)
    var label = signal.title.replace(/^r\//, "").split(":")[0];
    if (label.length > 18) label = label.slice(0, 16) + "\u2026";
    var labelClass = (sel || signal.rank <= 5) ? "bubble-label" : "bubble-label bubble-label-hover";
    content += '<text x="' + p.x + '" y="' + (p.y - p.r - 4) + '" text-anchor="middle" class="' + labelClass + '">' + label + '</text>';
    content += '</g>';
  });

  svg.innerHTML = '<g id="chartGroup" transform="translate(' + chartState.panX + ',' + chartState.panY + ') scale(' + chartState.scale + ')">' + content + '</g>';

  // Summary
  var summaryEl = document.getElementById("topicSummary");
  if (summaryEl) summaryEl.textContent = signals.length + " signals detected";
  var rankedEl = document.getElementById("rankedCount");
  if (rankedEl) rankedEl.textContent = signals.length;
  var savedEl = document.getElementById("savedCount");
  if (savedEl) savedEl.textContent = signals.filter(function(s) { return s.saved; }).length;

  // Click handlers on bubbles
  svg.querySelectorAll(".bubble").forEach(function(g) {
    g.addEventListener("click", function(e) {
      e.stopPropagation();
      selectedId = g.dataset.signal;
      renderAll();
      scrollInboxToSignal(selectedId);
    });
  });

  setupChartInteractions(svg);
}

function focusBubble(signalId) {
  var pos = bubblePositions[signalId];
  if (!pos) return;
  var svg = document.getElementById("bubbleSvg");
  if (!svg) return;
  var rect = svg.getBoundingClientRect();
  var svgW = rect.width || CHART_W;
  var svgH = rect.height || CHART_H;
  // Scale so the bubble is prominent
  var targetScale = 1.8;
  // Center the bubble in the viewport
  var scaleRatio = svgW / CHART_W;
  chartState.scale = targetScale;
  chartState.panX = (svgW / 2) / scaleRatio - pos.x * targetScale;
  chartState.panY = (svgH / 2) / scaleRatio - pos.y * targetScale;
  var group = document.getElementById("chartGroup");
  if (group) group.setAttribute("transform", "translate(" + chartState.panX + "," + chartState.panY + ") scale(" + chartState.scale + ")");
}

function scrollInboxToSignal(signalId) {
  var card = document.querySelector('.signal-item[data-signal="' + signalId + '"]');
  if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

var _chartInteractionsSet = false;
function setupChartInteractions(svg) {
  if (_chartInteractionsSet) return;
  _chartInteractionsSet = true;

  // Zoom — clamped between 0.8x and 3x
  svg.addEventListener("wheel", function(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.92 : 1.08;
    var newScale = Math.max(0.8, Math.min(3, chartState.scale * delta));
    var svgRect = svg.getBoundingClientRect();
    var mx = (e.clientX - svgRect.left) * (CHART_W / svgRect.width);
    var my = (e.clientY - svgRect.top) * (CHART_H / svgRect.height);
    chartState.panX = mx - (mx - chartState.panX) * (newScale / chartState.scale);
    chartState.panY = my - (my - chartState.panY) * (newScale / chartState.scale);
    chartState.scale = newScale;
    var group = document.getElementById("chartGroup");
    if (group) group.setAttribute("transform", "translate(" + chartState.panX + "," + chartState.panY + ") scale(" + chartState.scale + ")");
  }, { passive: false });

  // Pan
  svg.addEventListener("mousedown", function(e) {
    if (e.target.closest(".bubble")) return;
    chartState.dragging = true;
    chartState.lastX = e.clientX;
    chartState.lastY = e.clientY;
    svg.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", function(e) {
    if (!chartState.dragging) return;
    var svgRect = svg.getBoundingClientRect();
    chartState.panX += (e.clientX - chartState.lastX) * (CHART_W / svgRect.width);
    chartState.panY += (e.clientY - chartState.lastY) * (CHART_H / svgRect.height);
    chartState.lastX = e.clientX;
    chartState.lastY = e.clientY;
    var group = document.getElementById("chartGroup");
    if (group) group.setAttribute("transform", "translate(" + chartState.panX + "," + chartState.panY + ") scale(" + chartState.scale + ")");
  });
  window.addEventListener("mouseup", function() {
    chartState.dragging = false;
    svg.style.cursor = "grab";
  });

  // Double-click to reset view
  svg.addEventListener("dblclick", function() {
    chartState.scale = 1;
    chartState.panX = 0;
    chartState.panY = 0;
    var group = document.getElementById("chartGroup");
    if (group) group.setAttribute("transform", "translate(0,0) scale(1)");
  });

  svg.style.cursor = "grab";
}

function renderSignalList() {
  var list = document.getElementById("signalList");

  // Tab filter
  var tabFiltered = signals;
  if (activeInboxTab === "saved") {
    tabFiltered = signals.filter(function(s) { return s.saved; });
  } else if (activeInboxTab === "new") {
    tabFiltered = signals.filter(function(s) { return !s.dismissed && !s.saved; });
  }

  // State filter
  var filtered = activeIntentFilter === "all"
    ? tabFiltered
    : tabFiltered.filter(function(s) { return s.dominant_state === activeIntentFilter; });

  // Sort matching tag signals to the top when a legend filter is active
  if (activeTagFilter) {
    filtered = filtered.slice().sort(function(a, b) {
      var aMatch = (a.tags && a.tags.indexOf(activeTagFilter) !== -1) ? 0 : 1;
      var bMatch = (b.tags && b.tags.indexOf(activeTagFilter) !== -1) ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  var stateDisplayColors = { experiencing_pain:"#de5c56", tried_failed:"#c0392b", seeking:"#2d6fbb", found_what_works:"#3e9558", warning:"#e67e22", sharing_insight:"#875fb4", comparing:"#bd842f", promoting:"#9aa3ad" };
  var stateDisplayLabels = { experiencing_pain:"Pain", tried_failed:"Tried & failed", seeking:"Seeking", found_what_works:"What works", warning:"Warning", sharing_insight:"Insight", comparing:"Comparing", promoting:"Promo" };

  list.innerHTML = filtered.map(function(signal) {
    var state = signal.dominant_state || "sharing_insight";
    var stColor = stateDisplayColors[state] || "#9aa3ad";
    var stLabel = stateDisplayLabels[state] || state;
    var evidenceCount = signal.mentions || 0;
    return '<article class="signal-item ' + (signal.id === selectedId ? "selected" : "") + '" data-signal="' + signal.id + '">' +
      '<div class="signal-top">' +
        '<span><span class="rank">#' + String(signal.rank).padStart(2, "0") + '</span> <span class="signal-state">' + signal.status + '</span></span>' +
        '<span class="state-badge" style="color:' + stColor + ';border-color:' + stColor + '30">' + stLabel + '</span>' +
        '<span class="evidence-count-badge">' + evidenceCount + ' posts</span>' +
      '</div>' +
      '<div class="signal-title">' + signal.title + '</div>' +
      '<div class="tags">' + signal.tags.map(function(t) { return tagHtml(t, signal.id); }).join("") + '</div>' +
      '<div class="signal-summary">' + signalSummaryText(signal) + '</div>' +
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
      focusBubble(selectedId);
    });
  });

  // Update state filter counts
  var stateFilterLabels = { all:"All", experiencing_pain:"Pain", tried_failed:"Failed", seeking:"Seeking", found_what_works:"Works", warning:"Warning", sharing_insight:"Insight", comparing:"Compare", promoting:"Promo" };
  var filterEl = document.getElementById("intentFilters");
  if (filterEl) {
    filterEl.querySelectorAll(".intent-btn").forEach(function(btn) {
      var stateValue = btn.dataset.intent;
      var count = stateValue === "all" ? tabFiltered.length : tabFiltered.filter(function(s) { return s.dominant_state === stateValue; }).length;
      var label = stateFilterLabels[stateValue] || stateValue;
      btn.textContent = label + (count ? " " + count : "");
      btn.className = "intent-btn" + (stateValue === activeIntentFilter ? " active" : "");
    });
  }

  // Update inbox tab counts + active state
  var tabs = document.querySelectorAll(".inbox-tab");
  var tabCounts = {
    ranked: signals.length,
    new: signals.filter(function(s) { return !s.dismissed && !s.saved; }).length,
    saved: signals.filter(function(s) { return s.saved; }).length,
  };
  var tabLabels = { ranked: "Ranked", new: "New", saved: "Saved" };
  var tabKeys = ["ranked", "new", "saved"];
  tabs.forEach(function(tab, i) {
    var key = tabKeys[i];
    if (!key) return;
    tab.querySelector(".tab-count").textContent = tabCounts[key];
    tab.className = "inbox-tab" + (activeInboxTab === key ? " active" : "");
  });
}

function renderLineChart() {
  var svg = document.getElementById("timelineSvg");
  if (!svg) return;
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
  if (!svg) return;
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
  if (!root) return;
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
  document.getElementById("coverageCaption").textContent = activeLayers.length + "/" + evidenceLayers.length + " layers active in this context";

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

/**
 * Hide a detail-pane section (and its preceding <div class="section-label">)
 * when its content is empty. Operator goal: no wasted UI real estate on
 * sections we have nothing to show for. Re-shows on subsequent renders when
 * data returns.
 *
 *   hideSectionIfEmpty("phraseGrid")
 *   hideSectionIfEmpty("layerCoverage", { test: function(el) { return el.querySelector(".covered"); } })
 */
function hideSectionIfEmpty(elIdOrEl, options) {
  options = options || {};
  var el = typeof elIdOrEl === "string" ? document.getElementById(elIdOrEl) : elIdOrEl;
  if (!el) return;

  var hasContent;
  if (typeof options.test === "function") {
    hasContent = !!options.test(el);
  } else {
    var text = (el.textContent || "").trim();
    var children = el.children.length;
    hasContent = !!text || children > 0;
  }

  // Walk back to find the preceding .section-label sibling that titles us.
  var label = el.previousElementSibling;
  while (label && !label.classList.contains("section-label")) {
    label = label.previousElementSibling;
  }

  el.style.display = hasContent ? "" : "none";
  if (label) label.style.display = hasContent ? "" : "none";
}

function renderDetail() {
  var signal = selectedSignal();
  if (!signal) return;
  try {
  document.getElementById("detailKicker").innerHTML = 'SIGNAL DETAIL \u00b7 first detected Mar 28 2026 \u00b7 <span style="color:var(--green);font-family:inherit;font-weight:760">' + signal.status + '</span>';
  document.getElementById("detailTitle").textContent = signal.title;
  document.getElementById("detailTags").innerHTML = signal.tags.map(function(t) { return tagHtml(t, signal.id); }).join("") + ' <span class="confidence"><span class="bars"><i></i><i></i><i style="opacity:' + (signal.confidence === "High" ? "1" : ".32") + '"></i></span>' + signal.confidence + ' confidence</span>';

  // Wire detail action buttons
  var actionsContainer = document.querySelector(".detail-actions");
  if (actionsContainer) {
    actionsContainer.innerHTML =
      '<button class="button' + (signal.saved ? " active" : "") + '" type="button" id="btnSave">' + (signal.saved ? "\u2611 Saved" : "\u2610 Save") + '</button>' +
      '<button class="button' + (signal.dismissed ? " active" : "") + '" type="button" id="btnDismiss">' + (signal.dismissed ? "\u2612 Dismissed" : "\u2612 Dismiss") + '</button>' +
      '<button class="button' + (signal.alerted ? " active" : "") + '" type="button" id="btnAlert">' + (signal.alerted ? "\u26a1 Alerted" : "\u26a1 Alert") + '</button>';
    document.getElementById("btnSave").addEventListener("click", function() { saveSignal(signal.id); });
    document.getElementById("btnDismiss").addEventListener("click", function() { dismissSignal(signal.id); });
    document.getElementById("btnAlert").addEventListener("click", function() { alertSignal(signal.id); });

    // Analyze button — triggers thread intelligence
    var analyzeBtn = document.getElementById("btnAnalyze");
    if (analyzeBtn) {
      var hasIntel = signal.intelligence && signal.intelligence.count > 0;
      analyzeBtn.textContent = hasIntel ? "\u2699 Re-analyze" : "\u2699 Analyze";
      analyzeBtn.addEventListener("click", function() {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = "\u2699 Analyzing...";
        fetch("/api/signals/" + encodeURIComponent(signal.id) + "/analyze", { method: "POST" })
          .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function(data) {
            analyzeBtn.textContent = "\u2699 Done (" + data.analyzed + " threads)";
          })
          .catch(function() {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = "\u2699 Analyze";
            showToast("Analysis failed", true);
          });
      });
    }
  }
  document.getElementById("momentumText").textContent = signal.growth + " vs 14-day rolling baseline";
  document.getElementById("drivenBy").textContent = (signal.volume / 100).toFixed(1) + "x post volume \u00b7 " + signal.communities.length + " communities";
  document.getElementById("whyBox").innerHTML = signalWhyText(signal);
  document.getElementById("detailSpark").innerHTML = '<polyline points="' + linePoints([3, 4, 4, 5, 6, 8, 11, 15, 22], 120, 28, 2) + '" fill="none" stroke="#3e9558" stroke-width="1.7"></polyline>';

  // Group evidence into threads
  try {
  var threads = {};
  var orphans = [];
  signal.evidence.forEach(function(item) {
    if (item.thread_id) {
      if (!threads[item.thread_id]) threads[item.thread_id] = [];
      threads[item.thread_id].push(item);
    } else {
      orphans.push(item);
    }
  });

  // Sort each thread: post first, then comments by score
  Object.values(threads).forEach(function(items) {
    items.sort(function(a, b) {
      if (!a.isComment && b.isComment) return -1;
      if (a.isComment && !b.isComment) return 1;
      return b.score - a.score;
    });
  });

  // Sort threads by top post score
  var sortedThreadIds = Object.keys(threads).sort(function(a, b) {
    return (threads[b][0].score || 0) - (threads[a][0].score || 0);
  });

  var stateColorsMap = { experiencing_pain:"#de5c56", tried_failed:"#c0392b", seeking:"#2d6fbb", found_what_works:"#3e9558", warning:"#e67e22", sharing_insight:"#875fb4", comparing:"#bd842f", promoting:"#9aa3ad" };
  var stateLabelsMap = { experiencing_pain:"Pain", tried_failed:"Tried & failed", seeking:"Seeking", found_what_works:"Works", warning:"Warning", sharing_insight:"Insight", comparing:"Comparing", promoting:"Promo" };

  var evHtml = "";
  for (var ti = 0; ti < sortedThreadIds.length; ti++) {
    var threadItems = threads[sortedThreadIds[ti]];
    var post = threadItems[0];
    var comments = threadItems.slice(1);
    var hasUrl = post.url && post.url !== "#";
    var postBorderColor = stateColorsMap[post.evidence_state || "sharing_insight"] || "#875fb4";

    evHtml += '<div class="ev-thread">';
    // Root post
    evHtml += '<div class="ev-root">';
    evHtml += '<div class="ev-branch-root"></div>';
    evHtml += '<div class="ev-node" data-ev-id="' + escapeAttr(post.id) + '" style="border-left: 3px solid ' + postBorderColor + '; cursor:pointer">';
    evHtml += '<div class="ev-node-head">';
    var postState = post.evidence_state || "sharing_insight";
    var postStateColor = stateColorsMap[postState] || "#9aa3ad";
    var postStateExcerpt = extractStateExcerpt(post.quote, postState);
    evHtml += '<span class="ev-score">\u25b2 ' + post.score + '</span>';
    evHtml += '<span class="ev-chip evidence-chip" style="background:' + postStateColor + '18;color:' + postStateColor + ';border:1px solid ' + postStateColor + '30" data-chip-excerpt="' + escapeAttr(postStateExcerpt) + '">' + (stateLabelsMap[postState] || postState) + '</span>';
    evHtml += '<span class="ev-author">' + escapeHtml(post.author) + '</span>';
    if (comments.length > 0) evHtml += '<span class="ev-comment-count">' + comments.length + ' replies</span>';
    if (hasUrl) evHtml += '<a class="ev-link" href="' + post.url + '" target="_blank" rel="noopener">source \u203a</a>';
    evHtml += '</div>';
    if (post.title && !post.isComment) evHtml += '<div class="ev-title">' + (hasUrl ? '<a href="' + post.url + '" target="_blank" rel="noopener">' + escapeHtml(post.title) + '</a>' : escapeHtml(post.title)) + '</div>';
    evHtml += '<div class="ev-body">' + escapeHtml(post.quote.slice(0, 300)) + (post.quote.length > 300 ? '...' : '') + '</div>';
    evHtml += '</div></div>';

    // Thread-level AI insight banner
    var topInsight = "";
    if (signal.intelligence && signal.intelligence.threads) {
      for (var ii0 = 0; ii0 < signal.intelligence.threads.length; ii0++) {
        if (signal.intelligence.threads[ii0].threadId === threadKey && signal.intelligence.threads[ii0].keyInsight) {
          topInsight = signal.intelligence.threads[ii0].keyInsight;
          break;
        }
      }
    }
    if (topInsight) {
      evHtml += '<div class="thread-insight-banner"><span class="thread-insight-icon">&#9672;</span><span class="thread-insight-text">' + escapeHtml(topInsight) + '</span></div>';
    }

    // Comments — show first 2 + last, collapse middle with AI summary
    var showFirst = 2;
    var collapsed = comments.length > 3;
    var visibleComments = collapsed
      ? [].concat(comments.slice(0, showFirst), [comments[comments.length - 1]])
      : comments;
    var hiddenCount = collapsed ? comments.length - 3 : 0;
    var threadKey = sortedThreadIds[ti];

    // Get AI insight for this thread if available
    var threadInsight = "";
    if (signal.intelligence && signal.intelligence.threads) {
      for (var ii = 0; ii < signal.intelligence.threads.length; ii++) {
        var ti2 = signal.intelligence.threads[ii];
        if (ti2.threadId === threadKey && ti2.keyInsight) {
          threadInsight = ti2.keyInsight;
          break;
        }
      }
    }

    for (var ci = 0; ci < visibleComments.length; ci++) {
      var c = visibleComments[ci];
      var cUrl = c.url && c.url !== "#";
      var cBorderColor = stateColorsMap[c.evidence_state || "sharing_insight"] || "#875fb4";
      var isActuallyLast = (ci === visibleComments.length - 1) && (!collapsed);
      var isLastVisible = ci === visibleComments.length - 1;

      // Insert collapsed summary after first 2 comments
      if (collapsed && ci === showFirst) {
        evHtml += '<div class="ev-collapsed" data-thread-expand="' + escapeAttr(threadKey) + '">';
        evHtml += '<div class="ev-branch"><div class="ev-branch-line"></div><div class="ev-branch-arm" style="border-style:dashed"></div></div>';
        evHtml += '<div class="ev-collapsed-body">';
        if (threadInsight) {
          evHtml += '<div class="ev-collapsed-insight">' + escapeHtml(threadInsight) + '</div>';
        }
        evHtml += '<button class="ev-expand-btn" data-thread-expand="' + escapeAttr(threadKey) + '">' + hiddenCount + ' more replies \u2014 click to expand</button>';
        evHtml += '</div></div>';
      }

      evHtml += '<div class="ev-comment' + (collapsed && ci === visibleComments.length - 1 ? ' ev-last-peek' : '') + '">';
      evHtml += '<div class="ev-branch ' + (isLastVisible ? 'ev-branch-last' : '') + '"><div class="ev-branch-line"></div><div class="ev-branch-arm"></div></div>';
      evHtml += '<div class="ev-node ev-node-comment" data-ev-id="' + escapeAttr(c.id) + '" style="border-left: 2px solid ' + cBorderColor + '; cursor:pointer">';
      evHtml += '<div class="ev-node-head">';
      var cState = c.evidence_state || "sharing_insight";
      var cStateColor = stateColorsMap[cState] || "#9aa3ad";
      var cStateExcerpt = extractStateExcerpt(c.quote, cState);
      evHtml += '<span class="ev-score">\u25b2 ' + c.score + '</span>';
      evHtml += '<span class="ev-chip evidence-chip" style="background:' + cStateColor + '18;color:' + cStateColor + ';font-size:10px;border:1px solid ' + cStateColor + '30" data-chip-excerpt="' + escapeAttr(cStateExcerpt) + '">' + (stateLabelsMap[cState] || cState) + '</span>';
      evHtml += '<span class="ev-author">' + escapeHtml(c.author) + '</span>';
      if (cUrl) evHtml += '<a class="ev-link" href="' + c.url + '" target="_blank" rel="noopener">\u203a</a>';
      evHtml += '</div>';
      evHtml += '<div class="ev-body">' + escapeHtml(c.quote.slice(0, 200)) + (c.quote.length > 200 ? '...' : '') + '</div>';
      evHtml += '</div></div>';
    }

    // Store full comments data for expansion
    if (collapsed) {
      evHtml += '<div class="ev-hidden-comments" data-thread-hidden="' + escapeAttr(threadKey) + '" style="display:none">';
      for (var hi = showFirst; hi < comments.length - 1; hi++) {
        var h = comments[hi];
        var hUrl = h.url && h.url !== "#";
        var hBorderColor = stateColorsMap[h.evidence_state || "sharing_insight"] || "#875fb4";
        var hState = h.evidence_state || "sharing_insight";
        var hStateColor = stateColorsMap[hState] || "#9aa3ad";
        var hExcerpt = extractStateExcerpt(h.quote, hState);
        evHtml += '<div class="ev-comment">';
        evHtml += '<div class="ev-branch"><div class="ev-branch-line"></div><div class="ev-branch-arm"></div></div>';
        evHtml += '<div class="ev-node ev-node-comment" data-ev-id="' + escapeAttr(h.id) + '" style="border-left: 2px solid ' + hBorderColor + '; cursor:pointer">';
        evHtml += '<div class="ev-node-head">';
        evHtml += '<span class="ev-score">\u25b2 ' + h.score + '</span>';
        evHtml += '<span class="ev-chip evidence-chip" style="background:' + hStateColor + '18;color:' + hStateColor + ';font-size:10px;border:1px solid ' + hStateColor + '30" data-chip-excerpt="' + escapeAttr(hExcerpt) + '">' + (stateLabelsMap[hState] || hState) + '</span>';
        evHtml += '<span class="ev-author">' + escapeHtml(h.author) + '</span>';
        if (hUrl) evHtml += '<a class="ev-link" href="' + h.url + '" target="_blank" rel="noopener">\u203a</a>';
        evHtml += '</div>';
        evHtml += '<div class="ev-body">' + escapeHtml(h.quote.slice(0, 200)) + (h.quote.length > 200 ? '...' : '') + '</div>';
        evHtml += '</div></div>';
      }
      evHtml += '</div>';
    }

    evHtml += '</div>';
  }

  // Orphan evidence (no thread)
  for (var oi = 0; oi < orphans.length; oi++) {
    var o = orphans[oi];
    var oUrl = o.url && o.url !== "#";
    evHtml += '<article class="evidence" data-ev-id="' + escapeAttr(o.id) + '" style="cursor:pointer">' +
      '<div class="evidence-id">' + (o.isComment ? 'comm' : 'post') + '</div>' +
      '<div>' +
        '<div class="quote">"' + escapeHtml(o.quote.slice(0, 200)) + '"</div>' +
        '<div class="evidence-meta">' + escapeHtml(o.source) + ' \u00b7 ' + escapeHtml(o.author) + ' \u00b7 ' + o.age + ' \u00b7 \u25b2 ' + o.score + '</div>' +
      '</div>' +
      (oUrl ? '<a class="open-link" href="' + o.url + '" target="_blank" rel="noopener">open \u203a</a>' : '<span class="open-link disabled">replay</span>') +
    '</article>';
  }

  document.getElementById("evidenceList").innerHTML = evHtml;
  hideSectionIfEmpty("evidenceList");

  // Wire evidence click-through to drilldown drawer. Skip clicks on links and
  // expand buttons so they retain their existing behavior.
  document.querySelectorAll('#evidenceList [data-ev-id]').forEach(function(node) {
    node.addEventListener('click', function(e) {
      if (e.target.closest('a, .ev-expand-btn, [data-thread-expand]')) return;
      var id = node.getAttribute('data-ev-id');
      if (id) openEvidenceDrawer(id);
    });
  });

  // Wire expand buttons
  document.querySelectorAll(".ev-expand-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var threadKey = btn.dataset.threadExpand;
      var hidden = document.querySelector('[data-thread-hidden="' + threadKey + '"]');
      var collapsed = btn.closest(".ev-collapsed");
      if (hidden && collapsed) {
        // Insert hidden comments before the last comment
        var lastPeek = collapsed.parentElement.querySelector(".ev-last-peek");
        if (lastPeek) {
          hidden.style.display = "";
          lastPeek.parentElement.insertBefore(hidden, lastPeek);
          // Unwrap the container — move children out
          while (hidden.firstChild) {
            hidden.parentElement.insertBefore(hidden.firstChild, hidden);
          }
          hidden.remove();
        }
        collapsed.remove();
      }
    });
  });

  } catch(err) {
    console.error("Evidence render error:", err);
    document.getElementById("evidenceList").innerHTML = '<div style="color:red;padding:12px">Error rendering evidence: ' + err.message + '</div>';
  }

  // Evidence state distribution bar (replaces intent + awareness + sentiment)
  var stateEl = document.getElementById("stateComposition");
  if (stateEl) {
    var stateDist = signal.state_distribution || {};
    var stateTotal = Object.values(stateDist).reduce(function(s, v) { return s + v; }, 0) || 1;
    var stateColors = {
      experiencing_pain: "#de5c56",
      tried_failed: "#c0392b",
      seeking: "#2d6fbb",
      found_what_works: "#3e9558",
      warning: "#e67e22",
      sharing_insight: "#875fb4",
      comparing: "#bd842f",
      promoting: "#9aa3ad",
    };
    var stateLabels = {
      experiencing_pain: "Experiencing pain",
      tried_failed: "Tried & failed",
      seeking: "Seeking solution",
      found_what_works: "Found what works",
      warning: "Warning others",
      sharing_insight: "Sharing insight",
      comparing: "Comparing",
      promoting: "Promoting",
    };
    var stateOrder = ["experiencing_pain", "tried_failed", "warning", "seeking", "comparing", "found_what_works", "sharing_insight", "promoting"];
    var stEntries = stateOrder.filter(function(k) { return stateDist[k]; }).map(function(k) { return [k, stateDist[k]]; });
    if (stEntries.length) {
      var stBarParts = stEntries.map(function(entry) {
        var pct = Math.round(entry[1] / stateTotal * 100);
        var color = stateColors[entry[0]] || "#9aa3ad";
        return '<div class="intent-bar-seg" style="width:' + pct + '%;background:' + color + '" title="' + (stateLabels[entry[0]] || entry[0]) + ': ' + pct + '%"></div>';
      }).join("");
      var stLabels = stEntries.map(function(entry) {
        var pct = Math.round(entry[1] / stateTotal * 100);
        var color = stateColors[entry[0]] || "#9aa3ad";
        return '<span class="intent-label"><i class="dot" style="background:' + color + '"></i>' + (stateLabels[entry[0]] || entry[0]) + ' ' + pct + '%</span>';
      }).join("");
      stateEl.innerHTML = '<div class="intent-bar">' + stBarParts + '</div><div class="intent-labels">' + stLabels + '</div>';
    } else {
      stateEl.innerHTML = '<span class="faint">No evidence data</span>';
    }
  }

  // Thread intelligence — LLM-analyzed thread insights
  var tiEl = document.getElementById("threadIntelligence");
  if (tiEl) {
    var intel = signal.intelligence;
    if (intel && intel.threads && intel.threads.length > 0) {
      var tiHtml = '<div class="ti-summary">' + intel.count + ' thread' + (intel.count > 1 ? 's' : '') + ' analyzed</div>';
      tiHtml += intel.threads.map(function(t) {
        var qualityColor = { high: "var(--green)", medium: "var(--gold)", low: "var(--muted)" }[t.quality] || "var(--muted)";

        // Hover tooltip content
        var tooltipParts = [];
        if (t.arc) tooltipParts.push(t.arc);
        if (t.painLanguage && t.painLanguage.length > 0) {
          tooltipParts.push("Pain: \"" + t.painLanguage[0].quote.slice(0, 80) + "\"");
        }
        if (t.avatarClues && t.avatarClues.length > 0) {
          tooltipParts.push("Avatar: " + t.avatarClues[0].clue);
        }
        var tooltip = tooltipParts.join("\n");

        // NXY pills
        var nxyHtml = (t.notXItsY || []).map(function(n) {
          return '<span class="ti-nxy" title="' + escapeAttr(n.surface) + ' \u2192 ' + escapeAttr(n.deeper) + '">' +
            '\u201c' + truncate(n.surface, 25) + '\u201d \u2192 \u201c' + truncate(n.deeper, 25) + '\u201d</span>';
        }).join("");

        // Failed solution pills
        var fsHtml = (t.failedSolutions || []).map(function(f) {
          var vColor = f.verdict === "worked" ? "var(--green)" : f.verdict === "mixed" ? "var(--gold)" : "var(--red)";
          return '<span class="ti-failed" style="border-color:' + vColor + '" title="' + escapeAttr(f.reason || "") + '">' +
            f.name + '</span>';
        }).join("");

        var hasUrl = t.url && t.url !== "#";

        return '<div class="ti-thread" title="' + escapeAttr(tooltip) + '">' +
          '<div class="ti-thread-head">' +
            '<span class="ti-quality" style="color:' + qualityColor + '">\u25CF</span>' +
            '<span class="ti-title">' + truncate(t.title || "Thread", 50) + '</span>' +
            (hasUrl ? '<a class="ti-link" href="' + t.url + '" target="_blank">\u203a</a>' : '') +
          '</div>' +
          (t.keyInsight ? '<div class="ti-insight">' + t.keyInsight + '</div>' : '') +
          (nxyHtml ? '<div class="ti-nxy-row">' + nxyHtml + '</div>' : '') +
          (fsHtml ? '<div class="ti-failed-row">' + fsHtml + '</div>' : '') +
        '</div>';
      }).join("");
      tiEl.innerHTML = tiHtml;
    } else {
      tiEl.innerHTML = "";
    }
    hideSectionIfEmpty(tiEl);
  }

  // Deep extractions — "Not X, it's Y" and failed solutions
  var extractionsEl = document.getElementById("deepExtractions");
  if (extractionsEl) {
    var topEx = signal.top_extractions || [];
    var failedSols = signal.failed_solutions || [];
    var html = "";

    if (topEx.length) {
      html += topEx.map(function(ext) {
        var typeLabel = { not_x_its_y: "Not X, it's Y", failed_solution: "Failed solution", problem_language: "Problem language", identity_statement: "Identity" }[ext.type] || ext.type;
        var typeColor = { not_x_its_y: "var(--purple)", failed_solution: "var(--red)", problem_language: "var(--gold)", identity_statement: "var(--teal)" }[ext.type] || "var(--muted)";
        var surfaceHtml = ext.surface ? '<div class="extraction-surface">"' + ext.surface + '"</div>' : '';
        var deeperHtml = ext.deeper ? '<div class="extraction-deeper">"' + ext.deeper + '"</div>' : '';
        return '<div class="extraction-card">' +
          '<div class="extraction-type" style="color:' + typeColor + '">' + typeLabel + (ext.upvotes ? ' \u00b7 \u25b2' + ext.upvotes : '') + '</div>' +
          surfaceHtml + deeperHtml +
        '</div>';
      }).join("");
    }

    if (failedSols.length) {
      html += '<div class="failed-solutions-header">Failed solutions</div>';
      html += failedSols.map(function(sol) {
        return '<div class="failed-solution-row">' +
          '<span class="failed-name">' + sol.name + '</span>' +
          '<span class="failed-meta">' + sol.count + 'x \u00b7 \u25b2' + sol.validation + '</span>' +
          (sol.top_reason ? '<div class="failed-reason">' + sol.top_reason + '</div>' : '') +
        '</div>';
      }).join("");
    }

    extractionsEl.innerHTML = html || "";
    hideSectionIfEmpty(extractionsEl);
  }

  // Vocabulary — categorized language from evidence
  var vocabEl = document.getElementById("vocabularySection");
  if (vocabEl) {
    var vocab = signal.vocabulary;
    if (vocab && Object.keys(vocab).length > 0) {
      var vocabCategoryMeta = {
        pain: { label: "Pain language", color: "#de5c56", icon: "\uD83D\uDD25" },
        desire: { label: "What they want", color: "#3e9558", icon: "\u2728" },
        moment: { label: "When it hits", color: "#2d6fbb", icon: "\u23F0" },
        identity: { label: "Who they are", color: "#875fb4", icon: "\uD83D\uDC64" },
        temperature: { label: "Intensity", color: "#bd842f", icon: "\uD83C\uDF21" },
        metaphor: { label: "How they frame it", color: "#1b918d", icon: "\uD83D\uDDE3" },
        solution: { label: "Tools mentioned", color: "#68717d", icon: "\uD83D\uDEE0" },
      };
      var order = ["pain", "desire", "moment", "identity", "solution", "temperature", "metaphor"];
      var vhtml = "";
      for (var vi = 0; vi < order.length; vi++) {
        var cat = order[vi];
        var items = vocab[cat];
        if (!items || items.length === 0) continue;
        var meta = vocabCategoryMeta[cat] || { label: cat, color: "#68717d", icon: "" };
        vhtml += '<div class="vocab-category">';
        vhtml += '<div class="vocab-cat-label" style="color:' + meta.color + '">' + meta.icon + ' ' + meta.label + '</div>';
        vhtml += '<div class="vocab-pills">';
        for (var vj = 0; vj < Math.min(items.length, 6); vj++) {
          var item = items[vj];
          var hasUrl = item.url && item.url !== "#";
          var title = item.quote ? item.quote.slice(0, 100) : "";
          vhtml += '<span class="vocab-pill" style="border-color:' + meta.color + '20; background:' + meta.color + '08" title="' + escapeAttr(title) + '">';
          if (hasUrl) vhtml += '<a href="' + item.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">';
          vhtml += escapeHtml(item.phrase);
          if (item.upvotes > 0) vhtml += ' <span class="vocab-score">\u25b2' + item.upvotes + '</span>';
          if (hasUrl) vhtml += '</a>';
          vhtml += '</span>';
        }
        vhtml += '</div></div>';
      }
      vocabEl.innerHTML = vhtml;
    } else {
      vocabEl.innerHTML = "";
    }
    hideSectionIfEmpty(vocabEl);
  }

  document.getElementById("phraseGrid").innerHTML = signal.phrases.map(function(entry) {
    return '<span class="phrase">' + entry[0] + ' <b>' + entry[1] + '</b></span>';
  }).join("");
  hideSectionIfEmpty("phraseGrid");

  document.getElementById("communityBars").innerHTML = signal.spread.map(function(entry) {
    return '<div class="community-row">' +
      '<span>' + entry[0] + '</span>' +
      '<div class="community-track"><div class="community-fill" style="width:' + entry[1] + '%"></div></div>' +
      '<span>' + entry[1] + '%</span>' +
    '</div>';
  }).join("");
  hideSectionIfEmpty("communityBars");

  document.getElementById("relatedSignals").innerHTML = signal.related.map(function(entry) {
    var catColor = categories[entry[1]] ? categories[entry[1]].color : "#68717d";
    return '<div class="related-row">' +
      '<i class="dot" style="background:' + catColor + '"></i>' +
      '<span>' + entry[0] + '</span>' +
      '<span>' + entry[2] + ' \u203a</span>' +
    '</div>';
  }).join("");
  hideSectionIfEmpty("relatedSignals");

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

  // Intelligence chain — async fetch and render
  renderIntelligenceChain(signal.id);

  // Drilldown payload: lifecycle, cases, unified signals, cross-layer coverage.
  // Same fetch hydrates several panels so the operator sees the whole chain
  // without N parallel requests.
  renderChainFull(signal.id);
  } catch(err) { console.error("renderDetail error:", err); }
}

// --- Age / freshness helpers --------------------------------------------
// Every evidence / fact / link in the UI shows an age chip computed from
// the source date (published_at, created_at, last_seen_at, …). The color
// tier tells the operator how fresh the signal is at a glance:
//   fresh ≤7d   warm ≤30d   stale ≤90d   cold >90d   unknown (no date)
function freshnessTier(days) {
  if (days == null) return "unknown";
  if (days <= 7) return "fresh";
  if (days <= 30) return "warm";
  if (days <= 90) return "stale";
  return "cold";
}
function daysSince(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}
function formatAge(iso) {
  var d = daysSince(iso);
  if (d == null) return "—";
  if (d === 0) return "today";
  if (d === 1) return "1d";
  if (d < 7)   return d + "d";
  if (d < 30)  return Math.round(d / 7) + "w";
  if (d < 365) return Math.round(d / 30) + "mo";
  return Math.round(d / 365) + "y";
}
function ageChip(iso, opts) {
  opts = opts || {};
  var d = daysSince(iso);
  var tier = freshnessTier(d);
  var label = formatAge(iso);
  var title = iso ? new Date(iso).toLocaleString() : "no timestamp";
  return '<span class="age-chip age-' + tier + (opts.compact ? ' age-compact' : '') + '" title="' + escapeAttr(title) + '">' + label + '</span>';
}

function renderChainFull(signalId) {
  var badgesEl = document.getElementById("signalBadges");
  var crossEl = document.getElementById("crossLayer");
  var unifiedEl = document.getElementById("unifiedList");
  var freshEl = document.getElementById("signalFreshness");
  if (badgesEl) badgesEl.innerHTML = '<span class="faint">Loading lifecycle…</span>';
  if (crossEl) crossEl.innerHTML = '<span class="faint">Loading layers…</span>';
  if (unifiedEl) unifiedEl.innerHTML = '<span class="faint">Loading unified signals…</span>';
  if (freshEl) freshEl.innerHTML = '';

  fetch("/api/signals/" + encodeURIComponent(signalId) + "/chain-full")
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderLifecycleAndCaseBadges(badgesEl, data);
      renderFreshnessSummary(freshEl, data);
      renderCrossLayer(crossEl, data);
      renderUnifiedList(unifiedEl, data);
    })
    .catch(function(err) {
      console.error("chain-full failed", err);
      if (badgesEl) badgesEl.innerHTML = '';
      if (crossEl)  crossEl.innerHTML = '<span class="faint">Cross-layer unavailable</span>';
      if (unifiedEl) unifiedEl.innerHTML = '<span class="faint">Unified signals unavailable</span>';
    });
}

function renderFreshnessSummary(el, data) {
  if (!el) return;
  var f = data.freshness;
  if (!f || !f.count) {
    el.innerHTML = '';
    hideSectionIfEmpty(el);
    return;
  }
  el.innerHTML =
    '<span class="freshness-label">Freshness</span>' +
    ' newest ' + ageChip(f.newest_at) +
    ' · median ' + ageChip(f.median_at) +
    ' · oldest ' + ageChip(f.oldest_at) +
    ' <span class="faint">(across ' + f.count + ' packet' + (f.count === 1 ? '' : 's') + ')</span>';
  hideSectionIfEmpty(el);
}

function renderLifecycleAndCaseBadges(el, data) {
  if (!el) return;
  var html = '';
  if (data.lifecycle && data.lifecycle.state) {
    var lc = data.lifecycle;
    var stateColors = { forming:"#9aa3ad", emerging:"#2d6fbb", fresh:"#3e9558", mature:"#bd842f", fading:"#e67e22", stalled:"#875fb4", dormant:"#de5c56" };
    var color = stateColors[lc.state] || "#9aa3ad";
    html += '<span class="lifecycle-badge" style="border-color:' + color + ';color:' + color + '">';
    html += '<strong>' + lc.state.toUpperCase() + '</strong>';
    if (lc.evidence_7d != null && lc.evidence_30d != null) {
      html += ' <span class="lifecycle-stats">' + lc.evidence_7d + ' in 7d · ' + lc.evidence_30d + ' in 30d';
      if (lc.trend_ratio != null) html += ' · trend ×' + (Math.round(lc.trend_ratio * 100) / 100);
      html += '</span>';
    }
    if (lc.state_reason) html += '<div class="lifecycle-reason">' + escapeHtml(lc.state_reason) + '</div>';
    html += '</span>';
  }
  if (Array.isArray(data.cases) && data.cases.length) {
    for (var i = 0; i < data.cases.length; i++) {
      var c = data.cases[i];
      html += '<button class="case-badge" type="button" data-case-id="' + escapeAttr(c.id) + '">' +
        'CASE · ' + escapeHtml(c.title || c.id) + ' · ' + (c.member_count || 0) + ' sibling signal' + ((c.member_count || 0) === 1 ? '' : 's') +
      '</button>';
    }
  }
  el.innerHTML = html;
  hideSectionIfEmpty(el);
  // Wire case-badge clicks
  var caseBtns = el.querySelectorAll('[data-case-id]');
  for (var ci = 0; ci < caseBtns.length; ci++) {
    (function(btn) {
      btn.addEventListener('click', function() { openCaseDrawer(btn.getAttribute('data-case-id')); });
    })(caseBtns[ci]);
  }
}

function renderCrossLayer(el, data) {
  if (!el) return;
  if (!Array.isArray(data.layerCoverage) || !data.layerCoverage.length) {
    el.innerHTML = '';
    hideSectionIfEmpty(el);
    return;
  }
  // Pre-bucket missing-evidence notes by layer name (best-effort string match
  // against the layer label or id, so we can pin the unified signal's missing
  // hints to the right empty chip).
  var noteByLayer = {};
  if (Array.isArray(data.missing_notes)) {
    for (var n = 0; n < data.missing_notes.length; n++) {
      var note = data.missing_notes[n];
      var hay = (note.note || '').toLowerCase();
      for (var li = 0; li < data.layerCoverage.length; li++) {
        var L = data.layerCoverage[li];
        if (hay.indexOf(L.id) !== -1 || hay.indexOf((L.label || '').toLowerCase()) !== -1) {
          (noteByLayer[L.id] = noteByLayer[L.id] || []).push(note);
        }
      }
    }
  }

  var stateClass = { covered: "chip-covered", corroborated: "chip-corroborated", missing: "chip-missing" };
  var html = '<div class="cross-layer-strip">';
  for (var i = 0; i < data.layerCoverage.length; i++) {
    var l = data.layerCoverage[i];
    var cls = stateClass[l.state] || "chip-missing";
    var count = l.local_count || l.unified_count || 0;
    var via = l.state === "corroborated" ? " <span class=\"chip-via\">via unified</span>" : "";
    var title = l.note || '';
    if (noteByLayer[l.id]) {
      title = (title ? title + ' — ' : '') + noteByLayer[l.id].map(function(n){return n.note;}).join('; ');
      if (cls === "chip-missing") cls = "chip-missing-flagged";
    }
    html += '<button class="layer-chip ' + cls + '" type="button" ' +
      'data-layer-id="' + escapeAttr(l.id) + '" data-signal-id="' + escapeAttr(data.id) + '" ' +
      'title="' + escapeAttr(title) + '">' +
      escapeHtml(l.label) + ' <span class="chip-count">' + count + '</span>' + via +
    '</button>';
  }
  html += '</div>';
  // Inline missing-evidence callouts beneath the strip
  if (Array.isArray(data.missing_notes) && data.missing_notes.length) {
    html += '<ul class="missing-notes">';
    for (var m = 0; m < Math.min(data.missing_notes.length, 6); m++) {
      var mn = data.missing_notes[m];
      html += '<li><span class="missing-tag">missing</span> ' +
        escapeHtml(mn.note) +
        ' <span class="faint">(· ' + escapeHtml(mn.topic || '') + ')</span></li>';
    }
    html += '</ul>';
  }
  el.innerHTML = html;
  hideSectionIfEmpty(el);
  // Click → open evidence list per layer
  var chips = el.querySelectorAll('.layer-chip');
  for (var ch = 0; ch < chips.length; ch++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        openLayerDrawer(btn.getAttribute('data-signal-id'), btn.getAttribute('data-layer-id'));
      });
    })(chips[ch]);
  }
}

function renderUnifiedList(el, data) {
  if (!el) return;
  var us = data.unified_signals || [];
  if (!us.length) {
    el.innerHTML = '';
    hideSectionIfEmpty(el);
    return;
  }
  var stateBadge = { early: "🌱 EARLY", current: "🔥 CURRENT", late: "🌒 LATE" };
  var html = '';
  for (var i = 0; i < us.length; i++) {
    var u = us[i];
    var layerKeys = Object.keys(u.layer_coverage || {}).filter(function(k) { return (u.layer_coverage[k] || 0) > 0; });
    var corr = u.corroboration_score != null ? Math.round(u.corroboration_score * 100) / 100 : '?';
    html += '<button class="unified-card" type="button" data-unified-id="' + escapeAttr(u.id) + '">';
    var freshAt = u.peak_at || u.first_detected || u.updated_at;
    html += '<div class="unified-head">';
    html += '<span class="unified-state">' + (stateBadge[u.temporal_state] || u.temporal_state || '—') + '</span>';
    html += '<span class="unified-corr">corr ' + corr + '</span>';
    html += '<span class="unified-layers">' + layerKeys.length + '/7 layers</span>';
    html += ageChip(freshAt, { compact: true });
    html += '</div>';
    html += '<div class="unified-topic">' + escapeHtml(u.topic || '(untitled)') + '</div>';
    if (u.thesis) html += '<div class="unified-thesis">' + escapeHtml((u.thesis || '').slice(0, 220)) + '</div>';
    if ((u.missing_evidence || []).length) {
      html += '<div class="unified-missing"><span class="missing-tag">' + u.missing_evidence.length + ' missing</span></div>';
    }
    html += '</button>';
  }
  el.innerHTML = html;
  hideSectionIfEmpty(el);
  var cards = el.querySelectorAll('[data-unified-id]');
  for (var ci = 0; ci < cards.length; ci++) {
    (function(btn) {
      btn.addEventListener('click', function() { openUnifiedDrawer(btn.getAttribute('data-unified-id')); });
    })(cards[ci]);
  }
}

// --- Drilldown drawer (used by layer / unified / case / thread / evidence) ---

function openDrawer(kicker, title, bodyHtml) {
  var drawer = document.getElementById('drilldownDrawer');
  if (!drawer) return;
  document.getElementById('drilldownKicker').textContent = kicker || '';
  document.getElementById('drilldownTitle').textContent = title || '';
  document.getElementById('drilldownBody').innerHTML = bodyHtml || '';
  drawer.hidden = false;
}

function closeDrawer() {
  var drawer = document.getElementById('drilldownDrawer');
  if (drawer) drawer.hidden = true;
}

document.addEventListener('click', function(e) {
  if (e.target.matches('[data-drawer-close]')) closeDrawer();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeDrawer();
});

function evidenceCard(p) {
  var who = escapeHtml(p.author || 'anonymous');
  var src = escapeHtml(p.source || '');
  var layer = p.source_layer ? '<span class="ev-chip">' + escapeHtml(p.source_layer) + '</span>' : '';
  var url = p.url && p.url !== '#' ? '<a class="ev-link" href="' + p.url + '" target="_blank" rel="noopener">source ›</a>' : '';
  var body = escapeHtml((p.quote || '').slice(0, 280)) + ((p.quote || '').length > 280 ? '…' : '');
  var age = ageChip(p.published_at);
  return '<article class="drill-ev" data-ev-id="' + escapeAttr(p.id) + '">' +
    '<div class="drill-ev-head">' + layer + ' ' + age + ' <span class="ev-author">' + who + '</span> <span class="faint">· ' + src + '</span> ' + url + '</div>' +
    (p.title ? '<div class="drill-ev-title">' + escapeHtml(p.title) + '</div>' : '') +
    '<div class="drill-ev-body">' + body + '</div>' +
  '</article>';
}

function openLayerDrawer(signalId, layerId) {
  // Filter the currently-loaded signal's evidence by layer; lazy fetch chain-full
  // again so the drawer is correct after a context reload.
  openDrawer('LAYER · ' + layerId, 'Packets contributing to ' + layerId, '<span class="faint">Loading…</span>');
  fetch('/api/signals/' + encodeURIComponent(signalId) + '/chain-full')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var packets = (data.evidence || []).filter(function(p) { return p.source_layer === layerId; });
      // Augment with unified-signal-only packets for this layer
      var unifiedLayerPackets = [];
      var unifiedFetches = (data.unified_signals || []).map(function(u) {
        return fetch('/api/unified-signals/' + encodeURIComponent(u.id))
          .then(function(r) { return r.json(); })
          .then(function(ud) {
            var layerEntry = (ud.layers || {})[layerId];
            if (!layerEntry || !layerEntry.evidence) return;
            for (var i = 0; i < layerEntry.evidence.length; i++) {
              var p = layerEntry.evidence[i];
              p.__via = ud.topic;
              unifiedLayerPackets.push(p);
            }
          })
          .catch(function() {});
      });
      Promise.all(unifiedFetches).then(function() {
        var seen = {};
        for (var i = 0; i < packets.length; i++) seen[packets[i].id] = true;
        var addl = unifiedLayerPackets.filter(function(p) { return !seen[p.id]; });
        var html = '';
        if (!packets.length && !addl.length) {
          html = '<p class="faint">No packets in this layer. ' +
            (data.missing_notes && data.missing_notes.length
              ? 'Unified signals flag: ' + escapeHtml(data.missing_notes.map(function(n){return n.note;}).join('; '))
              : 'Try the <em>Discover</em> action to fill it.') + '</p>';
        } else {
          if (packets.length) {
            html += '<h4 class="drill-section">Direct evidence (' + packets.length + ')</h4>' +
                    packets.map(evidenceCard).join('');
          }
          if (addl.length) {
            html += '<h4 class="drill-section">Via unified signal (' + addl.length + ')</h4>' +
                    addl.map(function(p) {
                      return '<div class="drill-via faint">via <em>' + escapeHtml(p.__via || '') + '</em></div>' + evidenceCard(p);
                    }).join('');
          }
        }
        document.getElementById('drilldownBody').innerHTML = html;
        wireEvidenceClicks();
      });
    })
    .catch(function() {
      document.getElementById('drilldownBody').innerHTML = '<span class="faint">Failed to load layer evidence.</span>';
    });
}

function openUnifiedDrawer(unifiedId) {
  openDrawer('UNIFIED SIGNAL', 'Loading…', '<span class="faint">Loading…</span>');
  fetch('/api/unified-signals/' + encodeURIComponent(unifiedId))
    .then(function(r) { return r.json(); })
    .then(function(u) {
      document.getElementById('drilldownTitle').textContent = u.topic || unifiedId;
      var stateBadge = { early: '🌱 EARLY', current: '🔥 CURRENT', late: '🌒 LATE' };
      var html = '';
      html += '<div class="unified-meta">';
      html += '<span class="unified-state">' + (stateBadge[u.temporal_state] || u.temporal_state || '—') + '</span>';
      html += ' <span>corroboration <strong>' + (u.corroboration_score != null ? Math.round(u.corroboration_score * 100) / 100 : '?') + '</strong></span>';
      if (u.first_detected) html += ' <span class="faint">first detected ' + escapeHtml(u.first_detected) + '</span>';
      if (u.peak_at)        html += ' <span class="faint">peak ' + escapeHtml(u.peak_at) + '</span>';
      html += '</div>';
      if (u.thesis)            html += '<p class="unified-thesis-full"><strong>Thesis.</strong> ' + escapeHtml(u.thesis) + '</p>';
      if (u.temporal_reasoning) html += '<p class="faint">' + escapeHtml(u.temporal_reasoning) + '</p>';
      // Layer-by-layer panel
      var LAYER_ORDER = ['truth','conversation','intent','behavior','expectation','economic','capital'];
      html += '<h4 class="drill-section">What each layer says</h4>';
      for (var i = 0; i < LAYER_ORDER.length; i++) {
        var layer = LAYER_ORDER[i];
        var l = (u.layers || {})[layer];
        if (!l && !(u.layer_coverage || {})[layer]) continue;
        var packets = (l && l.evidence) || [];
        html += '<details class="drill-layer" ' + (i < 2 ? 'open' : '') + '>';
        html += '<summary><strong>' + layer + '</strong> · ' + packets.length + ' packet' + (packets.length === 1 ? '' : 's') + '</summary>';
        if (l && l.analysis) html += '<p>' + escapeHtml(l.analysis) + '</p>';
        if (packets.length)  html += packets.slice(0, 5).map(evidenceCard).join('');
        else                  html += '<p class="faint">No evidence linked.</p>';
        html += '</details>';
      }
      // Missing evidence
      if ((u.missing_evidence || []).length) {
        html += '<h4 class="drill-section">Missing evidence</h4><ul>';
        for (var mi = 0; mi < u.missing_evidence.length; mi++) {
          html += '<li><span class="missing-tag">missing</span> ' + escapeHtml(u.missing_evidence[mi]) + '</li>';
        }
        html += '</ul>';
      }
      // Recommended actions
      if ((u.recommended_actions || []).length) {
        html += '<h4 class="drill-section">Recommended actions</h4><ul>';
        for (var ai = 0; ai < u.recommended_actions.length; ai++) {
          var a = u.recommended_actions[ai];
          if (typeof a === 'string') html += '<li>' + escapeHtml(a) + '</li>';
          else html += '<li><strong>' + escapeHtml(a.action || '') + '</strong> — ' + escapeHtml(a.why || '') + '</li>';
        }
        html += '</ul>';
      }
      // Linked signals (back-navigation)
      if ((u.linkedSignals || []).length) {
        html += '<h4 class="drill-section">Linked signals (' + u.linkedSignals.length + ')</h4>';
        html += '<div class="drill-signals">';
        for (var si = 0; si < u.linkedSignals.length; si++) {
          var s = u.linkedSignals[si];
          html += '<button class="drill-sig-link" type="button" data-signal-link="' + escapeAttr(s.id) + '">#' + (s.rank || '?') + ' · ' + escapeHtml(s.title || s.id) + '</button>';
        }
        html += '</div>';
      }
      document.getElementById('drilldownBody').innerHTML = html;
      wireEvidenceClicks();
      var sigBtns = document.querySelectorAll('[data-signal-link]');
      for (var bi = 0; bi < sigBtns.length; bi++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-signal-link');
            closeDrawer();
            selectedId = id;
            try { renderDetail(); } catch (e) { console.error(e); }
          });
        })(sigBtns[bi]);
      }
    })
    .catch(function() {
      document.getElementById('drilldownBody').innerHTML = '<span class="faint">Failed to load unified signal.</span>';
    });
}

function openCaseDrawer(caseId) {
  openDrawer('CASE', 'Loading…', '<span class="faint">Loading…</span>');
  fetch('/api/cases/' + encodeURIComponent(caseId))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      document.getElementById('drilldownTitle').textContent = d.case && d.case.title || caseId;
      var html = '';
      if (d.case && d.case.description) html += '<p>' + escapeHtml(d.case.description) + '</p>';
      var members = d.members || [];
      if (!members.length) {
        html += '<p class="faint">This case has no linked signals yet. The case row was created but <code>signal_case_members</code> is empty — fix the writer in <code>src/pipeline/signal-cases.mjs</code> (see audit issue G-17).</p>';
      } else {
        html += '<h4 class="drill-section">Members (' + members.length + ')</h4>';
        html += '<table class="case-table"><thead><tr><th>#</th><th>Signal</th><th>State</th><th>Communities</th><th>Failed solutions</th></tr></thead><tbody>';
        for (var i = 0; i < members.length; i++) {
          var m = members[i];
          var failedNames = (m.failed_solutions || []).slice(0, 3).map(function(f) { return f.name || JSON.stringify(f); }).join(', ');
          html += '<tr>';
          html += '<td>' + (m.rank || '?') + '</td>';
          html += '<td><button class="drill-sig-link" type="button" data-signal-link="' + escapeAttr(m.id) + '">' + escapeHtml(m.title || m.id) + '</button></td>';
          html += '<td>' + escapeHtml(m.dominant_state || '') + '</td>';
          html += '<td>' + escapeHtml((m.communities || []).slice(0, 3).join(', ')) + '</td>';
          html += '<td>' + escapeHtml(failedNames) + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table>';
        var tags = Object.keys(d.overlap || {});
        if (tags.length) {
          html += '<h4 class="drill-section">Shared facets</h4>';
          for (var ti = 0; ti < tags.length; ti++) {
            var tag = tags[ti];
            html += '<div class="facet-tag"><strong>' + escapeHtml(tag) + '</strong> · covered by ' + d.overlap[tag].length + ' member' + (d.overlap[tag].length === 1 ? '' : 's') + '</div>';
          }
        }
      }
      document.getElementById('drilldownBody').innerHTML = html;
      var sigBtns = document.querySelectorAll('[data-signal-link]');
      for (var bi = 0; bi < sigBtns.length; bi++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-signal-link');
            closeDrawer();
            selectedId = id;
            try { renderDetail(); } catch (e) { console.error(e); }
          });
        })(sigBtns[bi]);
      }
    })
    .catch(function() {
      document.getElementById('drilldownBody').innerHTML = '<span class="faint">Failed to load case.</span>';
    });
}

/**
 * Render the full evidence-packet drawer. The packet card renders identical
 * to the cards used elsewhere; the rest of the body adds drilldown depth so
 * the operator can navigate even when the packet has no real source URL
 * (synthetic/fixture data, deleted Reddit threads, etc.):
 *   - full body (no truncation) + metrics + classification chips
 *   - thread siblings if reconstructed
 *   - cited-by signals
 *   - unified signals containing this packet
 *   - other packets by the same author in this context
 *   - other packets from the same community in this context
 */
function openEvidenceDrawer(evidenceId) {
  openDrawer('EVIDENCE PACKET', 'Loading…', '<span class="faint">Loading…</span>');
  fetch('/api/evidence/' + encodeURIComponent(evidenceId))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var p = d.packet || {};
      document.getElementById('drilldownTitle').textContent = p.title || p.id || evidenceId;

      var html = '';
      html += evidenceCardFull(p);

      if (d.thread) {
        var threadPackets = d.thread.packets || [];
        html += '<h4 class="drill-section">Thread (' + threadPackets.length + ' packets)</h4>';
        if (d.thread.intelligence && d.thread.intelligence.keyInsight) {
          html += '<p class="drill-insight"><strong>Key insight:</strong> ' + escapeHtml(d.thread.intelligence.keyInsight) + '</p>';
        }
        for (var i = 0; i < Math.min(6, threadPackets.length); i++) {
          html += evidenceCard(threadPackets[i]);
        }
        if (threadPackets.length > 6) html += '<p class="faint">+ ' + (threadPackets.length - 6) + ' more</p>';
      }

      if ((d.citingSignals || []).length) {
        html += '<h4 class="drill-section">Cited by ' + d.citingSignals.length + ' signal' + (d.citingSignals.length === 1 ? '' : 's') + '</h4>';
        for (var si = 0; si < d.citingSignals.length; si++) {
          var s = d.citingSignals[si];
          html += '<button class="drill-sig-link" type="button" data-signal-link="' + escapeAttr(s.id) + '">#' + (s.rank || '?') + ' · ' + escapeHtml(s.title || s.id) + '</button>';
        }
      }

      if ((d.unifiedSignals || []).length) {
        html += '<h4 class="drill-section">Part of ' + d.unifiedSignals.length + ' unified signal' + (d.unifiedSignals.length === 1 ? '' : 's') + '</h4>';
        for (var ui = 0; ui < d.unifiedSignals.length; ui++) {
          var u = d.unifiedSignals[ui];
          html += '<button class="drill-unified-link" type="button" data-unified-link="' + escapeAttr(u.id) + '">' + escapeHtml(u.topic || u.id) + ' <span class="faint">· ' + escapeHtml(u.layer || '') + '</span></button>';
        }
      }

      if ((d.relatedByAuthor || []).length) {
        var moreAuthor = Math.max(0, (d.authorTotal || 0) - d.relatedByAuthor.length);
        html += '<h4 class="drill-section">By same author · ' + escapeHtml(p.author || 'anonymous') + ' (' + (d.authorTotal || d.relatedByAuthor.length) + ')</h4>';
        for (var ai = 0; ai < d.relatedByAuthor.length; ai++) {
          html += evidenceCard(d.relatedByAuthor[ai]);
        }
        if (moreAuthor > 0) html += '<p class="faint">+ ' + moreAuthor + ' more by this author</p>';
      }

      if ((d.relatedByCommunity || []).length) {
        var moreComm = Math.max(0, (d.communityTotal || 0) - d.relatedByCommunity.length);
        html += '<h4 class="drill-section">From same community · ' + escapeHtml(p.source || '') + ' (' + (d.communityTotal || d.relatedByCommunity.length) + ')</h4>';
        for (var ci = 0; ci < d.relatedByCommunity.length; ci++) {
          html += evidenceCard(d.relatedByCommunity[ci]);
        }
        if (moreComm > 0) html += '<p class="faint">+ ' + moreComm + ' more from this community</p>';
      }

      document.getElementById('drilldownBody').innerHTML = html;

      // Re-bind clicks on every embedded evidence card so the drawer recurses.
      var evNodes = document.querySelectorAll('#drilldownBody .drill-ev[data-ev-id]');
      for (var ei = 0; ei < evNodes.length; ei++) {
        (function(node) {
          var id = node.getAttribute('data-ev-id');
          if (!id || id === evidenceId) return;
          node.style.cursor = 'pointer';
          node.addEventListener('click', function(ev) {
            // Don't hijack clicks on the source link inside the card.
            if (ev.target.closest('a.ev-link')) return;
            openEvidenceDrawer(id);
          });
        })(evNodes[ei]);
      }

      var sigBtns = document.querySelectorAll('[data-signal-link]');
      for (var bi = 0; bi < sigBtns.length; bi++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-signal-link');
            closeDrawer();
            selectedId = id;
            try { renderDetail(); } catch (e) { console.error(e); }
          });
        })(sigBtns[bi]);
      }
      var uniBtns = document.querySelectorAll('[data-unified-link]');
      for (var ui2 = 0; ui2 < uniBtns.length; ui2++) {
        (function(btn) {
          btn.addEventListener('click', function() { openUnifiedDrawer(btn.getAttribute('data-unified-link')); });
        })(uniBtns[ui2]);
      }
    })
    .catch(function(err) {
      console.error('evidence drawer failed', err);
      document.getElementById('drilldownBody').innerHTML = '<span class="faint">Failed to load packet.</span>';
    });
}

/**
 * Map source_id to a human-readable "Open on …" CTA label. Falls back to a
 * generic "Open source" when the source isn't in the table.
 */
function sourceCtaLabel(sourceId) {
  switch ((sourceId || '').toLowerCase()) {
    case 'reddit':         return 'Open on Reddit';
    case 'reddit-finance': return 'Open on Reddit';
    case 'hackernews':     return 'Open on Hacker News';
    case 'hn-hiring':      return 'Open on Hacker News';
    case 'polymarket':     return 'Open on Polymarket';
    case 'github':         return 'Open on GitHub';
    case 'google':         return 'Open page';
    case 'anthropic':      return 'Open release notes';
    case 'yfinance':       return 'Open on Yahoo Finance';
    case 'stocktwits':     return 'Open on Stocktwits';
    default:               return 'Open source';
  }
}

/**
 * Richer card used in the header of the drawer — full body, prominent
 * source-open CTA, metrics chips, classification chips. The compact
 * `evidenceCard` is still used for sibling lists below to keep them scannable.
 */
function evidenceCardFull(p) {
  var who = escapeHtml(p.author || 'anonymous');
  var src = escapeHtml(p.source || '');
  var layer = p.source_layer ? '<span class="ev-chip">' + escapeHtml(p.source_layer) + '</span>' : '';
  var body = escapeHtml(p.quote || '').replace(/\n/g, '<br>');
  var age = ageChip(p.published_at);

  // Prominent "Open on <source>" CTA row, OR a clear synthetic-fixture badge
  // when the packet doesn't resolve to a live URL. This is the single most
  // important affordance on the drawer — operators need to verify evidence at
  // the source.
  var ctaHtml;
  if (p.url && p.url !== '#') {
    ctaHtml =
      '<a class="drill-source-cta" href="' + p.url + '" target="_blank" rel="noopener">' +
        '<span class="drill-source-cta-label">' + escapeHtml(sourceCtaLabel(p.source_id)) + '</span>' +
        '<span class="drill-source-cta-arrow">↗</span>' +
      '</a>';
  } else {
    ctaHtml =
      '<div class="drill-source-cta drill-source-cta-missing" title="This packet is seeded fixture data or was ingested without a live source URL. Re-ingest from a real producer (reddit, hackernews, …) to drill through to source.">' +
        '<span class="drill-source-cta-label">No live source</span>' +
        '<span class="drill-source-cta-arrow">·</span>' +
        '<span class="drill-source-cta-hint">synthetic / fixture data</span>' +
      '</div>';
  }

  // Metrics row — render only chips with non-zero / non-null values.
  var metricBits = [];
  if (p.score)                 metricBits.push('▲ ' + p.score);
  if (p.replies)               metricBits.push('💬 ' + p.replies);
  if (p.evidence_weight)       metricBits.push('w ' + Number(p.evidence_weight).toFixed(1));
  if (p.quality_score != null) metricBits.push('q ' + Number(p.quality_score).toFixed(2));
  if (p.source_kind)           metricBits.push(escapeHtml(p.source_kind));
  var metricsHtml = metricBits.length
    ? '<div class="drill-ev-metrics">' + metricBits.map(function(b) { return '<span class="ev-metric">' + b + '</span>'; }).join('') + '</div>'
    : '';

  // Classification chips — only show fields that have meaningful values.
  var classBits = [];
  if (p.intent && p.intent !== 'question')                       classBits.push(['intent', p.intent]);
  if (p.awareness_level)                                         classBits.push(['awareness', p.awareness_level]);
  if (p.evidence_state && p.evidence_state !== 'sharing_insight') classBits.push(['state', p.evidence_state]);
  if (p.sentiment && p.sentiment !== 'neutral')                  classBits.push(['sentiment', p.sentiment]);
  var classHtml = classBits.length
    ? '<div class="drill-ev-class">' + classBits.map(function(b) {
        return '<span class="ev-class-chip"><span class="ev-class-label">' + b[0] + '</span>' + escapeHtml(b[1]) + '</span>';
      }).join('') + '</div>'
    : '';

  return '<article class="drill-ev drill-ev-full" data-ev-id="' + escapeAttr(p.id) + '">' +
    '<div class="drill-ev-head">' + layer + ' ' + age + ' <span class="ev-author">' + who + '</span> <span class="faint">· ' + src + '</span></div>' +
    (p.title ? '<div class="drill-ev-title">' + escapeHtml(p.title) + '</div>' : '') +
    '<div class="drill-ev-body drill-ev-body-full">' + body + '</div>' +
    ctaHtml +
    metricsHtml +
    classHtml +
  '</article>';
}

function wireEvidenceClicks() {
  var els = document.querySelectorAll('.drill-ev[data-ev-id]');
  for (var i = 0; i < els.length; i++) {
    (function(node) {
      node.addEventListener('click', function() {
        openEvidenceDrawer(node.getAttribute('data-ev-id'));
      });
    })(els[i]);
  }
}

function renderIntelligenceChain(signalId) {
  var el = document.getElementById("intelligenceChain");
  if (!el) return;
  el.innerHTML = '<span class="faint">Loading chain\u2026</span>';

  fetch("/api/signals/" + encodeURIComponent(signalId) + "/chain")
    .then(function(r) { return r.json(); })
    .then(function(chain) {
      if (!chain || chain.totalUnits === 0) {
        el.innerHTML = '';
        hideSectionIfEmpty(el);
        return;
      }

      var levelMeta = {
        observation:     { label: "Observations",    color: "#9aa3ad", icon: "\u25CB" },
        extraction:      { label: "LLM Extractions", color: "#2d6fbb", icon: "\u25C9" },
        cross_thread:    { label: "Cross-thread",    color: "#875fb4", icon: "\u25CE" },
        cross_community: { label: "Cross-community", color: "#3e9558", icon: "\u25C6" },
        synthesis:       { label: "Synthesis",        color: "#bd842f", icon: "\u2726" },
        conclusion:      { label: "Conclusions",      color: "#de5c56", icon: "\u2605" },
      };
      var levels = ["observation", "extraction", "cross_thread", "cross_community", "synthesis", "conclusion"];

      // Summary bar
      var barHtml = '<div class="chain-bar">';
      for (var li = 0; li < levels.length; li++) {
        var lvl = levels[li];
        var units = chain.byType[lvl] || [];
        var meta = levelMeta[lvl];
        var active = units.length > 0;
        barHtml += '<div class="chain-level' + (active ? " active" : "") + '" style="' + (active ? "border-color:" + meta.color : "") + '">';
        barHtml += '<span class="chain-icon" style="color:' + meta.color + '">' + meta.icon + '</span>';
        barHtml += '<span class="chain-count">' + units.length + '</span>';
        barHtml += '<span class="chain-label">' + meta.label + '</span>';
        if (li < levels.length - 1) barHtml += '<span class="chain-arrow">\u2192</span>';
        barHtml += '</div>';
      }
      barHtml += '</div>';

      // Top claims per level (expandable)
      var claimsHtml = '';
      for (var ci = 0; ci < levels.length; ci++) {
        var clvl = levels[ci];
        var cunits = chain.byType[clvl] || [];
        if (cunits.length === 0) continue;
        var cmeta = levelMeta[clvl];
        claimsHtml += '<div class="chain-claims">';
        claimsHtml += '<div class="chain-claims-header" style="color:' + cmeta.color + '">' + cmeta.icon + ' ' + cmeta.label + ' (' + cunits.length + ')</div>';
        var showCount = Math.min(cunits.length, 3);
        for (var cj = 0; cj < showCount; cj++) {
          var u = cunits[cj];
          var conf = Math.round((u.confidence || 0) * 100);
          var confColor = conf >= 70 ? "#3e9558" : conf >= 40 ? "#bd842f" : "#9aa3ad";
          // Make the claim clickable when its source resolves to a packet,
          // thread, or signal — so the operator can walk straight to evidence.
          var srcType = u.sourceType || '';
          var srcId   = u.sourceId   || '';
          var drillAttr = '';
          var cursor    = '';
          if ((srcType === 'evidence_packet' || srcType === 'thread_intelligence') && srcId) {
            drillAttr = ' data-drill-src-type="' + escapeAttr(srcType) + '" data-drill-src-id="' + escapeAttr(srcId) + '" data-drill-thread="' + escapeAttr(u.threadId || '') + '"';
            cursor    = 'cursor:pointer;';
          } else if (srcType === 'signal' && srcId) {
            drillAttr = ' data-signal-link="' + escapeAttr(srcId) + '"';
            cursor    = 'cursor:pointer;';
          }
          var basis = u.confidenceBasis ? ' title="' + escapeAttr(u.confidenceBasis) + '"' : '';
          claimsHtml += '<div class="chain-claim"' + drillAttr + basis + ' style="' + cursor + '">';
          claimsHtml += '<span class="chain-conf" style="color:' + confColor + '">' + conf + '%</span>';
          claimsHtml += ageChip(u.createdAt, { compact: true });
          claimsHtml += '<span class="chain-text">' + escapeHtml((u.claim || "").slice(0, 120)) + '</span>';
          claimsHtml += '</div>';
        }
        if (cunits.length > 3) {
          claimsHtml += '<div class="chain-more faint">+' + (cunits.length - 3) + ' more</div>';
        }
        claimsHtml += '</div>';
      }

      el.innerHTML = barHtml + claimsHtml;
      hideSectionIfEmpty(el);
      // Wire claim drilldowns
      el.querySelectorAll('[data-drill-src-type]').forEach(function(node) {
        node.addEventListener('click', function() {
          var srcType = node.getAttribute('data-drill-src-type');
          var srcId   = node.getAttribute('data-drill-src-id');
          var threadId = node.getAttribute('data-drill-thread');
          if (srcType === 'evidence_packet')      openEvidenceDrawer(srcId);
          else if (srcType === 'thread_intelligence') openThreadDrawer(threadId || srcId);
        });
      });
      el.querySelectorAll('[data-signal-link]').forEach(function(node) {
        node.addEventListener('click', function() {
          selectedId = node.getAttribute('data-signal-link');
          try { renderDetail(); } catch (e) { console.error(e); }
        });
      });
    })
    .catch(function() {
      el.innerHTML = '<span class="faint">Chain unavailable</span>';
    });
}

function openThreadDrawer(threadId) {
  if (!threadId) return;
  openDrawer('THREAD', 'Loading…', '<span class="faint">Loading…</span>');
  loadThreadIntoDrawer(threadId);
}

function loadThreadIntoDrawer(threadId) {
  fetch('/api/threads/' + encodeURIComponent(threadId))
    .then(function(r) {
      // 404 means the thread row is missing — we may still have surviving
      // hints (Reddit post id inside thread:<id>) we can use to regenerate.
      if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; throw e; }
      return r.json();
    })
    .then(function(d) {
      document.getElementById('drilldownTitle').textContent = (d.thread && d.thread.title) || threadId;
      var html = '';
      if (d.thread) {
        html += '<div class="drill-ev-head"><span class="ev-chip">' + escapeHtml(d.thread.community || '') + '</span>';
        if (d.thread.url) html += ' <a class="ev-link" href="' + d.thread.url + '" target="_blank" rel="noopener">open thread ›</a>';
        html += ' <span class="faint">· ' + (d.thread.comment_count || 0) + ' comments · score ' + (d.thread.total_score || 0) + '</span></div>';
      }
      if (d.intelligence) {
        var it = d.intelligence;
        if (it.keyInsight) html += '<p class="drill-insight"><strong>Key insight:</strong> ' + escapeHtml(it.keyInsight) + '</p>';
        if (it.conversationArc) html += '<p><strong>Arc.</strong> ' + escapeHtml(it.conversationArc) + '</p>';
        if (it.signalQuality) html += '<p class="faint">Quality: ' + escapeHtml(it.signalQuality) + ' · awareness: ' + escapeHtml(it.awarenessLevel || '?') + ' · desire: ' + escapeHtml(it.desireType || '?') + '</p>';
      }
      html += '<h4 class="drill-section">Packets (' + (d.packets || []).length + ')</h4>';
      html += (d.packets || []).slice(0, 12).map(evidenceCard).join('');
      if ((d.packets || []).length > 12) html += '<p class="faint">+ ' + ((d.packets || []).length - 12) + ' more</p>';
      if ((d.citingSignals || []).length) {
        html += '<h4 class="drill-section">Cited by ' + d.citingSignals.length + ' signal' + (d.citingSignals.length === 1 ? '' : 's') + '</h4>';
        for (var i = 0; i < d.citingSignals.length; i++) {
          var s = d.citingSignals[i];
          html += '<button class="drill-sig-link" type="button" data-signal-link="' + escapeAttr(s.id) + '">' + escapeHtml(s.title || s.id) + '</button>';
        }
      }
      document.getElementById('drilldownBody').innerHTML = html;
      wireEvidenceClicks();
      document.querySelectorAll('[data-signal-link]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          selectedId = btn.getAttribute('data-signal-link');
          closeDrawer();
          try { renderDetail(); } catch (e) { console.error(e); }
        });
      });
    })
    .catch(function(err) {
      renderThreadFailure(threadId, err && err.status);
    });
}

function renderThreadFailure(threadId, httpStatus) {
  // Pull whatever hints survived in intelligence_units so the operator sees
  // *what* is missing, not just an opaque error. The chain endpoint already
  // walks the unit graph; one shot is cheap.
  fetch('/api/intelligence/' + encodeURIComponent(threadId)).catch(function(){}); // fire-and-forget warm

  // Derive the reddit post id from the convention "thread:<id>".
  var redditPostId = (threadId.indexOf('thread:') === 0) ? threadId.slice('thread:'.length) : threadId;
  var redditUrl = 'https://www.reddit.com/comments/' + redditPostId;

  var body = '';
  body += '<div class="drill-failure">';
  body += '<div class="drill-failure-status">' + (httpStatus === 404
    ? 'Thread row not found in the local database.'
    : 'Failed to load thread (HTTP ' + (httpStatus || '?') + ').'
  ) + '</div>';
  body += '<p class="faint">Known hints from surviving intelligence:</p>';
  body += '<ul class="drill-failure-hints">';
  body += '<li><strong>Thread id:</strong> <code>' + escapeHtml(threadId) + '</code></li>';
  body += '<li><strong>Likely Reddit url:</strong> <a href="' + redditUrl + '" target="_blank" rel="noopener">' + redditUrl + '</a></li>';
  body += '</ul>';
  body += '<div class="drill-failure-actions">';
  body += '<button type="button" class="button" id="drillThreadRetry">↻ Retry</button>';
  body += '<button type="button" class="button button-primary" id="drillThreadRegen">⟳ Re-pull from Reddit</button>';
  body += '<a class="button" href="' + redditUrl + '" target="_blank" rel="noopener">Open on Reddit</a>';
  body += '</div>';
  body += '<div class="drill-failure-log" id="drillThreadLog" style="display:none"></div>';
  body += '</div>';
  document.getElementById('drilldownBody').innerHTML = body;

  document.getElementById('drillThreadRetry').addEventListener('click', function() {
    document.getElementById('drilldownBody').innerHTML = '<span class="faint">Retrying…</span>';
    loadThreadIntoDrawer(threadId);
  });
  document.getElementById('drillThreadRegen').addEventListener('click', function() {
    var btn = document.getElementById('drillThreadRegen');
    var log = document.getElementById('drillThreadLog');
    btn.disabled = true;
    btn.textContent = '⟳ Re-pulling from Reddit…';
    log.style.display = '';
    log.textContent = 'Calling /api/threads/' + threadId + '/regenerate …';
    fetch('/api/threads/' + encodeURIComponent(threadId) + '/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); })
      .then(function(res) {
        if (res.body && res.body.ok) {
          log.textContent = 'Re-fetched ' + (res.body.inserted || 0) + ' packets. Loading thread…';
          setTimeout(function() { loadThreadIntoDrawer(threadId); }, 250);
        } else {
          btn.disabled = false;
          btn.textContent = '⟳ Re-pull from Reddit';
          log.textContent = 'Regenerate failed (HTTP ' + res.status + '): ' + (res.body && res.body.error || 'unknown') +
            (res.body && res.body.hint ? '\nHint: ' + res.body.hint : '');
        }
      })
      .catch(function(err) {
        btn.disabled = false;
        btn.textContent = '⟳ Re-pull from Reddit';
        log.textContent = 'Network error: ' + err.message;
      });
  });
}

function renderContextBrief() {
  var el = document.getElementById("contextBrief");
  if (!el) return;
  var brief = initialData.contextBrief;
  if (!brief || !brief.thesis) { el.style.display = "none"; return; }

  var passes = brief.researchPasses;
  var passHtml = "";
  if (passes) {
    var passOrder = ["pass1", "pass2", "pass3"];
    passHtml = '<div class="brief-passes">' + passOrder.map(function(key) {
      var p = passes[key];
      if (!p) return "";
      return '<div class="brief-pass">' +
        '<div class="brief-pass-label">' + p.label + '</div>' +
        '<div class="brief-pass-desc">' + p.description + '</div>' +
        '<div class="brief-pass-queries">' + p.queries.map(function(q) {
          return '<span class="brief-query">"' + q + '"</span>';
        }).join("") + '</div>' +
      '</div>';
    }).join("") + '</div>';
  }

  el.innerHTML =
    '<div class="brief-toggle" id="briefToggle">' +
      '<span class="brief-toggle-label">Research Brief</span>' +
      '<span class="brief-toggle-icon" id="briefIcon">\u25B6</span>' +
    '</div>' +
    '<div class="brief-body" id="briefBody" style="display:none">' +
      '<div class="brief-section">' +
        '<div class="brief-heading">Thesis</div>' +
        '<p class="brief-text">' + brief.thesis + '</p>' +
      '</div>' +
      (brief.avatar ? '<div class="brief-section">' +
        '<div class="brief-heading">Avatar</div>' +
        '<p class="brief-text">' + brief.avatar + '</p>' +
      '</div>' : '') +
      (passHtml ? '<div class="brief-section">' +
        '<div class="brief-heading">Research Passes</div>' +
        passHtml +
      '</div>' : '') +
    '</div>';

  document.getElementById("briefToggle").addEventListener("click", function() {
    var body = document.getElementById("briefBody");
    var icon = document.getElementById("briefIcon");
    if (body.style.display === "none") {
      body.style.display = "block";
      icon.textContent = "\u25BC";
    } else {
      body.style.display = "none";
      icon.textContent = "\u25B6";
    }
  });
}

function renderAll() {
  renderContextBrief();
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

function alertSignal(signalId) {
  fetch("/api/signals/" + encodeURIComponent(signalId) + "/alert", { method: "POST" })
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function(data) {
      var s = signals.find(function(sig) { return sig.id === signalId; });
      if (s) s.alerted = data.alerted;
      showToast(data.alerted ? "Alert enabled" : "Alert removed");
      renderDetail();
    })
    .catch(function() { showToast("Failed to set alert", true); });
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
        '<h3>New topic</h3>' +
        '<button type="button" class="modal-close" id="modalClose">&times;</button>' +
      '</div>' +
      '<div class="modal-tabs" id="contextModeTabs">' +
        '<button class="modal-tab active" data-mode="ai">Quick (AI sets it up)</button>' +
        '<button class="modal-tab" data-mode="manual">Manual (advanced)</button>' +
      '</div>' +
      '<form id="newContextForm">' +
        '<div id="aiFields">' +
          '<label class="form-label">What are you watching?<input type="text" name="topic" class="form-input" placeholder="e.g. AI agents replacing SaaS subscriptions" id="topicInput"></label>' +
          '<label class="form-label">Why does it matter? <span class="form-hint">optional</span><input type="text" name="ai_description" class="form-input" placeholder="What angle? Who would care? Why now?"></label>' +
          '<p class="form-hint" style="padding:4px 0 0;font-size:11px;color:var(--muted)">We\'ll generate the search queries for you. Takes about 10 seconds.</p>' +
        '</div>' +
        '<div id="manualFields" style="display:none">' +
          '<label class="form-label">Label<input type="text" name="label" class="form-input" placeholder="e.g. AI tools for small law firms"></label>' +
          '<label class="form-label">Description<input type="text" name="description" class="form-input" placeholder="What are you monitoring?"></label>' +
          '<label class="form-label">Subreddits <span class="form-hint">comma-separated</span><input type="text" name="subreddits" class="form-input" placeholder="r/startups, r/SaaS, r/Entrepreneur"></label>' +
          '<label class="form-label">Search queries <span class="form-hint">comma-separated</span><input type="text" name="queries" class="form-input" placeholder="AI research agent, competitor monitoring"></label>' +
          '<label class="form-label">High-intent phrases <span class="form-hint">comma-separated</span><input type="text" name="high_intent" class="form-input" placeholder="alternative to, would pay for"></label>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="button" id="modalCancel">Cancel</button>' +
          '<button type="submit" class="button primary" id="contextSubmit">Create context</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);

  var mode = "ai";
  var tabs = document.getElementById("contextModeTabs");
  tabs.addEventListener("click", function(e) {
    var tab = e.target.closest(".modal-tab");
    if (!tab) return;
    mode = tab.dataset.mode;
    tabs.querySelectorAll(".modal-tab").forEach(function(t) { t.classList.toggle("active", t === tab); });
    document.getElementById("aiFields").style.display = mode === "ai" ? "" : "none";
    document.getElementById("manualFields").style.display = mode === "manual" ? "" : "none";
  });

  function close() { overlay.remove(); }
  document.getElementById("modalClose").addEventListener("click", close);
  document.getElementById("modalCancel").addEventListener("click", close);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) close(); });

  document.getElementById("newContextForm").addEventListener("submit", function(e) {
    e.preventDefault();
    var form = e.target;
    var submitBtn = document.getElementById("contextSubmit");
    submitBtn.disabled = true;
    submitBtn.textContent = mode === "ai" ? "Generating\u2026" : "Creating\u2026";

    if (mode === "ai") {
      var topic = form.topic.value.trim();
      if (!topic) { showToast("Enter a topic", true); submitBtn.disabled = false; submitBtn.textContent = "Create context"; return; }
      fetch("/api/contexts/from-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic, description: form.ai_description.value.trim() }),
      })
        .then(function(r) { if (!r.ok) return r.json().then(function(d) { throw new Error(d.error); }); return r.json(); })
        .then(function(data) {
          showToast("Context created: " + data.label + " (" + data.queryCount + " queries)");
          close();
          window.location.href = "/?context=" + encodeURIComponent(data.id);
        })
        .catch(function(err) { showToast(err.message || "Failed to generate context", true); submitBtn.disabled = false; submitBtn.textContent = "Create context"; });
    } else {
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
        .catch(function(err) { showToast(err.message || "Failed to create context", true); submitBtn.disabled = false; submitBtn.textContent = "Create context"; });
    }
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

// Intent filter tabs
var intentFiltersEl = document.getElementById("intentFilters");
if (intentFiltersEl) {
  intentFiltersEl.addEventListener("click", function(e) {
    var btn = e.target.closest(".intent-btn");
    if (!btn) return;
    activeIntentFilter = btn.dataset.intent;
    renderSignalList();
    renderBubbleChart();
  });
}

// Legend tag filter — click to highlight, click again to clear
document.querySelectorAll(".legend-item[data-tag]").forEach(function(item) {
  item.style.cursor = "pointer";
  item.addEventListener("click", function() {
    var tag = item.dataset.tag;
    activeTagFilter = activeTagFilter === tag ? null : tag;
    // Update legend active state
    document.querySelectorAll(".legend-item[data-tag]").forEach(function(el) {
      el.style.opacity = (!activeTagFilter || el.dataset.tag === activeTagFilter) ? "1" : ".35";
      el.style.fontWeight = (el.dataset.tag === activeTagFilter) ? "700" : "";
    });
    renderSignalList();
    applyTagFilter();
  });
});

function applyTagFilter() {
  // Dim bubbles in chart
  document.querySelectorAll("#bubbleSvg .bubble").forEach(function(g) {
    var sid = g.dataset.signal;
    var signal = signals.find(function(s) { return s.id === sid; });
    if (!signal) return;
    var matches = !activeTagFilter || (signal.tags && signal.tags.indexOf(activeTagFilter) !== -1);
    g.style.opacity = matches ? "1" : ".15";
  });
  // Dim signal cards in inbox
  document.querySelectorAll(".signal-item").forEach(function(card) {
    var sid = card.dataset.signal;
    var signal = signals.find(function(s) { return s.id === sid; });
    if (!signal) return;
    var matches = !activeTagFilter || (signal.tags && signal.tags.indexOf(activeTagFilter) !== -1);
    card.style.opacity = matches ? "1" : ".25";
  });
}

// Inbox tabs: Ranked / New / Saved
document.querySelectorAll(".inbox-tab").forEach(function(tab, i) {
  var tabKeys = ["ranked", "new", "saved"];
  tab.addEventListener("click", function() {
    activeInboxTab = tabKeys[i];
    activeIntentFilter = "all";
    renderSignalList();
  });
});

var stateExplanations = {
  experiencing_pain: "Describing a problem they feel — raw pain language from someone in the middle of it.",
  tried_failed: "Used a specific tool or approach and found it didn't work — competitive intelligence.",
  seeking: "Actively looking for a solution — demand signal, they'd pay if the right thing existed.",
  found_what_works: "Found something that works — adoption signal showing what's winning.",
  warning: "Telling others to avoid something — community-validated failure.",
  sharing_insight: "Sharing knowledge, experience, or a workaround they discovered.",
  comparing: "Evaluating multiple tools or approaches — competitive landscape through user eyes.",
  promoting: "Promoting their own product or service — lower trust, but shows what's being built.",
};

function extractStateExcerpt(body, state) {
  if (!body) return (stateExplanations[state] || "");
  var explanation = stateExplanations[state] || "";
  var text = body.replace(/\n+/g, " ").trim();
  var sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  var statePatterns = {
    experiencing_pain: /frustrat|annoying|hate|terrible|broken|expensive|struggling|waste|useless|nightmare|sucks|drowning|stuck/i,
    tried_failed: /tried|used|tested|gave .* a shot|paid for|subscribed|didn't work|waste|terrible|garbage/i,
    seeking: /looking for|is there|has anyone|recommend|any tool|best way|how do you|need|alternative/i,
    found_what_works: /game.changer|love it|works great|highly recommend|worth|can't live without|saved/i,
    warning: /don't waste|stay away|avoid|wouldn't recommend|save your|complete waste|worst/i,
    sharing_insight: /learned|realized|turns out|the key|what worked|my experience|here's how|tip/i,
    comparing: /vs|versus|compared|alternative|switch|better than|instead of/i,
    promoting: /built|created|launched|check out|announcing|just shipped/i,
  };

  var pat = statePatterns[state];
  var quote = "";
  if (pat) {
    for (var i = 0; i < sentences.length; i++) {
      if (pat.test(sentences[i])) { quote = sentences[i].trim().slice(0, 100); break; }
    }
  }
  if (!quote) quote = sentences[0] ? sentences[0].trim().slice(0, 80) : "";

  return explanation + "\n\u201c" + quote + "\u201d";
}

setupFixtureSelector();
renderAll();

// --- Facet Hover Cards ---

(function setupFacetHover() {
  var hoverTimer = null;
  var leaveTimer = null;
  var activeCard = null;

  function removeFacetCard() {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }
  }

  function showFacetCard(tagEl) {
    removeFacetCard();

    var tag = tagEl.dataset.facetTag;
    var signalId = tagEl.dataset.facetSignal;
    if (!tag || !signalId) return;

    var signal = signals.find(function(s) { return s.id === signalId; });
    if (!signal || !signal.facets) return;

    var facet = signal.facets[tag];
    if (!facet) return;

    var card = document.createElement("div");
    card.className = "facet-card";

    var meta = categories[tag];
    var color = meta ? meta.color : "#68717d";

    // Summary
    var html = '<div class="facet-card-header" style="border-left-color:' + color + '">';
    html += '<span class="facet-card-tag" style="color:' + color + '">' + (meta ? meta.label : tag) + '</span>';
    html += '<span class="facet-card-stats">' + facet.evidenceCount + ' posts \u00b7 ' + facet.totalUpvotes + ' upvotes';
    if (facet.threadCount > 0) html += ' \u00b7 ' + facet.threadCount + ' threads';
    html += '</span></div>';

    if (facet.summary) {
      html += '<div class="facet-card-summary">' + escapeHtml(facet.summary) + '</div>';
    }

    // Quotes
    if (facet.quotes && facet.quotes.length > 0) {
      html += '<div class="facet-card-quotes">';
      facet.quotes.slice(0, 2).forEach(function(q) {
        var hasUrl = q.url && q.url !== "#";
        html += '<div class="facet-card-quote">';
        if (hasUrl) {
          html += '<a class="facet-card-quote-text facet-card-link" href="' + q.url + '" target="_blank" rel="noopener">';
        } else {
          html += '<span class="facet-card-quote-text">';
        }
        html += '\u201c' + escapeHtml(q.quote) + '\u201d';
        html += hasUrl ? '</a>' : '</span>';
        html += '<span class="facet-card-quote-meta">' +
          (q.type === "comment" ? "comment" : "post") + ' \u00b7 ' +
          escapeHtml(q.community) + ' \u00b7 \u25b2' + q.upvotes +
          (hasUrl ? ' \u00b7 <a class="facet-card-source" href="' + q.url + '" target="_blank" rel="noopener">view \u203a</a>' : '') +
          '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Not X, it's Y
    if (facet.notXItsY && facet.notXItsY.length > 0) {
      html += '<div class="facet-card-nxy">';
      facet.notXItsY.slice(0, 2).forEach(function(n) {
        html += '<div class="facet-card-nxy-item">\u201c' + escapeHtml(truncate(n.surface, 35)) + '\u201d \u2192 \u201c' + escapeHtml(truncate(n.deeper, 35)) + '\u201d</div>';
      });
      html += '</div>';
    }

    // Failed solutions
    if (facet.failedSolutions && facet.failedSolutions.length > 0) {
      html += '<div class="facet-card-failed">';
      facet.failedSolutions.slice(0, 3).forEach(function(f) {
        var vColor = f.verdict === "worked" ? "var(--green)" : f.verdict === "mixed" ? "var(--gold)" : "var(--red)";
        html += '<span class="facet-card-failed-pill" style="border-color:' + vColor + '">' + escapeHtml(f.name) + '</span>';
      });
      html += '</div>';
    }

    card.innerHTML = html;
    document.body.appendChild(card);
    activeCard = card;

    // Position below the tag pill
    var rect = tagEl.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var left = rect.left;
    var top = rect.bottom + 6;

    // Keep card within viewport
    if (left + cardRect.width > window.innerWidth - 16) {
      left = window.innerWidth - cardRect.width - 16;
    }
    if (top + cardRect.height > window.innerHeight - 16) {
      top = rect.top - cardRect.height - 6;
    }

    card.style.left = left + "px";
    card.style.top = top + "px";

    // Allow mouse to enter the card
    card.addEventListener("mouseenter", function() {
      clearTimeout(leaveTimer);
    });
    card.addEventListener("mouseleave", function() {
      leaveTimer = setTimeout(removeFacetCard, 150);
    });
  }

  // Event delegation for all tag pills
  document.addEventListener("mouseenter", function(e) {
    var tagEl = e.target.closest("[data-facet-tag]");
    if (!tagEl) return;
    clearTimeout(leaveTimer);
    hoverTimer = setTimeout(function() { showFacetCard(tagEl); }, 200);
  }, true);

  document.addEventListener("mouseleave", function(e) {
    var tagEl = e.target.closest("[data-facet-tag]");
    if (!tagEl) return;
    clearTimeout(hoverTimer);
    leaveTimer = setTimeout(removeFacetCard, 150);
  }, true);
})();

// --- Evidence Chip Hover Cards (detail pane) ---

(function setupChipHover() {
  var hoverTimer = null;
  var leaveTimer = null;
  var activeCard = null;

  function removeCard() {
    if (activeCard) { activeCard.remove(); activeCard = null; }
  }

  function showCard(chip) {
    removeCard();
    var excerpt = chip.dataset.chipExcerpt;
    if (!excerpt) return;

    var label = chip.textContent.trim();
    var color = chip.style.color || "#68717d";

    var card = document.createElement("div");
    card.className = "chip-hover-card";
    // Split on newline: first line = explanation, second = quote
    var parts = excerpt.split("\n");
    var explanation = parts[0] || "";
    var quote = parts[1] || "";
    card.innerHTML = '<div class="chip-hover-label" style="color:' + color + '">' + escapeHtml(label) + '</div>' +
      (explanation ? '<div class="chip-hover-explanation">' + escapeHtml(explanation) + '</div>' : '') +
      (quote ? '<div class="chip-hover-quote">' + escapeHtml(quote) + '</div>' : '');
    document.body.appendChild(card);
    activeCard = card;

    var rect = chip.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var left = rect.left;
    var top = rect.bottom + 4;
    if (left + cardRect.width > window.innerWidth - 12) left = window.innerWidth - cardRect.width - 12;
    if (top + cardRect.height > window.innerHeight - 12) top = rect.top - cardRect.height - 4;
    card.style.left = left + "px";
    card.style.top = top + "px";

    card.addEventListener("mouseenter", function() { clearTimeout(leaveTimer); });
    card.addEventListener("mouseleave", function() { leaveTimer = setTimeout(removeCard, 120); });
  }

  document.addEventListener("mouseenter", function(e) {
    var chip = e.target && e.target.closest ? e.target.closest(".evidence-chip") : null;
    if (!chip || !chip.dataset.chipExcerpt) return;
    clearTimeout(leaveTimer);
    hoverTimer = setTimeout(function() { showCard(chip); }, 180);
  }, true);

  document.addEventListener("mouseleave", function(e) {
    var chip = e.target && e.target.closest ? e.target.closest(".evidence-chip") : null;
    if (!chip) return;
    clearTimeout(hoverTimer);
    leaveTimer = setTimeout(removeCard, 120);
  }, true);
})();

// --- Floating Command Panel ---

(function setupCommandPanel() {
  var panel = document.createElement("div");
  panel.id = "commandPanel";
  panel.className = "cmd-panel";
  panel.innerHTML =
    '<button class="cmd-toggle" id="cmdToggle" title="Command panel">\u26A1</button>' +
    '<div class="cmd-body" id="cmdBody">' +
      '<div class="cmd-header">Actions</div>' +
      '<button class="cmd-btn" data-action="discover">' +
        '<span class="cmd-icon">\uD83C\uDF10</span>' +
        '<span class="cmd-label">Discover evidence (Chrome)</span>' +
        '<span class="cmd-desc">Opens Chrome, searches Google for Reddit threads, and ingests</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="thread-intel">' +
        '<span class="cmd-icon">\uD83E\uDDE0</span>' +
        '<span class="cmd-label">Analyze conversations</span>' +
        '<span class="cmd-desc">Run LLM analysis on Reddit threads to extract deeper insights</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="brief">' +
        '<span class="cmd-icon">\uD83D\uDCCB</span>' +
        '<span class="cmd-label">Generate research brief</span>' +
        '<span class="cmd-desc">Create a structured intelligence report from collected evidence</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="analyze-signal">' +
        '<span class="cmd-icon">\uD83D\uDD2C</span>' +
        '<span class="cmd-label">Deep-analyze selected signal</span>' +
        '<span class="cmd-desc">Run thread intelligence on the currently selected signal</span>' +
      '</button>' +
      '<div class="cmd-divider"></div>' +
      '<div class="cmd-header">Deepen research</div>' +
      '<div class="cmd-deepen" id="cmdDeepen">' +
        '<button class="cmd-deepen-btn" data-deepen="experiencing_pain" style="--dc:#de5c56">Pain</button>' +
        '<button class="cmd-deepen-btn" data-deepen="tried_failed" style="--dc:#c0392b">Failed</button>' +
        '<button class="cmd-deepen-btn" data-deepen="seeking" style="--dc:#2d6fbb">Seeking</button>' +
        '<button class="cmd-deepen-btn" data-deepen="found_what_works" style="--dc:#3e9558">Works</button>' +
        '<button class="cmd-deepen-btn" data-deepen="warning" style="--dc:#e67e22">Warning</button>' +
        '<button class="cmd-deepen-btn" data-deepen="comparing" style="--dc:#bd842f">Compare</button>' +
      '</div>' +
      '<div class="cmd-divider"></div>' +
      '<div class="cmd-header">Adaptive research</div>' +
      '<button class="cmd-btn" data-action="coverage">' +
        '<span class="cmd-icon">\uD83D\uDCCA</span>' +
        '<span class="cmd-label">Assess coverage gaps</span>' +
        '<span class="cmd-desc">Analyze evidence distribution and identify what\u2019s missing</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="research-round">' +
        '<span class="cmd-icon">\uD83C\uDFAF</span>' +
        '<span class="cmd-label">Run adaptive research round</span>' +
        '<span class="cmd-desc">Auto-generate queries for gaps, discover, classify with LLM, refresh</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="research-loop">' +
        '<span class="cmd-icon">\uD83D\uDD04</span>' +
        '<span class="cmd-label">Full research loop (3 rounds)</span>' +
        '<span class="cmd-desc">Autonomous: assess \u2192 discover \u2192 classify \u2192 reassess \u2192 repeat</span>' +
      '</button>' +
      '<div class="cmd-divider"></div>' +
      '<div class="cmd-header">Intelligence</div>' +
      '<button class="cmd-btn" data-action="reclassify">' +
        '<span class="cmd-icon">\uD83E\uDD16</span>' +
        '<span class="cmd-label">LLM reclassify evidence</span>' +
        '<span class="cmd-desc">Upgrade regex classifications with Gemini Flash (costs ~$0.003/batch)</span>' +
      '</button>' +
      '<button class="cmd-btn" data-action="theme-labels">' +
        '<span class="cmd-icon">\uD83C\uDFF7</span>' +
        '<span class="cmd-label">Generate theme labels</span>' +
        '<span class="cmd-desc">Use LLM to derive readable signal names from search queries</span>' +
      '</button>' +
      '<div class="cmd-divider"></div>' +
      '<button class="cmd-btn cmd-btn-subtle" data-action="reload">' +
        '<span class="cmd-icon">\u21BB</span>' +
        '<span class="cmd-label">Refresh dashboard</span>' +
        '<span class="cmd-desc">Reload all data without leaving the page</span>' +
      '</button>' +
    '</div>';
  document.body.appendChild(panel);

  var toggle = document.getElementById("cmdToggle");
  var body = document.getElementById("cmdBody");
  var open = false;

  toggle.addEventListener("click", function() {
    open = !open;
    body.classList.toggle("cmd-open", open);
    toggle.classList.toggle("cmd-active", open);
  });

  // Close on click outside
  document.addEventListener("click", function(e) {
    if (open && !panel.contains(e.target)) {
      open = false;
      body.classList.remove("cmd-open");
      toggle.classList.remove("cmd-active");
    }
  });

  // Action handlers
  body.addEventListener("click", function(e) {
    var btn = e.target.closest(".cmd-btn");
    if (!btn || btn.disabled) return;

    var action = btn.dataset.action;
    var contextSelector = document.getElementById("contextSelect");
    var contextId = contextSelector ? contextSelector.value : null;

    if (!contextId && action !== "reload") {
      showToast("No context selected", true);
      return;
    }

    btn.disabled = true;
    var label = btn.querySelector(".cmd-label");
    var originalText = label.textContent;
    label.textContent = "Running...";

    var endpoint;
    var opts = { method: "POST", headers: { "Content-Type": "application/json" } };

    switch (action) {
      case "discover":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/discover";
        opts.body = "{}";
        break;
      case "thread-intel":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/thread-intel";
        opts.body = JSON.stringify({ limit: 30 });
        break;
      case "brief":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/brief";
        opts.body = "{}";
        break;
      case "analyze-signal":
        var sig = selectedSignal();
        if (!sig) {
          showToast("Select a signal first", true);
          btn.disabled = false;
          label.textContent = originalText;
          return;
        }
        endpoint = "/api/signals/" + encodeURIComponent(sig.id) + "/analyze";
        break;
      case "coverage":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/coverage";
        opts = { method: "GET" };
        fetch(endpoint)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var gapLines = data.gaps.map(function(g) {
              return "- **" + g.state + "**: " + g.actualPct + "% (target " + g.targetPct + "%, deficit " + g.deficit + "%)";
            });
            var body = "## Coverage Assessment\n\n**Total evidence:** " + data.totalEvidence + "\n\n";
            if (data.gaps.length > 0) {
              body += "### Gaps\n" + gapLines.join("\n") + "\n\n";
            } else {
              body += "### Coverage Balanced\n\n";
            }
            body += "### Recommendation\n" + data.recommendation + "\n\n";
            if (data.topTools.length > 0) body += "### Tools mentioned\n" + data.topTools.join(", ") + "\n\n";
            if (data.highValueCommunities.length > 0) body += "### High-value communities\n" + data.highValueCommunities.join(", ");
            fetch("/api/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "Coverage Assessment", body: body, format: "markdown" }),
            });
            label.textContent = "Done";
            setTimeout(function() { btn.disabled = false; label.textContent = originalText; }, 2000);
          })
          .catch(function(err) { showToast(err.message, true); btn.disabled = false; label.textContent = originalText; });
        return;
      case "research-round":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/research-round";
        opts.body = "{}";
        break;
      case "research-loop":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/research-loop";
        opts.body = JSON.stringify({ maxRounds: 3 });
        break;
      case "reclassify":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/reclassify";
        opts.body = "{}";
        break;
      case "theme-labels":
        endpoint = "/api/contexts/" + encodeURIComponent(contextId) + "/theme-labels";
        opts.body = "{}";
        break;
      case "reload":
        fetch("/api/reload", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        btn.disabled = false;
        label.textContent = originalText;
        return;
    }

    fetch(endpoint, opts)
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || "Failed"); });
        return r.json();
      })
      .then(function(data) {
        label.textContent = "Done";
        setTimeout(function() {
          btn.disabled = false;
          label.textContent = originalText;
        }, 2000);
      })
      .catch(function(err) {
        showToast(err.message || "Action failed", true);
        btn.disabled = false;
        label.textContent = originalText;
      });
  });

  // Deepen research buttons
  var deepenContainer = document.getElementById("cmdDeepen");
  if (deepenContainer) {
    deepenContainer.addEventListener("click", function(e) {
      var btn = e.target.closest(".cmd-deepen-btn");
      if (!btn || btn.disabled) return;

      var state = btn.dataset.deepen;
      var contextSelector = document.getElementById("contextSelect");
      var contextId = contextSelector ? contextSelector.value : null;
      if (!contextId) { showToast("No context selected", true); return; }

      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = "...";

      fetch("/api/contexts/" + encodeURIComponent(contextId) + "/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: state }),
      })
        .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function(data) {
          btn.textContent = "+" + (data.evidenceCount || 0);
          setTimeout(function() { btn.disabled = false; btn.textContent = original; }, 3000);
        })
        .catch(function() {
          showToast("Deepen failed", true);
          btn.disabled = false;
          btn.textContent = original;
        });
    });
  }

  // Keyboard shortcut: Cmd+K or Ctrl+K
  document.addEventListener("keydown", function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open = !open;
      body.classList.toggle("cmd-open", open);
      toggle.classList.toggle("cmd-active", open);
    }
  });
})();

function signalSummaryText(signal) {
  var intel = signal.intelligence;
  if (intel && intel.threads && intel.threads.length > 0) {
    // Use first key insight from thread intelligence
    for (var i = 0; i < intel.threads.length; i++) {
      if (intel.threads[i].keyInsight) return intel.threads[i].keyInsight;
    }
  }
  return signal.summary;
}

function signalWhyText(signal) {
  var intel = signal.intelligence;
  if (!intel || !intel.threads || intel.threads.length === 0) {
    return escapeHtml(signal.why);
  }

  var parts = [];

  // Collect key insights (deduplicated)
  var seen = new Set();
  var insights = [];
  for (var i = 0; i < intel.threads.length; i++) {
    var t = intel.threads[i];
    if (t.keyInsight && !seen.has(t.keyInsight)) {
      seen.add(t.keyInsight);
      insights.push(t.keyInsight);
    }
  }
  if (insights.length > 0) {
    parts.push('<div class="why-insights">' + insights.slice(0, 3).map(function(ins) {
      return '<div class="why-insight">' + escapeHtml(ins) + '</div>';
    }).join("") + '</div>');
  }

  // Collect not-x-its-y across threads
  var nxyItems = [];
  for (var j = 0; j < intel.threads.length; j++) {
    var nxy = intel.threads[j].notXItsY || [];
    for (var k = 0; k < nxy.length; k++) {
      if (nxy[k].surface && nxy[k].deeper) {
        nxyItems.push(nxy[k]);
      }
    }
  }
  if (nxyItems.length > 0) {
    parts.push('<div class="why-nxy">' + nxyItems.slice(0, 2).map(function(n) {
      return '<span class="why-nxy-pill">\u201c' + escapeHtml(truncate(n.surface, 30)) +
        '\u201d \u2192 \u201c' + escapeHtml(truncate(n.deeper, 30)) + '\u201d</span>';
    }).join("") + '</div>');
  }

  // Fallback stats line
  parts.push('<div class="why-stats">' + escapeHtml(signal.why) + '</div>');

  return parts.join("");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, " ");
}

// --- Server-Sent Events (real-time push from server/agents) ---

(function setupSSE() {
  var evtSource = new EventSource("/api/events");

  evtSource.addEventListener("toast", function(e) {
    var data = JSON.parse(e.data);
    showToast(data.message, data.type === "error");
  });

  evtSource.addEventListener("reload", function(e) {
    var data = JSON.parse(e.data);
    showToast("Refreshing data...");
    // Reload radar data for current context
    var contextSelector = document.getElementById("contextSelect");
    var contextId = contextSelector ? contextSelector.value : null;
    if (contextId) {
      fetch("/api/contexts/" + encodeURIComponent(contextId) + "/radar")
        .then(function(r) { return r.json(); })
        .then(function(data) {
          signals = data.signals || [];
          metrics = data.metrics || [];
          timeline = data.timeline || { posts: [], comments: [], authors: [] };
          heatmap = data.heatmap || [];
          intent = data.intent || [];
          evidenceLayers = data.evidenceLayers || [];
          sourceNodes = data.sourceNodes || [];
          pipelineHealth = data.pipelineHealth || null;
          renderAll();
        });
    }
  });

  evtSource.addEventListener("report", function(e) {
    var data = JSON.parse(e.data);
    showReportModal(data);
  });

  evtSource.onerror = function() {
    // Reconnect silently on error
    setTimeout(function() {
      evtSource.close();
      setupSSE();
    }, 3000);
  };
})();

// --- Report Modal ---

function showReportModal(data) {
  // Remove existing modal if any
  var existing = document.getElementById("reportModal");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "reportModal";
  overlay.className = "report-overlay";

  var modal = document.createElement("div");
  modal.className = "report-modal";

  // Header
  var header = document.createElement("div");
  header.className = "report-header";
  header.innerHTML = '<h2>' + escapeHtml(data.title || "Intelligence Report") + '</h2>' +
    '<span class="report-time">' + formatReportTime(data.timestamp) + '</span>' +
    '<button class="report-close" onclick="closeReportModal()">&times;</button>';
  modal.appendChild(header);

  // Body
  var body = document.createElement("div");
  body.className = "report-body";
  if (data.format === "markdown") {
    body.innerHTML = renderMarkdown(data.body);
  } else {
    body.innerHTML = data.body;
  }
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(function() { overlay.classList.add("report-visible"); });

  // Close on overlay click
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeReportModal();
  });

  // Close on Escape
  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      closeReportModal();
      document.removeEventListener("keydown", handler);
    }
  });
}

function closeReportModal() {
  var modal = document.getElementById("reportModal");
  if (modal) {
    modal.classList.remove("report-visible");
    setTimeout(function() { modal.remove(); }, 200);
  }
}

function formatReportTime(ts) {
  if (!ts) return "";
  var d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(md) {
  // Lightweight markdown → HTML (handles headers, bold, lists, code blocks, quotes)
  return md
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^```[\s\S]*?```$/gm, function(block) {
      var code = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      return '<pre><code>' + escapeHtml(code) + '</code></pre>';
    })
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><(h[234]|ul|pre|blockquote)/g, '<$1')
    .replace(/<\/(h[234]|ul|pre|blockquote)><\/p>/g, '</$1>');
}
