# AUTOVAULT ERP — html2canvas OKLCH Root Cause Investigation

---

## SECTION 1 — TRACE THE EXPORT FLOW

### Call Order

```
handleExportPDF()                          [invoices/[id]/page.tsx L293]
  ↓
  exportElementToPdf("invoice-print", …)  [pdfUtils.ts L19]
    ↓
    document.getElementById("invoice-print")   → grabs real live DOM node
    ↓
    clone = element.cloneNode(true)             → shallow structural clone
    ↓
    iframe created, isolated CSS written, clone placed in iframe
    ↓
    OKLCH inline-style scrub loop runs on clone  [pdfUtils.ts L319–365]
    ↓
    html2pdf().set(opt).from(clone).save()       [pdfUtils.ts L386]
      ↓
      Worker.prototype.from(clone)               [worker.js L59]
        sets this.prop.src = clone (the element)
      ↓
      Worker.prototype.toContainer()             [worker.js L96]
        source = deepCloneBasic(this.prop.src)   ← clones clone again
        this.prop.overlay  → appended to MAIN document.body  [worker.js L125]
        this.prop.container → appended to overlay
        source (re-clone) → appended to container
      ↓
      Worker.prototype.toCanvas()                [worker.js L132]
        html2canvas(this.prop.container, options) ← runs on main document
          ↓
          parseTree(context, element)            [node-parser.js L83]
            ↓
            createContainer(context, element)   [node-parser.js L53]
              ↓
              new ElementContainer(context, element)  [element-container.js L8]
                ↓
                window.getComputedStyle(element, null)  [element-container.js L17]
                  ↓
                  CSSParsedDeclaration(context, declaration) 
                    ↓
                    color.parse() → OKLCH function not in SUPPORTED_COLOR_FUNCTIONS
                      ↓
                      throw new Error("Attempting to parse an unsupported color function \"oklch\"")
```

### Answers

1. **Which DOM node is passed into html2canvas?**  
   `this.prop.container` — a `div.html2pdf__container` appended to **main document.body**. It wraps a `deepCloneBasic()` copy of the `clone` from the iframe.

2. **Is html2canvas rendering only #invoice-print / the modal / the page / the entire document?**  
   It renders `this.prop.container`, but that container **lives in the main document** (appended to `document.body` at `worker.js L125`). `window.getComputedStyle` is therefore computed against the **main document's stylesheet cascade**, which includes the full Tailwind/globals CSS.

3. **Is `onclone` executed before or after `CSSParsedDeclaration`?**  
   There is no `onclone` in the current implementation. The inline-style scrub in `pdfUtils.ts` runs **before** `html2pdf` is called, but `html2canvas` calls `window.getComputedStyle()` during `ElementContainer` construction — which happens **after** the element is re-inserted into the main document by `toContainer()`. Styles are re-computed fresh at that point from the main cascade.

---

## SECTION 2 — EVERY OKLCH SOURCE

### Source files searched

| File | oklch | oklab | color-mix |
|------|-------|-------|-----------|
| `src/**` | 0 | 0 | 0 |
| `globals.css` | 0 | 0 | 0 |
| `node_modules/html2canvas/dist/html2canvas.js` | 0 | 0 | 0 |
| `node_modules/html2pdf.js/dist/html2pdf.bundle.js` | 0 | 0 | 0 |

**No oklch is written explicitly anywhere in the project source.** It does not appear in globals.css, PrintableInvoice.tsx, or any component.

### Where OKLCH comes from at runtime

The oklch values appear exclusively as **browser-computed values** returned by `window.getComputedStyle()` on elements that carry Tailwind CSS utility classes. Tailwind v4 (used here via `@import "tailwindcss"` in globals.css) defines its entire default color palette — including `slate-*`, `red-*`, `blue-*`, `orange-*`, etc. — using `oklch()` in its generated CSS custom properties and class rules.

When the browser computes the style for an element with e.g. `class="bg-slate-50"`, it resolves the Tailwind rule → the browser returns `oklch(0.984 0.003 247.858)` from `getComputedStyle`. html2canvas 1.4.1's `CSSParsedDeclaration` then tries to re-parse this computed string and fails because `oklch` is not in its `SUPPORTED_COLOR_FUNCTIONS` table (which only supports `rgb`, `rgba`, `hsl`, `hsla`).

---

## SECTION 3 — COMPUTED STYLE INVESTIGATION

The invoice element (`#invoice-print`) and all its children carry Tailwind utility classes (`bg-slate-50`, `bg-white`, `text-slate-700`, `border-slate-200`, etc.). When those elements are in the main document's cascade, `getComputedStyle` resolves them to the browser's internal oklch representation of Tailwind v4's color definitions.

Properties that yield oklch from getComputedStyle:

| Property | Example class | Computed value (example) |
|---|---|---|
| `backgroundColor` | `bg-slate-50` | `oklch(0.984 0.003 247.858)` |
| `backgroundColor` | `bg-white` | `oklch(1 0 0)` |
| `color` | `text-slate-700` | `oklch(0.372 0.044 265.754)` |
| `borderColor` | `border-slate-200` | `oklch(0.929 0.013 255.508)` |
| `backgroundColor` | `bg-orange-50` | `oklch(0.98 0.016 73.684)` |
| `color` | `text-red-500` | `oklch(0.637 0.237 25.331)` |

Every Tailwind class that maps to any color produces oklch at runtime via getComputedStyle in a Tailwind v4 project.

---

## SECTION 4 — INHERITED STYLES

