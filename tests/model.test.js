import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNDARY,
  buildModel,
  generateSentence,
  generateSentences,
  groupCards,
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
  assert.deepEqual(
    model.diagnostics.topPairs.find(({ red, blue }) => red === "X" && blue === "red"),
    { red: "X", blue: "red", count: 2 }
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
