# AutoVault Inventory — Senior Product Designer UX Audit

---

## Executive Summary

AutoVault's Inventory module is **functionally complete and technically sophisticated.** The data model is rich — stock movements, margin tracking, vehicle fitments, intelligence insights, bulk operations — this is genuine ERP territory.

The problem is not what exists. The problem is **how it is presented.**

The module currently communicates like a dashboard that was built feature-by-feature, with each component designed in isolation. The result is a screen where everything demands equal attention simultaneously. There is no clear primary story. A user who opens Inventory today has to do real cognitive work to understand what they are looking at, what matters, and what to do next.

That is the single largest gap between AutoVault and the enterprise products it should compete with. Those products — Zoho, Odoo, Stripe, Linear — do not show you everything at once. They decide what matters most, make it obvious, and let the rest recede. AutoVault has not made those decisions yet.

The module has all the right ingredients. It needs a hierarchy layer applied on top of what already exists.

---

## Overall UX Score

**5.8 / 10**

| Dimension | Score |
|---|---|
| Information Architecture | 5 / 10 |
| Visual Hierarchy | 5 / 10 |
| Dashboard Quality | 5 / 10 |
| Table Experience | 6 / 10 |
| Product Details Experience | 6 / 10 |
| Stock Movement | 7 / 10 |
| Forms | 6 / 10 |
| Consistency | 6 / 10 |
| Responsive Experience | 5 / 10 |
| Commercial Product Feel | 5 / 10 |

---

## Major UX Problems (Ranked by Importance)

---

### Problem 1 — The page has no primary message

**Severity: Critical**

When a user opens the Inventory page, six KPI cards, an "Operations Control Room" panel, a sticky filter bar, quick-filter chips, and a full data table all appear simultaneously. Every element is rendered with equal visual weight. Nothing says: *this is what you should look at first.*

In Zoho Inventory, when you open the Inventory module, you immediately understand two things: your current stock health, and what needs action. Everything else is secondary context available on demand.

In AutoVault, the hierarchy is flat. The KPI cards carry the same visual intensity as the table rows. The "Operations Control Room" (a secondary insight panel) occupies the same vertical rhythm and visual weight as the primary KPI cards above it. The quick-filter chips sit in their own row below the sticky toolbar, creating a third consecutive band of UI at the top of the page before the user reaches the actual data.

The page has **four distinct horizontal bands** before a single product row is visible:
1. KPI Cards (6 columns)
2. Operations Control Room (6 columns)
3. Sticky Toolbar (search + 5 filters + 4 action buttons)
4. Quick Filter Chips (6 chips)

This is not information architecture — it is feature accumulation. A user at 1366px would see all four bands and possibly only the top 1–2 rows of the table. The thing they came to use — the product list — is below the fold.

**Why it matters:** A user doing a quick stock check should not have to scroll past an intelligence panel to find their product. The intelligence panel should feel lighter and secondary to the product table, not co-equal with it.

---

### Problem 2 — The Operations Control Room competes with the KPI Cards

**Severity: High**

The KPI Cards (Total Products, Stock Units, Inventory Value, Low Stock, Out of Stock, Capital Invested) and the Operations Control Room ("Inventory Health", "Capital Focus", "Restock Priority", "Avg. Margin", "Top Category", "Top Product") are two different things fighting for the same role.

The KPI Cards answer: *what is my inventory state right now?*
The Operations Control Room answers: *what should I think about this inventory state?*

These are sequentially logical — you look at the state, then you interpret it. But visually they are presented as peers: same width, same horizontal rhythm, same grid structure, similar card treatment.

The Operations Control Room also duplicates information. "Top Category" appears in both Section 2 and Section 5 of the panel. "Capital Focus" and "Top Category" both show `insights.topCategory`. This creates confusion — why are two of the six slots showing the same data?

**Why it matters:** The panel occupies significant vertical space (approximately 80–120px) but its six-column layout means each cell is extremely narrow at typical screen widths. The result is content that feels cramped and hard to read — especially "Capital Focus" and "Top Product" which try to display names that frequently get truncated.

---

### Problem 3 — The table row is too dense with competing signals

**Severity: High**

Each product row in the table currently presents:
- A colored left accent border (red / amber / green — always visible)
- Product name + SKU (in the Product column)
- SKU again as a separate click-to-copy chip (in the SKU column)
- Brand (text)
- Category (pill badge)
- Status (colored badge: Active / Inactive / Discontinued)
- Stock count + mini progress bar + status label (three-layer stock cell)
- Buy price
- Sell price
- Margin (colored badge)
- 4 action icon buttons

