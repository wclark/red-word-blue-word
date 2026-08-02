import {
  BOUNDARY,
  buildModel,
  createModelSnapshot,
  filterModel,
  groupCards,
  loadModelSnapshot,
} from "./model.js";
import { createGeneratorScreen } from "./screens/generator-screen.js";
import { createScreenRouter } from "./screens/router.js";

const SAMPLE_TEXT = `The red kite climbs above the quiet park. The quiet park wakes under morning light. Morning light warms the red kite. A bluebird circles above the park. The bluebird sings and the kite climbs. Small patterns can make surprising stories.`;
const MAX_SOURCE_CHARACTERS = 750_000;
const MAX_MODEL_FILE_BYTES = 8_000_000;
const COLLAPSED_BLUE_WORDS = 12;

const elements = {
  tabs: [...document.querySelectorAll("[role='tab']")],
  panels: [...document.querySelectorAll("[role='tabpanel']")],
  urlForm: document.querySelector("#url-form"),
  urlInput: document.querySelector("#source-url"),
  urlSubmit: document.querySelector("#url-submit"),
  readerFallback: document.querySelector("#reader-fallback"),
  sampleUrls: [...document.querySelectorAll("[data-example-url]")],
  pasteForm: document.querySelector("#paste-form"),
  sourceText: document.querySelector("#source-text"),
  characterCount: document.querySelector("#character-count"),
  fileInput: document.querySelector("#source-file"),
  dropZone: document.querySelector("#drop-zone"),
  modelFileInput: document.querySelector("#model-file"),
  modelDropZone: document.querySelector("#model-drop-zone"),
  downloadModel: document.querySelector("#download-model"),
  loadStatus: document.querySelector("#load-status"),
  statusText: document.querySelector("#status-text"),
  sourceName: document.querySelector("#source-name"),
  statWords: document.querySelector("#stat-words"),
  statCards: document.querySelector("#stat-cards"),
  statUnique: document.querySelector("#stat-unique"),
  statSentences: document.querySelector("#stat-sentences"),
  boundaryCheck: document.querySelector("#boundary-check"),
  diagCharacters: document.querySelector("#diag-characters"),
  diagVocabulary: document.querySelector("#diag-vocabulary"),
  diagAverageSentence: document.querySelector("#diag-average-sentence"),
  diagDuplicates: document.querySelector("#diag-duplicates"),
  diagPiles: document.querySelector("#diag-piles"),
  diagBranching: document.querySelector("#diag-branching"),
  topStarts: document.querySelector("#top-starts"),
  topPairs: document.querySelector("#top-pairs"),
  firstTokens: document.querySelector("#first-tokens"),
  lastTokens: document.querySelector("#last-tokens"),
  cardSearch: document.querySelector("#card-search"),
  cardSort: document.querySelector("#card-sort"),
  cardPageSize: document.querySelector("#card-page-size"),
  cardPiles: document.querySelector("#card-piles"),
  deckSummary: document.querySelector("#deck-summary"),
  deckPrevious: document.querySelector("#deck-previous"),
  deckNext: document.querySelector("#deck-next"),
  deckPageStatus: document.querySelector("#deck-page-status"),
  modelEdits: document.querySelector("#model-edits"),
  modelEditStatus: document.querySelector("#model-edit-status"),
  restoreWords: document.querySelector("#restore-words"),
};

let sourceModel = buildModel(SAMPLE_TEXT);
let currentModel = sourceModel;
let currentSourceLabel = "Example text";
let deckPage = 1;
let screenRouter;
const removedWords = new Set();
const expandedPiles = new Set();
const generatorScreen = createGeneratorScreen({ getModel: () => currentModel });

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function showStatus(message, tone = "ready") {
  elements.loadStatus.dataset.tone = tone;
  elements.statusText.textContent = message;
}

function setBusy(busy) {
  elements.urlSubmit.disabled = busy;
  elements.urlInput.disabled = busy;
  elements.urlSubmit.textContent = busy ? "Reading…" : "Read URL";
}

