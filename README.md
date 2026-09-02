# HeimUI documentation

Source of **[heimui.io](https://heimui.io)**.

```
index.html    landing page
sdk/          mobile SDK documentation
  index.html    layout, styles, search, code copying
  docs.js       the content
favicon.svg
CNAME         heimui.io
```

## Running it

Static HTML, no build step:

```bash
python3 -m http.server 8000
```

## Editing content

Content lives in `docs.js`, layout in `index.html`. Writing docs never means touching the layout.

Sections are entries in `SECTIONS`, grouped for the sidebar:

```js
{
  group: 'Core concepts',
  items: [{
    id: 'caching',                 // also the anchor: /sdk/#caching
    title: 'Caching & offline',
    blocks: [
      html(`<p>…</p>`),
      code(K, `HeimConfig(…)`),    // K = Kotlin, J = JSON, G = Gradle
      note('warning', `…`),        // note · tip · warning · security
      table(['Option', 'What it decides'], [['<code>ttlMillis</code>', '…']]),
    ]
  }]
}
```

Nesting, code highlighting, copy buttons, search and the scroll-spy sidebar all follow from that —
there is nothing else to wire.

## Adding a product

Copy `sdk/` to a new folder and add a card to the landing page.

Write for that product's reader: the SDK section is for engineers and shows code; Studio is for
designers and should show flows and screenshots, with no Kotlin in it.

## CI

Every push checks that `docs.js` parses, that no internal anchor points at a section that does not
exist, and that `CNAME` is intact. A syntax error in `docs.js` renders the page blank rather than
degrading, so it is worth catching before it ships.
