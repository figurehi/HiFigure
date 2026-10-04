"use strict";

const params = new URLSearchParams(window.location.search);
const API_BASE = (params.get("api") || `http://${window.location.hostname || "127.0.0.1"}:8000`).replace(/\/$/, "");
const PAGE_SIZE = 24;

const state = {
  participantId: "",
  sessionId: "",
  query: "",
  offset: 0,
  total: 0,
  hasMore: false,
  results: [],
  selected: new Map(),
  preview: null,
  searchStartedAt: 0,
};

const elements = Object.fromEntries([
  "session-gate", "session-form", "participant-id", "participant-error", "app",
  "search-form", "search-input", "empty-state", "loading-state", "error-state",
  "results-grid", "results-summary", "pagination", "previous-page", "next-page",
  "page-label", "selection-count", "selection-list", "selection-empty", "download-all",
  "download-status", "preview-dialog", "close-preview", "preview-image", "preview-type",
  "preview-title", "preview-source", "preview-caption", "preview-terms", "preview-select",
  "preview-download", "toast",
].map((id) => [id, document.getElementById(id)]));

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function imageUrl(item) {
  return item.imageUrl ? new URL(item.imageUrl, `${API_BASE}/`).href : "";
}

function sourceLabel(item) {
  return [item.paperTitle, item.venue, item.year || ""].filter(Boolean).join(" · ") || item.id;
}

function makeSessionId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `b-${Date.now()}-${random}`;
}

function logEvent(type, details = {}) {
  if (!state.participantId || !state.sessionId) return;
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(0, Math.round(performance.now())),
    ...details,
  };
  void fetch(`${API_BASE}/baseline-api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participantId: state.participantId,
      sessionId: state.sessionId,
      events: [event],
    }),
    keepalive: true,
  }).catch(() => {
    // Study logging is best-effort and never blocks the participant workflow.
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

function startSession(participantId) {
  state.participantId = participantId;
  state.sessionId = makeSessionId();
  elements["session-gate"].hidden = true;
  elements.app.hidden = false;
  elements["search-input"].focus();
  logEvent("session_started", { metadata: { tool: "baseline-keyword-search", selectionLimit: null } });
}

elements["session-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  const participantId = elements["participant-id"].value.trim();
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(participantId)) {
    elements["participant-error"].textContent = "Use 2–64 letters, numbers, hyphens, or underscores.";
    return;
  }
  elements["participant-error"].textContent = "";
  startSession(participantId);
});

async function performSearch(query, offset = 0) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return;
  state.query = normalizedQuery;
  state.offset = Math.max(0, offset);
  state.searchStartedAt = performance.now();
  elements["empty-state"].hidden = true;
  elements["error-state"].hidden = true;
  elements["results-grid"].replaceChildren();
  elements["loading-state"].hidden = false;
  elements.pagination.hidden = true;
  elements["results-summary"].textContent = `Searching for “${normalizedQuery}”…`;
  elements["search-input"].value = normalizedQuery;

  try {
    const url = new URL(`${API_BASE}/baseline-api/search`);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(state.offset));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const payload = await response.json();
    state.results = Array.isArray(payload.results) ? payload.results : [];
    state.total = Number(payload.total) || 0;
    state.hasMore = Boolean(payload.hasMore);
    renderResults();
    logEvent("keyword_search", {
      query: normalizedQuery,
      resultCount: state.results.length,
      metadata: {
        totalMatches: state.total,
        offset: state.offset,
        algorithm: payload.algorithm,
        durationMs: Math.round(performance.now() - state.searchStartedAt),
      },
    });
  } catch (error) {
    elements["error-state"].textContent = "The keyword search service is unavailable. Please ask the researcher to check the Baseline server.";
    elements["error-state"].hidden = false;
    elements["results-summary"].textContent = "Search could not be completed.";
    logEvent("search_error", { query: normalizedQuery, metadata: { message: String(error) } });
  } finally {
    elements["loading-state"].hidden = true;
  }
}

elements["search-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  void performSearch(elements["search-input"].value, 0);
});

document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => void performSearch(button.dataset.query || "", 0));
});

function renderResults() {
  const grid = elements["results-grid"];
  grid.replaceChildren();
  if (state.results.length === 0) {
    elements["empty-state"].hidden = false;
    elements["empty-state"].querySelector("h3").textContent = "No literal keyword matches";
    elements["empty-state"].querySelector("p").textContent = "Try fewer words or different terms used in scientific figure captions.";
    elements["results-summary"].textContent = `No results for “${state.query}”.`;
    return;
  }

  elements["empty-state"].hidden = true;
  const start = state.offset + 1;
  const end = state.offset + state.results.length;
  elements["results-summary"].textContent = `${state.total.toLocaleString()} matches · showing ${start}–${end}`;
  for (const item of state.results) grid.append(createResultCard(item));

  const page = Math.floor(state.offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  elements["page-label"].textContent = `Page ${page} of ${pages}`;
  elements["previous-page"].disabled = state.offset === 0;
  elements["next-page"].disabled = !state.hasMore;
  elements.pagination.hidden = pages <= 1;
}

function createResultCard(item) {
  const card = createElement("article", `result-card${state.selected.has(item.id) ? " is-selected" : ""}`);
  card.dataset.id = item.id;

  const preview = createElement("button", "card-preview");
  preview.type = "button";
  preview.setAttribute("aria-label", `Preview ${item.title}`);
  const image = createElement("img");
  image.src = imageUrl(item);
  image.alt = item.title;
  image.loading = "lazy";
  preview.append(image);
  preview.addEventListener("click", () => openPreview(item));

  const body = createElement("div", "card-body");
  const meta = createElement("div", "card-meta");
  meta.append(createElement("span", "card-type", item.imageType || "diagram"));
  meta.append(createElement("span", "", [item.venue, item.year || ""].filter(Boolean).join(" ")));
  body.append(meta);
  body.append(createElement("h3", "card-title", item.title));
  body.append(createElement("p", "card-source", item.paperTitle || item.caption || item.id));
  body.append(createTermList(item.matchedTerms));

  const actions = createElement("div", "card-actions");
  const select = createElement("button", "select-button", state.selected.has(item.id) ? "Selected" : "Select reference");
  select.type = "button";
  select.addEventListener("click", () => toggleSelection(item));
  const download = createElement("button", "icon-button", "↓");
  download.type = "button";
  download.title = "Download image";
  download.setAttribute("aria-label", `Download ${item.title}`);
  download.addEventListener("click", () => void downloadReference(item));
  actions.append(select, download);
  body.append(actions);
  card.append(preview, body);
  return card;
}

function createTermList(terms) {
  const list = createElement("div", "term-list");
  for (const term of (terms || []).slice(0, 4)) list.append(createElement("span", "", term));
  return list;
}

function toggleSelection(item) {
  if (state.selected.has(item.id)) {
    state.selected.delete(item.id);
    logEvent("reference_removed", { resultId: item.id, query: state.query });
  } else {
    state.selected.set(item.id, item);
    logEvent("reference_selected", {
      resultId: item.id,
      query: state.query,
      metadata: { rank: state.offset + state.results.findIndex((result) => result.id === item.id) + 1 },
    });
  }
  renderResults();
  renderSelection();
  if (state.preview && state.preview.id === item.id) updatePreviewSelect();
}

function renderSelection() {
  elements["selection-list"].replaceChildren();
  elements["selection-count"].textContent = `${state.selected.size} selected`;
  elements["selection-empty"].hidden = state.selected.size > 0;
  elements["download-all"].disabled = state.selected.size === 0;
  for (const item of state.selected.values()) {
    const row = createElement("div", "selection-item");
    const image = createElement("img");
    image.src = imageUrl(item);
    image.alt = "";
    const label = createElement("strong", "", item.title);
    const remove = createElement("button", "remove-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${item.title}`);
    remove.addEventListener("click", () => toggleSelection(item));
    row.append(image, label, remove);
    elements["selection-list"].append(row);
  }
}