That is 11–12 distinct elements in a single table row. Each element has its own color, weight, or shape. Every row looks exactly like every other row.

The result is a table that is **wide but not scannable.** A user who wants to quickly find the low-stock products has to parse each row completely to find what they need. The left accent border (green for healthy, red for out of stock) is the only quick-scan signal — and it competes with the colored margin badges, the colored status badges, and the colored stock labels within the cell.

**Why it matters:** Premium ERP tables — Stripe, Odoo, Zoho — achieve scannability by having one strong primary signal per row and letting everything else recede. In AutoVault's table, every column screams simultaneously.

---

### Problem 4 — The Product Details page feels like a card dump, not a workspace

**Severity: High**

The Product Details page opens with 10 KPI cards in a fixed-height grid, then a tab navigation, then a tab content area, then a right sidebar. The structure is logical — it is a standard ERP detail layout — but the execution feels disconnected.

**The KPI card grid** (10 cards: Current Stock, Opening Stock, Reserved Stock, Available Stock, Inventory Value, Cost, Sell Price, Unit Profit, Margin, Capital Invested) are all the same size, same color (white), same border, same shadow. They are visually undifferentiated. There is no sense of which metric is primary. "Current Stock" — the single most important number on this page — gets the same visual treatment as "Reserved Stock" (which is always 0 in the current implementation) and "Capital Invested."

**The tab navigation** (Overview, Stock, Sales History, Purchase History, Stock Movement, Compatible Vehicles) contains six tabs. This is a lot. On first load, the Overview tab shows two sub-sections: "Product Profile" (3 numbers) and "Inventory Intelligence" (5–6 cards). The distinction between these sub-sections and the KPI grid above them is unclear — the user is now looking at approximately 16 data points before reaching the tab-specific content.

**The right sidebar** contains System Metadata (Created At, Last Modified, Supplier Code, Tax GST, Low Alert Threshold), a Warehouse Location field (always "Not Assigned"), and a Local Notes textarea (explicitly labeled "not persisted"). This sidebar exists for all users in all contexts, but most of the content is either static or empty.

**Why it matters:** A workspace should tell a story — this product's most important status, what happened recently, what needs attention. The current page presents all data at equal weight. A user has to read and interpret everything themselves.

---

### Problem 5 — Animated elements create noise instead of signal

**Severity: Medium**

Two elements use `animate-pulse` (CSS animation) in non-emergency contexts:
1. The "Discontinued" lifecycle badge in the Product Details header pulses continuously.
2. The "Restock Recommendation" value pulses when there is a restock suggestion.

Animation in enterprise software should communicate urgency or state change — not status. A Discontinued badge is a permanent product state; it does not need to pulse. A restock recommendation is useful information; pulsing text makes it feel like an error state.

Additionally, the KPI cards animate on hover (`hover:-translate-y-1`). KPI cards are not interactive — they display data. Applying a button-hover behavior (lifting on hover) to a non-clickable element creates a false affordance.

**Why it matters:** When everything animates, nothing feels urgent. When KPI cards lift like buttons, users may expect to click them and be confused when nothing happens.

---

### Problem 6 — The sticky toolbar is too wide for its content

**Severity: Medium**

The filter toolbar contains: a search input, a Category select, a Brand select, a Status select, a Stock select, a Sort select, a Reset button (conditional), an Export button, an Import button, and an Add Product button. That is 10 potential elements in a single horizontal row.

On a 1366px laptop screen, these wrap unpredictably. The action buttons (Export, Import, Add Product) are in the same flex row as the filter selects. There is no visual separator between "I am filtering" and "I am taking an action." A user who wants to add a product has to visually parse through five filter controls to find the Add button.

Below the toolbar sit six quick-filter chips (All, Healthy, Low Stock, Out of Stock, Inactive, Discontinued). These chips duplicate the functionality of the Stock and Status selects in the toolbar. A user can achieve "Low Stock" three different ways: the Stock select, the Stock chip, or the Ctrl+F shortcut. This redundancy is not harmful, but it adds visual mass to the top of the page without clarity.

---

### Problem 7 — The expanded row panel has a trust problem

**Severity: Medium**

When a product row is expanded, three sub-panels appear: "Vehicle Compatibility," "Recent Activity Ledger," and "Inventory Intelligence."

