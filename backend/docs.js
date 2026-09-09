/* HeimUI documentation — backend guide. Rendering lives in /assets/docs-runtime.js. */

const SECTIONS = [
{
  group: 'Start here',
  items: [
  {
    id: 'hydration', title: 'What hydration is',
    blocks: [
      html(`<p>A screen authored in the Studio is a <strong>template</strong>. It has holes in it —
      <code>{{ product.name }}</code> — and lists that are drawn once and meant to be repeated.
      <strong>Hydration</strong> is the step that fills the holes with real data and expands the lists,
      producing the document a device actually renders.</p>`),

      code(J, `// the screen, as the Studio published it        // your data
{ "type": "text",                                { "user": { "name": "Ada" } }
  "text": "Hello {{ user.name }}" }

// the document a device receives
{ "type": "text", "text": "Hello Ada" }`),

      html(`<p>One function. Two inputs, two outputs:</p>`),
      code(P, `hydrate(screen, data) -> { document, unresolved }`),

      table(['', ''], [
        ['<code>screen</code>', 'The template, exactly as the Studio published it.'],
        ['<code>data</code>', 'Your payload. A plain object — nothing in it is HeimUI-specific.'],
        ['<code>document</code>', 'What you send to the device.'],
        ['<code>unresolved</code>', 'Every expression that found nothing. <strong>Do not ignore this list.</strong>']
      ]),

      note('warning', `A literal <code>{{ product.name }}</code> reaching a user is the failure this whole
      contract exists to prevent. An engine that leaves the braces in place without telling anyone means the
      first report of a broken screen comes from a screenshot.`),

      html(`<h3>The engine does not know what a button is</h3>
      <p>It never reads the schema and never validates a component type. It walks two keys —
      <code>items</code> and <code>children</code> — and substitutes <code>{{ … }}</code>. That is why a full
      implementation is around 350 lines and not 35,000, and why adding a component type to HeimUI never
      breaks your code.</p>`)
    ]
  },
  {
    id: 'do-you-need-it', title: 'Do you need this?',
    blocks: [
      html(`<p>There are two ways to integrate, and <strong>most teams should pick the first</strong> — in
      which case nothing else on this page applies to you.</p>

      <h3>Route A — the SDK hydrates, on the device</h3>
      <p>Your backend returns the JSON response you already have, plus the id of a screen. The SDK fetches the
      template and hydrates it on the device.</p>`),

      code(J, `// your existing endpoint, with one field added
{ "screen": "checkout_v3", "user": { "name": "Ada" }, "products": [ … ] }`),

      note('tip', `You write <strong>zero</strong> HeimUI code on the backend. No library, nothing from this
      page. This is the default, and it is the cheapest thing you will ever integrate.`),

      html(`<h3>Route B — you hydrate, on your server</h3>
      <p>Your server merges the template and the data itself and returns a finished document. Choose this
      when:</p>
      <ul class="mb-4 ml-5 list-disc space-y-1">
        <li>the device must not learn the shape of your data,</li>
        <li>you decide the payload server-side — A/B tests, entitlements, pricing rules, or</li>
        <li>you already own the template cache and want one round trip.</li>
      </ul>
      <p>Route B is the one that needs an implementation in your language. That is the rest of this page.</p>`)
    ]
  }
  ]
},
{
  group: 'The binding rules',
  items: [
  {
    id: 'repeat', title: 'repeat — expanding a list',
    blocks: [
      html(`<p><code>source</code> is where the list lives in your data. <code>as</code> is what one item is
      called inside the subtree.</p>`),
      code(J, `// screen
{ "type": "lazy_column", "id": "list",
  "repeat": { "source": "products", "as": "product" },
  "items": [ { "type": "text", "id": "name", "text": "{{ product.name }}" } ] }

// data
{ "products": [ { "name": "Camera" }, { "name": "Tripod" } ] }

// document
{ "type": "lazy_column", "id": "list",
  "items": [ { "type": "text", "id": "name", "text": "Camera" },
             { "type": "text", "id": "name", "text": "Tripod" } ] }`),
      html(`<p>The first child is the <strong>mould</strong>. It is drawn once per item and then it is gone.
      <code>repeat</code> itself is authoring information and never reaches the device.</p>`),
      note('warning', `Children after the mould are <strong>content, not template</strong> — a footer, a
      "see all" link. Replacing the whole bucket with the expansion deletes them, silently. Keep them, after
      the expansion.`)
    ]
  },
  {
    id: 'scope', title: 'scope — naming an object',
    blocks: [
      html(`<p>The same idea for one value instead of a list. It introduces a name and repeats nothing.</p>`),
      code(J, `// screen
{ "type": "container", "id": "header",
  "scope": { "source": "user", "as": "user" },
  "children": [ { "type": "text", "id": "hi", "text": "Hello {{ user.first_name }}" } ] }

// data
{ "user": { "first_name": "Ada" } }

// document
{ "type": "container", "id": "header",
  "children": [ { "type": "text", "id": "hi", "text": "Hello Ada" } ] }`)
    ]
  },
  {
    id: 'names', title: 'How a name resolves',
    blocks: [
      html(`<p>Three rules, in order:</p>`),
      table(['', ''], [
        ['<strong>Innermost first</strong>', 'A name resolves in the nearest enclosing frame that introduces it. This is what makes a list inside a list work: both moulds may call their item <code>item</code>, and the inner one wins inside itself.'],
        ['<strong>A bare name is a field</strong>', '<code>{{ name }}</code> with no dot means a field of the nearest frame — <code>{{ name }}</code> inside a product mould is the product name.'],
        ['<strong>Then the payload root</strong>', 'Failing every frame, the whole dotted path is read from the root of your data.']
      ]),
      note('warning', `Resolving outermost-first is a real bug with a real symptom: a list inside a list draws
      the outer item in every row.`),
      html(`<h3>A list of primitives binds to the alias itself</h3>
      <p>When the collection holds strings or numbers there is no field to read, so the alias <em>is</em> the
      value.</p>`),
      code(J, `// repeat { "source": "tags", "as": "tag" }, mould text = "{{ tag }}"
// data   { "tags": ["new", "sale"] }
// document: two texts — "new" and "sale"`)
    ]
  },
  {
    id: 'empty', title: 'empty — what an empty list draws',
    blocks: [
      code(J, `// screen
{ "type": "lazy_column", "id": "list",
  "repeat": { "source": "orders", "as": "order",
              "empty": { "type": "text", "id": "none", "text": "You have no orders yet" } },
  "items": [ { "type": "text", "id": "n", "text": "{{ order.code }}" } ] }

// data
{ "orders": [] }

// document
{ "type": "lazy_column", "id": "list",
  "items": [ { "type": "text", "id": "none", "text": "You have no orders yet" } ] }`),
      html(`<p>No <code>empty</code> and an empty list means the container is simply empty.</p>`),
      note('note', `An <strong>absent</strong> <code>empty</code> and <code>"empty": null</code> are different
      documents. In a dynamic language that means a sentinel — see <a href="#traps">what gets ported
      wrong</a>.`)
    ]
  },
  {
    id: 'variants', title: 'match and when — one list, several shapes',
    blocks: [
      html(`<p>A feed of mixed shapes. <code>match</code> names the item field that decides; each mould
      declares the value it draws with <code>when</code>. <code>"*"</code> is the fallback. Children with no
      <code>when</code> are content, and survive.</p>`),
      code(J, `// screen
{ "type": "lazy_column", "id": "feed",
  "repeat": { "source": "cards", "as": "card", "match": "kind" },
  "items": [ { "type": "text",  "id": "p", "when": "product", "text": "Product {{ card.title }}" },
             { "type": "image", "id": "b", "when": "banner",  "url": "{{ card.image }}" },
             { "type": "text",  "id": "footer", "text": "See all" } ] }

// data
{ "cards": [ { "kind": "banner", "image": "a.png" },
             { "kind": "product", "title": "Camera" },
             { "kind": "ad" } ] }

// document
{ "type": "lazy_column", "id": "feed",
  "items": [ { "type": "image", "id": "b", "url": "a.png" },
             { "type": "text",  "id": "p", "text": "Product Camera" },
             { "type": "text",  "id": "footer", "text": "See all" } ] }`),
      html(`<p>Two things to read out of that output. The third card is <code>kind: "ad"</code> and no mould
      claims it, so it is <strong>left out</strong> rather than drawn with the wrong template. And
      <code>when</code> is stripped: how a mould was chosen is not something a device has any use for.</p>`),
      note('note', `<code>match</code> is a field name, not an expression. That is deliberate — an editor can
      check a field against a declared contract and tell an author which entries no mould claims. A condition
      that is a program can only be run, never reasoned about.`)
    ]
  },
  {
    id: 'form-state', title: 'Form state — the namespace that is not yours',
    blocks: [
      html(`<p><code>state</code> is a reserved namespace belonging to the device. The SDK resolves
      <code>{{ state.* }}</code> against form state — what the user has typed, whether a submit is in flight.
      <strong>Leave it exactly as you found it.</strong></p>`),
      code(J, `// screen                                        // document — unchanged, and not reported
{ "type": "button", "loading": "{{ state.is_submitting }}" }`),
      note('security', `If your server resolves <code>{{ state.* }}</code>, you overwrite the user's typing
      with an empty string before the SDK can write it. The symptom is a form that submits blank fields.`),
      html(`<h3>state_scope — telling three rows apart</h3>
      <p>Three passengers on screen share one <code>state_key</code>. Without a namespace, typing in the third
      row fills the first, one validation rule covers all three, and the submitted payload carries a single
      name.</p>
      <p>So a repeated row that contains a form field gets a <code>state_scope</code> stamped on each copy —
      <code>passengers/p1</code>, from the source and the item's own <code>id</code>, falling back to the
      index. Only rows that write state get one; a catalogue of product cards would be paying bytes for
      nothing.</p>`),
      note('warning', `Whatever expanded the list is the only thing that knows which row is which — so on
      Route B, <strong>the stamping is yours</strong>.`)
    ]
  },
  {
    id: 'absent-null', title: 'Absent is not null',
    blocks: [
      code(J, `// screen: two texts — "[{{ product.badge }}]" and "[{{ product.ghost }}]"
// data:   { "product": { "badge": null } }

// document
[ { "id": "badge", "text": "[]" },
  { "id": "gone",  "text": "[{{ product.ghost }}]" } ]

// unresolved
[ { "nodeId": "gone", "property": "text", "expression": "product.ghost" } ]`),
      table(['', '', ''], [
        ['<code>badge</code>', 'present, null', 'Your backend saying <em>"this product has no badge"</em>. That is an answer: it renders empty and is <strong>not</strong> reported.'],
        ['<code>ghost</code>', 'absent', 'Nobody said anything. The braces stay and it <strong>is</strong> reported.']
      ]),
      html(`<p>Rendering the literal word <code>null</code> on a device is the old way of getting this
      wrong.</p>
      <h3>Two policies for what is left behind</h3>`),
      table(['Policy', 'Leaves', 'Use it'], [
        ['<code>keep</code>', 'the braces in place', 'Staging. Loud, impossible to miss.'],
        ['<code>blank</code>', 'an empty string', 'Production. Quiet, degrades cleanly.']
      ]),
      note('note', `<strong>Both report.</strong> The policy changes what a user sees, never what you are
      told.`)
    ]
  }
  ]
},
{
  group: 'Implementations',
  items: [
  {
    id: 'implementations', title: 'Python, Node, Kotlin and Go',
    blocks: [
      html(`<p>Four implementations exist, written separately, agreeing on all 22 corpus cases. Take one,
      or write your own.</p>`),
      table(['Language', 'File', 'Runner', 'Dependencies'], [
        ['Python 3.9+', '<a href="/backend/examples/python/heimui_hydration.py">heimui_hydration.py</a>', '<a href="/backend/examples/python/run_corpus.py">run_corpus.py</a>', 'None — standard library'],
        ['Node (ESM)', '<a href="/backend/examples/node/heimui-hydration.mjs">heimui-hydration.mjs</a>', '<a href="/backend/examples/node/run-corpus.mjs">run-corpus.mjs</a>', 'None'],
        ['Kotlin (JVM)', '<a href="/backend/examples/kotlin/HeimHydrationEngine.kt">HeimHydrationEngine.kt</a>', '<a href="/backend/examples/kotlin/RunCorpus.kt">RunCorpus.kt</a>', 'kotlinx-serialization-json'],
        ['Go 1.21+', '<a href="/backend/examples/go/hydration.go">hydration.go</a>', '<a href="/backend/examples/go/runcorpus/main.go">runcorpus/main.go</a>', 'None — standard library']
      ]),
      html(`<p>Each is a single file, structured in the same order as the rules above, and each passed 22
      of 22 on its first run against the corpus. That is the honest measure of how large this job is:</p>`),
      table(['Language', 'Lines of code', 'Total, with comments'], [
        ['Node', '256', '400'],
        ['Kotlin', '289', '442'],
        ['Python', '306', '475'],
        ['Go', '473', '630']
      ]),
      html(`<p>Go is the outlier because a type switch, an explicit <code>ok</code> on every map read and no
      comprehensions cost lines, not because it is doing more.</p>

      <h3>Where the template comes from is yours</h3>
      <p>The engine takes a screen that is already parsed. It never fetches anything, so <strong>whatever
      stores your published screens is a detail it knows nothing about</strong>: object storage such as S3 or
      GCS, a CDN in front of it, a Git repository, an internal API, or a table in your own database. The
      Studio publishes a screen; how it reaches your service is your architecture, not this contract's.</p>
      <p>Two things are worth doing wherever you read it from. Cache it — a template changes on a deploy, not
      on a request, and refetching one per request turns your storage into a hot path. And keep serving the
      last copy you had when the fetch fails, because a screen that is one release behind is a working app
      and a screen that is missing is a blank one.</p>`),
      tabs(
        code(P, `from heimui_hydration import hydrate_with_report, UnresolvedPolicy

# Wherever you publish screens: S3, a CDN, a Git repo, your own API, your own database.
screen = templates.fetch("checkout_v3")
data = checkout_payload(user)

result = hydrate_with_report(screen, data, UnresolvedPolicy.KEEP)

for u in result.unresolved:
    log.warning("unresolved %s on %s.%s", u.expression, u.node_id, u.property)

return result.document`),
        code(JS, `import { hydrateWithReport, UnresolvedPolicy } from './heimui-hydration.mjs';

// Wherever you publish screens: S3, a CDN, a Git repo, your own API, your own database.
const screen = await templates.fetch('checkout_v3');
const data = await checkoutPayload(user);

const { document, unresolved } = hydrateWithReport(screen, data, UnresolvedPolicy.KEEP);

for (const u of unresolved) {
  log.warn(\`unresolved \${u.expression} on \${u.nodeId}.\${u.property}\`);
}

return document;`),
        code(K, `// Wherever you publish screens: S3, a CDN, a Git repo, your own API, your own database.
val screen = templates.fetch("checkout_v3")
val data = checkoutPayload(user)

val (document, unresolved) = HeimHydrationEngine.hydrateWithReport(screen, data, UnresolvedPolicy.KEEP)

unresolved.forEach { log.warn("unresolved {} on {}.{}", it.expression, it.nodeId, it.property) }

return document`),
        code(GO, `// Wherever you publish screens: S3, a CDN, a Git repo, your own API, your own database.
screen, err := templates.Fetch(ctx, "checkout_v3")
if err != nil {
    return nil, err
}
data := checkoutPayload(user)

result := hydration.HydrateWithReport(screen, data, hydration.Keep)

for _, u := range result.Unresolved {
    log.Printf("unresolved %s on %s.%s", u.Expression, u.NodeID, u.Property)
}

return result.Document`)
      ),
      note('tip', `All four end with a section marked <em>legacy</em>, which reads screens authored before
      the binding contract existed. If every screen you serve was authored in the Studio against the contract,
      delete it — nothing above it depends on it.`)
    ]
  },
  {
    id: 'port', title: 'Porting it to your language',
    blocks: [
      html(`<p>Three steps.</p>
      <ol class="mb-4 ml-5 list-decimal space-y-1">
        <li>Copy the Python or Node file and translate it. Both are single files with no dependencies.</li>
        <li>Copy the matching corpus runner.</li>
        <li>Point it at the corpus and make it green.</li>
      </ol>`),
      note('note', `Do not start from this page. Start from a reference implementation and use the page to
      understand what you are reading — the corpus is what decides whether you are right.`)
    ]
  }
  ]
},
{
  group: 'Proving it',
  items: [
  {
    id: 'corpus', title: 'The conformance corpus',
    blocks: [
      html(`<p>Do not trust a reading of this page. The definition of correct is the <strong>hydration
      corpus</strong>: 22 JSON cases, each one a screen, a payload, the document a device should receive, and
      the expressions that should have been reported.</p>
      <p>Every implementation runs the same 22 cases. That is the entire reason engines written by different
      people in different languages agree.</p>`),
      code(SH, `curl -sL https://github.com/heimui-io/heimui-docs/archive/refs/heads/main.tar.gz \\
  | tar -xz --strip-components=2 heimui-docs-main/backend

cd backend/examples/python && python3 run_corpus.py
cd backend/examples/node   && node run-corpus.mjs
cd backend/examples/go     && go run ./runcorpus`),

      html(`<p>The Kotlin pair is two files for a JVM project rather than a script. This is the whole
      build they need:</p>`),
      code(G, `plugins {
    kotlin("jvm") version "2.0.21"
    application
}
repositories { mavenCentral() }
dependencies { implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3") }
application { mainClass.set("io.heimui.hydration.RunCorpusKt") }

// ./gradlew run --args="path/to/corpus"`),
      code(SH, `  ok   01-scope-object.json
  ok   02-repeat-items.json
  …
  ok   22-repeat-variant-unclaimed.json

22/22 cases pass.`),
      html(`<p>Each case carries a <code>why</code> field naming the bug it exists to prevent. Read those
      before you start — they are the shortest description of the hard parts.</p>`),
      code(J, `{
  "name": "a repeated form gets a namespace per row",
  "why": "Three passengers on screen share one state_key, so typing in the third row filled the
          first, one validation rule covered all three, and the submitted payload carried a
          single name.",
  "options": { "onUnresolved": "keep" },
  "screen": { … },
  "data": { … },
  "expected": { … },
  "expectedUnresolved": []
}`)
    ]
  },
  {
    id: 'traps', title: 'What gets ported wrong',
    blocks: [
      html(`<p>Every one of these is a real bug, and a corpus case exists to catch each.</p>`),
      table(['Trap', 'What it costs you'], [
        ['Resolving <code>{{ state.* }}</code>', "The user's typing is destroyed before the SDK sees it."],
        ['Dropping <code>metadata</code>', 'Nobody can say which version of a screen a user saw.'],
        ['Replacing the whole <code>items</code> bucket with the expansion', 'Footers and static siblings silently disappear.'],
        ['Treating absent and null the same', 'Either false alarms in the report, or none at all.'],
        ['Resolving names outermost-first', 'A list inside a list draws the outer item in every row.']
      ]),
      html(`<h3>One more, for dynamic languages</h3>
      <p><strong>Absent and null need different sentinels.</strong> Python uses a <code>MISSING</code> object,
      Node a <code>Symbol</code>. If you let both collapse to <code>None</code> or <code>undefined</code>,
      <a href="#absent-null">absent is not null</a> is unimplementable.</p>`),
      note('warning', `A caveat belonging to JavaScript rather than to this contract: JSON <code>3.0</code>
      parses to the number <code>3</code>, and <code>String(3)</code> is <code>"3"</code> where other
      languages render <code>"3.0"</code>. If a decimal's trailing zero matters — prices, mostly — send it as
      a string.`)
    ]
  }
  ]
}
];

renderDocs();
