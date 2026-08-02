# Slot-machine generation direction

The generation engine now returns a `steps` array with every sentence. Each
step records:

- the current red word
- the available blue words and their card counts
- the blue word that was chosen
- the chosen card ID

That keeps random selection in the model layer and lets the Generate screen
change how the already-selected path is presented.

## Proposed interaction

1. Add an **Instant / Slot machine** mode control to the Generate screen.
2. Generate the complete result first so probability and replacement behavior
   remain identical in both modes.
3. For each step, cycle visually through `step.options` for roughly 400–650 ms.
4. Lock on `step.chosen`, add its bigram card to the visible chain, and advance
   to the next red-word pile.
5. Stop at X, a dead end, or the word limit.

The animation should expose the choice set without implying that the final
visual frame caused the selection. Repeated cards can influence how often a
word appears during shuffling, while the locked word always comes from the
engine's precomputed choice.

## Renderer states

- `idle`: waiting to generate
- `shuffling`: cycling through the current step's blue-word options
- `locked`: showing the chosen word and appending its bigram card
- `complete`: X reached
- `stopped`: dead end or word limit
- `cancelled`: source, pruning, or generation settings changed mid-animation

The screen controller in `site/screens/generator-screen.js` is the intended
home for this renderer. A generation token should cancel stale animations when
the user generates again or edits the model.

## Accessibility and pacing

- Keep Instant mode available and respect `prefers-reduced-motion`.
- Do not announce every shuffled word to assistive technology; announce only
  locked words and the completed sentence.
- Let multiple requested sentences animate in parallel lanes, with each lane
  proceeding word by word.
- Provide a Skip animation action that immediately renders the saved final
  sentence and its complete chain.
