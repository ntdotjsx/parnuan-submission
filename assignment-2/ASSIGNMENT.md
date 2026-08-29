# Parnuan Software Engineer Intern — Assignment 2 (Optional Bonus)

## Assignment: Teach Parnuan to Remember

> **This assignment is optional.** Attempt it only after you're happy with Assignment 1. A strong Assignment 1 alone is better than a weak Assignment 1 + 2.

---

## Overview

In Assignment 1, you built a parser that turns free-form text into structured transactions. It probably guesses a category based on rules, an LLM, or a dictionary — the same way for every user.

But users have their own habits. One person's `ข้าวมันไก่` lives under `อาหาร`. Another person records it under `ข้าวเช้า`. A third splits lunch and dinner.

**Parnuan should learn each user's habits from their own transaction history — and re-apply what it learns automatically on future entries.**

This assignment is about the memory layer that sits on top of your parser. It is **not** about explicit "teach me" corrections. Memory is built **passively from the user's past transactions**, and it updates whenever those past transactions change.

We care about:

- how you model personal memory
- how you decide when memory should override the parser
- how you keep memory in sync when transactions are edited or deleted
- how you handle conflicts, ambiguity, and bad learning signals
- how you make the behavior transparent to the user

---

## What You Are Given

- A small set of screenshots showing the memory flow (see `screenshots/`)
- This assignment spec
- Your own Assignment 1 output as a starting point

You should reverse-engineer the intended behavior from the screenshots. Some details are intentionally unspecified. Make reasonable assumptions and document them.

---

## Product Context

Observed behavior from the screenshots:

1. A user sends a message. Parnuan parses it and **auto-categorizes** the transaction — using either the default parser, or the user's own memory if a match exists.
2. Parnuan builds memory **passively** from the user's past transactions. Every confirmed transaction is a learning signal.
3. When a user **edits** an existing transaction (e.g. changes its category from `อาหาร` to `ข้าวเช้า`), Parnuan:
   - updates the transaction
   - **updates the underlying memory** so the new categorization applies to future matching entries
   - confirms the memory update to the user ("อัปเดตความจำแล้ว")
4. There is a **settings toggle** ("จัดหมวดด้วยความจำ") that lets users enable or disable memory-based categorization entirely.
5. When enabled, Parnuan both **learns from new entries** and **auto-applies memory** to matching ones.

The key insight: memory is a **derived view of the user's own transaction history**, not a separate "corrections" database. If the history changes, memory changes with it.

---

## Requirements

Build a **proof of concept** for the memory layer.

Your solution should:

1. Accept a parsed transaction (reuse Assignment 1, or stub it if needed)
2. Apply the user's **existing memory** to override/augment the parser's default category when a match exists
3. **Learn** from every newly confirmed transaction so future matches benefit
4. When a past transaction is **edited or deleted**, update the memory accordingly so it stays in sync with the transaction history
5. Expose a way to **enable / disable** memory (mirror the settings toggle)
6. Make memory state **inspectable** — the user (and the reviewer) should be able to see what's been learned and why

You are free to decide:

- matching strategy (exact string, normalized, embedding, fuzzy, etc.)
- storage (in-memory, SQLite, JSON file, Mongo — anything)
- scope of memory (per user is fine; global is not)
- UI / API / CLI format
- confidence / conflict resolution rules
- what "memory" keys on (description? normalized description? something else?)
- whether memory is materialized (precomputed) or derived on the fly from transactions

---

## Required Demo Cases

Your submission must demonstrate at least these 3 flows:

### 1. Passive learning from history

- Start with empty memory
- User records a few `ข้าวมันไก่` transactions categorized as `อาหาร`
- User records `ข้าวมันไก่ 50` again → system auto-suggests `อาหาร` from learned memory (not just the default parser)
- Show that memory was built without the user being asked to "teach" anything

### 2. Memory updates when a past transaction is edited

- User has several `ข้าวมันไก่ → อาหาร` entries in history
- User edits one (or more) of those entries, changing the category to `ข้าวเช้า`
- Memory updates to reflect the new preference
- The next `ข้าวมันไก่` entry is categorized according to the updated memory
- Bonus: show how your system decides *how much weight* one edit carries vs many historical entries