The "Recent Activity Ledger" panel shows hardcoded static data — three fixed entries ("Stock adjustment manually performed June 20, 2026", "Invoice INV-2026-004 checkout", "Invoice INV-2026-001"). This data is not derived from the actual product. It appears for every single product in the inventory, including products that have never been sold or adjusted.

**This is a critical trust issue.** A warehouse manager who notices that the "Recent Activity" for a product they added yesterday shows an invoice from June 2026 will immediately lose confidence in the entire interface. Presenting fake data in an operational ERP context is not a minor visual problem — it undermines the product's credibility.

---

## Minor UX Problems

### Minor 1 — The empty state for "No Inventory" is generic

The empty warehouse state shows a Package icon and the text "Warehouse is Empty." This is correct behavior, but the state does not communicate what the user should do next. There is one CTA ("Add First Product"), but no explanation of how to use CSV import, what fields are required, or what the expected workflow is. First-time users are left to figure it out.

Zoho Inventory's empty states include a "Get Started" flow that walks users through their first product. AutoVault's empty state is a dead end.

### Minor 2 — "Stock Movement" tab and "Recent Activity" in expanded row overlap in purpose

The expanded row in the list page shows "Recent Activity Ledger." The Product Details page has a dedicated "Stock Movement" tab with a full timeline. These serve the same informational purpose. A user who sees the "Recent Activity" in the list and then clicks through to the detail page will see a different (real, accurate) timeline in the Stock Movement tab. This inconsistency erodes trust.

### Minor 3 — The "disabled" Movement History button has no explanation

In every table row's action column, there is a greyed-out ArrowUpDown icon button labeled "Movement history (coming soon)." This is a dead button — it cannot be clicked, it does nothing, and it sits between active action buttons (View, Adjust Stock, Edit). Its presence creates confusion: why is this here? What is it? Is it broken?

A feature that is not available should either be invisible or clearly deferred (with a meaningful tooltip). "Coming soon" is developer language, not user language.

### Minor 4 — The "Local Notes" textarea in the sidebar is misleading

The sidebar on the Product Detail page includes a textarea labeled "Local Notes (Not Synced)" with a disclaimer that notes "reside inside this tab session only and will not be persisted to localStorage." This means the notes disappear the moment the user navigates away. A user who types important stock notes in this field and then refreshes the page will lose them. This is a significant user expectations problem — a textarea in a sidebar looks like it saves. The disclaimer is in 9px italic text that most users will not read.

### Minor 5 — The "Inventory Intelligence" section on the Overview tab duplicates the expanded row panel

The Overview tab in Product Details contains an "Inventory Intelligence" grid that shows: Stock Health, Sales Velocity, Restock Recommendation, Profitability Rating, Days Since Last Sale, Dead Stock Status. The expanded row panel in the list already shows "Inventory Intelligence" with Stock Status, Suggested Order, and Replenishment Lead. Different labels, same concepts. A user navigating between both views will encounter the same ideas framed differently, creating unnecessary cognitive load.

### Minor 6 — Sales History tab title is inconsistent with the section heading

The tab label says "Sales History." The section heading inside the tab reads "Dynamic Invoiced Orders." These are different names for the same concept. Enterprise software should be consistent — pick one term and use it everywhere.

### Minor 7 — The "Stock Settings" tab shows warehouse and tax fields that are always empty

The Stock tab in Product Details shows six fields in a key-value grid. Three of them ("Shelf/Bin location assignment," "Tax GST classification," "HSN code number") are always blank or show "—" unless the user has configured these values. On a fresh installation, this tab reads as three fields with real data (Low Stock Threshold, Opening Stock, Current Stock) and three fields that are empty. This makes the tab feel incomplete.

---

## Design Language Issues

**The design system has three different levels of seriousness happening simultaneously:**

1. **Premium signals:** Dark navy KPI cards, amber CTAs, the "Operations Control Room" branding, the circular health gauge SVG — these elements say "professional enterprise software."

2. **Functional signals:** The table structure, the filter toolbar, the badge system, the tab navigation — these are competent and standard.

3. **Overly-exuberant signals:** `animate-pulse` on static labels, `hover:-translate-y-1` on data cards, a "decorative blob" inside KPI cards, "Operations Control Room" as a panel title (this sounds more like a crisis response center than an ERP widget) — these elements undercut the premium signals.