function activateTab(panelId) {
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.tab === panelId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  elements.panels.forEach((panel) => {
    panel.hidden = panel.id !== panelId;
  });
}

function updateStats() {
  const { stats } = currentModel;
  elements.statWords.textContent = number(stats.wordCount);
  elements.statCards.textContent = number(stats.cardCount);
  elements.statUnique.textContent = number(stats.uniquePairCount);
  elements.statSentences.textContent = number(stats.sentenceCount);
  renderDiagnostics();
}

function percent(value) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function renderTokenPreview(container, tokens) {
  container.replaceChildren();
  container.setAttribute("aria-label", tokens.join(" "));
  tokens.forEach((token) => {
    const chip = document.createElement("span");
    chip.textContent = token;
    container.append(chip);
  });
}

function renderDiagnostics() {
  const { stats, diagnostics } = currentModel;
  elements.diagCharacters.textContent = number(diagnostics.characterCount);
  elements.diagVocabulary.textContent = number(stats.vocabularyCount);
  elements.diagAverageSentence.textContent = `${diagnostics.averageSentenceLength.toFixed(1)} avg / ${number(diagnostics.longestSentenceLength)} max`;
  elements.diagDuplicates.textContent = `${percent(diagnostics.duplicateCardRate)} (${number(diagnostics.duplicateCardCount)})`;
  elements.diagPiles.textContent = number(diagnostics.redPileCount);
  elements.diagBranching.textContent = `${number(diagnostics.branchingPileCount)} of ${number(diagnostics.redPileCount)}`;
  elements.boundaryCheck.textContent = `Boundary check: ${number(diagnostics.startCardCount)} starts / ${number(diagnostics.endCardCount)} ends · ${diagnostics.averageNextWordsPerPile.toFixed(1)} average / ${number(diagnostics.widestPileNextWordCount)} widest next-word choices`;

  elements.topStarts.replaceChildren();
  diagnostics.topStarts.forEach(({ word, count }) => {
    const item = document.createElement("li");
    const start = document.createElement("span");
    start.className = "diagnostic-pair";
    const boundary = document.createElement("strong");
    boundary.className = "red-ink";
    boundary.textContent = "X";
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    const startWord = document.createElement("strong");
    startWord.className = "blue-ink";
    startWord.textContent = word;
    start.append(boundary, arrow, startWord);
    const weight = document.createElement("small");
    weight.textContent = `×${number(count)}`;
    item.append(start, weight);
    elements.topStarts.append(item);
  });

  elements.topPairs.replaceChildren();
  diagnostics.topPairs.forEach(({ red, blue, count }) => {
    const item = document.createElement("li");
    const pair = document.createElement("span");
    pair.className = "diagnostic-pair";
    const redWord = document.createElement("strong");
    redWord.className = "red-ink";
    redWord.textContent = displayWord(red);
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    const blueWord = document.createElement("strong");
    blueWord.className = "blue-ink";
    blueWord.textContent = displayWord(blue);
    pair.append(redWord, arrow, blueWord);
    const weight = document.createElement("small");
    weight.textContent = `×${number(count)}`;
    item.append(pair, weight);
    elements.topPairs.append(item);
  });

  renderTokenPreview(elements.firstTokens, diagnostics.firstTokens);
  renderTokenPreview(elements.lastTokens, diagnostics.lastTokens);
}

function displayWord(word) {
  return word === BOUNDARY ? "X" : word;
}

function renderModelEdits(message = "") {
  if (!removedWords.size) {
    elements.modelEdits.hidden = true;
    elements.modelEditStatus.textContent = "";
    return;
  }

  elements.modelEdits.hidden = false;
  const words = [...removedWords].sort((a, b) => a.localeCompare(b));
  elements.modelEditStatus.textContent = message ||
    `${number(words.length)} removed word${words.length === 1 ? "" : "s"}: ${words.join(", ")}. ` +
    `${number(currentModel.diagnostics.removedCardCount)} cards removed from the model.`;
}

