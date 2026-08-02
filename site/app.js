import {
  BOUNDARY,
  buildModel,
  collapseCards,
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
  cardView: document.querySelector("#card-view"),
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
const removedSequences = [];
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

function rebuildFromPruning() {
  currentModel = filterModel(sourceModel, removedWords, removedSequences);
  deckPage = 1;
  updateStats();
  renderDeck();
  generatorScreen.reset();
}

function renderModelEdits(message = "") {
  if (!removedWords.size && !removedSequences.length) {
    elements.modelEdits.hidden = true;
    elements.modelEditStatus.textContent = "";
    return;
  }

  elements.modelEdits.hidden = false;
  const words = [...removedWords].sort((a, b) => a.localeCompare(b));
  const decisions = [];
  if (words.length) {
    decisions.push(`${number(words.length)} removed word${words.length === 1 ? "" : "s"}: ${words.join(", ")}`);
  }
  if (removedSequences.length) {
    const examples = removedSequences.slice(0, 2).map((sequence) => `“${sequence.join(" ")}”`).join(", ");
    const extra = removedSequences.length > 2 ? ` +${number(removedSequences.length - 2)} more` : "";
    decisions.push(`${number(removedSequences.length)} removed sequence${removedSequences.length === 1 ? "" : "s"}: ${examples}${extra}`);
  }
  elements.modelEditStatus.textContent = message ||
    `${decisions.join(" · ")}. ${number(currentModel.diagnostics.removedCardCount)} cards removed from the model.`;
}

function removeWordFromModel(word) {
  if (word === BOUNDARY || removedWords.has(word)) return;
  const previousCardCount = currentModel.stats.cardCount;
  removedWords.add(word);
  expandedPiles.delete(word);
  rebuildFromPruning();

  const removedNow = previousCardCount - currentModel.stats.cardCount;
  renderModelEdits(
    `Removed “${word}” and ${number(removedNow)} card${removedNow === 1 ? "" : "s"} where it appeared on the red or blue side. ` +
    `${number(currentModel.diagnostics.removedCardCount)} cards are now removed in total.`
  );
}

function removeSequenceFromModel(sequence) {
  const words = sequence.filter((word) => word !== BOUNDARY);
  if (words.length < 2) return;
  const key = JSON.stringify(words);
  if (removedSequences.some((removed) => JSON.stringify(removed) === key)) return;
  removedSequences.push(words);
  expandedPiles.clear();
  rebuildFromPruning();
  renderModelEdits(
    `Removed every occurrence of “${words.join(" ")}” from the token stream before rebuilding the bigrams. ` +
    `${number(currentModel.diagnostics.removedCardCount)} cards are now removed in total.`
  );
}

function restoreRemovedWords() {
  if (!removedWords.size && !removedSequences.length) return;
  removedWords.clear();
  removedSequences.splice(0);
  expandedPiles.clear();
  currentModel = sourceModel;
  deckPage = 1;
  updateStats();
  renderDeck();
  generatorScreen.reset();
  renderModelEdits();
  showStatus("All removed words, sequences, and cards have been restored.", "ready");
}

function renderDeck() {
  const query = elements.cardSearch.value.trim().toLocaleLowerCase("en-US");
  const collapsed = elements.cardView.value === "collapsed";
  const cards = collapsed
    ? collapseCards(currentModel, { sortBy: elements.cardSort.value })
    : groupCards(currentModel, { sortBy: elements.cardSort.value });
  const matching = cards.filter(({ red }) => !query || red.toLocaleLowerCase("en-US").includes(query));
  const pageSize = Number(elements.cardPageSize.value);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  deckPage = Math.min(Math.max(1, deckPage), pageCount);
  const start = (deckPage - 1) * pageSize;
  const visible = matching.slice(start, start + pageSize);
  elements.cardPiles.replaceChildren();

  visible.forEach((card) => {
    const pile = document.createElement("article");
    pile.className = collapsed ? "card-pile virtual-card" : "card-pile bigram-pile";

    const redSide = document.createElement(card.red === BOUNDARY ? "div" : "button");
    redSide.className = "pile-red";
    if (card.red !== BOUNDARY) {
      redSide.type = "button";
      redSide.setAttribute(
        "aria-label",
        `Remove ${card.red} and every card that references it from the model`
      );
      redSide.title = `Remove “${card.red}” from the model`;
      redSide.addEventListener("click", () => removeWordFromModel(card.red));
    }
    const redLabel = document.createElement("span");
    redLabel.textContent = card.red === BOUNDARY ? "protected boundary" : "click to remove";
    const redWord = document.createElement("strong");
    redWord.textContent = displayWord(card.red);
    const redMeta = document.createElement("small");
    redMeta.className = "pile-meta";
    redMeta.textContent = collapsed
      ? `${number(card.count)} occurrence${card.count === 1 ? "" : "s"} · ${number(card.bluePath.length)} blue-side word${card.bluePath.length === 1 ? "" : "s"}`
      : `${number(card.total)} card${card.total === 1 ? "" : "s"} · ${number(card.blueWords.length)} blue choice${card.blueWords.length === 1 ? "" : "s"}`;
    redSide.append(redLabel, redWord, redMeta);

    const arrow = document.createElement("span");
    arrow.className = "pile-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const blueSide = document.createElement("div");
    blueSide.className = "pile-blues";
    if (collapsed) {
      blueSide.classList.add("virtual-blue-side");
      const phrase = document.createElement("span");
      phrase.className = "virtual-blue-path";
      phrase.setAttribute(
        "aria-label",
        `Blue side: ${card.bluePath.map((word) => displayWord(word)).join(" ")}`
      );
      card.bluePath.forEach((word, index) => {
        const token = document.createElement("span");
        token.className = "virtual-blue-token";
        if (index === card.bluePath.length - 1) token.classList.add("is-final");
        token.textContent = word === BOUNDARY ? "X · end" : word;
        phrase.append(token);
      });
      blueSide.append(phrase);

      if (card.sourceSequence.length >= 3) {
        const removeSequence = document.createElement("button");
        removeSequence.type = "button";
        removeSequence.className = "sequence-remove";
        removeSequence.setAttribute(
          "aria-label",
          `Remove sequence ${card.sourceSequence.join(" ")} from the source before rebuilding bigrams`
        );
        removeSequence.textContent = `Remove this ${number(card.sourceSequence.length)}-word source sequence`;
        removeSequence.addEventListener("click", () => removeSequenceFromModel(card.sourceSequence));
        blueSide.append(removeSequence);
      }
    } else {
      const expanded = expandedPiles.has(card.red);
      const displayedBlueWords = expanded ? card.blueWords : card.blueWords.slice(0, COLLAPSED_BLUE_WORDS);
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
      if (card.blueWords.length > COLLAPSED_BLUE_WORDS) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "more-chip";
        more.setAttribute("aria-expanded", String(expanded));
        more.textContent = expanded
          ? "Show fewer"
          : `Show ${number(card.blueWords.length - COLLAPSED_BLUE_WORDS)} more`;
        more.addEventListener("click", () => {
          if (expanded) expandedPiles.delete(card.red);
          else expandedPiles.add(card.red);
          renderDeck();
        });
        blueSide.append(more);
      }
    }

    pile.append(redSide, arrow, blueSide);
    elements.cardPiles.append(pile);
  });

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-deck";
    empty.textContent = query
      ? `No red word matches “${elements.cardSearch.value.trim()}”.`
      : "No virtual cards remain in this model.";
    elements.cardPiles.append(empty);
  }

  if (matching.length) {
    const end = start + visible.length;
    const scope = query ? `${number(matching.length)} matching` : number(matching.length);
    const kind = collapsed ? "collapsed virtual cards" : "red-word bigram piles";
    elements.deckSummary.textContent = `Showing ${number(start + 1)}–${number(end)} of ${scope} ${kind}${query ? ` (${number(cards.length)} total)` : ""}.`;
  } else {
    const kind = collapsed ? "collapsed virtual cards" : "red-word bigram piles";
    elements.deckSummary.textContent = `0 of ${number(cards.length)} ${kind}.`;
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
  removedSequences.splice(0, removedSequences.length, ...(currentModel.removedSequences ?? []).map((sequence) => [...sequence]));
  expandedPiles.clear();
  deckPage = 1;
  elements.sourceName.textContent = sourceLabel;
  elements.cardSearch.value = "";
  updateStats();
  renderDeck();
  renderModelEdits();
  generatorScreen.reset();
}

function train(text, sourceLabel) {
  const clipped = String(text ?? "").slice(0, MAX_SOURCE_CHARACTERS);
  const nextModel = buildModel(clipped);
  if (nextModel.stats.wordCount < 2) {
    throw new Error("Add at least two words so there is a pattern to follow.");
  }
  installModel(nextModel, nextModel, sourceLabel);
  screenRouter?.navigate("model");
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
    const removedWordCount = loaded.model.removedWords.length;
    const removedSequenceCount = loaded.model.removedSequences.length;
    const pruningSummary = [
      `${number(removedWordCount)} pruned word${removedWordCount === 1 ? "" : "s"}`,
      `${number(removedSequenceCount)} pruned sequence${removedSequenceCount === 1 ? "" : "s"}`,
    ].join(" and ");
    showStatus(
      `Loaded ${file.name} with ${pruningSummary}.`,
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

elements.cardView.addEventListener("change", () => {
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
