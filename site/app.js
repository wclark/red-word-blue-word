import { BOUNDARY, buildModel, generateSentence, groupCards } from "./model.js";

const SAMPLE_TEXT = `The red kite climbs above the quiet park. The quiet park wakes under morning light. Morning light warms the red kite. A bluebird circles above the park. The bluebird sings and the kite climbs. Small patterns can make surprising stories.`;
const EXAMPLE_URL = "https://www.gutenberg.org/cache/epub/11/pg11.txt";
const MAX_SOURCE_CHARACTERS = 750_000;
const MAX_VISIBLE_PILES = 80;

const elements = {
  tabs: [...document.querySelectorAll("[role='tab']")],
  panels: [...document.querySelectorAll("[role='tabpanel']")],
  urlForm: document.querySelector("#url-form"),
  urlInput: document.querySelector("#source-url"),
  urlSubmit: document.querySelector("#url-submit"),
  readerFallback: document.querySelector("#reader-fallback"),
  tryExample: document.querySelector("#try-example"),
  pasteForm: document.querySelector("#paste-form"),
  sourceText: document.querySelector("#source-text"),
  characterCount: document.querySelector("#character-count"),
  fileInput: document.querySelector("#source-file"),
  dropZone: document.querySelector("#drop-zone"),
  loadStatus: document.querySelector("#load-status"),
  statusText: document.querySelector("#status-text"),
  sourceName: document.querySelector("#source-name"),
  statWords: document.querySelector("#stat-words"),
  statCards: document.querySelector("#stat-cards"),
  statUnique: document.querySelector("#stat-unique"),
  statSentences: document.querySelector("#stat-sentences"),
  generationForm: document.querySelector("#generation-form"),
  generatedText: document.querySelector("#generated-text"),
  chainTrail: document.querySelector("#chain-trail"),
  generationNote: document.querySelector("#generation-note"),
  maxWords: document.querySelector("#max-words"),
  maxWordsValue: document.querySelector("#max-words-value"),
  cardSearch: document.querySelector("#card-search"),
  cardPiles: document.querySelector("#card-piles"),
  deckSummary: document.querySelector("#deck-summary"),
};

let currentModel = buildModel(SAMPLE_TEXT);

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
}

function displayWord(word) {
  return word === BOUNDARY ? "X" : word;
}

function renderDeck() {
  const query = elements.cardSearch.value.trim().toLocaleLowerCase("en-US");
  const groups = groupCards(currentModel);
  const matching = groups.filter(({ red }) => !query || red.toLocaleLowerCase("en-US").includes(query));
  const visible = matching.slice(0, MAX_VISIBLE_PILES);
  elements.cardPiles.replaceChildren();

  visible.forEach((group) => {
    const pile = document.createElement("article");
    pile.className = "card-pile";

    const redSide = document.createElement("div");
    redSide.className = "pile-red";
    const redLabel = document.createElement("span");
    redLabel.textContent = group.red === BOUNDARY ? "sentence starts" : "red word";
    const redWord = document.createElement("strong");
    redWord.textContent = displayWord(group.red);
    redSide.append(redLabel, redWord);

    const arrow = document.createElement("span");
    arrow.className = "pile-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const blueSide = document.createElement("div");
    blueSide.className = "pile-blues";
    group.blueWords.slice(0, 12).forEach(({ blue, count }) => {
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
    if (group.blueWords.length > 12) {
      const more = document.createElement("span");
      more.className = "more-chip";
      more.textContent = `+${group.blueWords.length - 12} more`;
      blueSide.append(more);
    }

    pile.append(redSide, arrow, blueSide);
    elements.cardPiles.append(pile);
  });

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-deck";
    empty.textContent = `No red-word pile matches “${elements.cardSearch.value.trim()}”.`;
    elements.cardPiles.append(empty);
  }

  const suffix = matching.length > visible.length ? ` Showing the first ${MAX_VISIBLE_PILES}.` : "";
  elements.deckSummary.textContent = `${number(matching.length)} of ${number(groups.length)} red-word piles.${suffix}`;
}

function renderTrail(cards) {
  elements.chainTrail.replaceChildren();
  cards.slice(0, 16).forEach(({ red, blue }) => {
    const card = document.createElement("span");
    card.className = "mini-card";
    const redWord = document.createElement("span");
    redWord.className = "red-ink";
    redWord.textContent = displayWord(red);
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    const blueWord = document.createElement("span");
    blueWord.className = "blue-ink";
    blueWord.textContent = displayWord(blue);
    card.append(redWord, arrow, blueWord);
    elements.chainTrail.append(card);
  });
  if (cards.length > 16) {
    const more = document.createElement("span");
    more.className = "trail-more";
    more.textContent = `+${cards.length - 16} cards`;
    elements.chainTrail.append(more);
  }
}

function train(text, sourceLabel) {
  const clipped = String(text ?? "").slice(0, MAX_SOURCE_CHARACTERS);
  const nextModel = buildModel(clipped);
  if (nextModel.stats.wordCount < 2) {
    throw new Error("Add at least two words so there is a pattern to follow.");
  }
  currentModel = nextModel;
  elements.sourceName.textContent = sourceLabel;
  elements.cardSearch.value = "";
  updateStats();
  renderDeck();
  makeSentence();
  return clipped.length < String(text ?? "").length;
}

function makeSentence() {
  const withReplacement = document.querySelector("input[name='replacement']:checked").value === "with";
  const result = generateSentence(currentModel, {
    withReplacement,
    maxWords: Number(elements.maxWords.value),
  });
  elements.generatedText.textContent = result.text || "This deck could not make a sentence.";
  renderTrail(result.cards);

  const notes = {
    boundary: `Reached X after ${result.words.length} word${result.words.length === 1 ? "" : "s"}: a complete path.`,
    maximum: `Stopped at the ${elements.maxWords.value}-word limit so a loop cannot run forever.`,
    "dead-end": "This no-replacement path used up a needed card. Try another draw.",
    empty: "Build a deck before generating a sentence.",
  };
  elements.generationNote.textContent = notes[result.reason];
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

elements.tryExample.addEventListener("click", () => {
  elements.urlInput.value = EXAMPLE_URL;
  elements.urlForm.requestSubmit();
});

elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));

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

elements.generationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  makeSentence();
});

elements.maxWords.addEventListener("input", () => {
  elements.maxWordsValue.textContent = elements.maxWords.value;
});

elements.cardSearch.addEventListener("input", renderDeck);

updateStats();
renderDeck();