function removeWordFromModel(word) {
  if (word === BOUNDARY || removedWords.has(word)) return;
  const previousCardCount = currentModel.stats.cardCount;
  removedWords.add(word);
  expandedPiles.delete(word);
  currentModel = filterModel(sourceModel, removedWords);
  deckPage = 1;
  updateStats();
  renderDeck();
  generatorScreen.generate();

  const removedNow = previousCardCount - currentModel.stats.cardCount;
  renderModelEdits(
    `Removed “${word}” and ${number(removedNow)} card${removedNow === 1 ? "" : "s"} where it appeared on the red or blue side. ` +
    `${number(currentModel.diagnostics.removedCardCount)} cards are now removed in total.`
  );
}

function restoreRemovedWords() {
  if (!removedWords.size) return;
  removedWords.clear();
  expandedPiles.clear();
  currentModel = sourceModel;
  deckPage = 1;
  updateStats();
  renderDeck();
  generatorScreen.generate();
  renderModelEdits();
  showStatus("All removed words and their cards have been restored.", "ready");
}

function renderDeck() {
  const query = elements.cardSearch.value.trim().toLocaleLowerCase("en-US");
  const groups = groupCards(currentModel, { sortBy: elements.cardSort.value });
  const matching = groups.filter(({ red }) => !query || red.toLocaleLowerCase("en-US").includes(query));
  const pageSize = Number(elements.cardPageSize.value);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  deckPage = Math.min(Math.max(1, deckPage), pageCount);
  const start = (deckPage - 1) * pageSize;
  const visible = matching.slice(start, start + pageSize);
  elements.cardPiles.replaceChildren();

  visible.forEach((group) => {
    const pile = document.createElement("article");
    pile.className = "card-pile";

    const redSide = document.createElement(group.red === BOUNDARY ? "div" : "button");
    redSide.className = "pile-red";
    if (group.red !== BOUNDARY) {
      redSide.type = "button";
      redSide.setAttribute(
        "aria-label",
        `Remove ${group.red} and every card that references it from the model`
      );
      redSide.title = `Remove “${group.red}” from the model`;
      redSide.addEventListener("click", () => removeWordFromModel(group.red));
    }
    const redLabel = document.createElement("span");
    redLabel.textContent = group.red === BOUNDARY ? "protected boundary" : "click to remove";
    const redWord = document.createElement("strong");
    redWord.textContent = displayWord(group.red);
    const redMeta = document.createElement("small");
    redMeta.className = "pile-meta";
    redMeta.textContent = `${number(group.total)} card${group.total === 1 ? "" : "s"} · ${number(group.blueWords.length)} blue choice${group.blueWords.length === 1 ? "" : "s"}`;
    redSide.append(redLabel, redWord, redMeta);

    const arrow = document.createElement("span");
    arrow.className = "pile-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const blueSide = document.createElement("div");
    blueSide.className = "pile-blues";
    const expanded = expandedPiles.has(group.red);
    const displayedBlueWords = expanded ? group.blueWords : group.blueWords.slice(0, COLLAPSED_BLUE_WORDS);
    displayedBlueWords.forEach(({ blue, count }) => {
      const chip = document.createElement("span");
      chip.className = "blue-chip";
      const word = document.createElement("span");
      word.textContent = blue === BOUNDARY ? "X · end" : blue;
      chip.append(word);
      if (count > 1) {
        const badge = document.createElement("small");
        badge.textContent = `×${count}`;
        chip.append(badge);
      }
      blueSide.append(chip);
    });
    if (group.blueWords.length > COLLAPSED_BLUE_WORDS) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "more-chip";
      more.setAttribute("aria-expanded", String(expanded));
      more.textContent = expanded
        ? "Show fewer"
        : `Show ${number(group.blueWords.length - COLLAPSED_BLUE_WORDS)} more`;
      more.addEventListener("click", () => {
        if (expanded) expandedPiles.delete(group.red);
        else expandedPiles.add(group.red);
        renderDeck();
      });
      blueSide.append(more);
    }

    pile.append(redSide, arrow, blueSide);
    elements.cardPiles.append(pile);
  });

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-deck";
    empty.textContent = query
      ? `No red-word pile matches “${elements.cardSearch.value.trim()}”.`
      : "No red-word piles remain in this model.";
    elements.cardPiles.append(empty);
  }

  if (matching.length) {
    const end = start + visible.length;
    const scope = query ? `${number(matching.length)} matching` : number(matching.length);
    elements.deckSummary.textContent = `Showing ${number(start + 1)}–${number(end)} of ${scope} red-word piles${query ? ` (${number(groups.length)} total)` : ""}.`;
  } else {
    elements.deckSummary.textContent = `0 of ${number(groups.length)} red-word piles.`;
  }
  elements.deckPageStatus.textContent = `Page ${number(deckPage)} of ${number(pageCount)}`;
  elements.deckPrevious.disabled = deckPage <= 1;
  elements.deckNext.disabled = deckPage >= pageCount;
}

