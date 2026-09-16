/* HeimUI documentation — the Studio. Rendering lives in /assets/docs-runtime.js. */

const diagram = (body) => html(`<pre class="my-4 overflow-x-auto rounded-xl border border-edge bg-[#0d1220] p-4 font-mono text-[13px] leading-relaxed text-muted">${body}</pre>`);

const SECTIONS = [
{
  group: 'Start here',
  items: [
  {
    id: 'run', title: 'Run it',
    blocks: [
      html(`<p>The Studio stores HeimUI screens and serves them to apps. It is one container and one
      SQLite file — no hosted service, no account, nothing leaving the machine you start it on.</p>

      <p>What it replaces is <em>where a screen comes from</em>:</p>`),

      diagram(`before   app ──▶ raw.githubusercontent.com/…/hub_screen.json
after    app ──▶ studio.yourcompany.com/screens/hub/hub_screen.json`),

      code(SH, `docker compose up`),

      html(`<p>Serves on <code>http://localhost:8080</code>, with the editor at <code>/editor/</code>.
      The database is <code>./data/studio.db</code> on your disk rather than inside the container: a
      container filesystem is ephemeral, and without that mount every rebuild would destroy every
      screen. For development without Docker, <code>./gradlew :server:run</code>.</p>

      <p>Nothing changes on the app side beyond the base URL. Screens are validated against the HeimUI
      schema before they are stored, so a screen that would render broken on a device cannot be saved
      in the first place.</p>`),

      html(`<h3>What a deployment can set</h3>`),

      table(['Variable', 'What it decides', 'Default'], [
        ['<code>STUDIO_DB</code>', 'Where the database file lives', '<code>studio.db</code> beside the process; <code>/data/studio.db</code> in Docker'],
        ['<code>STUDIO_PORT</code>', 'The port it serves on', '<code>8080</code>'],
        ['<code>STUDIO_HOST</code>', 'The interface it binds to', '<code>127.0.0.1</code>. The container sets <code>0.0.0.0</code> and publishes the port on loopback'],
        ['<code>STUDIO_TOKEN</code>', 'A token every <code>/api</code> call must present', 'unset, which leaves the Studio open — right on a laptop, wrong anywhere else'],
        ['<code>STUDIO_SEED</code>', '<code>off</code> skips the starter design system and example screen an empty Studio opens on', 'on'],
        ['<code>STUDIO_SIGNING_KEY</code> · <code>STUDIO_SIGNING_KEY_FILE</code>', 'The key to sign with, instead of the one this Studio generates. See <a href="#signing-key">The signing key</a>', 'generated in <code>signing/</code>'],
        ['<code>HEIMUI_STORAGE_ACCESS_KEY</code> · <code>HEIMUI_STORAGE_SECRET</code>', 'The bucket credential, when the container holds it rather than the panel. See <a href="/storage/#studio-config">Object storage</a>', 'none — the provider&rsquo;s own credential chain']
      ]),

      note('note', `An empty Studio seeds itself with a starter design system and one example screen, because
      a Studio that opens on nothing teaches nothing. It only ever happens into an empty one, and
      <code>STUDIO_SEED=off</code> skips it for a deployment that provisions its own catalogue.`),

      note('note', `The Studio is optional in both directions. An app can read screens from your own
      backend or from <a href="/storage/#why">a bucket</a> and never touch it; and a team that uses it
      to author screens can still serve them from somewhere else.`)
    ]
  },
  {
    id: 'drafts', title: 'Drafts, releases and rollback',
    blocks: [
      html(`<p>Saving is not publishing, and that distinction is the whole storage model.</p>`),

      table(['What you do', 'What it creates', 'What a device sees'], [
        ['<strong>Save</strong>', 'Nothing. It overwrites the one working draft this screen has', 'Nothing. Devices read the live release'],
        ['<strong>Publish</strong>', 'An immutable, <strong>named</strong> release, and points the environment at it', 'The new screen, on the next fetch'],
        ['<strong>Roll back</strong>', 'Nothing. It moves the pointer to an earlier release', 'That earlier screen']
      ]),

      html(`<p>So refining a screen twenty times is twenty saves of one draft, not twenty versions of
      anything. Publishing bytes that are already a release returns to that release rather than minting
      a duplicate of it, and because the ETag is derived from the content, a device that still holds
      those bytes gets a <code>304</code> instead of a download.</p>

      <p>The <strong>History</strong> tab shows the draft and the releases as two different things.
      Publishing asks what the release is, and that name is what the history shows — the dialog names
      what is being created, what it replaces, and whether the screen's own version should move.</p>`),

      html(`<h3>Getting a draft back</h3>
      <p>A save overwrites the draft, so the Studio keeps <strong>recovery points</strong> of its own as you
      work — capped, so they cannot grow without bound. <code>GET /api/snapshots/{id}</code> lists them and
      <code>GET /api/snapshot/{takenAt}/{id}</code> reads one, and the editor offers them where the history
      is. They are for the draft only: a release is immutable and needs no recovering.</p>`),

      note('tip', `A field appearing, or its rules changing, is a reason to bump the screen version. A
      copy change is not: bumping for one would make every device discard the forms users had half
      filled in.`)
    ]
  }
  ]
},
{
  group: 'The editor',
  items: [
  {
    id: 'editor', title: 'Three views of one document',
    blocks: [
      html(`<p><code>http://localhost:8080/editor/</code> once the server is up; <code>/</code> redirects
      there. The toolbar switches between three views of the same document:</p>`),

      table(['View', 'What it is for'], [
        ['<strong>Visual</strong>', 'A device canvas rendering the primitives, a component tree, and an inspector'],
        ['<strong>Split</strong>', 'The canvas beside the raw JSON, for when you are learning what a property does'],
        ['<strong>JSON</strong>', 'The document itself, with completion and validation from the schema the server validates against']
      ]),

      html(`<p>The inspector's controls are <strong>generated from the schema</strong>, not written by
      hand: the values a dropdown offers are that property's enum, the fields an action shows are that
      action's own fields, and a property the schema gains becomes editable without a code change in the
      editor. Every field carries an explanation of what changing it does, in the language the editor is
      set to.</p>

      <p>Every structural edit is undoable with <code>Cmd</code>/<code>Ctrl</code> + <code>Z</code>, so
      deleting a subtree is a keystroke to reverse rather than a decision. A payload the schema rejects
      is not stored, and the failing paths are listed under the editor rather than being a
      <code>422</code> nobody sees.</p>`),

      note('note', `Monaco and the icon font are bundled rather than fetched from a CDN, so the Studio
      works on a machine with no internet access at all.`)
    ]
  },
  {
    id: 'diagnostics', title: 'What the validator cannot catch',
    blocks: [
      html(`<p>The <strong>Diagnostics</strong> panel flags five things that are perfectly valid JSON and
      still wrong on a device. None of them blocks a save — most are normal states halfway through
      building a screen.</p>`),

      table(['What it flags', 'What the device does with it'], [
        ['A component with nothing to show — a <code>text</code> with no text, a <code>button</code> with no title', 'Renders nothing at all'],
        ['A component type the schema does not branch on', 'Renders a fallback. A genuinely new component and a typo look identical from here'],
        ['Two siblings sharing an id', 'The SDK renames one to keep a list key unique, and whatever referenced it now points at the other'],
        ['A <code>visible_if</code> reading a key nothing on the screen writes', 'The evaluator fails closed: the component never appears'],
        ['A <code>visible_if</code> written with interpolation instead of a key', 'Compares the literal text, fails closed, and is invisible forever with nothing to show why']
      ]),

      html(`<p>The middle ones are why this belongs in an editor rather than in the schema: they require
      looking at <em>other</em> nodes in the tree, and JSON Schema cannot express a cross-reference.</p>`),

      note('note', `An orphan state key has a legitimate case too — the host app can seed state the screen
      never declares — which is why it is a diagnostic rather than an error.`)
    ]
  },
  {
    id: 'design-system', title: 'The design system',
    blocks: [
      html(`<p>Two tabs, answering two different questions. <strong>Palette</strong> is the primitives the
      schema defines: what this system can draw. <strong>System</strong> is what your team saved: what
      this product looks like.</p>

      <p>Two ways into the second: <em>New component</em> builds one from scratch, and <em>Save as
      preset</em> in the inspector captures one you already configured on a screen. Inserting it later
      copies the whole subtree with fresh ids and its own form bindings, so the same saved form dropped
      in twice does not produce two inputs writing one key.</p>

      <p>A component opens in the <strong>workbench</strong> — the same canvas, tree and inspector, with
      the phone chrome dropped and the height fitted to the content, because a button is not a screen.
      Publish, Delete and History disappear rather than sitting there disabled: a component reaches a
      device only through the screens built from it.</p>`),

      note('warning', `<strong>Editing a preset does not reach the screens already built from it.</strong>
      Inserting copies primitives into the screen, so nothing new reaches a device and the wire contract
      does not move. Live propagation is a different feature with a different risk profile, and it needs
      versioned masters and a blast-radius view before it is safe to want.`)
    ]
  },
  {
    id: 'tokens', title: 'Brand tokens',
    blocks: [
      html(`<p>A colour written as <code>#00E5FF</code> is that colour in light and in dark. A colour
      written as <code>brand_primary</code> is a question the app answers, and it can answer differently
      per theme — so tokens are not a convenience here. They are the mechanism by which a server-driven
      screen follows the device's theme at all.</p>

      <p>Tokens are defined where design happens, under <strong>Tokens</strong>: the canvas previews them
      and switches between light and dark, and the manifest exports as Kotlin for the mobile team to
      register. Where a colour has to be the same in both themes, one field covers it.</p>`),

      note('warning', `<strong>A token the Studio offers and the app never registered resolves to a
      component default on the device, silently.</strong> No error, no log — just a screen that looks
      wrong. That is what the Kotlin export is for, and the diagnostics flag both halves: a name nothing
      can resolve, and a hex where the brand already has a name.`),

      html(`<p>The names themselves are data, not contract. One team's vocabulary is
      <code>brand_primary</code>, the next's is <code>neutral_01</code> through <code>neutral_10</code>,
      and neither belongs in a schema they both share.</p>`)
    ]
  }
  ]
},
{
  group: 'Serving apps',
  items: [
  {
    id: 'environments', title: 'Environments and read keys',
    blocks: [
      html(`<p>An environment is a pointer: which release of a screen is live on it. A screen published to
      <code>develop</code> and promoted to <code>release</code> is one release with two pointers, not two
      copies.</p>`),

      diagram(`/screens/@develop/checkout   ← what the team is testing
/screens/@release/checkout   ← what users are running`),

      html(`<p>The channel is a path segment rather than a header on purpose: the URL is the cache key, so
      every cache between the Studio and a device separates environments without being told. With a header
      it would take a correct <code>Vary</code> in the SDK, in any CDN and in any corporate proxy, and one
      of them getting it wrong serves a canary screen to a stable user.</p>

      <h3>Moving a screen through them</h3>`),

      table(['Action', 'What moves', 'What the release does'], [
        ['<strong>Publish</strong> to an environment', 'A new release, and that environment&rsquo;s pointer', 'Created'],
        ['<strong>Promote</strong> to the next', 'Only the pointer — the same release, byte for byte', 'Untouched, so the ETag holds and devices get a <code>304</code>'],
        ['<strong>Take down</strong>', 'The pointer is removed', 'Survives. Anything reading that environment gets a <code>404</code>, and putting it back is a promotion rather than a rebuild']
      ]),

      html(`<p>Environments are a list you can add to: a team that wants <code>staging</code> between the two
      creates it in <strong>Settings &rarr; Environments</strong>, and the order in that list is the order
      screens travel. Removing one takes down everything it was serving, which the dialog says out loud.</p>

      <h3>Who may read one</h3>
      <p>Closed by default. What reads a closed environment is a service, and a service can hold a secret:</p>`),

      table(['State', 'A request with no credentials'], [
        ['<strong>Closed</strong> (the default)', '<code>401</code>, naming the scheme it wanted'],
        ['<strong>Closed, with a read key</strong>', '<code>200</code> — send <code>Authorization: Bearer &lt;key&gt;</code>'],
        ['<strong>Open</strong> — the environment, or one screen inside it', '<code>200</code>. Anything that can reach the Studio may read it']
      ]),

      code(SH, `curl -H "Authorization: Bearer heimk_…" https://studio.example.com/screens/@release/checkout`),

      html(`<p>Keys are minted under <strong>Settings &rarr; Environments</strong>, one per consumer so one
      can be revoked without taking the others down. The secret is shown <strong>once</strong>, with the
      header line ready to paste; the Studio keeps only a hash of it.</p>

      <p>Opening one screen inside a closed environment is a separate switch, for a terms page inside a
      production that also serves a checkout. <a href="/storage/#device-reads">When the device can read it
      directly</a> covers what that means in a bucket.</p>`),

      note('security', `Access and signatures answer different questions. A read key decides <em>who may
      read</em>; the <a href="#signing-key">signature</a> on every response lets an app decide <em>who
      wrote it</em>. Neither replaces the other, and the signature travels on every environment, open or
      closed.`)
    ]
  },
  {
    id: 'draft-preview', title: 'Previewing a draft on a device',
    blocks: [
      html(`<p>A canvas is not a phone. The fonts are the phone's, the icons are the app's, and a custom
      component is whatever that app registered under that name — none of which an editor can show you.
      So the draft can be read from a device directly, before it is published to anybody.</p>`),

      code(SH, `curl -H "Authorization: Bearer heimk_…" \\
  https://studio.example.com/screens/@draft/checkout`),

      html(`<p><strong>A key is the whole of the access control.</strong> This route is never open, whatever
      any environment says: an environment decides who reads what was <em>published</em>, and a draft is
      precisely what was not. Without a key it answers <code>401</code> to everybody, including you.</p>`),

      table(['', ''], [
        ['<strong>Where the key comes from</strong>', '<strong>Settings &rarr; Environments &rarr; Draft preview</strong>, which also shows the route to copy. The secret appears once'],
        ['<strong>What that key opens</strong>', 'Drafts, and nothing else. It does not read an environment, and an environment&rsquo;s key does not read drafts'],
        ['<strong>What it serves</strong>', 'The working draft as it is right now — the save you just made, not the release'],
        ['<strong>Caching</strong>', '<code>no-store</code>. A draft changes while somebody types, and a preview a minute behind is worse than none']
      ]),

      note('security', `Keep it out of a release build. It reads unpublished work, so a preview key in an
      app on a shop is a copy of everything your team is still working on. Put it in a debug build, and
      revoke it when whoever was testing no longer needs it.`),

      html(`<p>It is signed like everything else this Studio serves, so an app with
      <a href="/sdk/#signing">signature verification</a> on renders the preview rather than refusing it.
      Nothing else about the app changes: the screen id is that URL, and the key travels in the same
      <code>Authorization</code> header your token provider already returns.</p>`)
    ]
  },
  {
    id: 'point-an-app', title: 'Pointing an app at it',
    blocks: [
      html(`<p>One setting in the app: the base URL the SDK resolves screen ids against.</p>`),

      code(K, `HeimConfig(baseUrl = "http://10.0.2.2:8080")   // the Android emulator's alias for your host`),

      html(`<p>Loading a directory of existing screens is a loop over the write API — useful when migrating
      off static files:</p>`),

      code(SH, `find sdui/screens -name "*.json" | sort | while read -r file; do
  id=$(echo "$file" | sed "s|^sdui/screens/||")
  curl -sf -X PUT "http://localhost:8080/api/screens/$id" \\
    -H "X-Heim-Studio: 1" -H "Content-Type: application/json" \\
    --data-binary @"$file" > /dev/null || { echo "REJECTED $id"; continue; }
  curl -sf -X POST "http://localhost:8080/api/publish/$id" \\
    -H "X-Heim-Studio: 1" -H "Content-Type: application/json" \\
    -d '{"name": "Imported"}' > /dev/null && echo "published $id"
done`),

      html(`<p>A screen the validator rejects prints <code>REJECTED</code> and is skipped — nothing is
      stored, so the next screen is unaffected. Re-running saves over the draft and publishes again.</p>

      <p>A <strong>physical device</strong> on the same wifi is not on loopback, so the server has to be
      opened up deliberately — and given a token, since at that point it is on a network with other
      machines:</p>`),

      code(SH, `STUDIO_HOST=0.0.0.0 STUDIO_TOKEN=$(openssl rand -hex 16) ./gradlew :server:run`),

      note('warning', `Plain <code>http://</code> reaches debug builds only. A release build refuses
      cleartext unless the host is named in <code>allowCleartextHosts</code>, and the platform has to agree
      too — see <a href="/sdk/#security">the SDK security model</a>.`)
    ]
  },
  {
    id: 'api', title: 'The API',
    blocks: [
      html(`<p>Two surfaces on one process. <strong>An app only ever touches the first.</strong></p>`),

      table(['Method', 'Route', 'Purpose'], [
        ['<code>GET</code>', '<code>/screens/{id}</code>', 'The live release on the last environment. Sends <code>ETag</code>, honours <code>If-None-Match</code>, carries <code>X-Heim-Signature</code>'],
        ['<code>GET</code>', '<code>/screens/@{channel}/{id}</code>', 'The live release on one named environment'],
        ['<code>GET</code>', '<code>/health</code>', 'Liveness and screen count. No token required']
      ]),

      html(`<p>Everything under <code>/api</code> writes drafts or decides what devices read, so it is
      gated — see <a href="#access">Access</a>.</p>`),

      table(['Method', 'Route', 'Purpose'], [
        ['<code>GET</code>', '<code>/api/screens</code>', 'Every screen, with what is live and whether the draft is ahead of it'],
        ['<code>GET</code> / <code>PUT</code>', '<code>/api/draft/{id}</code> · <code>/api/screens/{id}</code>', 'Read or overwrite the working draft. Send <code>X-Heim-Draft-Revision</code> to get a <code>409</code> instead of burying someone else&rsquo;s work'],
        ['<code>POST</code>', '<code>/api/publish/{id}</code>', 'Freeze the draft as a named release and put it live. <code>?channel=</code> targets an environment'],
        ['<code>POST</code>', '<code>/api/promote/{channel}/{id}</code>', 'Put an existing release live on another environment'],
        ['<code>POST</code>', '<code>/api/rollback/{n}/{id}</code>', 'Put an earlier release live again. Creates nothing'],
        ['<code>GET</code>', '<code>/api/history/{id}</code> · <code>/api/events/{id}</code>', 'The draft and the releases; and every movement of the live pointer'],
        ['<code>GET</code> / <code>PUT</code>', '<code>/api/tokens</code>', 'The brand vocabulary. <code>/api/tokens/kotlin</code> exports it for the app'],
        ['<code>GET</code> / <code>PUT</code>', '<code>/api/presets</code>', 'The components this team saved'],
        ['<code>GET</code> / <code>PUT</code>', '<code>/api/storage</code>', 'Where publications are mirrored. <a href="/storage/#studio-config">Object storage</a>'],
        ['<code>GET</code>', '<code>/api/signing</code>', 'The signing keys — public halves only'],
        ['<code>POST</code> / <code>DELETE</code>', '<code>/api/signing/next</code>', 'Prepare, or throw away, the next key'],
        ['<code>POST</code>', '<code>/api/signing/activate</code>', 'Make the prepared key the one that signs'],
        ['<code>GET</code>', '<code>/api/live/{id}</code>', 'What is live on each environment, and whether it may be read without a key'],
        ['<code>DELETE</code>', '<code>/api/live/{channel}/{id}</code>', 'Take a screen off one environment. The release survives'],
        ['<code>PATCH</code>', '<code>/api/live/{channel}/{id}</code>', 'Open or close <em>one screen</em> inside an environment'],
        ['<code>GET</code> / <code>POST</code>', '<code>/api/channels</code>', 'The environments, and adding one. <code>PATCH</code> opens or closes it; <code>DELETE</code> removes it'],
        ['<code>GET</code> / <code>POST</code>', '<code>/api/channels/{channel}/keys</code>', 'Read keys for a closed environment. The secret is in the answer to the <code>POST</code> and nowhere else, ever again'],
        ['<code>GET</code>', '<code>/api/snapshots/{id}</code> · <code>/api/snapshot/{takenAt}/{id}</code>', 'Recovery points for the working draft, and reading one back'],
        ['<code>POST</code>', '<code>/api/storage/resync</code>', 'Write what every environment is serving to the bucket again, after drift'],
        ['<code>GET</code>', '<code>/api/schema</code> · <code>/api/session</code>', 'The screen schema the editor validates against, and whether a token is required'],
        ['<code>POST</code>', '<code>/api/prune/{keep}/{id}</code>', 'Drop old releases, keeping the newest and the live one']
      ]),

      note('note', `A screen id may contain slashes and an extension — <code>hub/hub_screen.json</code> is a
      valid id, because that is what apps migrating off static file hosting already use.`)
    ]
  }
  ]
},
{
  group: 'Operating it',
  items: [
  {
    id: 'deployment', title: 'What it needs to run',
    blocks: [
      html(`<p>A JVM serving JSON out of a SQLite file. The numbers below are measured, not estimated:</p>`),

      table(['', ''], [
        ['<strong>Image</strong>', '610 MB — a JRE 21, the server jar, and the editor bundled inside it'],
        ['<strong>Memory</strong>', 'About 280 MB resident with a small catalogue. Give it 1 GB'],
        ['<strong>CPU</strong>', 'Idles at nothing. One core is more than enough; the work is reading a file and validating JSON'],
        ['<strong>Disk</strong>', 'The database, its write-ahead log, and the signing folder. Screens are text — a large catalogue is megabytes'],
        ['<strong>Network</strong>', 'One port, <code>8080</code> by default']
      ]),

      html(`<h3>One Studio per database</h3>
      <p>The store is SQLite in WAL mode with a busy timeout, which makes concurrent saves from several
      authors wait for each other rather than lose one. What it does <strong>not</strong> make safe is two
      containers on one volume: WAL over a network filesystem is where SQLite corruption stories come
      from.</p>
      <p>So run one. If a second exists for availability, only one may write, and both need
      <a href="#signing-key">the same signing key</a> — otherwise half the screens a device fetches are
      signed by a key the app has never heard of.</p>`),

      note('tip', `The honest answer to "what if the Studio is down" is not a second Studio. It is not
      being in the request path at all: <a href="/storage/#why">mirror publications into a bucket</a>, or
      let your backend hold the template. An editor that is down then stops <em>editing</em>, and nothing
      else.`),

      html(`<h3>Upgrading</h3>
      <p>A new image against the same <code>/data</code> volume. The store migrates its schema on start
      and takes its own copy first — <code>studio.db.pre-v0</code> beside the database — so a migration
      that goes wrong is a file to put back rather than a restore from yesterday.</p>

      <h3>Watching it</h3>`),

      code(SH, `curl -s http://localhost:8080/health
# {"status":"ok","screens":42}`),

      html(`<p>No token required, which is what lets a load balancer use it for liveness and readiness.
      It answers only that the process is up and how many screens it holds — enough to tell a hung
      container from a healthy one, and nothing a stranger can learn from.</p>`)
    ]
  },
  {
    id: 'access', title: 'Access',
    blocks: [
      html(`<p>Two things guard <code>/api</code>, because they answer different questions.</p>`),

      table(['Guard', 'What it stops'], [
        ['<strong>A token</strong>, when you set <code>STUDIO_TOKEN</code>', 'Anyone who can reach the Studio from using it. The editor asks once and keeps it in that browser'],
        ['<strong><code>X-Heim-Studio</code></strong>, on every mutation, always', 'A page you merely visit publishing or deleting screens through your own browser. A cross-origin POST with no unusual headers is sent with no preflight; a header the browser must preflight cannot be set from another origin']
      ]),

      code(SH, `STUDIO_TOKEN=$(openssl rand -hex 16) docker compose up`),

      html(`<p>With no token set the Studio is open, which is right on a laptop and wrong anywhere else.
      The server binds to <code>127.0.0.1</code> unless <code>STUDIO_HOST</code> says otherwise;
      <code>docker-compose.yml</code> sets <code>0.0.0.0</code> inside the container and publishes the port
      on loopback, so opening it up is a deliberate edit rather than the default.</p>`),

      note('security', `<code>GET /screens/{id}</code> is never behind any of this: it is the read-only,
      published-only route an app reads, and what guards it is <a href="#environments">the environment
      being open or a read key</a>.`)
    ]
  },
  {
    id: 'signing-key', title: 'The signing key',
    blocks: [
      html(`<p>The Studio signs every screen it serves, and seals what it writes to a bucket, with a key it
      makes for itself the first time it starts. Nothing to configure — but one thing to know about,
      because it is the only part of a Studio that cannot be recreated.</p>

      <p>What the signature is for, and how an app opts into checking it, is
      <a href="/sdk/#signing">Signed screens</a> on the SDK page. This is the operator&rsquo;s half.</p>`),

      table(['Where', 'What it is', 'Who may read it'], [
        ['<code>signing/active.pem</code>, beside the database', 'The key screens are signed with', 'The user the Studio runs as. Nothing else, no endpoint, ever'],
        ['<code>signing/next.pem</code>', 'A key prepared for a rotation, signing nothing yet', 'The same'],
        ['<code>signing/previous.pem</code>', 'The public half of the key the last rotation retired', 'Public. It signs nothing any more']
      ]),

      note('warning', `<strong>Back that folder up with the database.</strong> In Docker it is
      <code>./data/signing</code>, next to <code>studio.db</code>, so one backup covers both. A Studio
      restored without it comes back with a <em>new</em> key — and every installed app that trusts the old
      one refuses every screen, which no change on the server can undo.`),

      html(`<h3>Supplying the key yourself</h3>
      <p>Two Studios serving one app have to sign with the same key, and some teams keep keys in a secret
      manager rather than on a disk. Either variable does it, and the Studio then reads the key rather than
      making one:</p>`),

      code(SH, `# The PEM itself, as a secret manager usually injects it.
STUDIO_SIGNING_KEY="$(cat heimui-signing-key.pem)"

# Or a path, as a mounted secret usually arrives.
STUDIO_SIGNING_KEY_FILE=/run/secrets/heimui-signing-key`),

      html(`<p>It must be a P-256 private key in PKCS#8 form with its public half beside it — exactly what
      <a href="/backend/#signing">the backend guide</a> generates with <code>openssl</code>. A key that is
      supplied but unusable stops the Studio at startup rather than letting it sign with something else.
      The panel then says the key comes from the environment, and will not rotate it: that belongs where
      the key does.</p>

      <h3>Rotating it</h3>
      <p><strong>Settings &rarr; Screen signing</strong> shows the key id, the public key to copy into an
      app, and the rotation:</p>`),

      table(['Button', 'What happens'], [
        ['<strong>Prepare the next key</strong>', 'A second key is made. It signs nothing — it exists so apps can start trusting it'],
        ['<strong>Activate the next key</strong>', 'It becomes the key that signs, and every copy in the bucket is rewritten under it'],
        ['<strong>Discard</strong>', 'Throws away a prepared key that was never activated']
      ]),

      note('security', `Activating asks first, and it should: an app that does not trust the new key yet
      refuses <em>every</em> screen the moment it signs. <a href="/sdk/#signing">Rotating a key</a> has the
      order the steps must happen in — ship the app release that trusts both keys before you activate.`),

      note('note', `No endpoint returns a private key, and none ever will: a Studio token is typed into
      browsers, and a key that signs screens is worth more than the token guarding it. What the panel shows,
      and what <code>GET /api/signing</code> answers, is public halves only.`)
    ]
  },
  {
    id: 'backup', title: 'Backups',
    blocks: [
      html(`<p>Not <code>cp</code>. Copying the database while the server is writing can produce a corrupt
      file:</p>`),

      code(SH, `sqlite3 data/studio.db ".backup data/backup.db"
tar czf studio-backup.tgz data/backup.db data/signing`),

      html(`<p>Restoring is putting the database back as <code>data/studio.db</code> with the server
      stopped, and the <code>signing/</code> folder back beside it.</p>`),

      table(['Command', 'What happens to your data'], [
        ['<code>docker compose down</code>', 'Kept. The volume is a bind mount on your disk'],
        ['<code>docker compose down -v</code>', '<strong>Deleted.</strong> Screens, releases and the signing key'],
        ['A rebuild — <code>docker compose up --build</code>', 'Kept, including the key: neither lives inside the image']
      ])
    ]
  },
  {
    id: 'housekeeping', title: 'Housekeeping and limits',
    blocks: [
      html(`<p>Releases are never overwritten, so a screen published weekly grows without bound:</p>`),

      code(SH, `curl -X POST -H "X-Heim-Studio: 1" http://localhost:8080/api/prune/20/hub/hub_screen.json`),

      html(`<p>Keeps the newest twenty releases and never the live one — deleting what a device is reading
      would turn a cleanup into an outage. Drafts need no pruning: there is one per screen, and its
      automatic recovery points are capped.</p>

      <h3>What this does not do yet</h3>`),

      table(['Limit', 'What it means today'], [
        ['<strong>One token for everyone</strong>', 'There are no accounts, so every revision records <code>local</code> and the history cannot say who changed what'],
        ['<strong>No approval step</strong>', 'Anyone who can reach the Studio can publish']
      ]),

      note('note', `Both are the honest state of a self-hosted tool that assumes the people who can reach it
      are the people allowed to use it. If that is not true where you are running it, put it behind your own
      access layer and set <code>STUDIO_TOKEN</code>.`)
    ]
  }
  ]
}
];

renderDocs();
