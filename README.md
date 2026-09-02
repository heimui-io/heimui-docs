# HeimUI documentation

The site published at **[heimui.io](https://heimui.io)**.

```
index.html    landing — what HeimUI is, and which product you want
sdk/          the mobile SDK: installation, components, actions, extension points
CNAME         the custom domain
```

Static HTML, no build step. Open `index.html` or serve the folder:

```bash
python3 -m http.server 8000
```

## Why the docs live here and not with the code

The SDK, the Studio and the backend are separate products with separate audiences — mobile
engineers, designers, backend teams — but they are one thing to whoever is evaluating HeimUI. One
site with one search beats three that each answer a third of the question.

Keeping it out of any product repo is what makes that possible: `heimui-demo` is a showcase app,
and its repo should not be where Studio's documentation lands.

## Adding a product

Add a folder, add a card to the landing page. `sdk/` is the template — a static `index.html` shell
with the content in a `docs.js` beside it, so writing docs never means touching the layout.

The tone is not the same across products, and that is deliberate: the SDK section is written for
engineers and shows code; Studio is for designers and should show flows and screenshots, with no
Kotlin in sight.