function installModel(nextSourceModel, nextCurrentModel, sourceLabel) {
  sourceModel = nextSourceModel;
  currentModel = nextCurrentModel;
  currentSourceLabel = sourceLabel;
  removedWords.clear();
  currentModel.removedWords.forEach((word) => removedWords.add(word));
  expandedPiles.clear();
  deckPage = 1;
  elements.sourceName.textContent = sourceLabel;
  elements.cardSearch.value = "";
  updateStats();
  renderDeck();
  renderModelEdits();
  generatorScreen.generate();
}

function train(text, sourceLabel) {
  const clipped = String(text ?? "").slice(0, MAX_SOURCE_CHARACTERS);
  const nextModel = buildModel(clipped);
  if (nextModel.stats.wordCount < 2) {
    throw new Error("Add at least two words so there is a pattern to follow.");
  }
  installModel(nextModel, nextModel, sourceLabel);
  return clipped.length < String(text ?? "").length;
}

function safeFilename(label) {
  return String(label ?? "model")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "model";
}

function downloadCurrentModel() {
  const snapshot = createModelSnapshot(currentModel, { sourceLabel: currentSourceLabel });
  const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(currentSourceLabel)}.rwbw.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  const originalLabel = elements.downloadModel.textContent;
  elements.downloadModel.textContent = "Model downloaded";
  window.setTimeout(() => {
    elements.downloadModel.textContent = originalLabel;
  }, 1800);
}

async function loadSavedModel(file) {
  if (!file) return;
  if (file.size > MAX_MODEL_FILE_BYTES) {
    showStatus("That saved model is unexpectedly large.", "error");
    return;
  }
  try {
    const loaded = loadModelSnapshot(await file.text());
    installModel(loaded.sourceModel, loaded.model, loaded.sourceLabel);
    const removedCount = loaded.model.removedWords.length;
    showStatus(
      `Loaded ${file.name} with ${number(removedCount)} pruned word${removedCount === 1 ? "" : "s"}.`,
      "ready"
    );
    elements.modelFileInput.value = "";
    screenRouter.navigate("model");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function textFromHtml(html) {
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  documentCopy.querySelectorAll("script, style, noscript, svg, template").forEach((node) => node.remove());
  return documentCopy.body?.textContent ?? documentCopy.documentElement.textContent ?? "";
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "text/plain, text/html;q=0.9, */*;q=0.2" } });
    if (!response.ok) throw new Error(`The server answered with ${response.status}.`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_SOURCE_CHARACTERS * 3) throw new Error("That source is too large for this classroom tool.");
    const body = await response.text();
    const type = response.headers.get("content-type") ?? "";
    return type.includes("html") ? textFromHtml(body) : body;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readUrl(url, useFallback) {
  try {
    return { text: await fetchWithTimeout(url), usedFallback: false };
  } catch (directError) {
    if (!useFallback) throw directError;
    const readerUrl = `https://r.jina.ai/${url}`;
    try {
      return { text: await fetchWithTimeout(readerUrl), usedFallback: true };
    } catch (readerError) {
      throw new Error("That page could not be read. Try pasting its text or opening a saved text file instead.");
    }
  }
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_SOURCE_CHARACTERS * 3) {
    showStatus("That file is too large. Choose one under about 2 MB.", "error");
    return;
  }
  try {
    const raw = await file.text();
    const text = /html?/i.test(file.type) || /\.html?$/i.test(file.name) ? textFromHtml(raw) : raw;
    const clipped = train(text, file.name);
    showStatus(`${file.name} is ready.${clipped ? " The text was shortened to the first 750,000 characters." : ""}`, "ready");
  } catch (error) {
    showStatus(error.message, "error");
  }
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const index = elements.tabs.indexOf(tab);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = elements.tabs[(index + offset + elements.tabs.length) % elements.tabs.length];
    activateTab(next.dataset.tab);
    next.focus();
  });
});