**The tone is inconsistent.** The same page that uses sophisticated terms like "Capital Focus," "Restock Priority," and "Avg. Margin" also has pulsing badges and lifting cards. Enterprise software does not pulse. Enterprise software does not lift. Enterprise software communicates state through clear typography and purposeful color, not animation.

**Badge taxonomy is inconsistent across screens:**
- The list page uses pill-shaped badges for status (rounded-full)
- The detail page uses the same pills
- The stock movement timeline uses square-cornered type labels
- The expanded row uses yet another badge shape for fitment tags
- Category chips in the table use a pill-different shape than status badges

A user reading badges across these screens cannot build a mental model of what each shape means. In Stripe or Linear, badge shapes have semantic meaning: pills are statuses, rectangles are categories, outlined badges are secondary labels.

**Icon usage has no clear semantic system:**
- `Info` is used for "Vehicle Compatibility" (the expanded row)
- `Info` is also used for the "No Fitment Configured" empty state (the vehicles tab)
- `Activity` is used for "Stock Units" KPI and also as the Operations Control Room icon
- `TrendingUp` is used for "Inventory Value" KPI and also for "Capital Focus" in the Control Room

When the same icon carries multiple meanings on the same page, the icon system stops communicating meaning and becomes decoration.

---

## Information Architecture Issues

### The Inventory List page is trying to be three things at once

It is simultaneously:
- **A dashboard** (KPI cards + Operations Control Room)
- **A command center** (filter toolbar + chips)
- **A data grid** (the product table)

In mature ERP products, these roles are separated — either through progressive disclosure (the dashboard is collapsed by default), page sections with clear visual weight differences (the dashboard is small, the table is dominant), or separate pages (a summary dashboard vs. a data grid).

AutoVault puts all three at full weight on one page. The result is that none of the three experiences feel complete.

### The Product Details page has the right sections in the wrong proportion

The 10-card KPI grid at the top is the right idea — show the key numbers before anything else. But the grid treats all 10 numbers as equal. The most important number for most users is "Current Stock." The most important number for owners is "Margin." These should dominate visually. The rest should be available but recede.

The right sidebar (Metadata + Warehouse + Notes) is always 3 columns wide and always sticky. This is a substantial portion of screen real estate devoted to content that is almost always empty or unchanging. Odoo's product detail sidebar is collapsible. Notion's property sidebar fades to secondary. AutoVault's sidebar is always equally present, always equally prominent.

### The tab structure does not follow the user's natural mental model

The tabs are: Overview → Stock → Sales History → Purchase History → Stock Movement → Compatible Vehicles.

A typical warehouse manager thinks about a product in this sequence:
1. What is this product and how much do I have? (Overview / Stock)
2. What has happened to it? (Stock Movement)
3. Who bought it? (Sales History)
4. Where did it come from? (Purchase History)
5. What vehicles does it fit? (Compatible Vehicles)

The current order puts Sales History before Stock Movement, which means to understand *why* stock changed, the user has to click past the Sales tab to the Movement tab. In every major ERP (Odoo, Zoho, ERPNext), the stock ledger comes before or alongside the sales history, not after it.

---

## Enterprise ERP Comparison

### What AutoVault has that these products don't

- **Vehicle fitment tracking** is unique and genuinely valuable for auto parts businesses
- **Inline row expansion** (expanding a product row for quick context) is smoother than Odoo's approach, which navigates to a new page
- **The bulk fitment operation** is an impressive feature that most ERP products don't have
- **Real-time health gauge** in the Operations Control Room is more visually sophisticated than Zoho's flat status indicators

### What these products do that AutoVault doesn't

**Zoho Inventory:**
- The product list has a "low stock" alert banner at the top that shows only when there are urgent items — not always. AutoVault's "Operations Control Room" is always present, urgent or not.
- Table rows have a single, clear visual hierarchy: product name is large and prominent, everything else is smaller and secondary.
- Status badges are minimal: just text, no dot indicators.

**Odoo Enterprise:**
- Product cards on the list view are switchable between list and kanban — users can choose their preferred density.
- The product detail page has a clear "top line" section (name, reference, image, tags) and a "detail" section below, with a clear visual break.
- Form views have a clear section-based structure with visible section labels that group related fields.

**Stripe Dashboard:**
- Everything on a detail page has a clear primary metric. For a payment, it is the amount. For a product, it would be the revenue. Everything else supports that number.
- Actions are placed in a consistent location (top right) and never mixed with data fields.
- Empty states always explain what data would appear here and how to get it.

