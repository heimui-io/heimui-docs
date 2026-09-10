/* HeimUI documentation — object storage. Rendering lives in /assets/docs-runtime.js. */

const diagram = (body) => html(`<pre class="my-4 overflow-x-auto rounded-xl border border-edge bg-[#0d1220] p-4 font-mono text-[13px] leading-relaxed text-muted">${body}</pre>`);

const SECTIONS = [
{
  group: 'Start here',
  items: [
  {
    id: 'why', title: 'Why a bucket',
    blocks: [
      html(`<p>By default the Studio serves the screens it publishes: your service asks it for a
      template and it answers. That is one less moving part, and for most teams it is the right
      answer — <strong>if it is working for you, you can close this page</strong>.</p>

      <p>Object storage is for the teams it does not work for:</p>
      <ul class="mb-4 ml-5 list-disc space-y-1">
        <li>the Studio is an <strong>internal tool behind a VPN</strong>, and production cannot reach it;</li>
        <li>an editor going down must not be able to take a screen off a phone;</li>
        <li>you want templates on a <strong>CDN</strong>, close to the devices reading them;</li>
        <li>your platform team will not put a small editor in the request path of a live app.</li>
      </ul>

      <p>Turning it on makes the Studio <strong>mirror</strong> every publication into a bucket you own.
      It keeps serving them too — this is an extra destination, never a replacement — so you can point
      your service at the bucket, confirm it works, and stop there.</p>`),

      note('note', `Nothing about this changes what a template <em>is</em>. The bytes in the bucket are
      byte for byte what the Studio would have served, so a service can move between the two without a
      migration, and <a href="/backend/#hydration">hydration</a> is unchanged.`)
    ]
  },
  {
    id: 'shape', title: 'Who holds which key',
    blocks: [
      html(`<p>Three parties, and <strong>the Studio and your service never speak to each other</strong>.
      Both speak to the bucket, with different credentials and different permissions.</p>`),

      diagram(`Studio  ──write──▶  bucket  ◀──read──  your service
(editor)                                    (hydrates, answers the device)`),

      table(['Who', 'Credential', 'Permission'], [
        ['<strong>The Studio</strong>', 'A key that can write', '<code>PutObject</code>, <code>DeleteObject</code>'],
        ['<strong>Your service</strong>', 'A different key, read-only', '<code>GetObject</code>, <code>ListBucket</code>'],
        ['<strong>The device</strong>', 'None — it reads through your service', '—']
      ]),

      note('security', `Two credentials, not one. A read key that leaks into a log lets somebody read
      templates; a write key that leaks lets them <em>replace</em> the screen your users are looking at.
      Splitting them is the difference between an incident and a headline.`),

      html(`<h3>The bucket stays private</h3>
      <p>Your service holds a read key and uses it; the device talks to your service, exactly as it does
      today. Leave <em>Block all public access</em> on.</p>

      <p>There is one screen that does not fit that, and it is worth knowing before you design around this
      page: a screen with <strong>no data in it at all</strong> — terms and conditions, a help page, an
      onboarding carousel. Nothing has to fill it in, so nothing has to sit between it and the device. Those
      can be opened <strong>one at a time</strong>, without opening anything beside them, and that case is
      <a href="#device-reads">its own section</a>.</p>`)
    ]
  }
  ]
},
{
  group: 'The bucket',
  items: [
  {
    id: 'layout', title: 'How an object is named',
    blocks: [
      html(`<p>One object per screen per environment, at a key you can work out without asking anything:</p>`),

      diagram(`screens/@release/checkout.json
└──┬───┘ └──┬───┘ └───┬────┘
   │        │         └─ the screen id, plus .json
   │        └─ the environment, with an @ in front
   └─ the prefix you configured (default: screens/)`),

      html(`<p>A screen id may contain slashes, and they survive into the key — which means the bucket
      browses like the folders you organised the screens into:</p>`),

      code(SH, `screens/@develop/checkout.json
screens/@develop/examples/starter_catalogue.json
screens/@release/checkout.json`),

      note('tip', `That is deliberately the same shape as the URL the Studio serves
      (<code>/screens/@release/checkout</code>). Moving a service from one to the other is a change of
      base address, not a change of logic.`),

      html(`<h3>You do not have to work it out</h3>
      <p>In the Studio, open a screen and look at the promotion path under <strong>Versions</strong>. Each
      environment has a <strong>Path</strong> button, and it answers the question for that screen on that
      environment:</p>`),

      diagram(`Reading release r2 from Release

FROM THIS STUDIO
https://studio.example.com/screens/@release/checkout

Needs a read key. Mint one under Settings, Environments.

IN THE BUCKET (heimui-templates)
screens/@release/checkout.json`),

      html(`<p>Copy buttons on each line. It also tells you whether that screen needs a key, and names the
      readable copy when <a href="#device-reads">there is one</a> — so the thing your service reads and the
      thing the Studio writes cannot disagree because somebody guessed.</p>`),

      html(`<h3>What each action does to the bucket</h3>`),

      table(['In the Studio', 'In the bucket'], [
        ['Publish', 'Writes <code>@&lt;first environment&gt;/&lt;id&gt;.json</code>'],
        ['Promote', 'Writes <strong>the same bytes</strong> to the next environment&rsquo;s key. The first one stays.'],
        ['Roll back', 'Overwrites that environment&rsquo;s key with the older release'],
        ['Take a screen off an environment', 'Deletes <strong>that one key</strong>. Other environments keep theirs.'],
        ['Delete a screen', 'Deletes its key on every environment it was live on'],
        ['Delete an environment', 'Nothing — it is refused while any screen is live on it'],
        ['<a href="#device-reads">Open or close one screen</a>', 'Adds or removes a copy under the public prefix. The private one is untouched']
      ]),

      note('note', `A promotion is a copy, not a move. <code>@develop/checkout.json</code> and
      <code>@release/checkout.json</code> hold identical bytes after promoting, which is the whole point:
      what reaches users is what somebody already looked at.`)
    ]
  },
  {
    id: 'device-reads', title: 'When the device can read it directly',
    blocks: [
      html(`<p>The rule is one question, and it is not about architecture:</p>`),

      diagram(`Does the screen contain {{ … }} ?

  yes ──▶  something has to fill it, and that something holds your
           data — so it is your service. The device asks your service.

  no  ──▶  the template already IS the document. There is nothing to
           hydrate, and nothing has to sit in the middle.`),

      html(`<p>Terms and conditions. A help page. An onboarding carousel. A static promo. These have no
      bindings, so <a href="/backend/#hydration">hydration</a> is a no-op on them — and the SDK can fetch
      them straight from the Studio or from the bucket and render what it got.</p>

      <h3>Open one screen, or the whole environment</h3>
      <p>Both exist, because they answer different questions. In the Studio, under
      <strong>Settings &rarr; Environments</strong>, expanding an environment lists what it is serving with
      a switch on each row.</p>`),

      table(['Switch', 'What it opens', 'Reach for it when'], [
        ['<strong>The environment</strong>', 'Everything live on it, including whatever is published there next',
         'The whole environment is public by nature — a demo, a marketing preview'],
        ['<strong>One screen</strong>', 'That screen, on that environment, and nothing beside it',
         'A terms page inside a production that also serves a checkout']
      ]),

      note('note', `The two are kept apart on purpose. Opening an environment and closing it again
      <strong>does not close</strong> a screen somebody opened deliberately — collapsing them into one flag
      would take that screen dark for every device reading it, the moment an operator tightened the
      environment for an unrelated reason.`),

      html(`<p>Openness lives on the pointer, so taking a screen off an environment takes it with it. A
      screen that is published there again comes back closed, which is the safe direction for a setting
      nobody re-checks.</p>

      <h3>Reading an open screen from the Studio</h3>`),

      code(SH, `curl https://studio.example.com/screens/@release/terms`),

      html(`<p>No header. A screen that is not open answers <code>401</code> with the scheme it wanted,
      rather than a 404 that would leave an integrator guessing.</p>

      <h3>How that works in the bucket</h3>
      <p>Not with permissions. <strong>The Studio writes a second copy under a second prefix</strong>, and
      that prefix is the one a person made readable, once, by hand:</p>`),

      diagram(`screens/@release/terms.json     ← private. Your service reads this, with a key.
public/@release/terms.json      ← the same bytes, where a device can read them.`),

      note('security', `The alternative would be the Studio editing the bucket policy every time somebody
      flips a switch — and a Studio that can rewrite a bucket policy is a Studio that can open the entire
      bucket. <strong>Placement is the safer lever.</strong> The policy is written once, by you, names one
      prefix, and is never touched again.`),

      html(`<p>Per-object ACLs are the other thing you might reach for, and they are a dead end: buckets
      created since 2023 default to <em>bucket owner enforced</em>, which disables ACLs outright, and R2
      has never had them. Prefixes work everywhere.</p>

      <h3>Setting it up</h3>
      <p>Fill in <strong>Public prefix</strong> in <a href="#studio-config">the storage panel</a> — leave it
      empty and no readable copy is ever written, whatever any screen says. Then make that prefix readable,
      once. The tidy answer is a <strong>CDN in front of a bucket that stays private</strong> — CloudFront
      with an origin access control, or an R2 public bucket binding — so the device gets a cache close to it
      and the bucket is still unreachable from the internet.</p>

      <p>If you would rather not run one, a bucket policy does it. This needs <em>Block all public access</em>
      turned off, which is exactly the setting to be reluctant about:</p>`),

      code(J, `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadOpenScreens",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET/public/*"
  }]
}`),

      html(`<p>The Studio&rsquo;s own key needs nothing extra: it already has <code>PutObject</code> and
      <code>DeleteObject</code> on the bucket, and writing a copy is the same permission as writing the
      original. Widen the resource in <a href="#permissions">the write policy</a> to cover both prefixes.</p>

      <h3>What stays in step</h3>`),

      table(['What you do', 'What happens to the readable copy'], [
        ['Open one screen', 'Written immediately, not at the next publish'],
        ['Close it again', 'Removed immediately'],
        ['Publish over an open screen', 'Both copies updated together'],
        ['Open the environment', 'Written for every screen live on it'],
        ['Close the environment', 'Withdrawn for every screen it had opened'],
        ['Take a screen off the environment', 'Both copies removed'],
        ['Clear the public prefix', 'Nothing new is written. Copies already out there stay — remove them yourself']
      ]),

      note('warning', `That last row is the one to remember. Emptying the field stops the Studio writing
      readable copies; it does not go and delete the ones already in the bucket. If you are closing something
      off, close the prefix in the bucket too.`),

      note('note', `Promoting into an open environment is the moment that screen becomes world-readable.
      That is not a reason to avoid it — a terms page is meant to be read — but it is worth being the thing
      somebody thinks about when they click promote, rather than a property of the bucket they inherited.`)
    ]
  },
  {
    id: 'providers', title: 'Which providers work',
    blocks: [
      html(`<p>Anything that speaks the S3 API. The panel has five to pick from, and picking one decides
      what else it asks you for:</p>`),

      table(['Provider', 'It asks for', 'Endpoint it builds'], [
        ['<strong>Amazon S3</strong>', 'Bucket and region', '<em>none — the SDK resolves it from the region</em>'],
        ['<strong>Cloudflare R2</strong>', 'Bucket and <strong>account id</strong>', '<code>https://&lt;account&gt;.r2.cloudflarestorage.com</code>'],
        ['<strong>DigitalOcean Spaces</strong>', 'Bucket and region', '<code>https://&lt;region&gt;.digitaloceanspaces.com</code>'],
        ['<strong>Backblaze B2</strong>', 'Bucket and region', '<code>https://s3.&lt;region&gt;.backblazeb2.com</code>'],
        ['<strong>MinIO / other</strong>', 'Bucket and the <strong>whole endpoint</strong>', '<em>whatever you typed</em>']
      ]),

      note('tip', `<strong>MinIO / other is the escape hatch</strong>, and the reason that list does not have
      to be exhaustive. Anything that speaks the S3 API works there — including a provider that appeared
      after the Studio you are running was built.`),

      note('note', `<strong>MinIO is not a service you sign up for</strong> — it is a server you run, usually
      one container. It is the answer when the bytes are not allowed to leave your infrastructure. If you are
      already paying for S3 or R2, you do not need it.`),

      html(`<p>R2&rsquo;s region is fixed at <code>auto</code> and the panel will not let you edit it: as far
      as the S3 API is concerned R2 has one, and typing over it only produces a signature that does not
      match.</p>`),

      html(`<p>An endpoint that is filled in also switches the client to <strong>path-style</strong>
      addressing (<code>host/bucket/key</code> rather than <code>bucket.host/key</code>), because
      self-hosted endpoints serve one host rather than a subdomain per bucket. You do not configure that;
      it follows from the endpoint.</p>`)
    ]
  }
  ]
},
{
  group: 'Setting it up',
  items: [
  {
    id: 'aws-setup', title: 'Creating the bucket on AWS',
    blocks: [
      html(`<p>Once, in the AWS console. Twenty minutes, and most of it is waiting for pages to load.</p>

      <h3>1. The bucket</h3>
      <p>S3 &rarr; <strong>Create bucket</strong>. Pick a name and a region — the region is the one thing here
      that cannot be changed afterwards, so pick the one your service runs in. Leave <strong>Block all public
      access</strong> on.</p>

      <h3>2. A user for the Studio</h3>
      <p>IAM &rarr; Users &rarr; <strong>Create user</strong>, called something like
      <code>heimui-studio-writer</code>. Do not give it console access; it is not a person.</p>
      <p>Attach this as an inline policy:</p>`),

      code(J, `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::YOUR-BUCKET/screens/*"
  }]
}`),

      note('security', `No <code>GetObject</code> and no <code>ListBucket</code>. The Studio never reads the
      bucket — it only puts things in it and takes them out. A key that cannot read is a key that is worth
      much less to whoever finds it.`),

      html(`<h3>3. The key</h3>
      <p>On that user: <strong>Security credentials</strong> &rarr; <strong>Create access key</strong> &rarr;
      <em>Application running outside AWS</em>. You get an access key id (<code>AKIA…</code>) and a secret.
      <strong>The secret is shown once.</strong></p>`),

      note('tip', `If the Studio runs on EC2, ECS or EKS, skip steps 2 and 3 entirely: attach the policy to
      the instance or task role instead. There is then no key to store, no key to leak and no key to rotate,
      and the Studio finds the role on its own.`),

      html(`<h3>4. A second user for your service</h3>
      <p>The same again, called <code>heimui-service-reader</code>, with the read policy from
      <a href="#permissions">the permissions section</a>. Its key goes in your service&rsquo;s environment,
      never in the Studio.</p>`)
    ]
  },
  {
    id: 'studio-config', title: 'Pointing the Studio at it',
    blocks: [
      html(`<p>In the Studio: <strong>Settings &rarr; Template storage</strong>.</p>`),

      table(['Field', 'What goes in it'], [
        ['<strong>Provider</strong>', 'Pick one. It decides the rest of this form — see <a href="#providers">which providers work</a>'],
        ['<strong>Bucket</strong>', 'The name, on its own — no <code>s3://</code>, no URL'],
        ['<strong>Account ID</strong>', 'R2 only. The endpoint is built from it'],
        ['<strong>Region</strong>', 'Free text with suggestions, and fixed at <code>auto</code> for R2'],
        ['<strong>Prefix</strong>', 'Everything is written under it. <code>screens/</code> unless one bucket holds more than screens'],
        ['<strong>Endpoint</strong>', '<strong>Shown, not typed.</strong> Composed from the provider and what you filled in'],
        ['<strong>Public prefix</strong>', 'Optional, and usually empty. See <a href="#device-reads">when a device reads directly</a>'],
        ['<strong>Access key</strong>', 'Only if the Studio was not started with one. See below']
      ]),

      note('note', `The endpoint is the single likeliest thing to get wrong, and the failure it causes names
      neither the provider nor the region: a wrong endpoint on R2 is a DNS error, and a wrong region on AWS
      is <code>SignatureDoesNotMatch</code>. So the panel composes it and shows you the result rather than
      asking you to remember a format.`),

      html(`<h3>Where the credential comes from</h3>
      <p>Three places, and the first one that answers wins:</p>`),

      table(['Order', 'Source', 'The panel shows'], [
        ['1', 'The environment the Studio was started with', '<code>environment</code>'],
        ['2', 'The access key typed into this panel', '<code>studio</code>'],
        ['3', 'An instance or workload role', '<code>instance role</code>']
      ]),

      code(SH, `HEIMUI_STORAGE_ACCESS_KEY=AKIA...
HEIMUI_STORAGE_SECRET=...`),

      note('note', `The environment beats the panel <strong>and the panel says so</strong>, rather than
      quietly ignoring what somebody typed. Whoever operates the container should be able to overrule the
      editor; nobody should have to guess that they did.`),

      html(`<p>The panel exists because not every deployment has the other two. A Studio on a rented VPS —
      Railway, Hostinger, a droplet — has no instance role, and the person configuring it often has the
      editor and not a shell. Making them find one would not be safer; it would make them give up.</p>`),

      note('security', `A key saved from the panel lives in the Studio&rsquo;s database, and therefore in its
      backups. It is <strong>write-only</strong> — no endpoint returns it, including the one the panel itself
      reads — and the policy above is why that is survivable: the worst somebody can do with it is overwrite
      templates under one prefix. They cannot read the bucket and cannot delete anything else in it.`),

      html(`<h3>Test and save</h3>
      <p>The button writes a small object, deletes it, and only then stores the settings. <strong>If it
      cannot write, nothing is saved</strong>, and you get the provider&rsquo;s own words back:</p>`),

      code(SH, `Access Denied: s3:PutObject on arn:aws:s3:::templates/screens/@_heimui/connection-check.json`),

      note('warning', `Settings that do not work are worse than no settings. Publishing would go on looking
      successful while nothing reached the bucket, and the first sign would be a device asking for a screen
      that is not there. That is why this refuses to save rather than warning you.`),

      html(`<h3>Resync</h3>
      <p>A failed write leaves the Studio saying one thing and the bucket serving another. <strong>Resync</strong>
      writes what every environment is currently serving to the bucket again, and tells you how many objects
      moved. Reach for it after an outage, after a permission fix, or after changing the prefix.</p>`)
    ]
  },
  {
    id: 'permissions', title: 'The two policies',
    blocks: [
      html(`<h3>The Studio — write only</h3>
      <p>Both prefixes if you are using <a href="#device-reads">a public one</a>; drop the second resource
      if you are not.</p>`),
      code(J, `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:DeleteObject"],
    "Resource": [
      "arn:aws:s3:::YOUR-BUCKET/screens/*",
      "arn:aws:s3:::YOUR-BUCKET/public/*"
    ]
  }]
}`),

      html(`<h3>Your service — read only</h3>`),
      code(J, `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::YOUR-BUCKET",
      "arn:aws:s3:::YOUR-BUCKET/screens/*"
    ]
  }]
}`),

      note('warning', `<strong><code>s3:ListBucket</code> is in the read policy on purpose, and leaving it out
      will cost you an afternoon.</strong> On AWS, a caller without it that asks for an object which does not
      exist gets <strong>403 AccessDenied</strong> rather than 404 — S3 hides the difference so that a key you
      are not allowed to read cannot be probed for. Your service would conclude its credential is broken when
      the real answer is that the screen is not published on that environment.`),

      note('note', `This is AWS behaviour, and not every S3-compatible provider copies it: MinIO answers
      <code>404 NoSuchKey</code> with or without list permission. Grant <code>ListBucket</code> anyway — the
      policy then behaves the same everywhere, and your service does not need to know which provider it is
      talking to.`),

      html(`<h3>Rotating a key</h3>
      <p>Create the second key first, put it in place, then delete the first — AWS allows two at a time per
      user, and there is no window where nothing works. On the Studio side, saving a new key in the panel
      replaces the stored one immediately; <strong>Test and save</strong> proves the new one before the old
      one goes away.</p>`),

      note('tip', `Leaving both the access key and the secret <strong>empty</strong> when you save keeps the
      key that is already stored. That is how you change a bucket name or a prefix without having to re-enter
      a secret the panel was never allowed to show you.`)
    ]
  }
  ]
},
{
  group: 'Reading it',
  items: [
  {
    id: 'reading', title: 'Reading a template from your service',
    blocks: [
      html(`<p>Build the key, get the object, parse the JSON. There is no HeimUI library involved — this is
      your provider&rsquo;s ordinary SDK.</p>`),

      tabs(
        code(P, `import json, boto3

s3 = boto3.client("s3")  # or endpoint_url=... for R2, Spaces, MinIO

def template(screen_id: str, channel: str = "release") -> dict:
    key = f"screens/@{channel}/{screen_id}.json"
    body = s3.get_object(Bucket="YOUR-BUCKET", Key=key)["Body"].read()
    return json.loads(body)`),

        code(JS, `import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});  // or { endpoint, forcePathStyle: true }

export async function template(screenId, channel = 'release') {
  const key = \`screens/@\${channel}/\${screenId}.json\`;
  const out = await s3.send(new GetObjectCommand({ Bucket: 'YOUR-BUCKET', Key: key }));
  return JSON.parse(await out.Body.transformToString());
}`),

        code(K, `import aws.sdk.kotlin.services.s3.S3Client
import aws.sdk.kotlin.services.s3.model.GetObjectRequest
import aws.smithy.kotlin.runtime.content.decodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

// One client for the process, not one per read.
val s3 = S3Client { region = "us-east-1" }

suspend fun template(screenId: String, channel: String = "release"): JsonObject {
    val request = GetObjectRequest {
        bucket = "YOUR-BUCKET"
        key = "screens/@$channel/$screenId.json"
    }
    // The body is a stream, so it is read inside a block that owns its lifetime.
    return s3.getObject(request) {
        Json.parseToJsonElement(it.body!!.decodeToString()).jsonObject
    }
}`),

        code(GO, `func template(ctx context.Context, s3c *s3.Client, screenID, channel string) (map[string]any, error) {
    key := fmt.Sprintf("screens/@%s/%s.json", channel, screenID)
    out, err := s3c.GetObject(ctx, &s3.GetObjectInput{
        Bucket: aws.String("YOUR-BUCKET"),
        Key:    aws.String(key),
    })
    if err != nil {
        return nil, err
    }
    defer out.Body.Close()

    var screen map[string]any
    return screen, json.NewDecoder(out.Body).Decode(&screen)
}`)
      ),

      html(`<p>What comes back is a template, with the holes still in it. Merging it with your data is the
      next step, and it is a different page:</p>`),

      note('tip', `<a href="/backend/#hydration">The backend guide</a> has four reference implementations of
      hydration and a 22-case corpus that proves yours is correct. The object you just read is exactly the
      <code>screen</code> argument those take.`),

      html(`<h3>Cache it</h3>
      <p>A template changes when somebody publishes, which is rarely, and is read on every request, which is
      not. Keep the object&rsquo;s <strong>ETag</strong> and send it back as
      <code>If-None-Match</code>: an unchanged template answers <code>304</code> and costs you nothing.</p>

      <p>A promotion writes identical bytes, so the ETag is the same before and after — moving a release from
      one environment to the next does not invalidate a single cache entry.</p>`)
    ]
  },
  {
    id: 'failure', title: 'When something is wrong',
    blocks: [
      table(['What you see', 'What it usually is'], [
        ['<code>403 AccessDenied</code> on a screen you expect to exist',
         'On AWS, usually <code>s3:ListBucket</code> missing from the read policy — a 404 wearing a costume. See <a href="#permissions">the two policies</a>'],
        ['<code>404 NoSuchKey</code>',
         'That screen is not live on that environment. Check the environment name in the key, then the Studio'],
        ['The Studio says it published, the bucket has nothing',
         'Look at <strong>Settings &rarr; Template storage</strong>. The last error is there, in the provider&rsquo;s words. Fix it, then <strong>Resync</strong>'],
        ['<code>SignatureDoesNotMatch</code>',
         'Usually the region, not the key — an endpoint-less config signs for the region you typed'],
        ['<code>NoSuchBucket</code> on a bucket that exists',
         'Wrong region, or an endpoint that needs path-style. Filling in the endpoint field switches that on']
      ]),

      html(`<h3>The mirror never blocks publishing</h3>
      <p>Every write to the bucket happens <strong>after</strong> the Studio has already committed, and a
      failure is recorded rather than raised. A typo in a bucket name cannot stop somebody shipping a screen,
      and an outage at your provider cannot either.</p>

      <p>The cost of that choice is that the two can drift apart quietly. The storage panel is where drift
      shows up — a last error that has not cleared — and <strong>Resync</strong> is how it is repaired.</p>`),

      note('note', `The Studio keeps serving templates the whole time. If the bucket is empty, stale or
      unreachable, pointing your service back at the Studio is a change of base address and nothing else.`)
    ]
  }
  ]
}
];

renderDocs();
