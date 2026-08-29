import type { FindCategoryResult } from "../../types"
import { CATEGORIES, CATEGORY_KEYWORDS } from "../constants/categories"

// Creates a unique ID
export function createId(): string {
    return crypto.randomUUID()
}

/**
 * Infers the most likely category for a transaction description.
 *
 * The category is determined by matching the description
 * against predefined category keywords.
 *
 * Matching strategy (documented, simplified for POC):
 * - Substring match against each category's keyword list.
 * - If multiple categories match, the one with the MOST matched
 *   keywords wins (not just the first one found in object order).
 * - Ties are broken by declaration order in CATEGORY_KEYWORDS.
 *
 * Known limitations (see README):
 * - Substring matching can false-positive on short/ambiguous keywords
 *   (e.g. a keyword "รถ" could match inside an unrelated word).
 * - Thai text has no word boundaries, so this is not word-aware matching.
 * - `.toLowerCase()` only affects Latin-script keywords (e.g. "Grab", "BTS");
 *   it has no effect on Thai text.
 *
 * @param description - Transaction description to categorize.
 * @returns The matched category with a confidence score, or "other" if no match is found.
 */
export function findCategory(description: string): FindCategoryResult {
    const normalized = description.toLowerCase()

    let bestCategoryId: string | null = null
    let bestMatchCount = 0

    for (const [categoryId, keywords] of Object.entries(
        CATEGORY_KEYWORDS,
    )) {
        const matchCount = keywords.filter((keyword) =>
            normalized.includes(keyword.toLowerCase()),
        ).length

        if (matchCount > bestMatchCount) {
            bestMatchCount = matchCount
            bestCategoryId = categoryId
        }
    }

    if (bestCategoryId) {
        const category = CATEGORIES.find(
            (item) => item.id === bestCategoryId,
        )

        if (category) {
            // Simplified, documented confidence heuristic for this POC:
            // - 1 keyword match => 0.7 (plausible, but a single substring
            //   hit could still be a false positive)
            // - 2+ keyword matches => 0.9 (multiple independent signals
            //   agreeing on the same category)
            // This is NOT a calibrated probability — it's a rough signal
            // for the review UI to decide what to flag for the user.
            const confidence = bestMatchCount >= 2 ? 0.9 : 0.7

            return { category, confidence }
        }
    }

    const otherCategory = CATEGORIES.find(
        (item) => item.id === "other",
    )

    if (!otherCategory) {
        throw new Error("Other category not found")
    }

    return {
        category: otherCategory,
        confidence: 0.1,
        warning: "No matching category found, defaulting to 'other'",
    }
}