**Linear:**
- The filter bar is not always visible — it appears when needed and collapses when not. AutoVault's filter toolbar is always present and always the same size regardless of context.
- Status labels are used consistently — the same label format appears in every context.

**SAP Fiori:**
- The product detail page has a "smart business" section at the top — a curated set of 3–5 KPIs chosen based on context (if stock is low, the stock KPI is prominent; if it's healthy, margin is prominent). AutoVault shows all 10 cards always.
- Table column alignment is strict and consistent across all tables in the system.

**What makes these products feel premium that AutoVault currently lacks:**
1. **Editorial decisions about what matters most** — they choose what to emphasize; AutoVault emphasizes everything
2. **Consistent interaction patterns** — every action, hover, focus, and state follows the same rules everywhere
3. **Purposeful empty states** — they guide users toward productive next actions
4. **Animation used only for transitions, not for state** — movement communicates change, not importance

---

## What Should Be Improved

1. **Give the page a primary message.** The table is the main feature. The KPI row and control room should feel lighter — summary context that gives way to the table, not competes with it.

2. **Reduce the visual mass at the top of the Inventory list.** Before a user sees a single product, they scroll past KPI cards, an intelligence panel, a toolbar, and chips. This sequence needs to breathe and recede.

3. **Make the product table scannable at a glance.** One strong signal per row (stock health via the left accent), with everything else available but not shouting.

4. **Establish a consistent badge system.** Decide what pill shapes mean, what rectangle shapes mean, and use them that way everywhere in the module.

5. **Remove animation from non-interactive, non-urgent elements.** KPI cards should not lift on hover. Static state badges should not pulse.

6. **Address the fake "Recent Activity" data in expanded rows.** This is a trust problem. If real data is not available in that context, the panel should be honest about it.

7. **Give the Product Details page a clear primary metric.** "Current Stock" should visually dominate the KPI grid. Everything else should be secondary.

8. **Improve the Product Details tab order.** Move "Stock Movement" closer to the front — it is the most operationally important tab after Overview.

9. **Give the Warehouse / Local Notes sidebar meaningful empty states.** Not just blank fields, but clear guidance on what would appear there and when.

10. **Standardize the icon system.** The same icon should not mean two different things on the same page.

---

## What Should NOT Be Changed

1. **The vehicle fitment system** — it is functionally complete and genuinely differentiated. Only the presentation needs refinement.

2. **The Operations Control Room concept** — having a real-time intelligence panel is a great idea for an ERP. The concept is right; the execution and visual weight need refinement.

3. **The sticky filter toolbar** — being able to filter without scrolling back to the top is essential for a long product list. Keep it sticky.

4. **The stock movement timeline** (on the Product Detail page) — the vertical timeline with color-coded nodes is the strongest visual pattern in the entire module. It communicates clearly.

5. **The bulk fitment workflow** — selecting multiple products and applying fitments in one operation is powerful. Don't change the interaction.

6. **The quick-filter chips** — they provide fast access to common filter states. Keep them, but consider integrating them more tightly with the toolbar.

7. **The expandable row concept** — giving users a quick preview without navigating away is the right UX pattern for an ERP list. Keep it.

8. **The KPI cards** — the concept of showing summary KPIs at the top is correct. The visual treatment is the issue, not the concept.

9. **The tab structure on Product Details** — six tabs is appropriate for a product with this many data dimensions. Don't collapse or merge tabs.

10. **The dark navy "Capital Invested" KPI card** — the visual contrast makes it immediately clear this is premium/owner-only information. This is smart design and should be preserved.

---

## Final Recommendations

AutoVault's Inventory module needs **one thing above all else:** a decision about what matters most, applied consistently across every screen.

Right now, the product presents all features with equal confidence. Enterprise users don't want confidence — they want clarity. They want to open a page and immediately know: am I okay, or do I have a problem?

That question can be answered by the existing data. The module already computes health scores, critical counts, margin averages, and stock alerts. The data is there. It just needs to be given a hierarchy.

The specific work needed is not a redesign. It is a hierarchy pass:

- Make the table dominant on the list page.
- Make "Current Stock" dominant on the detail page.
- Make the Operations Control Room feel like a secondary panel, not a co-equal dashboard.
- Remove animation from static states.
- Establish and enforce a consistent badge vocabulary.
- Fix the trust issue with fake activity data.

When those things are done, AutoVault's Inventory module will feel like software that a business can trust — which is the only thing that matters in an ERP.

---

*UX Audit Complete. Waiting for approval before preparing the implementation specification.*
