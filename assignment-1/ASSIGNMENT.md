# Parnuan Software Engineer Intern — Take-Home Assignment

## Assignment

**Reverse Engineer Parnuan’s Text → Transaction Flow**

---

## Overview

Parnuan is an AI-powered personal finance product built for real users.

One of the core product experiences is turning a free-form text message into one or more structured financial transactions that the user can review before confirming.

This assignment is designed to evaluate how you:

- understand product behavior from limited information
- make technical decisions under ambiguity
- design a practical solution
- build a small but meaningful proof of concept

This is **not** a pixel-perfect UI exercise.
This is **not** a perfect-solution exercise.

We care more about:

- engineering judgment
- product understanding
- scoping
- technical trade-offs
- clarity of communication

---

## What You Are Given

You will be given:

- a small set of screenshots of the existing product flow (see screenshots/)
- a short list of requirements

You should use these to reverse engineer the intended behavior.

Some details are intentionally left unspecified.
You are expected to make reasonable assumptions.

---

## Product Context

Users can send free-form text messages to log financial activity.

A single message may contain:

- one transaction
- multiple transactions
- one or multiple categories
- implicit or explicit time references
- mixed natural language patterns

The system should interpret the message and return a reviewable result before final confirmation.

---

## Requirements

Build a **proof of concept** for the text → transaction(s) flow.

Your solution should:

1. Accept a free-form text input
2. Parse one or more transaction candidates from the message
3. Return structured output that is **reviewable**
4. Show how the user could inspect, edit, or confirm the result
5. Handle ambiguity in a reasonable way

You are free to decide:

- category structure
- parsing strategy
- architecture
- UI / API / CLI format
- storage approach
- whether to use rules, LLMs, or a hybrid approach

---

## Expected Output

A working **proof of concept** in any form.

Examples:

- JSON output
- API endpoint
- simple UI
- CLI tool
- chatbot-like prototype

Any format is acceptable **as long as it clearly demonstrates**:

1. input text
2. parsed transaction result(s)
3. reviewable structured output
4. how ambiguous or uncertain cases are handled

---

## Required Demo Cases

Your submission must include at least these 3 demo cases:

### 1. Single transaction

Example:

- `ข้าวมันไก่ 50`

### 2. Multiple transactions in one message

Example:

- `ข้าวมันไก่ 50 น้ำเปล่า 7 แล้วก็ช้อปปิ้ง 500`

### 3. Message with time reference

Example:

- `เมื่อวานตอน 5 โมงครึ่ง ข้าวมันไก่ 50`

You may use these examples directly or create equivalent ones.

---

## Deliverables

## Part 1 — Reverse-Engineered Behavior

In your README, explain:

### 1. What behavior did you infer from the screenshots?

Examples:

- one message can produce multiple transactions
- timestamp may come from message content
- output is reviewable before final confirmation

### 2. What assumptions did you make?

Examples:

- what fields a transaction should contain
- whether uncertain categories are allowed
- what happens if parsing is incomplete

---

## Part 2 — Technical Design

Describe your approach.

Include:

### 3. Parsing Strategy

How does your system interpret text?

Examples:

- rules / pattern matching
- LLM
- hybrid
- dictionary / heuristics
- fallback behavior

### 4. Data Model

What structure does a parsed transaction have?

Examples:

- amount
- description
- category
- timestamp
- confidence
- notes / parsing warnings

### 5. Review Flow

How does the user inspect or correct the result before confirmation?

### 6. Trade-offs

What did you optimize for?

Examples:

- speed vs completeness
- low cost vs flexibility
- simplicity vs extensibility

---

## Part 3 — Implementation

Build a small but real proof of concept.

Your implementation should demonstrate the core flow:
**free-form text → parsed transaction(s) → reviewable output**

It does **not** need to be production complete.

### Good examples of scope

- parser + structured JSON output
- API + sample requests/responses
- simple UI showing parsed items
- lightweight demo with editable results

---

## Part 4 — Edge Cases

In your README, include:

### 7. What ambiguous or difficult cases did you consider?

List edge cases that can break your system and how to handle them.

### 8. What would likely fail in your current solution?

List at least 3 realistic failure cases.

### 9. What would you improve next?

If you had one more week, what would you improve first?

---

## (bonus points) Part 5 — Walkthrough

Please include a short walkthrough video (**max 5 minutes**) covering:

1. what you inferred from the screenshots
2. your main technical decisions
3. your parsing approach
4. your trade-offs
5. your current limitations

A simple Loom is enough.

---

## Technical Guidelines

- Any language / stack is acceptable
- TypeScript is preferred
- Keep the solution small and focused
- Do not overbuild

**Expected time:** 1–3 hours.

This is a guideline, not a hard limit. We expect you to scope the assignment yourself — decide what to cut, what to go deep on, and what to leave as "would do next." How you scope under a time budget is part of what we're evaluating. If you spend significantly more or less, mention it in the README.

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
3. Technical design
4. Parsing approach
5. Data model
6. Trade-offs
7. Edge cases
8. Known limitations
9. Setup instructions
10. Time spent

---

## Git Expectations

We want to understand how you work.

Please:

- use meaningful commit messages
- make incremental commits when possible
- avoid one giant final commit if possible

---

## What We’re Looking For

Strong submissions usually show:

- clear reasoning from incomplete information
- practical technical decisions
- sensible scoping
- thoughtful handling of ambiguity
- simple, clear implementation
- good communication

Weak submissions usually:

- focus only on UI polish
- overbuild
- ignore ambiguity
- skip trade-offs
- make unclear assumptions
- optimize for appearance over clarity

---

## Evaluation Rubric

| Criteria | Weight | What We Look For |
|----------|--------|------------------|
| Product Understanding | 20% | Did you correctly infer the intended behavior from limited information? |
| Technical Judgment | 25% | Did you make sensible engineering decisions under ambiguity and constraints? |
| Parsing & Data Design | 20% | Is the text-to-transaction approach practical and well-structured? |
| Implementation Quality | 20% | Is the proof of concept functional, clear, and reasonably built? |
| Communication | 15% | Is the README and walkthrough clear, structured, and honest about trade-offs? |

---

## Submission Checklist

- [ ] GitHub repository link
- [ ] Working proof of concept
- [ ] README with required sections
- [ ] Commit history
- [ ] (bonus points) Walkthrough video link

Good luck. We’re excited to see how you think and build.