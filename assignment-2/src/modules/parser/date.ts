import type { ExtractDateResult } from "../../types"

/**
 * Extract date/time from Thai text.
 *
 * Supported examples:
 *
 * เมื่อวาน
 * เมื่อวานตอน 5 โมง
 * เมื่อวานตอน 5 โมงครึ่ง
 * เมื่อวานตอน 5 โมงเย็น
 * เมื่อวานตอน 5 โมงเช้า
 * เมื่อวานตอนเที่ยง
 *
 * NOTE on Thai time ambiguity:
 * Thai "X โมง" is genuinely ambiguous without a period word (เช้า/บ่าย/เย็น/ทุ่ม/ตี).
 * "5 โมง" alone could mean 05:00 or 17:00 depending on context/dialect.
 * This POC does NOT attempt to fully solve that — it:
 *   1. Uses an explicit period word when present (high confidence).
 *   2. Falls back to a documented guess when absent (low confidence, explicit warning).
 * A production version would need a fuller Thai time-of-day parser and/or
 * ask the user to disambiguate in the review step.
 */

// Maps a detected period word to how many hours to add to the 1-12 "โมง" number.
// null = ambiguous, needs a guess.

/** Resolves the time offset based on the period word.
 * @param period - The Thai period word (เช้า, บ่าย, เย็น, ทุ่ม, ตี).
 * @returns An object containing the offset in hours and a label for the period.
 */
function resolvePeriodOffset(period: string | undefined): {
    offsetHours: number | null
    label: string
} {
    switch (period) {
        case "เช้า":
            // 1-11 โมงเช้า => 01:00-11:00 (as spoken); "6 โมงเช้า" = 06:00
            return { offsetHours: 0, label: "morning" }
        case "บ่าย":
            // บ่ายโมง = 13:00, บ่าย 2-4 โมง = 14:00-16:00
            return { offsetHours: 12, label: "afternoon" }
        case "เย็น":
            // 5-6 โมงเย็น = 17:00-18:00
            return { offsetHours: 12, label: "evening" }
        case "ทุ่ม":
            // 1-5 ทุ่ม (spoken without โมง, handled separately) = 19:00-23:00
            return { offsetHours: 18, label: "night" }
        case "ตี":
            // ตี 1 - ตี 5 = 01:00-05:00
            return { offsetHours: 0, label: "late night / early morning" }
        default:
            return { offsetHours: null, label: "unspecified" }
    }
}

/**
 * Builds a warning message for the extracted date/time.
 * @param params - An object containing details about the extracted time.
 * @returns A warning message string.
 */
function buildWarning(params: {
    rawMatch: string
    hour: number
    minute: number
    periodLabel: string
    guessed: boolean
}): string {
    const timeStr = `${String(params.hour).padStart(2, "0")}:${String(
        params.minute,
    ).padStart(2, "0")}`

    if (params.guessed) {
        return `Interpreted "${params.rawMatch}" as ${timeStr} (${params.periodLabel}) — no explicit เช้า/บ่าย/เย็น/ทุ่ม/ตี given, so this is a guess. Please verify.`
    }

    return `Interpreted "${params.rawMatch}" as ${timeStr} (${params.periodLabel}).`
}

/**
 * Extracts a date and optional time reference from Thai text.
 * @param text - The input text containing a date/time reference.
 * @returns An object containing the extracted date, cleaned text, confidence score, and an optional warning.
 */
export function extractDate(text: string): ExtractDateResult {
    const now = new Date()

    // Matches: เมื่อวาน(ตอน)? <1-12> โมง(ครึ่ง)? (เช้า|บ่าย|เย็น|ทุ่ม|ตี)?
    const timeMatch = text.match(
        /เมื่อวาน(?:ตอน)?\s*(\d{1,2})\s*โมง(ครึ่ง)?\s*(เช้า|บ่าย|เย็น|ทุ่ม|ตี)?/,
    )

    if (timeMatch) {
        const rawHour = Number(timeMatch[1])
        const hasHalfHour = Boolean(timeMatch[2])
        const period = timeMatch[3]

        // Guard against garbage input like "13 โมง" or "0 โมง"
        if (!Number.isInteger(rawHour) || rawHour < 1 || rawHour > 12) {
            return {
                date: now,
                cleanedText: text,
                confidence: 0.3,
                warning: `Found a time-like phrase ("${timeMatch[0]}") but the hour (${rawHour}) is out of the expected 1-12 range; ignoring it and using the current date/time instead.`,
            }
        }

        const { offsetHours, label } = resolvePeriodOffset(period)
        const guessed = offsetHours === null

        // Fallback guess when no period word is given: assume afternoon/evening,
        // since that's the most common case for meal/expense logging in practice.
        // This is an explicit, documented assumption — not a hidden default.
        const finalOffset = offsetHours ?? 12

        let hour24 = rawHour === 12 ? 0 : rawHour
        hour24 = (hour24 + finalOffset) % 24

        const date = new Date(now)
        date.setDate(date.getDate() - 1)
        date.setHours(hour24, hasHalfHour ? 30 : 0, 0, 0)

        const warning = buildWarning({
            rawMatch: timeMatch[0],
            hour: hour24,
            minute: hasHalfHour ? 30 : 0,
            periodLabel: guessed ? "guessed" : label,
            guessed,
        })

        return {
            date,
            cleanedText: text.replace(timeMatch[0], "").trim(),
            // Explicit period word => high confidence.
            // Guessed period => noticeably lower confidence, since AM/PM
            // ambiguity is a real source of error, not a minor detail.
            confidence: guessed ? 0.55 : 0.9,
            warning,
        }
    }

    if (text.includes("เมื่อวาน")) {
        const date = new Date(now)
        date.setDate(date.getDate() - 1)

        return {
            date,
            cleanedText: text.replace("เมื่อวาน", "").trim(),
            confidence: 0.9,
            warning:
                "Date set to yesterday; no specific time was mentioned, so the current time was kept.",
        }
    }

    return {
        date: now,
        cleanedText: text,
        confidence: 0.7,
        warning: "No explicit date was found; current date/time was used.",
    }
}