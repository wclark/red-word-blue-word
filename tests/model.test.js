import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDARY,
  buildModel,
  createModelSnapshot,
  filterModel,
  gardenPathCards,
  generateSentence,
  generateSentences,
  groupCards,
  loadModelSnapshot,
  tokenize,
} from "../site/model.js";

test("tokenize keeps contractions and hyphenated words", () => {
  assert.deepEqual(tokenize("Don't re-read BLUE words!"), ["don't", "re-read", "blue", "words"]);
});

test("buildModel adds sentence-boundary cards", () => {
  const model = buildModel("Red fish swim. Blue fish rest!");
  assert.equal(model.stats.wordCount, 6);
  assert.equal(model.stats.sentenceCount, 2);
  assert.equal(model.stats.cardCount, 8);
  assert.deepEqual(
    model.transitions.get(BOUNDARY).map(({ blue }) => blue),
    ["red", "blue"]
  );
  assert.equal(model.transitions.get("swim")[0].blue, BOUNDARY);
});

test("newlines do not create sentence boundaries without punctuation", () => {
  const model = buildModel("red words wrap\nonto another line\n\nwithout punctuation");
  assert.equal(model.stats.sentenceCount, 1);
  assert.equal(model.diagnostics.startCardCount, 1);
  assert.deepEqual(
    model.transitions.get(BOUNDARY).map(({ blue }) => blue),
    ["red"]
  );
});

test("punctuation still creates boundaries across pasted lines", () => {
  const model = buildModel("red words end here.\nblue words start here!\nlast words finish?");
  assert.equal(model.stats.sentenceCount, 3);
  assert.deepEqual(
    model.transitions.get(BOUNDARY).map(({ blue }) => blue),
    ["red", "blue", "last"]
  );
});

test("common abbreviations and decimals do not create false boundaries", () => {
  const model = buildModel("Dr. Seuss counted 3.14 circles. Then he stopped.");
  assert.equal(model.stats.sentenceCount, 2);
  assert.deepEqual(
    model.transitions.get(BOUNDARY).map(({ blue }) => blue),
    ["dr", "then"]
  );
});

test("duplicate source pairs remain duplicate weighted cards", () => {
  const model = buildModel("Go now. Go now.");
  const goPile = groupCards(model).find(({ red }) => red === "go");
  assert.equal(goPile.total, 2);
  assert.deepEqual(goPile.blueWords, [{ blue: "now", count: 2 }]);
  assert.equal(model.diagnostics.duplicateCardCount, 3);
  assert.equal(model.diagnostics.startCardCount, 2);
  assert.equal(model.diagnostics.endCardCount, 2);
  assert.deepEqual(model.diagnostics.firstTokens, ["go", "now", "go", "now"]);
});

test("model diagnostics summarize branching and sentence lengths", () => {
  const model = buildModel("Red birds sing. Red birds fly high.");
  assert.equal(model.stats.vocabularyCount, 5);
  assert.equal(model.diagnostics.averageSentenceLength, 3.5);
  assert.equal(model.diagnostics.longestSentenceLength, 4);
  assert.equal(model.diagnostics.redPileCount, 6);
  assert.equal(model.diagnostics.branchingPileCount, 1);
  assert.equal(model.diagnostics.widestPileNextWordCount, 2);
  assert.deepEqual(model.diagnostics.topStarts[0], { word: "red", count: 2 });
  assert.ok(model.diagnostics.topPairs.every(({ red, blue }) => red !== BOUNDARY && blue !== BOUNDARY));
});

test("filterModel removes a word from both sides of every card", () => {
  const source = buildModel("Red fish swim. Blue fish rest!");
  const filtered = filterModel(source, ["fish"]);

  assert.equal(source.stats.cardCount, 8);
  assert.equal(filtered.stats.cardCount, 4);
  assert.equal(filtered.diagnostics.removedCardCount, 4);
  assert.equal(filtered.diagnostics.removedWordCount, 1);
  assert.deepEqual(filtered.removedWords, ["fish"]);
  assert.ok(filtered.cards.every(({ red, blue }) => red !== "fish" && blue !== "fish"));
  assert.equal(filtered.transitions.has("fish"), false);
  assert.equal(filtered.stats.vocabularyCount, 4);
  assert.deepEqual(filtered.diagnostics.firstTokens, ["red", "swim", "blue", "rest"]);
  assert.deepEqual(filtered.diagnostics.lastTokens, ["red", "swim", "blue", "rest"]);
});

test("token preview omits words no longer referenced by an active card", () => {
  const source = buildModel("Red blue green. Keep moving.");
  const filtered = filterModel(source, ["red", "green"]);

  assert.ok(filtered.cards.every(({ red, blue }) => red !== "blue" && blue !== "blue"));
  assert.deepEqual(filtered.diagnostics.firstTokens, ["keep", "moving"]);
  assert.deepEqual(filtered.diagnostics.lastTokens, ["keep", "moving"]);
});

