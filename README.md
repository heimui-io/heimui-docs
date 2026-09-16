# HeimUI documentation

Source of **[heimui.io](https://heimui.io)**.

## The ecosystem

| | | |
| --- | --- | --- |
| **[Core SDK](https://github.com/heimui-io/heimui-core)** | Renders the screens on Android and iOS | Apache 2.0 |
| **[Documentation](https://heimui.io)** | Guides, the screen schema, hydration and signing | [heimui-docs](https://github.com/heimui-io/heimui-docs) |
| **[Demo app](https://github.com/heimui-io/heimui-demo)** | A full integration you can run | Apache 2.0 |
| **HeimUI Studio** | The visual editor that authors and publishes screens | Commercial — [heimui.io/studio](https://heimui.io/studio/) |

## What you probably came for

The [backend guide](https://heimui.io/backend/) sends people here for two things.

**Four reference implementations of hydration**, in `backend/examples/`. Each is one file that merges
a screen template with a payload, and each passes all 25 conformance cases.

| Language | File | Dependencies |
| --- | --- | --- |
| Python 3.9+ | `examples/python/heimui_hydration.py` | none — standard library |
| Node (ESM) | `examples/node/heimui-hydration.mjs` | none |
| Kotlin (JVM) | `examples/kotlin/HeimHydrationEngine.kt` | kotlinx-serialization-json |
| Go 1.21+ | `examples/go/hydration.go` | none — standard library |

**The conformance corpus**, in `backend/corpus/`: 25 cases, each one a screen, a payload, the
document a device should receive, and the expressions that should have been reported as unresolved.
It is what decides whether an implementation is correct — including one you write in a language not
listed above.

```bash
cd backend/examples/python && python3 run_corpus.py
cd backend/examples/node   && node run-corpus.mjs
cd backend/examples/go     && go run ./runcorpus
```

Take a file, port it, make the corpus green. That is the whole job, and it is around 300 lines.

## Something wrong on the site?

Open an issue naming the page and what is wrong. Pushes here are restricted to the maintainer, so an
issue travels faster than a pull request.

## Working on the site

Static HTML, no build step. Serve from the repository root rather than opening a file — pages link
with root-absolute paths, and `file://` resolves those against your disk.

```bash
python3 -m http.server 8000
```

Content is `SECTIONS` in each section's `docs.js`; rendering is `assets/docs-runtime.js`, shared by
every section. Both files carry their own instructions. Four things fail silently if you get them
wrong:

- The runtime loads **before** a section's `docs.js`, and that file ends with `renderDocs()`.
- A language only highlights if that section's `index.html` loads its highlight.js pack.
- `backend/corpus/` is generated. It is authored in `heimui-core/schema/hydration` and overwritten
  by `sync-schema.sh`, so an edit made here is lost — and until it is, this repository and the SDK
  disagree about what a screen renders while both keep passing their own checks.
- A syntax error in any script renders a blank page rather than degrading.

CI catches the last one on every push, along with dead anchors, the CNAME, and the corpus itself.