### 3. Memory disabled

- Toggle memory off
- Show that the system falls back to the default parser — no learning, no applying
- Toggle back on — memory should still be consistent with current transaction history (or explain why not)

---

## Deliverables

## Part 1 — Reverse-Engineered Behavior

In your README, explain:

### 1. What behavior did you infer from the screenshots?

Examples:

- memory is per-user
- memory is derived from past transactions, not explicit corrections
- editing a past transaction updates memory
- memory can be turned off in settings

### 2. What assumptions did you make?

Examples:

- what a memory entry keys on (exact string, normalized, etc.)
- whether amount or time affects memory at all
- how many historical entries are needed before memory "counts"
- how edits propagate (just the one edited row, or all past matches too?)

---

## Part 2 — Technical Design

### 3. Memory Data Model

What does a memory entry look like? What does it key on? What does it store? Is it materialized, or computed on demand?

### 4. Matching Strategy

How do you decide whether an incoming transaction matches an existing memory entry? Exact match? Normalized? Fuzzy? LLM?

### 5. Update & Sync Rules

What happens when a past transaction is edited or deleted? How does memory stay in sync? What happens when the same key has conflicting history (5 `อาหาร`, 2 `ข้าวเช้า`)? What happens when new evidence contradicts old evidence?

### 6. Trust & Transparency

How does the user know what Parnuan has learned, and why it suggested a particular category? How can they inspect, override, or reset memory?

### 7. Trade-offs

What did you optimize for?

Examples:

- precision vs recall
- simplicity vs flexibility
- storage cost vs lookup speed
- materialized memory vs recomputed-on-read
- user control vs automation

---

## Part 3 — Implementation

Build a small but real proof of concept on top of your Assignment 1 parser (or a stub).

It does **not** need to be production complete. A CLI, API, or minimal UI is all fine — as long as it clearly demonstrates:

- learning from historical transactions
- applying memory on new inputs
- updating memory when history changes

---

## Part 4 — Edge Cases & Failure Modes

In your README, include:

### 8. What difficult cases did you consider?

Examples:

- near-duplicate descriptions (`ข้าวมันไก่` vs `ข้าวมันไก่ทอด`)
- one-off edits that shouldn't overwrite strong historical patterns
- category renames / deletions
- stale memory after user's habits change
- cold-start (no history yet)
- memory poisoning (one typo breaks auto-categorization)
- a transaction with no clear majority category in history

### 9. What would likely fail in your current solution?

List at least 3 realistic failure cases.

### 10. What would you improve next?

If you had one more week, what would you improve first?

---

## (Bonus) Part 5 — Walkthrough

If you have time, include a short walkthrough video (**max 3 minutes**) covering:

1. how you model memory
2. your matching and sync strategy
3. how you handle conflicts
4. your current limitations

A simple Loom is enough.

---

## Technical Guidelines

- Any language / stack is acceptable
- TypeScript is preferred
- Keep the solution small and focused
- Do not overbuild — we are looking for clear thinking, not a framework

**Expected time:** 1–3 hours on top of Assignment 1.

This is a guideline, not a hard limit. Scope it yourself. If you run out of time, ship what works and document the rest as "would do next." Honest scoping is part of the evaluation.

If you use AI / LLMs:

- use environment variables for secrets
- explain why you chose that approach
- describe fallback behavior
- be mindful of cost

A simple, well-reasoned solution is better than an overcomplicated one.

---

## README Requirements

Your README must include:

1. Reverse-engineered behavior
2. Assumptions
3. Memory data model
4. Matching strategy
5. Update & sync rules
6. Trade-offs
7. Edge cases
8. Known limitations
9. Setup instructions
10. Time spent

---

## What We're Looking For

Strong submissions usually show:

- a simple but correct mental model of memory as a derived view of history
- clear thinking about when memory should override the parser
- honest handling of conflicts and stale signals
- thoughtful UX around transparency and user control

Weak submissions usually:

- treat memory as a separate "corrections" table that drifts from history
- forget to update memory when transactions are edited or deleted
- over-engineer the matching (embeddings for a 3-entry demo)
- ignore the user's ability to inspect or reset memory

Good luck.