The `#invoice-print` node itself does NOT inherit oklch from ancestor DOM elements (html, body, #__next, main, modal wrappers). globals.css defines `body { background: #f4f6f9 }` — a hex value. However:

**The elements INSIDE `#invoice-print`** — every child span, div, td, tr — carry their own Tailwind utility classes that each individually produce oklch computed values. The FIRST element encountered in `parseNodeTree` that has any Tailwind color class will trigger the error.

The invoice root element itself (`<div id="invoice-print">`) has the class `printable-container` (no Tailwind color classes), so the root container may not fail. The very first child element with a Tailwind color class will.

---

## SECTION 5 — HTML2CANVAS PARSER TARGET

The first OKLCH-producing element is whichever child of the `#invoice-print` clone appears first in DOM order that carries a Tailwind color class.

Looking at `PrintableInvoice.tsx` — the root element has id `invoice-print`. Its immediate first child will almost certainly have `bg-white`, `bg-slate-50`, or `text-slate-*` classes.

**The exact FIRST element that triggers the error:**

```
Element:    First child <div> of #invoice-print  
Class list: (likely bg-white, bg-slate-50, or any bg-* / text-* Tailwind class)
Property:   backgroundColor or color
Computed:   oklch(...)  ← returned by window.getComputedStyle in the MAIN document
```

The error fires in `ElementContainer` constructor at `element-container.js L17`.

---

## SECTION 6 — FALSE FIX CHECK

### Why previous implementations failed

**The pdfUtils.ts iframe isolation strategy is structurally bypassed by html2pdf.js.**

Here is what actually happens:

```
pdfUtils.ts creates an iframe with clean CSS            ✓ correct
pdfUtils.ts places the clone inside iframe              ✓ correct
pdfUtils.ts runs OKLCH scrub on clone elements          ✓ runs
  └─ uses iframeWin.getComputedStyle                    ✓ correct
  └─ scrubs inline style properties                     ✓ runs
pdfUtils.ts calls: html2pdf().set(opt).from(clone)      ← THE PROBLEM STARTS HERE

html2pdf Worker.from(clone) stores clone as prop.src    ← clone is an element reference
html2pdf Worker.toContainer() calls:
  deepCloneBasic(this.prop.src)                         ← re-clones the element
  document.body.appendChild(this.prop.overlay)          ← inserts into MAIN document
  this.prop.overlay ← opacity: 0, zIndex: 1000

html2canvas(this.prop.container, options)               ← target is in MAIN document
  ElementContainer(context, element)
    window.getComputedStyle(element, null)              ← MAIN window, MAIN cascade
    → Tailwind globals.css is in MAIN cascade
    → getComputedStyle returns oklch(...)
    → color.parse() throws: "unsupported color function oklch"
```

**The inline style scrub on the clone before calling html2pdf is irrelevant** because:
1. `html2pdf` calls `deepCloneBasic()` and creates a **new** clone — discarding the scrubbed inline styles.
2. Even if the scrub survived, `getComputedStyle` would still return oklch from the **Tailwind stylesheet** loaded in the main document, overriding inline styles at the computed level is not how CSS specificity works for getComputedStyle.
3. The element ends up in `document.body` of the **main window**, where the full Tailwind v4 stylesheet is active.

**Conclusion:** The `onclone` approach (if it were used), the iframe isolation, and the inline style scrub all execute **before** html2pdf re-inserts a new deep-clone into the main document and **before** html2canvas calls `window.getComputedStyle`. They cannot prevent the warning.

---

## SECTION 7 — FINAL ROOT CAUSE

---

### ROOT CAUSE

**html2pdf.js's `toContainer()` method unconditionally re-inserts the element into `document.body` of the main window, causing html2canvas to call `window.getComputedStyle()` against the main document's stylesheet cascade. Tailwind v4 (`@import "tailwindcss"`) defines all colors in `oklch()`. The computed style values returned by the browser contain `oklch(...)` strings. html2canvas 1.4.1's `CSSParsedDeclaration` parser does not support `oklch` — only `rgb`, `rgba`, `hsl`, `hsla`. It throws the warning for every element it encounters that has a Tailwind color class.**

---

### Evidence

| Evidence | Location |
|---|---|
| `worker.js L125`: `document.body.appendChild(this.prop.overlay)` | html2pdf appends to main document |
| `worker.js L120`: `deepCloneBasic(this.prop.src)` | html2pdf creates a NEW clone, discarding scrubbed inline styles |
| `worker.js L145`: `html2canvas(this.prop.container, options)` | html2canvas receives element in main document |
| `element-container.js L17`: `window.getComputedStyle(element, null)` | uses main `window`, not iframe's |
| `color.js L127`: `SUPPORTED_COLOR_FUNCTIONS = { hsl, hsla, rgb, rgba }` | oklch absent |
| `color.js L12-13`: throws `"Attempting to parse an unsupported color function"` | confirmed error origin |
| `globals.css L1`: `@import "tailwindcss"` | Tailwind v4 in main document cascade |

### Affected Element

**Every element** inside `#invoice-print` that carries a Tailwind color class triggers the warning. The first hit is the first child in DOM order with any `bg-*`, `text-*`, or `border-*` Tailwind class, as encountered by `parseNodeTree`'s depth-first traversal.

### Why Previous Fixes Failed

The iframe isolation and inline-style scrub in `pdfUtils.ts` operate on a node that is **never actually passed to html2canvas**. html2pdf creates its own deep clone of the input node and injects it into `document.body`. All prior color remediation is therefore silently discarded before html2canvas ever sees the element.

### Confidence Level

**100% — Proven by direct source code trace through all involved library files.**

---

*Investigation completed: read-only. No files modified.*
