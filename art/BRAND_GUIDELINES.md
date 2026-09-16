# 🐾 HeimUI — Brand & Design System Guidelines

> **"Heimdall: The All-Seeing Guardian of Server-Driven UI"**
> Official visual identity and branding specifications for the **HeimUI Engine**.

---

## 📖 1. Brand Story & Concept

**HeimUI** takes its name and soul from **Heimdall**, the faithful Australian Cattle Dog (*Blue Heeler*), and the mythological Norse guardian of the Bifrost bridge between realms.

* **The Guardian Mascot:** Just as Heimdall guards the bridge, HeimUI acts as the rock-solid, cryptographic, fail-safe bridge between backend services and native Compose Multiplatform clients (Android & iOS).
* **Visual Metaphor:** The logo fuses Heimdall’s distinctive physical traits (pointed ears, black eye patches, white forehead blaze, tan eyebrow dots) with cybernetic circuitry, UI wireframe nodes, and glowing neon gradients.

---

## 🎨 2. Colour

These are the **brand** colours — the logo, the banner, marketing surfaces.

| Token | HEX | Role |
| :--- | :--- | :--- |
| **Obsidian Dark** | `#0B0F19` | Canvas |
| **Slate Surface** | `#161D2F` | Cards and containers |
| **Electric Cyan** | `#00E5FF` | Primary accent |
| **Neon Violet** | `#A855F7` | Secondary accent |
| **Deep Indigo** | `#4F46E5` | Gradient midtone — logo and banner only |
| **Guardian Tan** | `#D97706` | Brow accent in the mark |
| **Blaze White** | `#FFFFFF` | High-contrast foreground |
| **Muted Smoke** | `#94A3B8` | Secondary text |

```css
/* Primary brand gradient */
background: linear-gradient(135deg, #00E5FF 0%, #4F46E5 50%, #A855F7 100%);
```

> **The app's palette is not here.** It lives in
> [`DemoColors.kt`](../shared/src/commonMain/kotlin/io/heimui/demo/designsystem/tokens/DemoColors.kt),
> which is what the code actually reads — including the semantic colours a brand palette has no
> opinion about (success, warning, error, surface variants).
>
> Restating them here would create two lists that disagree, and they already had: this file
> documented two colours the app never used, and omitted six that it does. A brand palette and a
> product palette are different artefacts with different owners; keeping them in one place makes
> both wrong.

---

## 🔤 3. Typography Hierarchy

### A. Display & Headings: **Plus Jakarta Sans** / **Inter**
* **Usage:** App titles, marketing landing pages, headers, banners.
* **Weights:** `Bold (700)`, `SemiBold (600)`.
* **Letter Spacing:** `-0.02em` (Tight, modern).

### B. Body & UI Controls: **Inter** / **Geist Sans**
* **Usage:** Form fields, descriptions, buttons, dialog messages, table text.
* **Weights:** `Regular (400)`, `Medium (500)`.
* **Line Height:** `1.5` (150%).

### C. Code & Payloads: **JetBrains Mono** / **Fira Code**
* **Usage:** JSON schema previews, SDK code samples, terminal CLI logs.
* **Weights:** `Regular (400)`, `SemiBold (600)`.

---

## 📐 4. Logo Clear Space & Minimum Sizes

```
      ┌───────────────────────────────┐
      │              [ X ]            │
      │       ┌─────────────┐         │
[ X ] │       │   HEIMDALL  │   [ X ] │
      │       │     LOGO    │         │
      │       └─────────────┘         │
      │              [ X ]            │
      └───────────────────────────────┘
  Clear space [X] = 20% of logo width
```

* **Minimum Digital Size:**
  * App Icon / Favicon: `32 x 32 px`
  * Organization Avatar: `180 x 180 px`
  * Header Banner: `1280 x 720 px` (16:9 aspect ratio)
* **Contrast Requirement:** Always display on dark surfaces (`#0B0F19` or `#161D2F`) or inside dark container frames.

---

## 🚫 5. Brand Don'ts
* ❌ Do **not** stretch, skew, or distort the proportions of Heimdall's head.
* ❌ Do **not** alter the signature eye-patch / tan eyebrow dots.
* ❌ Do **not** place the neon logo on bright yellow or light gray backgrounds without a dark backing card.
* ❌ Do **not** add heavy drop-shadows that conflict with the clean cyber glow.

---

## 📂 6. Asset Catalog

* **Avatar (1:1):** `art/heimui-avatar.jpg`
* **Banner (16:9):** `art/heimui-banner.jpg`
* **Vector Logo Mark (SVG):** `art/heimui-logo.svg`
* **Vector Banner (SVG):** `art/heimui-banner.svg`
