export const BOUNDARY = "X";
export const MODEL_SNAPSHOT_FORMAT = "red-word-blue-word-model";
export const MODEL_SNAPSHOT_VERSION = 1;

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const PERIOD_SENTINEL = "\uE000";

export function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function splitSentences(text) {
  const clean = normalizeText(text);
  if (!clean) return [];
  const punctuationDrivenText = clean.replace(/\s*\n+\s*/g, " ");
  const protectedText = punctuationDrivenText
    .replace(/\b(?:e\.g|i\.e|mr|mrs|ms|dr|prof|sr|jr|st|mt|vs|etc)\./giu, (match) =>
      match.replaceAll(".", PERIOD_SENTINEL)
    )
    .replace(/(\d)\.(\d)/gu, `$1${PERIOD_SENTINEL}$2`)
    .replace(/\b([A-Z])\.(?=\s*(?:[A-Z]\.|[A-Z][a-z]))/gu, `$1${PERIOD_SENTINEL}`);

  return (protectedText.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? [])
    .map((segment) => segment.replaceAll(PERIOD_SENTINEL, ".").trim())
    .filter((segment) => tokenize(segment).length > 0);
}

export function tokenize(text) {
  return (String(text ?? "").match(WORD_PATTERN) ?? []).map((token) =>
    token.replaceAll("’", "'").toLocaleLowerCase("en-US")
  );
}

function cardsFromSentenceWords(sentenceWords) {
  const cards = [];
  sentenceWords.forEach((words, sentenceIndex) => {
    if (!words.length) return;
    const sequence = [BOUNDARY, ...words, BOUNDARY];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      cards.push({
        id: cards.length,
        red: sequence[index],
        blue: sequence[index + 1],
        sentenceIndex,
      });
    }
  });
  return cards;
}

function normalizeRemovedSequences(sequences = []) {
  const candidates = Array.isArray(sequences) ? sequences : [];
  const normalized = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const words = (Array.isArray(candidate) ? candidate : tokenize(candidate))
      .map((word) => String(word ?? "").toLocaleLowerCase("en-US"))
      .filter((word) => word && word !== BOUNDARY);
    if (words.length < 2) return;
    const key = JSON.stringify(words);
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(words);
  });
  return normalized;
}

function removeSequenceOccurrences(words, sequences) {
  return sequences.reduce((remainingWords, sequence) => {
    const filtered = [];
    for (let index = 0; index < remainingWords.length;) {
      const matches = sequence.every((word, offset) => remainingWords[index + offset] === word);
      if (matches) index += sequence.length;
      else {
        filtered.push(remainingWords[index]);
        index += 1;
      }
    }
    return filtered;
  }, [...words]);
}

export function buildModel(text) {
  const normalized = normalizeText(text);
  const sentences = splitSentences(normalized);
  const sentenceWords = sentences.map((sentence) => tokenize(sentence));
  const cards = cardsFromSentenceWords(sentenceWords);

  const source = { normalized, sentenceWords };
  return createModel(cards, source, new Set(), cards, sentenceWords, []);
}