test("filterModel supports multiple removals and protects the X boundary", () => {
  const source = buildModel("Red fish swim. Blue fish rest!");
  const filtered = filterModel(source, [BOUNDARY, "red", "fish"]);

  assert.deepEqual(filtered.removedWords, ["fish", "red"]);
  assert.equal(filtered.diagnostics.startCardCount, 1);
  assert.ok(filtered.cards.some(({ red }) => red === BOUNDARY));
  assert.ok(filtered.cards.every(({ red, blue }) => !["red", "fish"].includes(red) && !["red", "fish"].includes(blue)));
});

test("groupCards can sort piles by frequency and branching", () => {
  const model = buildModel("A cat naps. A dog runs. A fox runs. B cat runs.");
  const byFrequency = groupCards(model, { sortBy: "frequency-desc" });
  const byBranching = groupCards(model, { sortBy: "branching-desc" });

  assert.equal(byFrequency[0].red, BOUNDARY);
  assert.equal(byFrequency[1].red, "a");
  assert.equal(byFrequency[1].total, 3);
  assert.equal(byBranching[0].red, BOUNDARY);
  assert.equal(byBranching[1].red, "a");
  assert.equal(byBranching[1].blueWords.length, 3);
});

test("gardenPathCards removes deterministic intermediate piles", () => {
  const model = buildModel("Start one fork left. Start one fork right.");
  const cards = gardenPathCards(model);

  assert.equal(groupCards(model).length, 6);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards[0], {
    red: BOUNDARY,
    blackWords: ["start", "one"],
    blue: "fork",
    firstWord: "start",
    count: 2,
    total: 2,
    choiceCount: 1,
    bigramCount: 3,
    sourceSequence: ["start", "one", "fork"],
  });
  assert.deepEqual(
    cards.filter(({ red }) => red === "fork").map(({ blackWords, blue }) => [blackWords, blue]),
    [[["left"], BOUNDARY], [["right"], BOUNDARY]]
  );
  assert.ok(cards.every(({ red }) => !["start", "one", "left", "right"].includes(red)));
});

test("a garden-path card can have zero black words before its blue juncture", () => {
  const model = buildModel("Fork left. Fork right. Other fork left.");
  const directJuncture = gardenPathCards(model)
    .find(({ red, firstWord }) => red === BOUNDARY && firstWord === "fork");

  assert.deepEqual(directJuncture.blackWords, []);
  assert.equal(directJuncture.blue, "fork");
  assert.equal(directJuncture.bigramCount, 1);
});

test("gardenPathCards keeps one stable anchor for a deterministic cycle", () => {
  const model = {
    transitions: new Map([
      ["beta", [{ red: "beta", blue: "alpha" }]],
      ["alpha", [{ red: "alpha", blue: "beta" }]],
    ]),
  };

  assert.deepEqual(gardenPathCards(model), [{
    red: "alpha",
    blackWords: ["beta"],
    blue: "alpha",
    firstWord: "beta",
    count: 1,
    total: 1,
    choiceCount: 1,
    bigramCount: 2,
    sourceSequence: ["alpha", "beta", "alpha"],
  }]);
});

test("garden-path cards can be sorted by path frequency", () => {
  const model = buildModel("Start fork right. Start fork right. Start fork left.");
  const alphabetical = gardenPathCards(model).filter(({ red }) => red === "fork");
  const frequent = gardenPathCards(model, { sortBy: "frequency-desc" })
    .filter(({ red }) => red === "fork");

  assert.deepEqual(alphabetical.map(({ blackWords, blue }) => [blackWords, blue]), [
    [["left"], BOUNDARY],
    [["right"], BOUNDARY],
  ]);
  assert.deepEqual(frequent.map(({ blackWords, blue, count }) => [blackWords, blue, count]), [
    [["right"], BOUNDARY, 2],
    [["left"], BOUNDARY, 1],
  ]);
});

test("sequence pruning happens before bigrams while preserving the same words elsewhere", () => {
  const source = buildModel("We dislike very bad phrase today. Very bad dogs bark.");
  const filtered = filterModel(source, [], [["very", "bad", "phrase"]]);
  const pairs = filtered.cards.map(({ red, blue }) => [red, blue]);

  assert.ok(pairs.some(([red, blue]) => red === "dislike" && blue === "today"));
  assert.ok(pairs.some(([red, blue]) => red === "very" && blue === "bad"));
  assert.ok(pairs.every(([red, blue]) => red !== "phrase" && blue !== "phrase"));
  assert.deepEqual(filtered.removedSequences, [["very", "bad", "phrase"]]);
  assert.equal(filtered.diagnostics.removedSequenceTokenCount, 3);
});

test("removing a whole sentence does not create an X to X card", () => {
  const source = buildModel("Remove this whole sentence.");
  const filtered = filterModel(source, [], [["remove", "this", "whole", "sentence"]]);

  assert.equal(filtered.cards.length, 0);
  assert.equal(filtered.diagnostics.startCardCount, 0);
  assert.equal(filtered.diagnostics.endCardCount, 0);
});

