/* HeimUI documentation — mobile SDK content. Rendering lives in /assets/docs-runtime.js. */

const SECTIONS = [
{
  group: 'Getting started',
  items: [
  {
    id: 'introduction', title: 'What is HeimUI?',
    blocks: [
      html(`<p><strong>HeimUI is a Server-Driven UI engine for Kotlin Multiplatform.</strong> Your backend
      returns JSON describing a screen; the SDK renders it as native Compose on Android and iOS. Changing a
      screen becomes a deploy, not an app release.</p>
      <p>That is the easy part to build and the hard part to get right. What separates a toy SDUI from one you
      can put in front of users is what happens when things go wrong — a payload from a newer server, a network
      that drops mid-form, a cache written by an attacker on a rooted device. Those are the parts this SDK is
      mostly made of.</p>`),

      html(`<h3>What you get beyond rendering</h3>`),
      table(['', ''], [
        ['<strong>Forward compatibility</strong>', 'A component type this client has never heard of degrades to nothing and reports itself. An old app does not break on a new payload.'],
        ['<strong>Stale-while-revalidate</strong>', 'The cached screen paints immediately, then the network answer replaces it. ETag revalidation means an unchanged screen costs a few hundred bytes.'],
        ['<strong>Fails closed</strong>', 'Submissions only reach allow-listed hosts. URLs only open allow-listed schemes. Signed payloads are re-verified when read from cache, not just when written.'],
        ['<strong>Degrades, never blanks</strong>', 'Circuit breaker, timeouts, an emergency bundle, and a cached copy that stays on screen rather than being replaced by an error.'],
        ['<strong>Yours to extend</strong>', 'Nine providers, custom native components addressed by name, and a repository you can replace outright.']
      ]),

      note('note', `This section documents the <strong>mobile SDK</strong> — how to add it to an app and
      drive it. If you own the backend that serves the payloads, the binding rules and the hydration
      guide are in <a href="/backend/#hydration">Backend</a>.`)
    ]
  },
  {
    id: 'installation', title: 'Installation',
    blocks: [
      html(`<p>HeimUI publishes one artifact per platform from a single Kotlin Multiplatform module. You depend
      on the root coordinate and Gradle resolves the right variant.</p>`),
      code(G, `repositories {
    mavenCentral()
}

dependencies {
    implementation("io.heimui:heimui-core:0.0.1-alpha-2")
}`),

      html(`<h3>Plain Android apps too</h3>
      <p>You do not need Kotlin Multiplatform to consume this. Compose Multiplatform's Android target
      <em>is</em> Jetpack Compose — the same <code>androidx.compose</code> classes, no duplication — so an
      ordinary Android module works with no KMP plugin anywhere in the build.</p>`),
      code(G, `// A plain com.android.application module. No KMP plugin.
dependencies {
    implementation("io.heimui:heimui-core:0.0.1-alpha-2")
    implementation(platform("androidx.compose:compose-bom:2025.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
}`),
      note('note', `The one requirement is that your app uses Compose. From a Views/XML app, host it in a
      <code>ComposeView</code>.`),

      html(`<h3>Android permissions</h3>`),
      code(J, `<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`),
      note('tip', `<code>ACCESS_NETWORK_STATE</code> is what lets the SDK tell <em>offline</em> apart from
      <em>the server failed</em>, and serve cached content accordingly.`)
    ]
  },
  {
    id: 'quickstart', title: 'Quickstart',
    blocks: [
      html(`<p>Three steps to a screen coming down from your backend.</p>
      <h3>1 · Initialise once per process</h3>`),
      code(K, `// Application.onCreate() on Android, or your iOS startup path.
HeimUI.initialize(
    HeimConfig(baseUrl = "https://api.yourcompany.com/sdui")
)`),

      html(`<h3>2 · Render a screen inside the theme</h3>`),
      code(K, `@Composable
fun HomeRoute(navController: NavController) {
    HeimTheme {
        HeimScreen(
            screenId = "home",
            onAction = { action ->
                // Navigation is yours: only your app knows its own graph.
                if (action is NavigateAction) navController.navigate(action.screenId)
            },
        )
    }
}`),
      note('warning', `<code>onAction</code> has no default, on purpose. HeimUI dispatches
      <code>NavigateAction</code> and stops — it never navigates on its own, because only the host knows its
      routes. Making the parameter required means you cannot forget to wire it and wonder why taps do nothing.`),

      html(`<h3>3 · Serve the payload</h3>
      <p>A screen id resolves against <code>baseUrl</code> and nothing else:
      <code>{baseUrl}/{screenId}</code>. The SDK adds no path segment of its own, so
      <code>"home"</code> and <code>"catalog/detail"</code> name your routes, not a layout it
      imposes on you. Return this and you have a working screen:</p>`),
      code(J, `{
  "id": "home",
  "version": "1.0.0",
  "title": "Home",
  "root": {
    "type": "container",
    "id": "root",
    "padding": { "horizontal": 16, "top": 24 },
    "spacing": 12,
    "children": [
      { "type": "text", "id": "hello", "text": "Shipped without a release", "style": "headlineSmall" },
      { "type": "button", "id": "go", "title": "Open catalog", "icon": "shopping_cart",
        "actions": [ { "type": "navigate", "screen_id": "catalog" } ] }
    ]
  }
}`),
      html(`<p>Loading, pull-to-refresh, error and empty states are handled for you. So is caching, ETag
      revalidation and the circuit breaker.</p>`)
    ]
  }]
},
{
  group: 'Core concepts',
  items: [
  {
    id: 'config', title: 'HeimConfig',
    blocks: [
      html(`<p>Everything the engine needs, in one object. Only <code>baseUrl</code> is required.</p>`),
      table(['Option', 'Type', 'What it decides'], [
        ['<code>baseUrl</code>', '<code>String</code>', 'Where screens live. A screen id resolves to <code>{baseUrl}/{screenId}</code> — the SDK contributes no path segment of its own. Also the trust boundary: submissions, absolute screen URLs and images are all measured against this origin.'],
        ['<code>authTokenProvider</code>', '<code>HeimAuthTokenProvider?</code>', 'Supplies the <code>Authorization</code> header, per request and per context. See <a href="#auth">Authentication</a>.'],
        ['<code>allowedSubmitHosts</code>', '<code>Set&lt;String&gt;</code>', 'Hosts a <code>submit_form</code> may post to besides your origin. A payload cannot exfiltrate the token to a host you did not list.'],
        ['<code>allowCleartextHosts</code>', '<code>Set&lt;String&gt;</code>', 'Hosts reachable over cleartext <code>http://</code> — a local backend during development. Loopback and <code>baseUrl</code>\'s own host need no entry; everything a payload can name does. Empty in production. See <a href="#security">Security model</a>.'],
        ['<code>customHttpClient</code>', '<code>HttpClient?</code>', 'Your own Ktor client — interceptors, certificate pinning, a shared connection pool.'],
        ['<code>trustedSigningKeys</code>', '<code>Set&lt;String&gt;</code>', 'Public keys whose ES256 signatures this app accepts — the Studio&rsquo;s for what it serves, your backend&rsquo;s for what it hydrates, and both halves of a key rotation. Setting it turns verification on. See <a href="#signing">Signed screens</a>.'],
        ['<code>publicScreenHosts</code>', '<code>Set&lt;String&gt;</code>', 'Hosts a screen may be read from with no credentials: a public bucket or a CDN. Allowed across origins, and never sent an <code>Authorization</code> header.'],
        ['<code>verifySignatures</code>', '<code>Boolean</code>', 'Refuse payloads whose signature does not verify. Cached copies are re-checked before rendering, not only when stored. Implied by <code>trustedSigningKeys</code>.'],
        ['<code>publicKey</code>', '<code>String?</code>', '<strong>Legacy.</strong> A shared HMAC secret, which has to be on the device to be checked there — so whoever extracts it can sign screens the app accepts. Use <code>trustedSigningKeys</code>.'],
        ['<code>customSignatureVerifier</code>', '<code>HeimSignatureVerifier?</code>', 'Your own verification, if your scheme is not the default.'],
        ['<code>emergencyBundleProvider</code>', '<code>HeimEmergencyBundleProvider?</code>', 'Payloads compiled into the app, shown when the network and the cache both have nothing.'],
        ['<code>customCacheDataSource</code>', '<code>HeimCacheDataSource?</code>', 'Where cached screens live. See <a href="#caching">Caching</a>.']
      ]),
      code(K, `HeimUI.initialize(
    HeimConfig(
        baseUrl = "https://api.yourcompany.com/sdui",
        allowedSubmitHosts = setOf("forms.yourcompany.com"),
        trustedSigningKeys = setOf(BuildConfig.HEIMUI_STUDIO_KEY, BuildConfig.HEIMUI_BACKEND_KEY),
        customCacheDataSource = DriverBackedHeimCacheDataSource(driver = YourStorageDriver()),
    )
)`),
      html(`<h3>Lifecycle</h3>`),
      table(['', ''], [
        ['<code>HeimUI.initialize(config)</code>', 'Configures the engine. Calling it again reconfigures in place — use it when the user switches environment or region.'],
        ['<code>HeimUI.reset()</code>', 'Tears everything down. Call it on logout: it drops the isolated DI container so no cached screen from the previous session survives.'],
        ['<code>HeimUI.repository</code>', 'The repository, for fetching a screen outside Compose.'],
        ['<code>HeimUI.isInitialized</code>', 'Guard for code that may run before startup.']
      ]),
      note('note', `HeimUI runs Koin in an isolated container, so it cannot collide with the DI graph of an
      app that already uses Koin. You do not have to know or care that it is there.`)
    ]
  },
  {
    id: 'auth', title: 'Authentication',
    blocks: [
      html(`<p>The provider is called <strong>per request</strong>, and it is told <em>what</em> is being
      requested. That distinction is not decoration — it is the shape most integrations actually need once
      payloads sit on a CDN and writes go to your own API.</p>`),
      code(K, `HeimConfig(
    baseUrl = "https://cdn.yourcompany.com/sdui",
    authTokenProvider = HeimAuthTokenProvider { context ->
        when (context) {
            is HeimAuthContext.ScreenFetch -> null                  // public CDN
            is HeimAuthContext.FormSubmit  -> session.bearerToken()  // your API
        }
    },
)`),
      note('security', `Handing a credential to a third-party CDN is wrong even when it works. It also breaks
      in ways that are hard to diagnose: <code>raw.githubusercontent.com</code>, for instance, answers
      <strong>404 — not 401 —</strong> to an <code>Authorization</code> header it cannot validate, so it never
      reveals whether a private repo exists. A single unconditional token turns every screen into a misleading
      "not found".`),
      html(`<p>Because it is called per request, a rotated token takes effect immediately with no
      re-initialisation. HeimUI never stores, caches or refreshes it — token lifecycle stays entirely yours. A
      blank or whitespace-only return is treated as no token rather than sending an empty header, which some
      gateways reject outright.</p>`)
    ]
  },
  {
    id: 'signing', title: 'Signed screens',
    blocks: [
      html(`<p>A screen is instructions your app obeys. TLS already stops somebody rewriting one in
      flight; signatures answer the question TLS does not: <strong>did this screen come from you?</strong>
      Trust the public keys of whoever signs, and the app renders those screens and nothing else.</p>

      <p><strong>This is off by default, and nothing here is required to ship an app.</strong> An app that
      lists no keys verifies nothing and works exactly as it did — TLS, and your own service, which is
      where most systems stop. Turn it on when a screen is worth more than the network it crossed:
      a transfer, a limit, a consent, a price.</p>`),

      table(['What it stops', 'How it happens in practice'], [
        ['A screen nobody on your side produced', 'A bucket left writable, a CDN account somebody else got into, a stolen deploy credential'],
        ['A screen changed after you produced it', 'A proxy with a certificate the device already trusts, common on managed fleets'],
        ['A cache written on the device', 'A rooted or jailbroken phone, where the cache file is a file like any other'],
        ['A submission answered with a screen of somebody else&rsquo;s choosing', 'The response to <code>submit_form</code> is a screen too, and is held to the same signature']
      ]),

      note('security', `The key an app carries is a <strong>public</strong> key: it verifies and cannot sign.
      Extracting it from an APK gains an attacker nothing, which is the whole reason this is asymmetric.
      The signing key never leaves the Studio or your backend. Never ship a private key in an app.`),

      html(`<h3>Who signs what</h3>
      <p>One rule decides it: <strong>whoever produces the bytes the device receives signs them.</strong>
      A signature covers exact bytes, so anything that changes a byte invalidates it — and hydration
      changes bytes.</p>`),

      table(['How the screen reaches the device', 'Who signs', 'How the signature travels'], [
        ['Straight from the Studio — <code>/screens/@release/terms</code>', 'The Studio', '<code>X-Heim-Signature</code> header'],
        ['Your backend hydrates it and answers', 'Your backend, after hydrating', '<code>X-Heim-Signature</code> header'],
        ['Your backend passes a template through unchanged', 'Whoever signed it, forwarded', 'Forward the header you received'],
        ['A public bucket or CDN the device reads directly', 'The Studio, when it writes the copy', 'Inside the object — see <a href="/storage/#sealed-copies">sealed copies</a>']
      ]),

      html(`<h3>Turning it on</h3>
      <p>Two keys is the normal case, not an edge case: the Studio signs what it serves and what it
      writes to a bucket, your backend signs what it hydrates.</p>`),

      code(K, `HeimUI.initialize(
    HeimConfig(
        baseUrl = "https://api.yourcompany.com/sdui",
        trustedSigningKeys = setOf(
            BuildConfig.HEIMUI_STUDIO_KEY,    // Settings, Screen signing, in the Studio
            BuildConfig.HEIMUI_BACKEND_KEY,   // whatever your service prints at startup
        ),
        // Only if the app reads screens straight from a bucket or CDN.
        publicScreenHosts = setOf("screens.yourcompany.com"),
    )
)`),

      note('note', `Setting <code>trustedSigningKeys</code> turns verification on by itself, so a key list
      can never ship with verification quietly off. A key that is not a P-256 public key fails
      <code>initialize</code> at startup, naming which one — rather than rejecting every screen later.`),

      html(`<h3><code>publicScreenHosts</code> is an exception list</h3>
      <p>It is <em>not</em> where your screens live — that is <code>baseUrl</code>, and it does not change.
      By default the SDK <strong>refuses</strong> a screen URL on any other host, because a payload naming
      <code>https://elsewhere.example/x.json</code> would otherwise be fetched with the session token
      attached. Listing a host here says two things at once: screens may be read from it, and
      <strong>nothing authenticates that request</strong> — the token provider is not even asked.</p>`),

      code(K, `HeimConfig(
    baseUrl = "https://api.yourcompany.com/sdui",          // where your screens live
    publicScreenHosts = setOf("screens.yourcompany.com"),  // the bucket or CDN, read with nothing attached
)

HeimScreen(screenId = "home")   // relative: your API, with whatever your token provider returns
HeimScreen(screenId = "https://screens.yourcompany.com/public/@release/login.json")   // the object, bare`),

      note('note', `If <em>every</em> screen comes from the bucket, that host is your <code>baseUrl</code>
      and belongs in this set as well — then relative screen ids are read without credentials too. The
      host is what decides, not the shape of the id. Cleartext <code>http://</code> is still refused
      unless the host is in <code>allowCleartextHosts</code>.`),

      html(`<h3>What the SDK checks</h3>`),

      table(['Check', 'Why'], [
        ['The algorithm is exactly <code>ES256</code>', 'A verifier that believes the header would accept <code>alg: none</code>'],
        ['The <code>kid</code> is one of your keys', 'A valid signature by somebody else is still somebody else'],
        ['The signature covers the bytes as received', 'Not a re-serialised copy, not the parsed tree'],
        ['The cached copy, again, before it is rendered', 'A cache file on a rooted device is attacker-writable'],
        ['Screens returned by <code>submit_form</code>', 'Otherwise a submission endpoint is a way around all of it'],
        ['Nothing half-understood — <code>crit</code>, <code>b64</code>, padded base64', 'Two spellings of one payload must not both verify']
      ]),

      html(`<h3>The format</h3>
      <p>JWS (RFC 7515), so any JOSE library produces it, and the SDK accepts exactly one shape of it:
      <code>ES256</code>, a <code>kid</code> that is the RFC 7638 thumbprint of the public key, a signature
      as raw <code>r || s</code>, everything unpadded base64url. A served screen carries a detached JWS in
      <code>X-Heim-Signature</code>; an object in a bucket carries the flattened JSON form.</p>`),

      code(SH, `X-Heim-Signature: eyJhbGciOiJFUzI1NiIsImtpZCI6IkFRbVFYZ0hSSnpFbFdLQkduVVdPaHBxZyJ9..TXNHbogZZI95lkMAbr2iUw`),

      note('tip', `<a href="/backend/#signing">The backend guide</a> has the signing half in Kotlin, Node,
      Python and Go, and a set of vectors that proves a signer agrees with what the SDK accepts.`),

      html(`<h3>Rotating a key</h3>
      <p>Apps update slowly, so a key is trusted <em>before</em> it signs. Activating first would sign
      every screen with a key the apps in people&rsquo;s pockets have never heard of, and every one of
      them would refuse every screen at once.</p>
      <ol class="mb-4 ml-5 list-decimal space-y-1">
        <li><strong>Prepare</strong> the next key in the Studio. It signs nothing yet.</li>
        <li><strong>Ship an app release</strong> whose <code>trustedSigningKeys</code> holds both.</li>
        <li><strong>Activate</strong> it, once that release is what people are running. The Studio
        immediately rewrites every copy in the bucket under the new key.</li>
        <li><strong>Drop the old key</strong> from the app in a later release, when installations on the
        previous one no longer matter.</li>
      </ol>`),

      html(`<h3>When verification fails</h3>
      <p>Failing closed means the screen is not rendered. The SDK says which check failed, because the
      answers are different things to fix:</p>`),

      table(['The error names', 'What it usually is'], [
        ['the screen is not signed', 'Signing is off on the server, or a proxy dropped the header'],
        ['it was signed with key …, which this app does not trust', 'A rotation activated before the app release that trusts the new key'],
        ['the signature does not match the screen&rsquo;s content', 'Something re-serialised or rewrote the body after it was signed'],
        ['only ES256 signatures are accepted', 'A signer using DER, HMAC, or another algorithm']
      ]),

      note('warning', `A cached copy that fails is deleted rather than shown, so a device that cannot reach
      a working server falls through to the emergency bundle instead of rendering something unverifiable.`),

      html(`<h3>The HMAC scheme this replaces</h3>
      <p><code>publicKey</code> is a shared HMAC secret, and the name was always wrong: the secret that
      checks a signature there is the secret that makes one. It has to be in the app to be checked in the
      app, so anybody who pulls it out of an APK can sign screens every installation accepts. It still
      works, for apps already configured with it, and it cannot be combined with
      <code>trustedSigningKeys</code>.</p>
      <p>Moving across is two releases: ship one that trusts the new public key while the server still
      sends the old header, then switch the server over.</p>`)
    ]
  },
  {
    id: 'caching', title: 'Caching & offline',
    blocks: [
      html(`<p>There is one thing here that surprises people, so it is worth stating plainly:</p>`),
      note('note', `<strong>HeimUI always makes the network request.</strong> There is no "serve the cache and
      skip the call" mode. The cache exists to remove the <em>wait</em>, not the request.`),
      html(`<p><code>getScreen()</code> is a flow that emits up to twice — the cached screen immediately, then
      the fresh one if it differs. Bandwidth is saved by the <strong>ETag</strong>, not by skipping the call:
      the second open sends <code>If-None-Match</code>, the server answers <code>304</code> with an empty body,
      and the cached screen is re-emitted as fresh.</p>
      <p>The consequence is the property you bought SDUI for: a screen you change on the server appears on the
      next open. Always. No cache-busting, no version bump. An offline-first cache that skipped the network
      would quietly destroy that.</p>
      <h3>What identifies a cached screen</h3>
      <p>The <strong>URL it was fetched from</strong> — origin, path and query parameters — not the
      screen id.</p>`),
      note('note', `The distinction is not academic. <code>product_detail?sku=x1</code> and
      <code>?sku=x2</code> share a screen id and are different resources, so keying by the id put both
      in one entry: opening the second product showed the first for an instant, and asked the server
      about it using the first one's ETag. The same collapse happens across origins, where two
      backends each serve a <code>products</code>.`),
      html(`<p>Parameters are sorted into the key, so two callers passing the same filters in a
      different order share one entry instead of caching the same screen twice.</p>

      <h3>The cache is bounded</h3>
      <p><code>DriverBackedHeimCacheDataSource</code> keeps <strong>60 screens</strong> and drops the
      oldest first. Adjust with <code>maxEntries</code>.</p>`),
      note('tip', `The bound matters because entries are per-URL: a catalogue browsed through a hundred
      products leaves a hundred entries, in storage the user never agreed to spend. A TTL alone does not
      limit that — it removes what nobody came back for, and says nothing about how much accumulates in
      the meantime.`),

      html(`<h3>What you can change</h3>`),
      table(['Goal', 'How'], [
        ['Default', 'Nothing. In-memory, dies with the process.'],
        ['Survive restarts', '<code>DriverBackedHeimCacheDataSource(driver = …)</code>'],
        ['Change how long a stale copy stays usable', '<code>ttlMillis</code> — 7 days by default, <code>null</code> disables expiry'],
        ['Never cache', '<code>NoHeimCacheDataSource()</code>'],
        ['Your own storage', 'Implement <code>HeimStorageDriver</code> — four suspend functions'],
        ['Total control', 'Implement <code>HeimCacheDataSource</code>']
      ]),
      code(K, `HeimConfig(
    baseUrl = "https://api.yourcompany.com/sdui",
    customCacheDataSource = DriverBackedHeimCacheDataSource(
        driver = SharedPreferencesStorageDriver(context),
        ttlMillis = 2 * 60 * 60 * 1000L,   // two hours instead of seven days
    ),
)`),
      note('warning', `Reach for <code>NoHeimCacheDataSource</code> less often than it looks. Disabling the
      cache costs stale-while-revalidate (the user now waits on the network every open), all offline
      behaviour, and the ETag saving — a <code>304</code> needs a cached copy to serve, so every open
      re-downloads the whole payload. The default already revalidates on every open.`),
      note('security', `With <code>verifySignatures</code> on, a cached entry is re-verified <em>before</em>
      it is rendered, not only when it was written. A cache file is attacker-writable on a rooted or
      jailbroken device, so trusting it implicitly would reopen the exact hole signatures close.`)
    ]
  }]
},
{
  group: 'Building screens',
  items: [
  {
    id: 'components', title: 'Component catalogue',
    blocks: [
      html(`<p>Twenty-one component types. Every one accepts <code>id</code>, <code>visible_if</code>,
      <code>a11y</code>, <code>weight</code> and <code>frame</code> in addition to what is listed here.</p>
      <h3>Layout</h3>`),
      table(['Type', 'Notes'], [
        ['<code>container</code>', 'Linear layout. <code>direction</code> (<code>VERTICAL</code>/<code>HORIZONTAL</code>), <code>alignment</code>, <code>arrangement</code>, <code>spacing</code>, <code>padding</code>, <code>background_color</code>, <code>corner_radius</code>, <code>border_color</code>, <code>border_width</code>, <code>scrollable</code> — see the note below on its default.'],
        ['<code>box</code>', 'Overlay. <code>content_alignment</code>, <code>padding</code>, <code>background_color</code>, <code>corner_radius</code>, <code>border_color</code>, <code>border_width</code>.'],
        ['<code>card</code>', 'Elevated surface with one child. <code>elevation</code>, <code>corner_radius</code>, <code>border_color</code>, and it can carry <code>actions</code>.'],
        ['<code>lazy_column</code> · <code>lazy_row</code>', 'Virtualised lists. <code>spacing</code>, <code>padding</code>, <code>alignment</code>, <code>arrangement</code>, <code>pagination</code>.'],
        ['<code>spacer</code> · <code>divider</code>', 'Fixed gap (<code>size</code>, or flexible with <code>is_flexible</code>), and a rule (<code>thickness</code>, <code>color</code>).']
      ]),
      note('note', `There is no <code>column</code>, <code>row</code> or <code>grid</code>. A vertical stack is
      <code>container</code> with <code>direction: "VERTICAL"</code>; a horizontal one is the same component
      with <code>HORIZONTAL</code>. One component, one set of properties to learn.`),

      html(`<h3>Content</h3>`),
      table(['Type', 'Notes'], [
        ['<code>text</code>', '<code>text</code>, <code>style</code>, <code>color</code>, <code>text_align</code>, <code>max_lines</code>.'],
        ['<code>rich_text</code>', 'One paragraph of styled runs, with links. See <a href="#richtext">Rich text</a>.'],
        ['<code>image</code>', 'Loaded through Coil 3. <code>url</code>, <code>blur_hash</code>, <code>aspect_ratio</code>, <code>corner_radius</code>, <code>content_scale</code>.'],
        ['<code>icon</code>', 'A <em>name</em>, drawn by your <code>HeimIconProvider</code>.'],
        ['<code>badge</code>', 'Decoration, not tappable — for a tappable pill use <code>chip</code>. <code>background_color</code>, <code>text_color</code>, <code>icon_url</code>.'],
        ['<code>button</code>', '<code>variant</code> (<code>FILLED</code>, <code>OUTLINED</code>, <code>TEXT</code>, <code>TONAL</code>), optional <code>icon</code>, <code>is_loading</code>, <code>is_enabled</code>, <code>actions</code>. Styleable — see <a href="#theming">Styling a control</a>.'],
        ['<code>chip</code>', 'Compact and tappable. Action, single choice, or toggle — see <a href="#chips">Chips</a>.'],
        ['<code>custom</code>', 'Your own composable, addressed by name. See <a href="#custom">Custom components</a>.']
      ]),

      html(`<h3>Forms</h3>`),
      table(['Type', 'Notes'], [
        ['<code>text_field</code>', '<code>input_type</code> (<code>TEXT</code>, <code>NUMBER</code>, <code>EMAIL</code>, <code>PASSWORD</code>, <code>PHONE</code>), <code>initial_value</code>, <code>validation_rules</code>, <code>helper_text</code>.'],
        ['<code>switch</code>', 'A setting. <code>initial_checked</code>, <code>on_check_actions</code>.'],
        ['<code>checkbox</code>', 'An agreement — "I accept". The whole row is the tap target, not the 20dp box.'],
        ['<code>radio_group</code>', 'One of a few, all visible. Past about five options, use a select. <code>initial_value</code>, <code>on_select_actions</code>.'],
        ['<code>select</code>', 'One of many, revealed on demand. Stores the option <code>value</code>, shows its <code>label</code>. <code>initial_value</code>, <code>on_select_actions</code>.'],
        ['<code>date_picker</code>', 'State holds ISO <code>YYYY-MM-DD</code>. <code>min_date</code>, <code>max_date</code>, and <code>confirm_text</code> / <code>dismiss_text</code> — see <a href="#forms">Forms</a>.']
      ]),
      note('note', `<code>dropdown</code> is spelled <code>select</code>. Every form component writes into the
      same state namespace, so <code>visible_if</code> can read any of them.`),
      note('tip', `Every control on this page also takes <code>background_color</code>,
      <code>text_color</code>, <code>border_color</code> and friends, for the screen a designer specced
      down to the pixel. See <a href="#theming">Styling a control</a>.`)
    ]
  },
  {
    id: 'layout', title: 'Layout: padding, weight & frame',
    blocks: [
      html(`<h3>Placing something vertically on a screen that is mostly empty</h3>
      <p>This is the one layout rule worth learning before you need it, because the symptom looks
      like a bug: a component that will not move away from the top no matter what you set.</p>
      <p>The two properties that sound interchangeable are not:</p>`),

      table(['Axis', 'Property', 'Where'], [
        ['Horizontal', '<code>content_alignment</code>', 'on a <code>box</code>'],
        ['<strong>Vertical</strong>', '<strong><code>arrangement</code></strong>', 'on a <code>container</code>']
      ]),

      html(`<p>A <code>box</code> fills the width but <strong>not</strong> the height, so it ends up exactly as
      tall as what is inside it. <code>TOP</code> and <code>BOTTOM</code> then have no room to mean anything —
      the box already ends where its content ends. They move things only when something inside has given the
      box height, a list filling the screen being the usual case.</p>
      <p>A <code>container</code> is different, and only when you ask it to be: with the default
      <code>PACKED</code> arrangement it wraps its content like the box, but <strong>any other value makes it
      take the height of the viewport</strong> and distribute what is inside across it. That is the mechanism,
      and it is why the same screen sits at the top or in the middle depending on one word:</p>`),

      code(J, `{ "type": "container", "direction": "VERTICAL", "arrangement": "CENTER",
  "children": [ { "type": "card", "id": "banner" } ] }`),

      note('tip', `<code>PACKED</code> puts it at the top, <code>CENTER</code> in the middle,
      <code>END</code> at the bottom. Nothing else changes — no height, no spacers, no weights. If you
      reached for weighted spacers to centre something and they did nothing, this is why: under
      <code>PACKED</code> there is no spare height for them to share out.`),
      html(`<h3>Padding takes a number or an object</h3>`),
      code(J, `"padding": 16
"padding": { "horizontal": 16, "vertical": 24 }
"padding": { "start": 48, "top": 32, "end": 8, "bottom": 0 }`),
      html(`<p>Sides are <code>start</code>/<code>end</code>, not left/right, so one payload lays out correctly
      in Arabic and Hebrew without the server knowing the reader's locale. <code>all</code>,
      <code>horizontal</code> and <code>vertical</code> are shorthands, and an explicit side always wins —
      JSON guarantees no key order, so <code>{ "horizontal": 16, "start": 0 }</code> reads the same either way
      round.</p>`),

      note('warning', `<strong>Padding means one of two things.</strong> On <code>container</code>,
      <code>card</code> and <code>box</code> it is layout padding, applied inside the scroll viewport — it
      scrolls away with the content. On <code>lazy_row</code> and <code>lazy_column</code> it is
      <em>content padding</em>, which stays put while items scroll edge to edge. For a chip strip or a
      carousel that must keep a fixed inset at both ends, <code>lazy_row</code> is the component you want.`),

      html(`<h3>weight — sharing an axis</h3>
      <p>Relational: what share of the parent's main axis a child takes. Only a <code>container</code>
      applies it, because only a parent can divide an axis.</p>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL", "spacing": 12, "children": [
  { "type": "button", "id": "send", "title": "Send", "weight": 1 },
  { "type": "button", "id": "recv", "title": "Receive", "weight": 1 }
]}`),

      html(`<h3>frame — asking for a size</h3>
      <p>Intrinsic: what the component asks for regardless of who holds it.</p>`),
      code(J, `"frame": { "min_height": 120 }          // a floor; still grows with its content
"frame": { "aspect_ratio": 1.78 }       // a proportion, correct at any width
"frame": { "width": 48, "height": 48 }  // fixed; does NOT grow`),
      note('warning', `<strong>Reach for <code>min_height</code>, not <code>height</code>.</strong> <code>dp</code>
      is independent of screen density but <em>not</em> of the user's font scale. Someone running text at 200%
      for accessibility will see it clipped inside a fixed box and can do nothing about it — and in
      server-driven UI that mistake ships to every device at once, with nobody having seen it rendered. Fixed
      sizes are right for an avatar or an icon frame: things with no text in them.`),

      html(`<h3>Arrangement and alignment are different axes</h3>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL",
  "arrangement": "SPACE_BETWEEN",   // distributes along the row
  "alignment": "CENTER",            // centres across its height
  "spacing": 8 }                    // a minimum gap, not the exact one, with SPACE_*`),
      html(`<p><code>arrangement</code> takes <code>PACKED</code> (the default), <code>CENTER</code>,
      <code>END</code>, <code>SPACE_BETWEEN</code>, <code>SPACE_AROUND</code> and
      <code>SPACE_EVENLY</code>.</p>`),

      html(`<h3>Scrolling</h3>
      <p><code>scrollable</code> defaults differently per axis, and the reason is worth knowing.</p>`),
      note('warning', `A <strong>vertical</strong> container scrolls unless told not to — content taller
      than the screen is the common case, and clipping it strands the user. A <strong>horizontal</strong>
      one does <em>not</em> scroll unless you ask.
      <br><br>That asymmetry is not arbitrary: a scrolling axis is measured as unbounded, and unbounded
      width stops text from ever wrapping. A row holding a title and a description beside an icon —
      the most common card layout there is — would be clipped mid-word. Overflowing horizontally is
      the rarer intent and is better asked for explicitly.`),
      note('tip', `For a chip strip or a carousel, reach for <code>lazy_row</code> rather than a
      scrollable <code>container</code>. Its padding becomes content padding, so the items keep their
      inset at both ends while still scrolling to the screen edge.`),

      html(`<h3>Insets</h3>
      <p><code>apply_safe_insets</code> is screen-level and on by default: the SDK pads the payload by the
      status bar, navigation bar and cutout.</p>`),
      note('warning', `If you wrapped <code>HeimScreen</code> in a <code>Scaffold</code>, the insets get applied
      twice and the screen sits about 22dp too low. <code>Modifier.padding(innerPadding)</code> insets the
      content but does not tell anything below it that the window insets are handled. Consume them:`),
      code(K, `Scaffold(topBar = { … }, bottomBar = { … }) { innerPadding ->
    Box(
        modifier = Modifier
            .padding(innerPadding)
            .consumeWindowInsets(innerPadding)   // without this, the payload pads again
    ) {
        HeimScreen(screenId = "home", onAction = ::onHeimAction)
    }
}`),
      html(`<p>Fix it here, not with <code>apply_safe_insets: false</code> in the payload. The payload must not
      have to know whether a particular host wrapped it in a Scaffold, or the same screen renders differently
      depending on which app fetched it.</p>`)
    ]
  },
  {
    id: 'richtext', title: 'Rich text',
    blocks: [
      html(`<p>The sentence <code>text</code> cannot express: "I accept the <u>terms and conditions</u>" with
      only the bracketed part linked. Splitting it into three components puts a line break where the sentence
      should flow.</p>`),
      code(J, `{
  "type": "rich_text",
  "id": "legal",
  "style": "bodySmall",
  "align": "START",
  "spans": [
    { "text": "I accept the " },
    { "text": "terms and conditions", "weight": "bold", "url": "https://yourcompany.com/terms" },
    { "text": " and the " },
    { "text": "privacy policy", "url": "https://yourcompany.com/privacy" },
    { "text": "." }
  ]
}`),
      html(`<p>A span inherits the paragraph's style and overrides only what it names, so three bold words do
      not mean restating the size and family. <code>weight</code> accepts the CSS-ish names a design team
      writes (<code>bold</code>, <code>semibold</code>) and the numeric weights a designer exports
      (<code>700</code>).</p>`),
      note('security', `There is no HTML here, deliberately. A link inside a paragraph goes through the same
      <code>HeimUrlLauncher</code> and scheme policy as <code>open_url</code>, so <code>javascript:</code> and
      <code>intent://</code> are refused in prose exactly as they are in a button. A payload cannot get a wider
      capability by phrasing it as a sentence.`)
    ]
  },
  {
    id: 'chips', title: 'Chips',
    blocks: [
      html(`<p>The compact tappable label that sits between <code>badge</code>, which is decoration and cannot
      be tapped, and <code>button</code>, which is the wrong shape for a strip of them.</p>
      <p>What it binds decides what it is:</p>`),
      table(['Binding', 'Behaviour'], [
        ['<code>state_key</code> + <code>value</code>', 'One of a group. Chips sharing a key are mutually exclusive, and tapping the selected one clears it.'],
        ['<code>state_key</code> alone', 'An independent on/off, for a multi-select row.'],
        ['Neither', 'A plain action chip.']
      ]),
      code(J, `{ "type": "lazy_row", "id": "categories", "spacing": 8, "padding": { "horizontal": 16 },
  "items": [
    { "type": "chip", "id": "c_all",   "label": "All",   "variant": "FILTER",
      "state_key": "category", "value": "all", "icon": "widgets" },
    { "type": "chip", "id": "c_audio", "label": "Audio", "variant": "FILTER",
      "state_key": "category", "value": "audio", "icon": "headphones" }
  ]}`),
      note('tip', `Put the strip in a <code>lazy_row</code>, not a horizontal <code>container</code>. Its
      padding becomes content padding, so the chips scroll edge to edge while keeping their 16dp inset at both
      ends. A padded container puts that inset <em>inside</em> the scroll, and it disappears the moment the
      user drags.`),

      html(`<h4>Reaching the screen edge</h4>
      <p>There is a subtlety here that is easy to miss. If the strip sits inside a
      <code>lazy_column</code> that has horizontal padding, the parent insets <em>every</em> item —
      including the strip. The chips end up double-inset, and worse, the strip cannot scroll to the
      screen edge because its viewport starts 16dp in.</p>
      <p>For a full-bleed carousel, move the horizontal inset off the parent and onto the items that
      need it:</p>`),
      code(J, `{ "type": "lazy_column", "id": "home",
  "padding": { "top": 8, "bottom": 96 },
  "items": [
    { "type": "box", "id": "hero_inset", "padding": { "horizontal": 16 },
      "children": [ { "type": "card", "id": "hero", "child": { } } ] },

    { "type": "lazy_row", "id": "chips", "padding": { "horizontal": 16 },
      "items": [ ] }
  ]}`),
      html(`<p>Components that carry no padding of their own — <code>text</code>, <code>button</code>,
      <code>image</code>, <code>badge</code> — go inside a <code>box</code> or <code>container</code>
      that does. Verbose, but it is the only arrangement where one child reaches the edge and its
      siblings stay aligned.</p>`),
      note('note', `<code>variant</code> is not cosmetic. <code>FILTER</code> announces itself as selected or
      not to a screen reader; <code>ASSIST</code> announces an action. Using one for the other is the
      difference between hearing "selected" and hearing nothing.`)
    ]
  },
  {
    id: 'forms', title: 'Forms, validation & conditional visibility',
    blocks: [
      html(`<p>Every form component writes into one state namespace keyed by <code>state_key</code>. Anything
      can read it back with <code>visible_if</code>, and <code>submit_form</code> interpolates it into the
      request body.</p>`),
      code(J, `{ "type": "container", "id": "kyc", "direction": "VERTICAL", "spacing": 16, "children": [
  { "type": "switch", "id": "biz", "state_key": "is_business",
    "label": "Registering a business account?" },

  { "type": "text_field", "id": "tax", "state_key": "tax_id",
    "label": "Tax ID",
    "visible_if": "is_business == true",
    "validation_rules": [
      { "type": "REQUIRED", "error_message": "Tax ID is required for business accounts" }
    ]},

  { "type": "select", "id": "doc", "state_key": "doc_type", "label": "Document type",
    "options": [
      { "value": "cc", "label": "National ID" },
      { "value": "passport", "label": "Passport" }
    ]},

  { "type": "date_picker", "id": "dob", "state_key": "birth_date",
    "label": "Date of birth", "min_date": "1900-01-01", "max_date": "2007-12-31" },

  { "type": "button", "id": "submit", "title": "Submit", "is_full_width": true,
    "actions": [
      { "type": "submit_form", "endpoint": "https://api.yourcompany.com/kyc",
        "payload": { "tax_id": "{{state.tax_id}}", "born": "{{state.birth_date}}" } }
    ]}
]}`),
      html(`<h3>Validation rules</h3>
      <p><code>REQUIRED</code>, <code>MIN_LENGTH</code>, <code>MAX_LENGTH</code>, <code>EMAIL</code>,
      <code>NUMERIC</code>, and <code>CUSTOM</code> for validators you register yourself. The whole form is
      validated before the request is built, so a field the user never touched still blocks submission.</p>`),
      code(K, `HeimTheme(
    validatorRegistry = remember {
        HeimValidatorRegistry().apply {
            register("COLOMBIAN_NIT") { value, _ -> value.filter(Char::isDigit).length == 9 }
        }
    },
) { HeimScreen(screenId = "kyc", onAction = ::onHeimAction) }`),
      note('note', `A <code>CUSTOM</code> rule naming a validator you have not registered fails the field
      <strong>closed</strong>. Silently skipping it would let an older client accept data a newer server
      rejects.`),
      html(`<h3>Dates are stored as ISO</h3>
      <p><code>date_picker</code> puts <code>YYYY-MM-DD</code> in state and shows the user their own format.
      The stored value travels to your backend, and <code>15/03/2024</code> is 15 March in Bogotá and
      unparseable where the month comes first. Bounds are compared in UTC, because a calendar date has no time
      zone and treating it as an instant moves a birth date by a day west of Greenwich.</p>`),
      html(`<h3>The picker's two labels come from the payload</h3>`),
      code(J, `{ "type": "date_picker", "id": "dob", "state_key": "birth_date",
  "label": "Fecha de nacimiento",
  "confirm_text": "Aceptar",
  "dismiss_text": "Cancelar" }`),
      note('note', `Material localises the rest of the dialog from the device locale — the headline,
      the month names, the weekday initials. These two buttons cannot follow, because the SDK ships no
      translations for languages it has never heard of. Left alone they read "OK" and "Cancel" inside an
      otherwise translated sheet.
      <br><br>The server already knows the reader's language from <code>Accept-Language</code>, so it is
      the right place to answer this.`),

      html(`<h3>Drafts survive process death</h3>`),
      code(K, `HeimTheme(
    formDraftStorage = DriverBackedFormDraftStorage(driver = YourStorageDriver()),
) { … }`),
      html(`<p>A user halfway through a long form who takes a phone call can have the app killed underneath
      them. With this wired, their answers are still there.</p>`),

      html(`<h3>A draft belongs to one version of the screen</h3>
      <p>Every persisted draft is stamped with the <code>version</code> the payload declared, under the
      reserved key <code>__heim_screen_version</code>, exported as the constant
      <code>DRAFT_VERSION_KEY</code> so a storage driver reading its own contents can name it rather than
      hardcode the string. The stamp is added on the way to storage and stripped on the way back, so it never
      appears in form state or in a submitted payload.</p>`),
      code(J, `{
  "id": "kyc",
  "version": "2.0.0",
  "title": "Identity verification",
  "root": { … }
}`),
      html(`<p>The version arrives with the payload, so it is not known until the screen has loaded.
      <code>HeimScreen</code> hands it to the state manager once the content is there. If the stored draft's
      stamp matches, the draft is restored. If it does not, the draft is discarded and cleared from
      storage.</p>`),
      html(`<p>Discarding sounds harsher than restoring, and it is the safer of the two. A
      <code>state_key</code> can change meaning between two versions of a screen. If <code>doc_type</code>
      held a document type in the version the draft was written against and holds something else in the
      version now on screen, restoring it puts an answer in the form that the user never gave — and they see
      a field that is already filled, so they have no reason to look at it. On a KYC or a payment form that is
      a worse outcome than losing the draft.</p>`),
      note('note', `<strong>Bump <code>version</code> whenever you change what a <code>state_key</code>
      means</strong> — renaming it, reusing it for a different question, changing the set of values it can
      hold. Moving a field, restyling it or editing its label does not need a bump; those leave the answers
      still true. The cost of bumping when you did not have to is one lost draft. The cost of not bumping when
      you should have is a wrong answer submitted under the user's name.`),
      note('note', `This <code>version</code> is the string inside the payload. It is not the revision number
      your backend or CMS assigns when someone saves a screen — HeimUI Studio, for instance, numbers every
      revision it stores so it can roll back, and never touches the JSON. Two different numbering schemes, and
      only the one inside the payload reaches the device. A screen can be on its fortieth stored revision and
      still be <code>"version": "1.0.0"</code> as far as drafts are concerned, which is correct if none of
      those forty edits changed what a key means.`),

      html(`<h3>Where the guard is late</h3>
      <p>Stale-while-revalidate paints the cached payload before the fresh one arrives. If the cached copy is
      an older version, its draft matches it and is restored — briefly. When the fresh version lands, those
      restored fields are emptied and the stored draft is cleared, so the values from the old version do not
      survive into the new screen and are not re-stamped with the new version on the next save.</p>
      <p>So the user can see stale answers appear and then vanish. This narrows the window rather than closing
      it: the wrong values are on screen for as long as revalidation takes. Withdrawing them is still the right
      trade — the alternative is leaving them in place under a version they were never written for.</p>`)
    ]
  }]
},
{
  group: 'Actions',
  items: [
  {
    id: 'error-screens', title: 'Errors are screens too',
    blocks: [
      html(`<p>A screen the reader should not see is still a screen. "Your session expired", "this is
      not available on your plan", "that order is gone" — your backend knows exactly what to show, and
      it should be able to show it without you writing it twice in native code for each platform.</p>
      <p><strong>Answer with a 4xx and a screen in the body.</strong> The SDK renders it instead of the
      one that was asked for. The status stays honest — your dashboards, caches and proxies all keep
      working — and the reader gets a page you designed in the Studio:</p>`),

      code('http', `HTTP/1.1 403 Forbidden
Content-Type: application/json

{ "id": "suspended", "root": { "type": "container", "children": [ ... ] } }`),

      table(['Status', 'What the SDK does with a screen in the body'], [
        ['<strong>2xx</strong>', 'Renders it and caches it. The ordinary path'],
        ['<strong>4xx</strong>', 'Renders it. <strong>Never caches it</strong>'],
        ['<strong>5xx</strong>', 'Ignores it, and falls back to cache or the emergency bundle']
      ]),

      html(`<p>The 5xx line is deliberate. A 4xx is the server stating something true about the request;
      a 5xx is the server saying it does not know what state it is in, and a body from something that
      broken describes nothing — more often it is a proxy's HTML that never reached your application.</p>`),

      note('warning', `<strong>A 4xx screen is never cached and never replaces the cached copy.</strong>
      It describes the state of the world right now, not the contents of that screen. Cached, a
      reinstated account would keep reading "suspended" until a TTL expired — and offline, forever.`),

      html(`<h3>Reacting to it</h3>
      <p>Rendering is not always enough: a <code>401</code> usually means the session is gone and the
      app should navigate somewhere the payload knows nothing about. The status is carried through, as
      a number rather than a sentence to match against:</p>`),

      code('kotlin', `HeimTelemetryObserver { event ->
    if (event is HeimTelemetryEvent.ScreenRefused && event.statusCode == 401) {
        session.signOut()
    }
}`),

      note('security', `Screens from an error response are verified exactly like any other. A 4xx is
      the response an intermediary can most easily put in front of an app — a captive portal, a proxy,
      a corporate middlebox — so a screen that fails verification is discarded and the SDK falls back
      as if the body had never arrived. If signing is off here, it is off everywhere: this path is no
      weaker than the 200 one, and no stronger.`),

      html(`<p>Empty states need none of this. "No orders yet" is a successful answer to a valid
      question, so it is a <code>200</code> with a screen, like anything else.</p>`)
    ]
  },
  {
    id: 'overlay', title: 'In-app notifications',
    blocks: [
      html(`<p>A banner that appears over whatever the user is looking at is not a component, and the
      SDK does not model it as one. It is <strong>an ordinary screen drawn on top of another</strong>
      — authored in the Studio, published to a channel, signed and cached like every other screen. A
      card, an image, a button, whatever you want it to be.</p>
      <p>Pass its id as <code>overlayScreenId</code>, and <code>null</code> when there is nothing to
      show:</p>`),

      code('kotlin', `var notification by remember { mutableStateOf<String?>(null) }

// A push arrives while the app is open. This part is yours: the SDK has no
// opinion about when a notification is warranted.
fun onPushReceived(payload: Push) {
    notification = payload.screenId      // "notifications/order_shipped"
}

HeimScreen(
    screenId = "home",
    onAction = ::handleAction,
    overlayScreenId = notification,
    onOverlayDismiss = { notification = null }
)`),

      html(`<p>The overlay dismisses itself through <code>dismiss_modal</code> — the same action that
      closes a dialog or a bottom sheet — so a "Close" button in the payload needs nothing special:</p>`),

      code('json', `{ "type": "button", "id": "close", "title": "Close",
  "actions": [{ "type": "dismiss_modal" }] }`),

      html(`<p>Every other action the overlay dispatches reaches your <code>onAction</code> exactly
      like the main screen's, so a "View order" button is handled where you already handle
      navigation.</p>`),

      note('note', `<strong>An overlay is silent while it loads, and silent when it fails.</strong>
      No skeleton, because a full-size shimmer over a screen the user is working on is worse than
      nothing; and no error card, because a notification that could not load is not a failure worth
      interrupting someone to report. It appears when it is ready, or it does not appear.`),

      html(`<h3>Replacing the loading and error states</h3>
      <p>The built-in failure card says "Unable to load screen" in English and looks like Material,
      neither of which is right for every app. Both states take a replacement:</p>`),

      code('kotlin', `HeimScreen(
    screenId = "home",
    onAction = ::handleAction,
    errorContent = { message, onRetry ->
        OurOwnErrorState(text = stringResource(R.string.screen_failed), onRetry = onRetry)
    },
    loadingContent = { OurOwnShimmer() }
)`),

      note('warning', `<code>message</code> is diagnostic text meant for you, not for the person
      holding the phone — it carries the URL and the HTTP status. Log it; show your own wording.`),

      html(`<p>Where the overlay appears is the payload's decision, not the SDK's — top, middle or bottom,
      changed in the Studio without touching the app. It is the same rule as any other short screen, and it
      catches people out, so it is written up under
      <a href="#layout">Layout</a>.</p>`)
    ]
  },
  {
    id: 'actions', title: 'The action model',
    blocks: [
      html(`<p>Ten action types. Some the SDK performs itself; all of them are forwarded to your
      <code>onAction</code> afterwards, so you can observe or extend any of them. Every action also
      accepts <code>tracking</code> — see <a href="#tracking">Analytics</a>.</p>`),
      table(['Action', 'Fields', 'Who handles it'], [
        ['<code>navigate</code>', '<code>screen_id</code>, <code>params</code>', '<strong>You.</strong> The SDK never navigates — only your app knows its graph. <code>screen_id</code> resolves against <code>baseUrl</code>, or may be an absolute URL on your own origin, so one payload can link to the next by href.'],
        ['<code>submit_form</code>', '<code>endpoint</code>, <code>method</code>, <code>payload</code>', 'SDK. Validates, interpolates state, posts, reports the result.'],
        ['<code>set_state</code>', '<code>key</code>, <code>value</code>', 'SDK. Writes a value into form state. Purely local.'],
        ['<code>open_url</code>', '<code>url</code>', 'SDK, through <code>HeimUrlLauncher</code> under the scheme policy.'],
        ['<code>show_dialog</code> · <code>show_bottom_sheet</code>', '<code>title</code>, <code>message</code>, <code>confirm_text</code>/<code>confirm_actions</code>, <code>dismiss_text</code>/<code>dismiss_actions</code> · <code>content</code>, <code>is_dismissible</code>', 'SDK, through <code>HeimModalPresenter</code>. The sheet&rsquo;s content is a full SDUI component tree.'],
        ['<code>show_snackbar</code>', '<code>message</code>, <code>duration</code>', 'SDK.'],
        ['<code>dismiss_modal</code> · <code>dismiss</code>', '—', 'SDK closes modals; <code>dismiss</code> is forwarded so you can pop your own stack.'],
        ['<code>custom</code>', '<code>name</code>, <code>payload</code>', '<strong>You.</strong> An escape hatch with a name and a payload.']
      ]),
      code(K, `HeimScreen(
    screenId = "catalog",
    onAction = { action ->
        when (action) {
            is NavigateAction -> navController.navigate(action.screenId, action.params)
            is DismissAction  -> navController.popBackStack()
            is CustomAction   -> handleCustom(action.name, action.payload)
            else -> Unit   // the SDK already did the rest
        }
    },
)`),

      html(`<h3>Actions run in order, and stop on failure</h3>`),
      code(J, `"actions": [
  { "type": "set_state", "key": "submitting", "value": true },
  { "type": "submit_form", "endpoint": "https://api.yourcompany.com/kyc" },
  { "type": "navigate", "screen_id": "success" }
]`),
      note('note', `A list is not a set. The navigation runs <em>after</em> the submission finishes, and
      <strong>only if it succeeded</strong>. An action an interceptor swallowed stops the sequence too: it
      decided that step must not happen, and the steps after it were written assuming it did.`),

      html(`<h3>set_state — interaction without a round trip</h3>
      <p>This is what lets anything that is not an input drive <code>visible_if</code>: selecting a plan card,
      switching a tab, expanding a section. Tabs, for instance, need no dedicated component:</p>`),
      code(J, `{ "type": "container", "direction": "HORIZONTAL", "spacing": 8, "children": [
  { "type": "chip", "id": "t_m", "label": "Monthly", "variant": "FILTER",
    "state_key": "plan_tab", "value": "monthly" },
  { "type": "chip", "id": "t_y", "label": "Yearly", "variant": "FILTER",
    "state_key": "plan_tab", "value": "yearly" }
]},
{ "type": "card", "id": "monthly", "visible_if": "plan_tab == 'monthly'", "child": { … } },
{ "type": "card", "id": "yearly",  "visible_if": "plan_tab == 'yearly'",  "child": { … } }`)
    ]
  },
  {
    id: 'tracking', title: 'Analytics',
    blocks: [
      html(`<p>Any action can carry the analytics event it should report. The SDK never looks inside the
      map — it carries the names the payload chose and hands them over.</p>`),
      code(J, `{ "type": "navigate", "screen_id": "catalog",
  "tracking": {
    "primary":   { "name": "select_category",
                   "params": { "category_id": "audio", "position": 2 } },
    "warehouse": { "event": "catalog.category.selected",
                   "attributes": [ { "key": "surface", "value": "home" } ] }
  }}`),
      code(K, `HeimTheme(
    trackingDispatcher = { _, payload ->
        payload["primary"]?.let { firstProvider.log(it) }
        payload["warehouse"]?.let { secondProvider.log(it) }
    },
) { … }`),
      html(`<p>Nested objects and arrays survive intact, so one block per provider works — each names the same
      click differently and the SDK does not have to know that.</p>`),
      note('tip', `<strong>Why this belongs in the payload.</strong> In most companies the analytics team is
      not the mobile team, and event names change every sprint. With the names in the client, every rename is
      an app release. With them in the payload, it is a backend deploy — which is the promise of SDUI applied
      to measurement.`),
      note('note', `This is distinct from <code>HeimTelemetryObserver</code>, which is the SDK reporting on
      <em>itself</em> — a screen rendered, a payload repaired, a submission blocked. Its vocabulary is fixed by
      the SDK. Tracking is the product reporting on the user, and its vocabulary is yours.`)
    ]
  }]
},
{
  group: 'Extending',
  items: [
  {
    id: 'theming', title: 'Theming & tokens',
    blocks: [
      html(`<p>Pass your Material 3 objects straight in. The payload names roles —
      <code>primary</code>, <code>titleMedium</code>, <code>surfaceVariant</code> — and your theme decides what
      they look like.</p>`),
      code(K, `// HeimTheme inherits the theme it is wrapped in. Server-driven screens look like the
// rest of your app with nothing to restate at the call site.
YourAppTheme {
    HeimTheme {
        HeimScreen(screenId = "home", onAction = ::onHeimAction)
    }
}

// Pass them explicitly only when the SDUI surface should differ from the rest of the app.
HeimTheme(
    colorScheme = MarketingColorScheme,
    typography  = MarketingTypography,
) { … }`),
      note('tip', `<strong>A payload should never contain a hex colour.</strong> It names a role and this file
      decides what the role means — which is what makes a rebrand a client release rather than a migration
      across every JSON on your server.`),
      html(`<h3>Names Material does not have</h3>
      <p>Real design systems have vocabulary Material does not: <code>legal</code>,
      <code>price-strikethrough</code>, <code>brand-gradient</code>. <code>HeimBrandTokens</code> maps
      arbitrary names to colours and text styles, so a larger design system does not force a fork.</p>`),
      code(K, `val brandTokens = remember {
    HeimBrandTokens(
        colors = mapOf("legal" to Color(0xFF6B7280), "flash-sale" to Color(0xFFFF3D71)),
        textStyles = mapOf("legal" to MaterialTheme.typography.bodySmall.copy(lineHeight = 16.sp)),
    )
}

HeimTheme(brandTokens = brandTokens) { … }`),

      html(`<h3>Styling a control</h3>
      <p>A theme covers the screens you own. It does not cover the one a designer handed over with a
      specific button on it — and until a payload could say so, the answer was a custom component for
      what is still a button. The eight interactive components take style properties:</p>`),
      table(['Component', 'Properties'], [
        ['<code>button</code>', '<code>background_color</code>, <code>text_color</code>, <code>border_color</code>, <code>border_width</code>, <code>corner_radius</code>'],
        ['<code>text_field</code> · <code>select</code> · <code>date_picker</code> · <code>chip</code>', 'those five, plus <code>accent_color</code>'],
        ['<code>switch</code>', '<code>text_color</code>, <code>background_color</code>, <code>accent_color</code>'],
        ['<code>checkbox</code>', '<code>text_color</code>, <code>border_color</code>, <code>corner_radius</code>, <code>accent_color</code>'],
        ['<code>radio_group</code>', '<code>text_color</code>, <code>border_color</code>, <code>accent_color</code>']
      ]),
      code(J, `{
  "type": "button", "id": "pay", "title": "Pay now",
  "background_color": "brand-primary",
  "text_color": "text-on-brand",
  "corner_radius": 8
}`),
      html(`<p><code>accent_color</code> is the one colour a control is <em>about</em>: the track of a
      switch that is on, the tick in a checkbox, the outline of a focused field, the fill of a selected
      filter chip, the highlighted day in a date picker. Naming it once is why a control does not need a
      property per state.</p>`),
      note('tip', `These take the same names as anything else — a <code>HeimBrandTokens</code> key or a
      Material role — so <code>brand-primary</code> is still one colour in light and another in dark. A
      hex is accepted and is the same colour in both, which is occasionally what a designer means and
      usually not.`),
      note('note', `Colours you leave out are the theme's, not a default: a button that names only
      <code>background_color</code> gets a readable label derived from it, and one that names nothing
      renders exactly as it did before any of this existed. Disabled states are derived too, so a styled
      control still greys out like a control.`)
    ]
  },
  {
    id: 'providers', title: 'Providers',
    blocks: [
      html(`<p>Nine interfaces, each with a working default. Override what you need; the rest cost you
      nothing.</p>`),
      table(['Provider', 'What it decides', 'When to override'], [
        ['<code>HeimIconProvider</code>', 'What an icon <em>name</em> draws', '<strong>Almost always.</strong> The SDK ships about a dozen generic glyphs and no icon dependency.'],
        ['<code>HeimImageLoader</code>', 'How remote images load', 'Ask your CDN for the size actually drawn; add gateway auth'],
        ['<code>HeimUrlLauncher</code>', 'What <code>open_url</code> does', 'Claim your own scheme instead of bouncing out to the OS'],
        ['<code>HeimUrlPolicy</code>', 'Which schemes may open', 'Allow-list — never a deny-list'],
        ['<code>HeimModalPresenter</code>', 'How dialogs and sheets look', 'Stock Material reads as someone else&rsquo;s UI inside yours'],
        ['<code>HeimTelemetryObserver</code>', 'Where SDK events go', '<strong>Wire on day one.</strong>'],
        ['<code>HeimFormDraftStorage</code>', 'Where drafts survive process death', 'Any form longer than one screen'],
        ['<code>HeimValidatorRegistry</code>', 'Named validation rules', 'Your own <code>tax_id</code>, <code>iban</code>, <code>curp</code>'],
        ['<code>HeimActionDispatcher</code>', 'Intercept actions before they run', 'Gate a submission <em>before</em> it reaches the network']
      ]),
      html(`<h3>Icons are the one to do first</h3>
      <p>The SDK carries no icon dependency, on purpose. It knows a dozen generic names; anything else falls
      back to a placeholder and reports <code>IconMissing</code>. A dozen lines fixes it:</p>`),
      code(K, `object AppIcons : HeimIconProvider {
    private val icons = mapOf(
        "shopping_cart"   to Icons.Default.ShoppingCart,
        "account_balance" to Icons.Default.AccountBalance,
    )

    @Composable
    override fun RenderIcon(name: String, tint: Color, size: Dp, modifier: Modifier) {
        Icon(
            imageVector = icons[name.lowercase().trim()]
                ?: Icons.AutoMirrored.Filled.HelpOutline,
            contentDescription = null,
            tint = tint,
            modifier = modifier.size(size),
        )
    }
}`),
      note('tip', `The principle generalises: <strong>the vocabulary belongs to the app, not the SDK.</strong>
      The server names an icon; you decide what that name draws. The same <code>"shopping_cart"</code> is a
      Material symbol in one app and a brand asset in another, with no server change and no SDK release.`),

      html(`<h3>Gating an action before it runs</h3>`),
      code(K, `class RequireSessionInterceptor(private val session: Session) : HeimActionInterceptor {
    override suspend fun intercept(
        action: HeimAction,
        stateManager: HeimStateManager,
        next: suspend (HeimAction) -> Unit,
    ) {
        // Not calling next stops the chain: the request is never built, let alone sent.
        if (action is SubmitFormAction && session.token == null) return
        next(action)
    }
}

HeimTheme(
    actionDispatcher = remember {
        HeimActionDispatcher.build { addInterceptor(RequireSessionInterceptor(session)) }
    },
) { … }`),
      note('note', `The check belongs here rather than in a payload. A server-driven screen cannot know whether
      this device still holds a valid session — the token may have expired since the JSON was authored, and
      <code>visible_if</code> evaluates against form state, not auth. In an interceptor, every screen inherits
      it, including screens written after this code.`)
    ]
  },
  {
    id: 'custom', title: 'Custom components',
    blocks: [
      html(`<p>The escape hatch for anything the primitives cannot express — a chart, a map, a card
      scanner, an AR view, or a product card whose design is yours and is not going to be described in
      JSON. The server addresses a composable the SDK has never heard of.</p>

      <h3>Two halves that meet at render time</h3>
      <p>This is the part worth getting straight, because the registry lives at the app root and a tap
      usually has to navigate — and navigation is per-route. Those are not in conflict: the registry
      declares <em>how a name is drawn</em>, and the action handler arrives <em>as a parameter</em> when
      the component is actually rendered.</p>`),

      html(`<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" class="my-4 w-full" role="img" aria-label="How a custom component is resolved">
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#334155"/>
    </marker>
  </defs>
  <rect x="8" y="8" width="330" height="150" rx="10" fill="#161D2F" stroke="#A855F7" stroke-width="1.5"/>
  <text x="24" y="34" fill="#A855F7" font-family="JetBrains Mono, monospace" font-size="11">ONCE, AT THE APP ROOT</text>
  <text x="24" y="60" fill="#F8FAFC" font-family="Inter, sans-serif" font-size="14" font-weight="600">HeimTheme(registry)</text>
  <text x="24" y="84" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Declares how a name is drawn.</text>
  <text x="24" y="104" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Knows nothing about navigation,</text>
  <text x="24" y="124" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">screens, or where it is used.</text>
  <text x="24" y="146" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11.5">"product_card" &#8594; @Composable</text>
  <rect x="382" y="8" width="330" height="150" rx="10" fill="#161D2F" stroke="#00E5FF" stroke-width="1.5"/>
  <text x="398" y="34" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11">PER SCREEN</text>
  <text x="398" y="60" fill="#F8FAFC" font-family="Inter, sans-serif" font-size="14" font-weight="600">HeimScreen(id, onAction)</text>
  <text x="398" y="84" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">Decides what a tap does, because</text>
  <text x="398" y="104" fill="#94A3B8" font-family="Inter, sans-serif" font-size="12.5">only this route knows its graph.</text>
  <text x="398" y="146" fill="#00E5FF" font-family="JetBrains Mono, monospace" font-size="11.5">NavigateAction &#8594; navController</text>
  <rect x="196" y="196" width="330" height="88" rx="10" fill="#0d1220" stroke="#334155" stroke-width="1.5"/>
  <text x="212" y="222" fill="#D97706" font-family="JetBrains Mono, monospace" font-size="11">FROM THE SERVER</text>
  <text x="212" y="248" fill="#94A3B8" font-family="JetBrains Mono, monospace" font-size="11.5">{ "type": "custom",</text>
  <text x="212" y="268" fill="#94A3B8" font-family="JetBrains Mono, monospace" font-size="11.5">&#160;&#160;"name": "product_card", "data": { … } }</text>
  <path d="M173,158 L330,196" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <path d="M547,158 L392,196" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <path d="M361,284 L361,318" stroke="#334155" stroke-width="1.5" fill="none" marker-end="url(#ar)"/>
  <rect x="112" y="322" width="498" height="66" rx="10" fill="#161D2F" stroke="#10B981" stroke-width="1.5"/>
  <text x="128" y="348" fill="#10B981" font-family="JetBrains Mono, monospace" font-size="11">YOUR COMPOSABLE, CALLED WITH BOTH</text>
  <text x="128" y="374" fill="#F8FAFC" font-family="JetBrains Mono, monospace" font-size="12">renderer(data, onAction<tspan fill="#94A3B8"> of this screen</tspan>, modifier)</text>
</svg>`),

      note('note', `The click does <strong>not</strong> live in the theme. Your renderer receives the
      <code>onAction</code> of the screen being drawn, so one registration navigates differently
      depending on where it appears. Capturing a <code>navController</code> inside the registry would
      be the mistake — take the parameter instead.`),

      html(`<h3>1 · Declare the shape</h3>
      <p>Once, as a type. It doubles as the contract you hand to whoever writes the payload.</p>`),
      code(K, `@Serializable
data class ProductCard(
    val sku: String,
    val title: String,
    val price: Double,
    val currency: String = "USD",
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("in_stock") val inStock: Boolean = true,
)`),

      html(`<h3>2 · Register it at the root</h3>`),
      code(K, `// App.kt — once per process. No navigation in here.
val registry = remember {
    HeimCustomComponentRegistry().apply {
        register<ProductCard>("HORIZONTAL_CARD_PRODUCT") { product, onAction, modifier ->
            HorizontalProductCard(
                product  = product,
                onClick  = {
                    // Goes back through the same pipeline as any SDK action: your interceptors,
                    // your tracking, the sequential ordering. Nothing special-cased.
                    onAction(NavigateAction("product_detail", mapOf("sku" to product.sku)))
                },
                modifier = modifier,   // already carries weight and frame from the payload
            )
        }
    }
}

HeimTheme(customComponentRegistry = registry) { AppNavHost() }`),

      html(`<h3>3 · Each route brings its own handler</h3>`),
      code(K, `composable("catalog") {
    HeimScreen("catalog", onAction = { if (it is NavigateAction) nav.navigate(it.screenId) })
}

composable("wishlist") {
    // Same card, same registration — a different destination, because the route decides.
    HeimScreen("wishlist", onAction = { if (it is NavigateAction) nav.navigate(it.screenId) })
}`),

      html(`<h3>4 · The server sends data, not design</h3>`),
      code(J, `{ "type": "lazy_column", "id": "catalog",
  "padding": { "horizontal": 16, "top": 8 }, "spacing": 12,
  "items": [
    { "type": "custom", "id": "p_001", "name": "HORIZONTAL_CARD_PRODUCT",
      "data": {
        "sku": "sku_001", "title": "Auriculares Pro", "price": 348.5,
        "image_url": "https://cdn.example.com/p/001.jpg", "in_stock": true
      }},
    { "type": "custom", "id": "p_002", "name": "HORIZONTAL_CARD_PRODUCT",
      "data": { "sku": "sku_002", "title": "Teclado 65%", "price": 129.0 } }
  ]}`),

      html(`<p>Reordering the list, adding products, changing prices — all payload. Changing how the
      card <em>looks</em> is a client release, and that is correct: it is native code.</p>`),

      note('tip', `<strong>Prefer the typed overload.</strong> The untyped one hands you a
      <code>Map&lt;String, HeimValue&gt;</code> and leaves the unpacking to you —
      <code>d["title"]?.asString.orEmpty()</code> at every field, with the payload's shape spelled out
      in string literals the compiler cannot check. A typo in <code>"image_url"</code> is a silently
      empty image. With a type, defaults live in the constructor and the names are checked for you.`),

      note('note', `A payload that does not fit the type renders <strong>nothing</strong> and reports a
      <code>PayloadViolation</code>, rather than throwing — the same rule everywhere else: a malformed
      component costs its own space on screen, never the screen around it. The same happens for a
      <code>custom</code> nobody registered. Set <code>showDiagnostics = true</code> in debug builds to
      see a visible placeholder instead.`),

      html(`<h3>Ten components do not mean ten blocks at the root</h3>
      <p><code>register</code> returns the registry, so registrations compose. Group them by feature,
      one extension function per file, and the composition root stays the same size however many
      components exist.</p>`),
      code(K, `// designsystem/custom/ProductComponents.kt
fun HeimCustomComponentRegistry.productComponents() = apply {
    register<ProductCard>("HORIZONTAL_CARD_PRODUCT") { p, onAction, m ->
        HorizontalProductCard(p, { onAction(NavigateAction("product_detail", mapOf("sku" to p.sku))) }, m)
    }
    register<ProductGrid>("GRID_CARD_PRODUCT") { p, onAction, m -> GridProductCard(p, onAction, m) }
}

// App.kt — five lines, whether you have three components or thirty.
val registry = remember {
    HeimCustomComponentRegistry()
        .productComponents()
        .checkoutComponents()
        .marketingComponents()
}`),
      note('tip', `When your composable already takes <code>(data, onAction, modifier)</code> in that
      order, the registration is a reference:
      <code>register&lt;ProductCard&gt;("HORIZONTAL_CARD_PRODUCT", ::HorizontalProductCard)</code>.
      The lambda is only needed where you translate an action — and that translation is the useful
      code, not ceremony.`),
      note('note', `There is no annotation processor doing this for you, deliberately. A component
      that appears without a visible registration is impossible to trace when it misbehaves, it
      would make KSP a build dependency for every consumer, and two features registering the same
      name would collide invisibly. Composition solves the verbosity without any of that.`),

      html(`<h3>When not to reach for this</h3>
      <p>If the card can be built from <code>card</code> + a horizontal <code>container</code> +
      <code>image</code> + <code>text</code>, build it that way — then the server controls the design
      too, which is the point of SDUI. Reserve <code>custom</code> for what the primitives genuinely
      cannot express.</p>
      <p>A useful test: <strong>if expressing it would mean adding ten properties to the schema, it is a
      custom component.</strong></p>`)
    ]
  },
  {
    id: 'repository', title: 'Replacing the data layer',
    blocks: [
      html(`<p><code>HeimScreenRepository</code> is an interface. Implement it and the SDK never opens a
      socket — payloads can come from your existing GraphQL or gRPC stack, from assets compiled into the app,
      or from fixtures in a test.</p>`),
      code(K, `// UI tests with no server, and no flakiness that has nothing to do with the code under test.
val repository = MockHeimScreenRepository(
    jsonProvider = { screenId -> testFixtures[screenId] }
)

HeimScreen(screenId = "checkout", onAction = {}, repository = repository)`),
      html(`<p><code>HeimSignatureVerifier</code>, <code>HeimEmergencyBundleProvider</code>,
      <code>HeimStorageDriver</code> and <code>HeimClock</code> sit at the same level. <code>HeimClock</code>
      exists so cache TTL expiry is testable without waiting seven days.</p>`)
    ]
  }]
},
{
  group: 'Operating it',
  items: [
  {
    id: 'observability', title: 'Telemetry',
    blocks: [
      html(`<p>Wire this on day one. Two of these events are how a backend team finds out it is shipping broken
      SDUI <em>before</em> users report it — the screen renders, just not as the author intended, so nothing
      else would tell you.</p>`),
      table(['Event', 'Means'], [
        ['<code>PayloadViolation</code>', '<strong>The client had to repair what it received</strong> — a clamped dimension, a duplicate id, an unknown component type.'],
        ['<code>IconMissing</code>', 'A payload named an icon your provider does not know.'],
        ['<code>ScreenRefreshFailed</code>', 'Revalidation failed but cached content is still on screen. Nobody is blocked — do not page anyone — but the network or backend is degrading.'],
        ['<code>SubmissionBlocked</code>', 'A submission was refused locally and never left the device.'],
        ['<code>UrlBlocked</code>', 'A payload tried to open a scheme the policy refuses.'],
        ['<code>ValidatorMissing</code>', 'A <code>CUSTOM</code> rule named a validator nobody registered.'],
        ['<code>ScreenViewed</code> · <code>ActionExecuted</code> · <code>TimeToRender</code>', 'Normal operation, with <code>isStale</code> telling you whether the render came from cache.']
      ]),
      code(K, `HeimTheme(
    telemetryObserver = { event ->
        when (event) {
            is HeimTelemetryEvent.PayloadViolation ->
                crashlytics.log("SDUI payload repaired on \${event.screenId}: \${event.violations}")
            is HeimTelemetryEvent.TimeToRender ->
                metrics.record("sdui.render_ms", event.durationMs)
            else -> analytics.log(event)
        }
    },
) { … }`)
    ]
  },
  {
    id: 'security', title: 'Security model',
    blocks: [
      html(`<p>Everything here fails closed, and none of it is overridable from a payload. That is the point:
      a payload is untrusted input that arrived over a network.</p>`),
      table(['Control', 'What it stops'], [
        ['<code>allowedSubmitHosts</code>', 'A malicious or compromised payload posting the user&rsquo;s token to a host you never listed.'],
        ['<code>allowCleartextHosts</code>', 'A payload naming an <code>http://</code> URL — a screen, a form endpoint, an image — and having the SDK fetch it, token and all, over a network anyone on the path can read. Empty by default, so cleartext is refused unless you named the host.'],
        ['<code>HeimUrlPolicy</code>', '<code>intent://</code> reaching unexported Android components; <code>file://</code> and <code>content://</code> disclosing local storage; <code>javascript:</code> running in whatever renders it. It is an <strong>allow-list</strong> — a deny-list always misses the next scheme.'],
        ['Payload guard', 'A deeply nested or oversized payload exhausting the parser. On Kotlin/Native a stack overflow is an uncatchable SIGSEGV, so the depth is checked by scanning the bytes <em>before</em> parsing begins.'],
        ['<code>trustedSigningKeys</code>', 'A screen nobody on your side produced, or one changed after you produced it — including a copy read back from a cache an attacker wrote on a rooted device. See <a href="#signing">Signed screens</a>.'],
        ['<code>publicScreenHosts</code>', 'A session token reaching a bucket or CDN that has no business holding one: a host listed there is read with no credentials at all.'],
        ['Circuit breaker', 'A client fleet hammering a backend that is already down.']
      ]),
      note('security', `Image URLs are restricted to <code>https</code> and <code>data</code>. A payload cannot
      point an <code>image</code> at <code>file://</code> and read local storage into a bitmap.`),
      html(`<h3>Cleartext during development</h3>
      <p>A local backend speaks <code>http://</code>, and the SDK refuses cleartext by default — for screens,
      for form submissions and for images alike. Two things do not need declaring: loopback
      (<code>localhost</code>, <code>127.0.0.1</code>), and <code>baseUrl</code>&rsquo;s own host when that URL
      is already <code>http://</code>, since your app wrote that origin in its own source. Everything a
      <em>payload</em> can name does need declaring:</p>`),
      code(K, `HeimUI.initialize(
    HeimConfig(
        baseUrl = "http://10.0.2.2:8080",   // the Android emulator's alias for your machine
        // Only needed for a host the payload names that is not the baseUrl's own —
        // a local image CDN, say. Keep it empty in release.
        allowCleartextHosts = if (BuildConfig.DEBUG) setOf("assets.local") else emptySet(),
    )
)`),
      note('warning', `The platform has to agree too, and no SDK setting substitutes for it: Android wants
      <code>android:usesCleartextTraffic="true"</code> or a network security config (put it in
      <code>src/debug</code> so the release build never carries it), and iOS an ATS exception. Ship neither in
      a release build.`),
      html(`<h3>R8 and obfuscation</h3>
      <p><strong>Android.</strong> From <code>0.0.1-alpha-2</code> the AAR carries its keep rules as
      <code>proguard.txt</code>, so R8 in your app applies them automatically — there is nothing to copy
      into your own <code>proguard-rules.pro</code>. They cover the serializable DTOs, their generated
      serializers, the enum constants and the component constructors. <code>0.0.1-alpha-1</code> shipped
      without them by mistake; if you are on it, either move up or paste
      <a href="https://github.com/heimui-io/heimui-core/blob/main/shared/consumer-rules.pro"
      target="_blank" rel="noopener">consumer-rules.pro</a> into your own rules.</p>
      <p>Two things make the SDK structurally hard for R8 to break, and they are worth knowing because they
      also tell you where <em>your</em> code is exposed. Every polymorphic subtype declares an explicit
      <code>@SerialName</code>, so the discriminator in the JSON is a literal string rather than a class
      name: R8 is free to rename <code>TextComponentDto</code> to <code>a.b.c</code> and parsing still
      works. And nothing is looked up by name at runtime — the serializers are generated at compile time
      and reached by direct reference.</p>`),
      note('warning', `Verify it anyway, and verify your own models. Build one minified release and open a
      screen. If you define serializable types of your own, give each polymorphic subtype an explicit
      <code>@SerialName</code> and keep them in your rules — that failure is the classic release-only
      surprise: the debug build passes and the release cannot parse a payload it handled fine.`),
      html(`<p><strong>iOS.</strong> Nothing to configure, and no equivalent risk. Kotlin/Native compiles
      ahead of time to machine code, so there is no bytecode shrinker renaming types and no step that can
      pull the discriminator out from under the parser. The framework is built static, and Apple's
      toolchain only strips symbols nothing references.</p>
      <p>If your organisation runs a commercial iOS obfuscator over the finished app, that is a different
      tool with different reach: it can rewrite the Objective-C symbols the framework exports. Test a build
      with it before you rely on it — but it is your pipeline's decision, not an SDK setting.</p>`)
    ]
  },
  {
    id: 'demo', title: 'The showcase app',
    blocks: [
      html(`<p><a href="https://github.com/heimui-io/heimui-demo" target="_blank" rel="noopener">heimui-demo</a>
      is the reference integration. Every screen is fetched over HTTP from static JSON on GitHub, so it
      exercises the real repository — cache, ETag revalidation, stale-while-revalidate, timeouts and the
      circuit breaker — rather than a hand-rolled fetcher that would demonstrate none of them.</p>`),
      table(['Vertical', 'What it shows'], [
        ['<strong>E-Commerce</strong>', 'Filter chips bound to state, flash-sale badges, a product sheet whose content is itself SDUI.'],
        ['<strong>Fintech</strong>', 'A KYC form with conditional visibility, select, date picker, radio group and checkbox, and drafts that survive process death.'],
        ['<strong>Food delivery</strong>', 'Feeds, carousels and an order-tracking card.'],
        ['<strong>SaaS paywall</strong>', 'Plan comparison and a reactive billing toggle driven by <code>set_state</code>.'],
        ['<strong>Storybook</strong>', 'Every primitive, the brand tokens, and a custom stock-chart plugin.']
      ]),
      note('tip', `The <code>&lt;/&gt;</code> button on any screen opens a panel showing the SDK events that
      screen produced and the raw JSON behind it. It is the fastest way to understand what the engine is
      actually doing — and it is about forty lines of app code you can copy.`),
      html(`<h3>Iterating on payloads locally</h3>`),
      code(G, `python3 -m http.server 8080          # from the repo root
# then point the SDK at your machine:
#   baseUrl = "http://10.0.2.2:8080/sdui"   (10.0.2.2 is the emulator's host loopback)`),
      note('note', `Plain HTTP only reaches a debug build: the demo carries a network security config in
      <code>src/debug</code> that exempts loopback addresses. Release builds still refuse cleartext.`)
    ]
  }]
}];

renderDocs();