function createModel(cards, source, removedWords, baseCards, modelSentenceWords, removedSequences) {
  const transitions = new Map();
  const uniquePairs = new Set();
  const pairCounts = new Map();

  cards.forEach((card) => {
    const pairKey = JSON.stringify([card.red, card.blue]);
    uniquePairs.add(pairKey);
    pairCounts.set(pairKey, {
      red: card.red,
      blue: card.blue,
      count: (pairCounts.get(pairKey)?.count ?? 0) + 1,
    });
    if (!transitions.has(card.red)) transitions.set(card.red, []);
    transitions.get(card.red).push(card);
  });

  const activeSentenceWords = modelSentenceWords.map((words) =>
    words.filter((word) => !removedWords.has(word))
  );
  const activeWords = activeSentenceWords.flat();
  const cardWords = new Set(
    cards.flatMap(({ red, blue }) => [red, blue]).filter((word) => word !== BOUNDARY)
  );
  const previewWords = activeWords.filter((word) => cardWords.has(word));
  const activeSentenceLengths = activeSentenceWords.map((words) => words.length).filter(Boolean);
  const vocabulary = new Set(activeWords);
  const nextWordCounts = [...transitions.values()].map(
    (outgoingCards) => new Set(outgoingCards.map(({ blue }) => blue)).size
  );
  const duplicateCardCount = cards.length - uniquePairs.size;
  const startCardCount = transitions.get(BOUNDARY)?.length ?? 0;
  const endCardCount = cards.filter(({ blue }) => blue === BOUNDARY).length;
  const sortedPairs = [...pairCounts.values()].sort(
    (a, b) => b.count - a.count || a.red.localeCompare(b.red) || a.blue.localeCompare(b.blue)
  );

  return {
    cards,
    transitions,
    source,
    baseCards,
    removedWords: [...removedWords].sort((a, b) => a.localeCompare(b)),
    removedSequences: removedSequences.map((sequence) => [...sequence]),
    stats: {
      wordCount: activeWords.length,
      cardCount: cards.length,
      uniquePairCount: uniquePairs.size,
      sentenceCount: startCardCount,
      vocabularyCount: vocabulary.size,
    },
    diagnostics: {
      characterCount: source.normalized.length,
      duplicateCardCount,
      duplicateCardRate: cards.length ? duplicateCardCount / cards.length : 0,
      removedCardCount: baseCards.length - cards.length,
      removedWordCount: removedWords.size,
      removedSequenceCount: removedSequences.length,
      removedSequenceTokenCount: source.sentenceWords.flat().length - modelSentenceWords.flat().length,
      redPileCount: transitions.size,
      branchingPileCount: nextWordCounts.filter((count) => count > 1).length,
      averageNextWordsPerPile: nextWordCounts.length
        ? nextWordCounts.reduce((sum, count) => sum + count, 0) / nextWordCounts.length
        : 0,
      widestPileNextWordCount: nextWordCounts.length ? Math.max(...nextWordCounts) : 0,
      averageSentenceLength: activeSentenceLengths.length
        ? activeSentenceLengths.reduce((sum, length) => sum + length, 0) / activeSentenceLengths.length
        : 0,
      longestSentenceLength: activeSentenceLengths.length ? Math.max(...activeSentenceLengths) : 0,
      startCardCount,
      endCardCount,
      topStarts: sortedPairs
        .filter(({ red, blue }) => red === BOUNDARY && blue !== BOUNDARY)
        .map(({ blue, count }) => ({ word: blue, count }))
        .slice(0, 10),
      topPairs: sortedPairs
        .filter(({ red, blue }) => red !== BOUNDARY && blue !== BOUNDARY)
        .slice(0, 10),
      firstTokens: previewWords.slice(0, 18),
      lastTokens: previewWords.slice(-18),
    },
  };
}

export function filterModel(model, excludedWords = [], excludedSequences = []) {
  if (!model?.baseCards || !model?.source) return model;
  const candidates = typeof excludedWords === "string" ? [excludedWords] : excludedWords;
  const removedWords = new Set();

  for (const candidate of candidates ?? []) {
    if (candidate === BOUNDARY) continue;
    const word = String(candidate ?? "").toLocaleLowerCase("en-US");
    if (word) removedWords.add(word);
  }

  const removedSequences = normalizeRemovedSequences(excludedSequences);
  const modelSentenceWords = model.source.sentenceWords.map((words) =>
    removeSequenceOccurrences(words, removedSequences)
  );
  const sequenceCards = cardsFromSentenceWords(modelSentenceWords);
  const cards = sequenceCards.filter(
    ({ red, blue }) => !removedWords.has(red) && !removedWords.has(blue)
  );
  return createModel(cards, model.source, removedWords, model.baseCards, modelSentenceWords, removedSequences);
}

export function createModelSnapshot(model, options = {}) {
  if (!model?.source?.normalized) throw new Error("There is no model to save.");
  return {
    format: MODEL_SNAPSHOT_FORMAT,
    version: MODEL_SNAPSHOT_VERSION,
    savedAt: options.savedAt ?? new Date().toISOString(),
    source: {
      label: String(options.sourceLabel ?? "Saved model"),
      text: model.source.normalized,
    },
    pruning: {
      removedWords: [...(model.removedWords ?? [])],
      removedSequences: (model.removedSequences ?? []).map((sequence) => [...sequence]),
    },
  };
}

