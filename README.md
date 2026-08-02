# Red Word, Blue Word

A small, static classroom language lab. It turns source text into bigram
"cards," groups those cards by their red word, and generates new sentences by
following each blue word to the matching red-word pile.

The app is deliberately transparent: students can inspect the cards, compare
sampling with and without replacement, generate several sentences at once, see
exactly which cards produced each sentence, and inspect import/model diagnostics.
Red-word piles can be sorted, searched, paged, expanded, or clicked to remove
that word from both sides of every card; all removals can be restored without
re-importing the source. It is a bigram/Markov model, not a neural language model.

The interface is split into Source, Generate, Model, and Learn screens. Cleaned
models can be downloaded as `.rwbw.json` files and loaded again later with their
pruned-word lists intact. Generation results expose complete bigram chains and
per-step choice data for the planned slot-machine renderer described in
[`docs/slot-machine-generation.md`](docs/slot-machine-generation.md).

## What it can read

- Text pasted into the page
- Local plain-text and HTML files
- `http://` or `https://` URLs

URL loading first asks the source site directly. Many sites do not allow that
from a browser, so the optional reader fallback uses the public
[Jina AI Reader](https://jina.ai/reader/) service. When that fallback is used,
the requested URL is sent to Jina. Pasting or opening a file keeps the text in
the browser. Use only text you have the right to analyze.

Known-good examples are built into the URL panel: the app's short `sample.txt`,
Project Gutenberg's *Alice's Adventures in Wonderland*, and Project Gutenberg's
*Frankenstein*. The Gutenberg choices automatically enable the reader fallback.

## Local preview

Serve the `site` directory so browser modules can load:

```powershell
python -m http.server 8080 --directory site
```

Then open `http://localhost:8080`.

## Tests

The model has no runtime dependencies. With Node 20 or newer:

```powershell
npm test
```

## AWS deployment

[`deployment.json`](deployment.json) records the isolated S3 prefix and the
existing xoom.org CloudFront distribution. The deploy script uploads only this
app's prefix; it does not delete or replace the xoom.org root site.

If the AWS session is expired, authenticate first:

```powershell
aws login --profile personal-sites
```

Then deploy:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

The script publishes both a normal folder entry and an HTML entry at the exact
UUID key, then invalidates only those CloudFront paths. The clean production URL
is:

<https://xoom.org/b5a6e4a9-50cf-4a80-a666-a5666d13c913>
