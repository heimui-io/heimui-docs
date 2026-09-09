# HeimUI documentation

Source of **[heimui.io](https://heimui.io)**.

```
index.html              landing page
assets/
  docs-runtime.js       rendering, navigation, search — shared by every section
sdk/                    mobile SDK documentation
  index.html              page shell
  docs.js                 the content
backend/                hydrating a screen, for the team that owns the backend
  index.html
  docs.js
  examples/               reference implementations, one folder per language
  corpus/                 the 22 conformance cases — a generated copy, see below
favicon.svg
CNAME                   heimui.io
```

## Running it

Static HTML, no build step:

```bash
python3 -m http.server 8000
```

Serve from the repository root rather than opening a file: pages link with root-absolute paths
(`/sdk/`, `/favicon.svg`), and `file://` resolves those against your disk.

## Editing content

Content lives in `docs.js`, rendering in `assets/docs-runtime.js`. Writing docs never means touching
the runtime.

Sections are entries in `SECTIONS`, grouped for the sidebar:

```js
{
  group: 'Core concepts',
  items: [{
    id: 'caching',                 // also the anchor: /sdk/#caching
    title: 'Caching & offline',
    blocks: [
      html(`<p>…</p>`),
      code(K, `HeimConfig(…)`),    // K J G P JS SH GO — see the runtime's language list
      note('warning', `…`),        // note · tip · warning · security
      table(['Option', 'What it decides'], [['<code>ttlMillis</code>', '…']]),
    ]
  }]
}
```

Nesting, code highlighting, copy buttons, search and the scroll-spy sidebar all follow from that —
there is nothing else to wire.

Two rules the runtime imposes. A content file ends with `renderDocs()`, and the page loads
`assets/docs-runtime.js` **before** it, so the helpers exist when the content is read and the
document exists when it is rendered. And a language only highlights if `index.html` loads its
highlight.js pack.

## Adding a product

Copy an existing `index.html` to a new folder, change the title, description and footer, and write a
`docs.js` beside it. Add a card to the landing page and an entry to the section switcher in every
`index.html`, so the new section is reachable from the others.

Write for that product's reader: the SDK section is for engineers and shows Kotlin; Studio is for
designers and should show flows and screenshots, with no Kotlin in it.

## The corpus is a copy

`backend/corpus/` is generated. It is the hydration corpus from `heimui-core/schema/hydration`,
which is where it is authored, and it is overwritten by `heimui-core/scripts/sync-schema.sh`.

**Editing a case here loses the edit silently**, and worse, it makes this repository disagree with
the SDK about what a screen renders while both keep passing their own checks. Change it upstream and
run the sync.

## CI

Every push checks that every `.js` file parses, that no internal anchor points at a section that
does not exist, that `CNAME` is intact, and that the reference implementations still pass all 22
corpus cases.

A syntax error in `docs.js` renders its page blank rather than degrading, and one in
`assets/docs-runtime.js` blanks every page, so both are worth catching before they ship.

The corpus run is there because the page makes a specific promise — *these implementations pass the
corpus* — and a promise nothing verifies is a promise that quietly stops being true.