export function loadModelSnapshot(value) {
  let snapshot;
  try {
    snapshot = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (snapshot?.format !== MODEL_SNAPSHOT_FORMAT || snapshot?.version !== MODEL_SNAPSHOT_VERSION) {
    throw new Error("That is not a supported Red Word, Blue Word model file.");
  }
  if (typeof snapshot.source?.text !== "string" || !snapshot.source.text.trim()) {
    throw new Error("That model file does not contain source text.");
  }
  if (!Array.isArray(snapshot.pruning?.removedWords)) {
    throw new Error("That model file has invalid pruning data.");
  }
  if (snapshot.pruning.removedSequences !== undefined && (
    !Array.isArray(snapshot.pruning.removedSequences) ||
    snapshot.pruning.removedSequences.some((sequence) =>
      !Array.isArray(sequence) || sequence.some((word) => typeof word !== "string")
    )
  )) {
    throw new Error("That model file has invalid sequence-pruning data.");
  }

  const sourceModel = buildModel(snapshot.source.text);
  if (sourceModel.stats.wordCount < 2) {
    throw new Error("That model file does not contain enough source words.");
  }
  const removedWords = snapshot.pruning.removedWords.filter((word) => typeof word === "string");
  const removedSequences = snapshot.pruning.removedSequences ?? [];
  const model = filterModel(sourceModel, removedWords, removedSequences);
  return {
    sourceModel,
    model,
    sourceLabel: String(snapshot.source.label || "Saved model"),
    savedAt: typeof snapshot.savedAt === "string" ? snapshot.savedAt : "",
  };
}

function choose(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function formatSentence(words, completed) {
  if (!words.length) return "";
  const joined = words.join(" ").replace(/^(\p{L})/u, (letter) => letter.toLocaleUpperCase("en-US"));
  return `${joined}${completed ? "." : "…"}`;
}

export function generateSentence(model, options = {}) {
  const {
    withReplacement = true,
    maxWords = 32,
    random = Math.random,
  } = options;

  if (!model?.cards?.length || !model.transitions?.has(BOUNDARY)) {
    return {
      text: "",
      words: [],
      cards: [],
      steps: [],
      gardenPathCards: [],
      completed: false,
      reason: "empty",
    };
  }

  const remaining = withReplacement
    ? null
    : new Map([...model.transitions].map(([red, cards]) => [red, [...cards]]));

  const words = [];
  const usedCards = [];
  const steps = [];
  let red = BOUNDARY;
  let completed = false;
  let reason = "maximum";

  while (words.length < maxWords) {
    const choices = withReplacement ? model.transitions.get(red) ?? [] : remaining.get(red) ?? [];
    if (!choices.length) {
      reason = "dead-end";
      break;
    }

    const card = choose(choices, random);
    usedCards.push(card);
    const optionCounts = new Map();
    choices.forEach(({ blue }) => optionCounts.set(blue, (optionCounts.get(blue) ?? 0) + 1));
    steps.push({
      red,
      options: [...optionCounts.entries()]
        .map(([blue, count]) => ({ blue, count }))
        .sort((a, b) => b.count - a.count || a.blue.localeCompare(b.blue)),
      chosen: card.blue,
      cardId: card.id,
    });

    if (!withReplacement) {
      const index = choices.findIndex(({ id }) => id === card.id);
      choices.splice(index, 1);
    }

    if (card.blue === BOUNDARY) {
      completed = true;
      reason = "boundary";
      break;
    }

    words.push(card.blue);
    red = card.blue;
  }

  return {
    text: formatSentence(words, completed),
    words,
    cards: usedCards,
    steps,
    gardenPathCards: buildGeneratedGardenPathCards(model, usedCards, steps),
    completed,
    reason,
  };
}

export function generateSentences(model, count, options = {}) {
  const sentenceCount = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));
  return Array.from({ length: sentenceCount }, () => generateSentence(model, options));
}

function blueWordCounts(cards = []) {
  const counts = new Map();
  cards.forEach(({ blue }) => counts.set(blue, (counts.get(blue) ?? 0) + 1));
  return [...counts.entries()]
    .map(([blue, count]) => ({ blue, count }))
    .sort((a, b) => b.count - a.count || a.blue.localeCompare(b.blue));
}

function compareCardRows(a, b, sortBy) {
  if (a.red === BOUNDARY && b.red !== BOUNDARY) return -1;
  if (b.red === BOUNDARY && a.red !== BOUNDARY) return 1;
  const aPath = [...(a.blackWords ?? []), a.blue].join(" ");
  const bPath = [...(b.blackWords ?? []), b.blue].join(" ");
  const alphabetical = a.red.localeCompare(b.red) || aPath.localeCompare(bPath);
  if (sortBy === "alphabetical-desc") return -alphabetical;
  if (sortBy === "frequency-desc") return b.count - a.count || b.total - a.total || alphabetical;
  if (sortBy === "frequency-asc") return a.count - b.count || a.total - b.total || alphabetical;
  if (sortBy === "branching-desc") {
    return b.choiceCount - a.choiceCount || b.total - a.total || alphabetical;
  }
  return alphabetical;
}

