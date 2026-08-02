import { BOUNDARY, generateSentences } from "../model.js";

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function displayWord(word) {
  return word === BOUNDARY ? "X" : word;
}

function renderTrail(container, result, sentenceIndex) {
  result.gardenPathCards.forEach(({ red, blackWords, blue, choiceCount, underlyingCards }) => {
    const card = document.createElement("span");
    card.className = "mini-card garden-path-mini-card";
    card.title = choiceCount === 1
      ? `The only garden-path card at this red word; ${number(underlyingCards.length)} bigram${underlyingCards.length === 1 ? "" : "s"} underneath`
      : `Chosen from ${number(choiceCount)} garden-path cards at this red-word juncture; ${number(underlyingCards.length)} bigrams underneath`;
    card.setAttribute(
      "aria-label",
      `${displayWord(red)} in red; ${blackWords.length ? `${blackWords.join(" ")} in black; ` : ""}${displayWord(blue)} in blue`
    );

    const redWord = document.createElement("span");
    redWord.className = "garden-mini-red";
    redWord.textContent = displayWord(red);
    const arrow = document.createElement("span");
    arrow.className = "garden-mini-arrow";
    arrow.textContent = "→";
    const path = document.createElement("span");
    path.className = "garden-mini-path";
    blackWords.forEach((word) => {
      const blackWord = document.createElement("span");
      blackWord.className = "garden-mini-black";
      blackWord.textContent = word;
      path.append(blackWord);
    });
    const blueWord = document.createElement("span");
    blueWord.className = "garden-mini-blue";
    blueWord.textContent = displayWord(blue);
    path.append(blueWord);
    card.append(redWord, arrow, path);
    container.append(card);
  });

  if (result.partialGardenPath) {
    const { red, words, underlyingCards } = result.partialGardenPath;
    const partial = document.createElement("span");
    partial.className = "mini-card garden-path-mini-card is-partial";
    partial.title = "Generation stopped before this deterministic path reached its next blue-word juncture.";
    partial.setAttribute(
      "aria-label",
      `${displayWord(red)} in red; ${words.length ? `${words.join(" ")} in an incomplete path; ` : ""}stopped before the next blue word`
    );

    const redWord = document.createElement("span");
    redWord.className = "garden-mini-red";
    redWord.textContent = displayWord(red);
    const arrow = document.createElement("span");
    arrow.className = "garden-mini-arrow";
    arrow.textContent = "→";
    const path = document.createElement("span");
    path.className = "garden-mini-path";
    words.forEach((word) => {
      const blackWord = document.createElement("span");
      blackWord.className = "garden-mini-black";
      blackWord.textContent = displayWord(word);
      path.append(blackWord);
    });
    const stop = document.createElement("span");
    stop.className = "garden-mini-stop";
    stop.textContent = "…";
    stop.title = `${number(underlyingCards.length)} bigram${underlyingCards.length === 1 ? "" : "s"} before the cutoff`;
    path.append(stop);
    partial.append(redWord, arrow, path);
    container.append(partial);
  }
  container.setAttribute(
    "aria-label",
    `${result.partialGardenPath ? "Garden-path chain with a partial ending" : "Complete garden-path card chain"} for sentence ${sentenceIndex + 1}`
  );
}

function renderGeneratedResult(result, index) {
  const item = document.createElement("li");
  item.className = "generated-result";

  const sentenceRow = document.createElement("div");
  sentenceRow.className = "sentence-row";
  const sentenceNumber = document.createElement("span");
  sentenceNumber.className = "sentence-number";
  sentenceNumber.textContent = String(index + 1).padStart(2, "0");
  const sentenceText = document.createElement("blockquote");
  sentenceText.textContent = result.text || "This path could not make a sentence.";
  sentenceRow.append(sentenceNumber, sentenceText);

  const pathPanel = document.createElement("div");
  pathPanel.className = "path-panel";
  const pathHeading = document.createElement("div");
  pathHeading.className = "path-heading";
  const pathLabel = document.createElement("strong");
  pathLabel.textContent = "Garden-path chain";
  const pathCount = document.createElement("span");
  const gardenBigramCount = result.gardenPathCards.reduce(
    (total, card) => total + card.underlyingCards.length,
    0
  ) + (result.partialGardenPath?.underlyingCards.length ?? 0);
  pathCount.textContent = `${number(result.gardenPathCards.length)} garden card${result.gardenPathCards.length === 1 ? "" : "s"} · ${number(gardenBigramCount)} bigram${gardenBigramCount === 1 ? "" : "s"} inside${result.partialGardenPath ? " · partial path" : ""}`;
  pathHeading.append(pathLabel, pathCount);
  const trail = document.createElement("div");
  trail.className = "chain-trail";
  renderTrail(trail, result, index);
  pathPanel.append(pathHeading, trail);

  item.append(sentenceRow, pathPanel);
  return item;
}

export function createGeneratorScreen({ getModel }) {
  const elements = {
    form: document.querySelector("#generation-form"),
    generatedList: document.querySelector("#generated-list"),
    generationNote: document.querySelector("#generation-note"),
    maxWords: document.querySelector("#max-words"),
    maxWordsValue: document.querySelector("#max-words-value"),
    sentenceCount: document.querySelector("#sentence-count"),
    sentenceCountValue: document.querySelector("#sentence-count-value"),
    generationSubmit: document.querySelector("#generation-submit"),
  };
  let lastResults = [];

  function reset(note = "The model is ready. Choose the settings, then generate when you are satisfied with the cleanup.") {
    lastResults = [];
    const placeholder = document.createElement("li");
    placeholder.className = "generated-placeholder";
    placeholder.textContent = "Your cleaned model is ready to generate.";
    elements.generatedList.replaceChildren(placeholder);
    elements.generationNote.textContent = note;
  }

  function generate() {
    const withReplacement = document.querySelector("input[name='replacement']:checked").value === "with";
    const count = Number(elements.sentenceCount.value);
    const results = generateSentences(getModel(), count, {
      withReplacement,
      maxWords: Number(elements.maxWords.value),
    });
    lastResults = results;
    elements.generatedList.replaceChildren(
      ...results.map((result, index) => renderGeneratedResult(result, index))
    );

    const completed = results.filter(({ reason }) => reason === "boundary").length;
    const limited = results.filter(({ reason }) => reason === "maximum").length;
    const deadEnds = results.filter(({ reason }) => reason === "dead-end").length;
    const emptyPaths = results.filter(({ reason }) => reason === "empty").length;
    const notes = [`${number(completed)} of ${number(results.length)} reached the X boundary`];
    if (limited) notes.push(`${number(limited)} hit the word limit`);
    if (deadEnds) notes.push(`${number(deadEnds)} ran out of an available card`);
    if (emptyPaths) notes.push(`${number(emptyPaths)} could not start from X`);
    elements.generationNote.textContent = `${notes.join(" · ")}. Garden-path cards skip automatic black-word steps and land on the next blue-word juncture.`;
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    generate();
  });
  elements.maxWords.addEventListener("input", () => {
    elements.maxWordsValue.textContent = elements.maxWords.value;
  });
  elements.sentenceCount.addEventListener("input", () => {
    const count = Number(elements.sentenceCount.value);
    const noun = count === 1 ? "sentence" : "sentences";
    elements.sentenceCountValue.textContent = String(count);
    elements.sentenceCountValue.parentElement.lastChild.textContent = ` ${noun}`;
    elements.generationSubmit.firstChild.textContent = `Generate ${count} ${noun} `;
  });

  return {
    generate,
    reset,
    get lastResults() {
      return lastResults;
    },
  };
}
