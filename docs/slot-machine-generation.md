# Slot-machine generation direction

The generation engine retains a raw `steps` array for diagnostics and also
returns `gardenPathCards`, the presentation and animation unit. Each garden-path
card records:

- one starting red word
- zero or more black words that become automatic after the first choice
- one final blue word naming the next red-word juncture
- the available whole garden-path cards and their counts at that juncture
- the underlying bigram cards, for inspection rather than animation

The raw bigram traversal keeps probability and replacement behavior unchanged.
The grouped cards prevent the interface from pretending there is another choice
at every deterministic intermediate word.

The result also records `startWord`, `startOptions`, and the raw X entry card.
X chooses the sentence start with its original weights, but it is not rendered
as a garden-path card. The selected starting word becomes the first red word.
If the word limit stops inside a deterministic run, `partialGardenPath` keeps
those visible words separate instead of mislabeling the cutoff as a blue
juncture.

## Proposed interaction

1. Add an **Instant / Slot machine** mode control to the Generate screen.
2. Generate the complete result first so probability and replacement behavior
   remain identical in both modes.
3. Cycle through `startOptions`, lock the starting word, and present it as the
   first red word rather than displaying an X-to-word card.
4. At each red-word juncture, cycle visually through the candidate garden-path
   cards for roughly 400–650 ms.
5. Lock on the selected first step, reveal its zero or more black words without
   shuffling, then reveal the final blue word.
6. Turn that final blue word into the next red word and repeat. Do not animate
   each hidden bigram along the black garden path.
7. Stop at X, a dead end, or the word limit.

The animation should expose the choice set without implying that the final
visual frame caused the selection. Repeated cards can influence how often a
candidate appears during shuffling, while the locked garden-path card always
comes from the engine's precomputed choice.

## Renderer states

- `idle`: waiting to generate
- `shuffling`: cycling through the current red juncture's garden-path options
- `locked`: showing the red word, automatic black path, and final blue word
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
  proceeding garden-path card by garden-path card.
- Provide a Skip animation action that immediately renders the saved final
  sentence and its complete garden-path chain.