elements.sourceText.value = SAMPLE_TEXT;
elements.characterCount.textContent = `${number(SAMPLE_TEXT.length)} characters`;

elements.sourceText.addEventListener("input", () => {
  elements.characterCount.textContent = `${number(elements.sourceText.value.length)} characters`;
});

elements.pasteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const clipped = train(elements.sourceText.value, "Pasted text");
    showStatus(`Your pasted text is ready.${clipped ? " It was shortened to the first 750,000 characters." : ""}`, "ready");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

elements.urlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let url;
  try {
    url = new URL(elements.urlInput.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    showStatus("Enter a complete http:// or https:// URL.", "error");
    return;
  }

  setBusy(true);
  showStatus("Reading the source…", "loading");
  try {
    const result = await readUrl(url.href, elements.readerFallback.checked);
    const clipped = train(result.text, url.hostname);
    const route = result.usedFallback ? " through Jina Reader" : " directly";
    showStatus(`Loaded ${url.hostname}${route}.${clipped ? " The text was shortened to the first 750,000 characters." : ""}`, "ready");
  } catch (error) {
    showStatus(error.name === "AbortError" ? "The request took too long. Try pasting the text instead." : error.message, "error");
  } finally {
    setBusy(false);
  }
});

elements.sampleUrls.forEach((button) => button.addEventListener("click", () => {
  elements.urlInput.value = new URL(button.dataset.exampleUrl, document.baseURI).href;
  if (button.dataset.requiresReader === "true") elements.readerFallback.checked = true;
  elements.urlForm.requestSubmit();
}));

elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));
elements.modelFileInput.addEventListener("change", () => loadSavedModel(elements.modelFileInput.files[0]));
elements.downloadModel.addEventListener("click", downloadCurrentModel);

['dragenter', 'dragover'].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
});

elements.dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

['dragenter', 'dragover'].forEach((eventName) => {
  elements.modelDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.modelDropZone.classList.add("is-dragging");
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  elements.modelDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.modelDropZone.classList.remove("is-dragging");
  });
});

elements.modelDropZone.addEventListener("drop", (event) => loadSavedModel(event.dataTransfer.files[0]));

elements.cardSearch.addEventListener("input", () => {
  deckPage = 1;
  renderDeck();
});

elements.cardSort.addEventListener("change", () => {
  deckPage = 1;
  renderDeck();
});

elements.cardPageSize.addEventListener("change", () => {
  deckPage = 1;
  renderDeck();
});

elements.deckPrevious.addEventListener("click", () => {
  deckPage -= 1;
  renderDeck();
  elements.cardPiles.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.deckNext.addEventListener("click", () => {
  deckPage += 1;
  renderDeck();
  elements.cardPiles.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.restoreWords.addEventListener("click", restoreRemovedWords);

screenRouter = createScreenRouter({ defaultScreen: "source" });
updateStats();
renderDeck();
renderModelEdits();