function openPreview(item) {
  state.preview = item;
  elements["preview-image"].src = imageUrl(item);
  elements["preview-image"].alt = item.title;
  elements["preview-type"].textContent = item.imageType || "diagram";
  elements["preview-title"].textContent = item.title;
  elements["preview-source"].textContent = sourceLabel(item);
  elements["preview-caption"].textContent = item.caption || "No caption available.";
  elements["preview-terms"].replaceChildren(...createTermList(item.matchedTerms).childNodes);
  updatePreviewSelect();
  elements["preview-dialog"].showModal();
  logEvent("result_opened", {
    resultId: item.id,
    query: state.query,
    metadata: { rank: state.offset + state.results.findIndex((result) => result.id === item.id) + 1 },
  });
}

function updatePreviewSelect() {
  if (!state.preview) return;
  elements["preview-select"].textContent = state.selected.has(state.preview.id) ? "Remove from selection" : "Select reference";
}

elements["close-preview"].addEventListener("click", () => elements["preview-dialog"].close());
elements["preview-dialog"].addEventListener("click", (event) => {
  if (event.target === elements["preview-dialog"]) elements["preview-dialog"].close();
});
elements["preview-select"].addEventListener("click", () => state.preview && toggleSelection(state.preview));
elements["preview-download"].addEventListener("click", () => state.preview && void downloadReference(state.preview));

function triggerServerDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
}

function downloadReference(item) {
  const url = new URL(`${API_BASE}/baseline-api/download/${encodeURIComponent(item.id)}`);
  url.searchParams.set("participant_id", state.participantId);
  url.searchParams.set("session_id", state.sessionId);
  url.searchParams.set("query", state.query);
  triggerServerDownload(url.href);
  showToast("Download started.");
}

elements["download-all"].addEventListener("click", () => {
  const selected = Array.from(state.selected.values());
  if (selected.length > 100) {
    showToast("Download up to 100 references in one ZIP.");
    return;
  }
  elements["download-all"].disabled = true;
  elements["download-status"].textContent = "Preparing one download…";
  const url = new URL(`${API_BASE}/baseline-api/download`);
  for (const item of selected) url.searchParams.append("reference_id", item.id);
  url.searchParams.set("participant_id", state.participantId);
  url.searchParams.set("session_id", state.sessionId);
  url.searchParams.set("query", state.query);
  triggerServerDownload(url.href);
  elements["download-status"].textContent = selected.length === 1
    ? "Image download started."
    : "ZIP download started. Ready to upload to GPT.";
  elements["download-all"].disabled = false;
});

elements["previous-page"].addEventListener("click", () => {
  void performSearch(state.query, Math.max(0, state.offset - PAGE_SIZE));
  window.scrollTo({ top: document.querySelector(".workspace").offsetTop - 80, behavior: "smooth" });
});

elements["next-page"].addEventListener("click", () => {
  void performSearch(state.query, state.offset + PAGE_SIZE);
  window.scrollTo({ top: document.querySelector(".workspace").offsetTop - 80, behavior: "smooth" });
});

renderSelection();
