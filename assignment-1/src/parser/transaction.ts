import type { Transaction } from "../types"
import { createId } from "../utils"
/**
 * Split one message into transaction candidates.
 *
 * Example:
 *
 * ข้าวมันไก่ 50 น้ำเปล่า 7 แล้วก็ช้อปปิ้ง 500
 *
 * =>
 *
 * [
 *   "ข้าวมันไก่ 50",
 *   "น้ำเปล่า 7",
 *   "ช้อปปิ้ง 500"
 * ]
 */
export function splitCandidates(text: string): string[] {
    const normalized = text
        .replace(/แล้วก็/g, "|")
        .replace(/และ/g, "|")
        .trim()

    const candidates = normalized
        .split("|")
        .flatMap((part) => {
            const result: string[] = []

            let remaining = part.trim()

            while (remaining.length > 0) {
                /*
                 * Find:
                 *
                 * description + amount
                 *
                 * Example:
                 * "ข้าวมันไก่ 50 น้ำเปล่า 7"
                 *
                 * => "ข้าวมันไก่ 50"
                 */
                const match = remaining.match(
                    /^(.+?\s\d+(?:\.\d+)?)\s+(?=\S)/,
                )

                if (!match) {
                    result.push(remaining)
                    break
                }

                result.push(match[1].trim())

                remaining = remaining
                    .slice(match[0].length)
                    .trim()
            }

            return result
        })

    return candidates.filter(Boolean)
}
/**
 * Parse one transaction candidate.
 *
 * Example:
 *
 * "ข้าวมันไก่ 50"
 *
 * =>
 *
 * description = "ข้าวมันไก่"
 * amount = 50
 */
export function parseCandidate(
    candidate: string,
    date: Date,
): Transaction | null {
    const match = candidate.match(
        /(.+?)\s+(\d+(?:\.\d+)?)$/,
    )

    if (!match) {
        return null
    }

    const description = match[1].trim()
    const amount = Number(match[2])

    if (!description || Number.isNaN(amount)) {
        return null
    }

    return {
        id: createId(),
        description,
        amount,
        category: null, // Category will be assigned later in the processing pipeline
        date: date.toISOString(),
    }
}