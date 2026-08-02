import { BOUNDARY, generateSentences } from "../model.js";

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function displayWord(word) {
  return word === BOUNDARY ? "X" : word;
}

function renderTrail(container, result, sentenceIndex) {
  result.cards.forEach(({ red, blue }, cardIndex) => {
    const card = document.createElement("span");
    card.className = "mini-card";
    const step = result.steps[cardIndex];
    const optionCount = step?.options.length ?? 0;
    card.title = optionCount === 1
      ? "The only available blue word at this step"
      : `Chosen from ${number(optionCount)} available blue words at this step`;

    const redWord = document.createElement("span");
    redWord.className = "red-ink";
    redWord.textContent = displayWord(red);
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    const blueWord = document.createElement("span");
    blueWord.className = "blue-ink";
    blueWord.textContent = displayWord(blue);
    card.append(redWord, arrow, blueWord);
    container.append(card);
  });
  container.setAttribute("aria-label", `Complete bigram chain for sentence ${sentenceIndex + 1}`);
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
  pathLabel.textContent = "Bigram chain";
  const pathCount = document.createElement("span");
  pathCount.textContent = `${number(result.cards.length)} card${result.cards.length === 1 ? "" : "s"}`;
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
    elements.generationNote.textContent = `${notes.join(" · ")}. Every complete bigram chain is shown below its sentence.`;
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
