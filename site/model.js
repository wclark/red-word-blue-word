export const BOUNDARY = "X";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

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

  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return [...segmenter.segment(clean)]
      .map(({ segment }) => segment.trim())
      .filter((segment) => tokenize(segment).length > 0);
  }

  return (clean.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? [])
    .map((segment) => segment.trim())
    .filter((segment) => tokenize(segment).length > 0);
}

export function tokenize(text) {
  return (String(text ?? "").match(WORD_PATTERN) ?? []).map((token) =>
    token.replaceAll("’", "'").toLocaleLowerCase("en-US")
  );
}

export function buildModel(text) {
  const sentences = splitSentences(text);
  const cards = [];
  const transitions = new Map();
  const vocabulary = new Set();
  const uniquePairs = new Set();
  let wordCount = 0;

  sentences.forEach((sentence, sentenceIndex) => {
    const words = tokenize(sentence);
    wordCount += words.length;
    words.forEach((word) => vocabulary.add(word));

    const sequence = [BOUNDARY, ...words, BOUNDARY];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const card = {
        id: cards.length,
        red: sequence[index],
        blue: sequence[index + 1],
        sentenceIndex,
      };
      cards.push(card);
      uniquePairs.add(JSON.stringify([card.red, card.blue]));
      if (!transitions.has(card.red)) transitions.set(card.red, []);
      transitions.get(card.red).push(card);
    }
  });

  return {
    cards,
    transitions,
    stats: {
      wordCount,
      cardCount: cards.length,
      uniquePairCount: uniquePairs.size,
      sentenceCount: sentences.length,
      vocabularyCount: vocabulary.size,
    },
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
    return { text: "", words: [], cards: [], completed: false, reason: "empty" };
  }

  const remaining = withReplacement
    ? null
    : new Map([...model.transitions].map(([red, cards]) => [red, [...cards]]));

  const words = [];
  const usedCards = [];
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
    completed,
    reason,
  };
}

export function groupCards(model) {
  return [...model.transitions.entries()]
    .map(([red, cards]) => {
      const counts = new Map();
      cards.forEach(({ blue }) => counts.set(blue, (counts.get(blue) ?? 0) + 1));
      return {
        red,
        total: cards.length,
        blueWords: [...counts.entries()]
          .map(([blue, count]) => ({ blue, count }))
          .sort((a, b) => b.count - a.count || a.blue.localeCompare(b.blue)),
      };
    })
    .sort((a, b) => {
      if (a.red === BOUNDARY) return -1;
      if (b.red === BOUNDARY) return 1;
      return a.red.localeCompare(b.red);
    });
}