function gardenPathJunctures(model) {
  const choiceWords = new Map(
    [...model.transitions].map(([red, cards]) => [
      red,
      [...new Set(cards.map(({ blue }) => blue))],
    ])
  );
  const anchors = new Set([BOUNDARY]);

  choiceWords.forEach((choices, red) => {
    if (choices.length !== 1) anchors.add(red);
  });

  // A deterministic cycle has no natural branching anchor. Retain one stable
  // representative so the cycle is visible and path construction terminates.
  choiceWords.forEach((_choices, start) => {
    if (anchors.has(start)) return;
    const path = [];
    const indexes = new Map();
    let red = start;

    while (red !== BOUNDARY && !anchors.has(red) && choiceWords.has(red)) {
      if (indexes.has(red)) {
        const cycle = path.slice(indexes.get(red));
        anchors.add([...cycle].sort((a, b) => a.localeCompare(b))[0]);
        break;
      }
      indexes.set(red, path.length);
      path.push(red);
      const choices = choiceWords.get(red);
      if (choices.length !== 1) break;
      red = choices[0];
    }
  });

  return { anchors, choiceWords };
}

export function gardenPathCards(model, options = {}) {
  const sortBy = typeof options === "string" ? options : options.sortBy ?? "alphabetical";
  if (!model?.transitions?.size) return [];
  const { anchors, choiceWords } = gardenPathJunctures(model);
  const rows = [];

  anchors.forEach((red) => {
    const sourceCards = model.transitions.get(red) ?? [];
    if (!sourceCards.length) return;
    const choices = blueWordCounts(sourceCards);

    choices.forEach(({ blue, count }) => {
      const pathWords = [blue];
      let nextRed = blue;
      let safety = model.transitions.size + 1;

      while (
        safety > 0 &&
        nextRed !== BOUNDARY &&
        !anchors.has(nextRed) &&
        choiceWords.get(nextRed)?.length === 1
      ) {
        nextRed = choiceWords.get(nextRed)[0];
        pathWords.push(nextRed);
        safety -= 1;
      }

      const finalBlue = pathWords.at(-1);
      const blackWords = pathWords.slice(0, -1);

      rows.push({
        red,
        blackWords,
        blue: finalBlue,
        firstWord: pathWords[0],
        count,
        total: sourceCards.length,
        choiceCount: choices.length,
        bigramCount: pathWords.length,
        sourceSequence: [red, ...pathWords].filter((word) => word !== BOUNDARY),
      });
    });
  });

  return rows.sort((a, b) => compareCardRows(a, b, sortBy));
}

function gardenPathKey(red, firstWord) {
  return JSON.stringify([red, firstWord]);
}

function buildGeneratedGardenPathCards(model, usedCards, steps) {
  if (!usedCards.length) return [];
  const { anchors } = gardenPathJunctures(model);
  const templates = new Map(
    gardenPathCards(model).map((card) => [gardenPathKey(card.red, card.firstWord), card])
  );
  const generated = [];
  let segmentStart = 0;

  usedCards.forEach((card, cardIndex) => {
    const lastCard = cardIndex === usedCards.length - 1;
    const reachedJuncture = card.blue === BOUNDARY || anchors.has(card.blue);
    if (!lastCard && !reachedJuncture) return;

    const underlyingCards = usedCards.slice(segmentStart, cardIndex + 1);
    const pathWords = underlyingCards.map(({ blue }) => blue);
    const firstStep = steps[segmentStart];
    const options = (firstStep?.options ?? []).map(({ blue: firstWord, count }) => {
      const template = templates.get(gardenPathKey(underlyingCards[0].red, firstWord));
      return template
        ? { firstWord, blackWords: [...template.blackWords], blue: template.blue, count }
        : { firstWord, blackWords: [], blue: firstWord, count };
    });

    generated.push({
      red: underlyingCards[0].red,
      blackWords: pathWords.slice(0, -1),
      blue: pathWords.at(-1),
      firstWord: pathWords[0],
      options,
      choiceCount: options.length,
      underlyingCards,
      reachedJuncture,
    });
    segmentStart = cardIndex + 1;
  });

  return generated;
}

export function groupCards(model, options = {}) {
  const sortBy = typeof options === "string" ? options : options.sortBy ?? "alphabetical";
  return [...model.transitions.entries()]
    .map(([red, cards]) => {
      return {
        red,
        total: cards.length,
        blueWords: blueWordCounts(cards),
      };
    })
    .sort((a, b) => {
      if (a.red === BOUNDARY) return -1;
      if (b.red === BOUNDARY) return 1;
      const alphabetical = a.red.localeCompare(b.red);
      if (sortBy === "alphabetical-desc") return -alphabetical;
      if (sortBy === "frequency-desc") return b.total - a.total || alphabetical;
      if (sortBy === "frequency-asc") return a.total - b.total || alphabetical;
      if (sortBy === "branching-desc") {
        return b.blueWords.length - a.blueWords.length || b.total - a.total || alphabetical;
      }
      return alphabetical;
    });
}
