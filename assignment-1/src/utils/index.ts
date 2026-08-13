import type { Category } from "../types"
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
 * @param description - Transaction description to categorize.
 * @returns The matched category, or "other" if no match is found.
 */
export function findCategory(description: string): {
    category: Category
} {
    const normalized = description.toLowerCase()

    for (const [categoryId, keywords] of Object.entries(
        CATEGORY_KEYWORDS,
    )) {
        const matched = keywords.some((keyword) =>
            normalized.includes(keyword.toLowerCase()),
        )

        if (matched) {
            const category = CATEGORIES.find(
                (item) => item.id === categoryId,
            )

            if (category) {
                return { category }
            }
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
    }
}