test("saved model snapshots preserve source and pruning", () => {
  const source = buildModel("Red fish swim. Blue fish rest!");
  const filtered = filterModel(source, ["fish"], [["blue", "fish"]]);
  const snapshot = createModelSnapshot(filtered, {
    sourceLabel: "Fish story",
    savedAt: "2026-08-02T00:00:00.000Z",
  });
  const restored = loadModelSnapshot(JSON.stringify(snapshot));

  assert.equal(snapshot.format, "red-word-blue-word-model");
  assert.equal(restored.sourceLabel, "Fish story");
  assert.deepEqual(restored.model.removedWords, ["fish"]);
  assert.deepEqual(restored.model.removedSequences, [["blue", "fish"]]);
  assert.deepEqual(
    restored.model.cards.map(({ red, blue }) => [red, blue]),
    filtered.cards.map(({ red, blue }) => [red, blue])
  );
  assert.equal(restored.sourceModel.stats.cardCount, source.stats.cardCount);

  const earlierSnapshot = { ...snapshot, pruning: { removedWords: ["fish"] } };
  const earlierRestored = loadModelSnapshot(earlierSnapshot);
  assert.deepEqual(earlierRestored.model.removedSequences, []);
});

test("loadModelSnapshot rejects unrelated JSON", () => {
  assert.throws(
    () => loadModelSnapshot('{"hello":"world"}'),
    /not a supported Red Word, Blue Word model file/
  );
});

test("generation follows a deterministic complete chain", () => {
  const model = buildModel("Bright birds sing.");
  const result = generateSentence(model, { random: () => 0 });
  assert.equal(result.text, "Bright birds sing.");
  assert.equal(result.completed, true);
  assert.deepEqual(
    result.cards.map(({ red, blue }) => [red, blue]),
    [[BOUNDARY, "bright"], ["bright", "birds"], ["birds", "sing"], ["sing", BOUNDARY]]
  );
  assert.deepEqual(result.steps[0], {
    red: BOUNDARY,
    options: [{ blue: "bright", count: 1 }],
    chosen: "bright",
    cardId: 0,
  });
  assert.equal(result.steps.at(-1).chosen, BOUNDARY);
  assert.equal(result.gardenPathCards.length, 1);
  assert.deepEqual(result.gardenPathCards[0].blackWords, ["bright", "birds", "sing"]);
  assert.equal(result.gardenPathCards[0].blue, BOUNDARY);
  assert.equal(result.gardenPathCards[0].underlyingCards.length, 4);
});

test("generation groups raw bigrams into juncture-to-juncture garden-path cards", () => {
  const model = buildModel("Start one fork left. Start one fork right.");
  const result = generateSentence(model, { random: () => 0 });

  assert.equal(result.cards.length, 5);
  assert.equal(result.gardenPathCards.length, 2);
  assert.deepEqual(
    result.gardenPathCards.map(({ red, blackWords, blue, choiceCount }) => ({
      red,
      blackWords,
      blue,
      choiceCount,
    })),
    [
      { red: BOUNDARY, blackWords: ["start", "one"], blue: "fork", choiceCount: 1 },
      { red: "fork", blackWords: ["left"], blue: BOUNDARY, choiceCount: 2 },
    ]
  );
  assert.deepEqual(
    result.gardenPathCards[1].options.map(({ blackWords, blue, count }) => ({ blackWords, blue, count })),
    [
      { blackWords: ["left"], blue: BOUNDARY, count: 1 },
      { blackWords: ["right"], blue: BOUNDARY, count: 1 },
    ]
  );
  assert.deepEqual(
    result.gardenPathCards.flatMap(({ underlyingCards }) => underlyingCards.map(({ id }) => id)),
    result.cards.map(({ id }) => id)
  );
});

test("without replacement can exhaust a looping pile", () => {
  const model = buildModel("A a a.");
  const result = generateSentence(model, { withReplacement: false, maxWords: 12, random: () => 0 });
  assert.ok(result.cards.length <= model.cards.length);
  assert.equal(new Set(result.cards.map(({ id }) => id)).size, result.cards.length);
});

test("generation respects its word limit", () => {
  const model = buildModel("A a a a a a.");
  const result = generateSentence(model, { maxWords: 2, random: () => 0 });
  assert.equal(result.words.length, 2);
  assert.equal(result.completed, false);
  assert.equal(result.reason, "maximum");
  assert.match(result.text, /…$/u);
});

test("generateSentences returns the requested number of independent paths", () => {
  const model = buildModel("Bright birds sing.");
  const results = generateSentences(model, 5, { withReplacement: false, random: () => 0 });
  assert.equal(results.length, 5);
  results.forEach((result) => {
    assert.equal(result.text, "Bright birds sing.");
    assert.equal(new Set(result.cards.map(({ id }) => id)).size, result.cards.length);
  });
});
