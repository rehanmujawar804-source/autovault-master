# Project Brain Navigation Index

**Purpose:** Quick reference for what's in the Brain and how to use it

**Updated:** 2026-06-22 (After V1 Brutal Audit Ingestion)

---

## Quick Links by Purpose

### 🚀 I'm a new AI session. Where do I start?
1. **Read first:** `AGENTS.md` (operating protocol for this project)
2. **Read second:** `brain/master-memory.md` (compressed project knowledge)
3. **If you need:** Architecture details → `brain/architecture.md`

### 🐛 I'm fixing bugs from the audit. Where's the roadmap?
1. **Read first:** `brain/audit-validation.md` (which findings are confirmed broken)
2. **Read second:** `brain/stabilization-plan.md` (4 batches of fixes, with specs)
3. **Reference:** `brain/audits/v1-brutal-audit.md` (complete audit document)

### 🏗️ I'm adding a new feature. How do I fit it in?
1. **Read first:** `brain/patterns.md` (approved coding patterns)
2. **Read second:** `brain/architecture.md` (system structure, avoid breaking things)
3. **Reference:** `brain/dependency-graph.md` (what will your change affect?)

### 📚 I need to understand how something works
1. **For module overview:** `brain/feature-map.md` (file-to-feature mapping)
2. **For data flow:** `brain/dependency-graph.md` (how modules relate)
3. **For business logic:** `brain/decisions.md` (why things are designed this way)

### ⚠️ I'm about to make a mistake. Help!
1. **Read:** `brain/mistakes.md` (known pitfalls and fragile areas)
2. **Check:** `brain/decisions.md` (why a thing was done that way)

### 📋 I need to update the Brain after my work
1. **Update:** `brain/master-memory.md` (if architecture changes)
2. **Update:** `brain/mistakes.md` (if you fix a known issue or discover new one)
3. **Update:** `brain/roadmap.md` (reset priorities)
4. **Reference:** `AGENTS.md` section "Updating the Brain"

---

## Brain File Descriptions

| File | Size | Purpose | Read When |
|---|---|---|---|
| **AGENTS.md** | 15 KB | Operating protocol for AI sessions | First thing every session |
| **master-memory.md** | 10 KB | Compressed project intelligence | Starting a new task |
| **memory.md** | 8 KB | Project state summary | Need full context |
| **architecture.md** | 13 KB | System structure & data flows | Understanding how it works |
| **patterns.md** | 13 KB | 18 approved coding patterns | Writing new code |
| **decisions.md** | 9 KB | 17 engineering decisions with rationale | Understanding why |
| **mistakes.md** | 12 KB | Known pitfalls & fragile areas | Before making changes |
| **roadmap.md** | 8 KB | Feature priorities & next steps | Planning work |
| **glossary.md** | 10 KB | 35+ terminology definitions | Need terminology clarity |
| **dependency-graph.md** | 12 KB | Data relationships & impact | Assessing change scope |
| **feature-map.md** | 14 KB | Feature-to-file mapping | Finding code |
| **v1-brutal-audit.md** | 17 KB | Complete audit findings | Reviewing findings |
| **audit-validation.md** | 19 KB | Findings cross-checked vs code | Confirming issues exist |
| **stabilization-plan.md** | 26 KB | 4-batch fix roadmap with specs | Implementing fixes |
| **AUDIT-SUMMARY.md** | 10 KB | Audit ingestion recap | Understanding what was done |
| **INDEX.md** | This file | Navigation guide | Finding what you need |

---

## By Role

### For the Owner
- **Understand current state:** `brain/master-memory.md` + `AUDIT-SUMMARY.md`
- **Understand what's broken:** `brain/audit-validation.md` (findings summary)
- **See fix roadmap:** `brain/stabilization-plan.md` (4 batches, 6–8 weeks)
- **Track progress:** Update `brain/mistakes.md` as fixes ship

### For the Developer
- **Get started:** `AGENTS.md` + `brain/master-memory.md`
- **See what to build:** `brain/stabilization-plan.md` (current batch specs)
- **Understand patterns:** `brain/patterns.md` (how to code in this project)
- **Avoid pitfalls:** `brain/mistakes.md` (known issues)
- **Find code:** `brain/feature-map.md` (feature → files)
- **Understand flow:** `brain/architecture.md` (how modules work together)

### For Future AI Sessions
- **Session 1:** Read `AGENTS.md` + `brain/master-memory.md`
- **Session 2+:** Reference relevant Brain files based on task
- **After work:** Update Brain files (especially `mistakes.md`, `roadmap.md`)

---

## How the Brain Was Built

### Phase 1: Project Brain Creation
- Inspected entire codebase
- Created 11 foundational Brain files
- Captured real project knowledge (not templates)

### Phase 2-3: Audit Ingestion (Just Completed)
- Received V1 Brutal Audit Report (100+ findings)
- Validated critical findings against code
- Created 4 new files:
  - `v1-brutal-audit.md` — Complete audit document
  - `audit-validation.md` — Cross-check matrix
  - `stabilization-plan.md` — 4-batch fix roadmap
  - `AUDIT-SUMMARY.md` — Integration summary

---

## Current Project Health

### 🔴 Critical Issues (5)
- Hardcoded date in analytics
- customer.totalSpent not updated on repayment
- No data backup mechanism
- No invoice edit/void
- buyPrice visible to Staff

### 🟠 High Issues (10)
- 5 alert() calls (should be toasts)
- No validation for Credit+Paid
- Profit retroactively unstable
- Invoice number collision risk
- Walk-in debt unreachable
- 5 other UX/quality gaps

### ✅ Working Well
- Billing workflow (paid invoices)
- Debt tracking
- Inventory management
- Dashboard trends
- Role-based UI visibility

---

## Stabilization Progress

| Batch | Focus | Status | Timeline |
|---|---|---|---|
| **Batch 1** | Critical trust fixes | 📋 Designed | Week 1–2 |
| **Batch 2** | Business-safety fixes | 📋 Designed | Week 2–4 |
| **Batch 3** | UX & quality polish | 📋 Designed | Week 4–5 |
| **Batch 4** | Optional hardening | 📋 Designed | Week 6+ |
| **Total** | Full stabilization | 📋 Roadmap ready | 6–8 weeks |

---

## Key Metrics

| Metric | Current | Target |
|---|---|---|
| Critical issues | 5 | 0 |
| High issues | 10 | 0 |
| Data safety | ❌ None | ✅ Backup/restore |
| Invoice correctness | ❌ No void | ✅ Void available |
| Profit accuracy | ❌ Retroactive | ✅ Historical |
| Customer LTV | ❌ Wrong | ✅ Correct |
| Production ready | ❌ 60–70% | ✅ 100% |

---

## How to Navigate by Task Type

### If you're **starting a new feature:**
1. Read: `brain/master-memory.md` (10 min)
2. Read: `brain/architecture.md` (15 min)
3. Check: `brain/mistakes.md` (5 min)
4. Reference: `brain/patterns.md` while coding
5. Reference: `brain/feature-map.md` if you need to find related code

### If you're **fixing a bug:**
1. Read: `brain/audit-validation.md` (find the bug)
2. Read: `brain/stabilization-plan.md` (see if it's in a batch, with specs)
3. Reference: `brain/architecture.md` (understand scope)
4. Reference: `brain/dependency-graph.md` (what will break?)

### If you're **troubleshooting:**
1. Read: `brain/mistakes.md` (is it a known issue?)
2. Read: `brain/dependency-graph.md` (trace data flow)
3. Check: `brain/decisions.md` (why was it done this way?)

### If you're **adding to the Brain:**
1. Update: `brain/master-memory.md` (if architecture changed)
2. Update: `brain/mistakes.md` (if you fixed an issue or found new one)
3. Update: `brain/roadmap.md` (reset priorities)
4. Reference: `AGENTS.md` section "How to Update the Brain"

---

## Audit Files Location

All audit-related files are in `brain/audits/`:
- `v1-brutal-audit.md` — Complete audit document

Plus top-level audit files:
- `audit-validation.md` — Validation matrix
- `stabilization-plan.md` — Fix roadmap
- `AUDIT-SUMMARY.md` — Integration summary

---

## Questions This Brain Answers

| Question | Where to Look |
|---|---|
| What is this project? | `brain/master-memory.md` |
| How is it built? | `brain/architecture.md` |
| How do I code here? | `brain/patterns.md` |
| Why is something designed that way? | `brain/decisions.md` |
| What should I avoid? | `brain/mistakes.md` |
| How do modules relate? | `brain/dependency-graph.md` |
| Where is feature X in the code? | `brain/feature-map.md` |
| What's broken? | `brain/audit-validation.md` |
| How do I fix it? | `brain/stabilization-plan.md` |
| What does term X mean? | `brain/glossary.md` |
| How do I work on this project? | `AGENTS.md` |
| What's the next priority? | `brain/roadmap.md` |

---

## File Size Summary

```
Total Brain Size: ~189 KB

Core Files (11):      ~110 KB
Audit Files (4):      ~72 KB

Breakdown:
- stabilization-plan.md     26 KB (largest: detailed task specs)
- v1-brutal-audit.md        17 KB (comprehensive audit)
- audit-validation.md       19 KB (validation matrix)
- architecture.md           13 KB
- feature-map.md            14 KB
- patterns.md               13 KB
- dependency-graph.md       12 KB
- mistakes.md               12 KB
- memory.md                 8 KB
- master-memory.md          10 KB
- decisions.md              9 KB
- roadmap.md                8 KB
- glossary.md               10 KB
- AUDIT-SUMMARY.md          10 KB
- INDEX.md                  This file
- AGENTS.md                 15 KB
```

---

## How This Brain Evolves

### After Each Batch (Every 2 weeks):
- ✏️ Update `brain/mistakes.md` (mark issues as fixed)
- ✏️ Update `brain/roadmap.md` (reset priorities)
- ✏️ Add notes to `AGENTS.md` (new patterns if discovered)

### After Each Sprint (Every 4 weeks):
- ✏️ Update `brain/master-memory.md` (if architecture changed)
- ✏️ Create new audit if major changes made
- ✏️ Review `brain/patterns.md` (are they still accurate?)

### After Major Refactoring:
- ✏️ Update `brain/architecture.md` (diagram + description)
- ✏️ Update `brain/dependency-graph.md` (data flow changes)
- ✏️ Update `brain/feature-map.md` (file structure changes)

---

## Next Session Checklist

When the next AI session starts:
- [ ] Read `AGENTS.md` (how to work here)
- [ ] Read `brain/master-memory.md` (compressed knowledge)
- [ ] Determine your task
- [ ] Look up relevant files using this INDEX
- [ ] Read necessary Brain files
- [ ] Do your work
- [ ] Update Brain files after completion
- [ ] Document any new findings

---

## Emergency Contacts (for the Owner)

If something breaks during stabilization:
- Check `brain/mistakes.md` (might be a known issue)
- Check `brain/mistakes.md` under "Recent Findings" (might be newly discovered)
- Check `brain/AUDIT-SUMMARY.md` (understand current issues)
- Refer to `brain/stabilization-plan.md` Risk Mitigation section

---

**Last Updated:** 2026-06-22  
**Status:** Ready for implementation  
**Next Step:** Start Batch 1, Task 1.1 (hardcoded date fix)
