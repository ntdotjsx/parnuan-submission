import type { ExtractDateResult } from "../../types"

/**
 * Resolves the time offset based on the period word.
 *
 * @param period - The Thai period word (เช้า, บ่าย, เย็น, ทุ่ม, ตี).
 * @returns An object containing the offset in hours and a label for the period.
 */
function resolvePeriodOffset(period: string | undefined): {
    offsetHours: number | null
    label: string
} {
    switch (period) {
        case "เช้า":
            return { offsetHours: 0, label: "morning" }
        case "บ่าย":
            return { offsetHours: 12, label: "afternoon" }
        case "เย็น":
            return { offsetHours: 12, label: "evening" }
        case "ทุ่ม":
            return { offsetHours: 18, label: "night" }
        case "ตี":
            return { offsetHours: 0, label: "late night / early morning" }
        default:
            return { offsetHours: null, label: "unspecified" }
    }
}

/**
 * Builds a warning message for the extracted date/time.
 *
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
 * Extracts a date and optional time reference from Thai natural language text.
 *
 * Supports patterns such as:
 * - Relative days: "3 วันที่", "2 วันที่แล้ว", "3 วันก่อน", "เมื่อวานซืน", "เมื่อวาน", "วันนี้"
 * - Spoken hours with minutes: "5 โมง 11", "5 โมง 11 นาที", "6 เย็นโมง 20 นาที", "6 โมงเย็น 20 นาที"
 * - Period-based times: "บ่าย 2 โมง 10 นาที", "ตี 4 ครึ่ง", "2 ทุ่ม 15 นาที", "เที่ยงครึ่ง", "เที่ยงคืน"
 *
 * @param text - The input text containing a date/time reference.
 * @returns An object containing the extracted date, cleaned text, confidence score, and an optional warning.
 */
export function extractDate(text: string): ExtractDateResult {
    const now = new Date()
    let daysAgo: number | null = null
    let rawDateMatch = ""
    let textToClean = text

    /**
     * Relative day expression extraction
     */
    const relativeDaysMatch = textToClean.match(/(\d+)\s*วัน(?:ที่แล้ว|ก่อน|ที่)/)
    if (relativeDaysMatch) {
        daysAgo = parseInt(relativeDaysMatch[1], 10)
        rawDateMatch = relativeDaysMatch[0]
        textToClean = textToClean.replace(relativeDaysMatch[0], " ")
    } else if (textToClean.includes("เมื่อวานซืน")) {
        daysAgo = 2
        rawDateMatch = "เมื่อวานซืน"
        textToClean = textToClean.replace("เมื่อวานซืน", " ")
    } else if (textToClean.includes("เมื่อวาน")) {
        daysAgo = 1
        rawDateMatch = "เมื่อวาน"
        textToClean = textToClean.replace("เมื่อวาน", " ")
    } else if (textToClean.includes("วันนี้")) {
        daysAgo = 0
        rawDateMatch = "วันนี้"
        textToClean = textToClean.replace("วันนี้", " ")
    }

    let parsedHour: number | null = null
    let parsedMinute = 0
    let periodLabel = "unspecified"
    let guessed = false
    let timeMatched = false
    let rawTimeMatch = ""

    /**
     * Noon and midnight patterns (เที่ยง / เที่ยงคืน)
     */
    const noonMatch = textToClean.match(
        /(?:ตอน)?\s*(เที่ยงคืน|เที่ยงวัน|เที่ยง)(?:\s*(?:(ครึ่ง)|(\d{1,2})\s*นาที|(\d{1,2})))?/,
    )
    if (noonMatch) {
        timeMatched = true
        rawTimeMatch = noonMatch[0].trim()
        const isMidnight = noonMatch[1] === "เที่ยงคืน"
        parsedHour = isMidnight ? 0 : 12
        if (noonMatch[2]) {
            parsedMinute = 30
        } else if (noonMatch[3]) {
            parsedMinute = parseInt(noonMatch[3], 10)
        } else if (noonMatch[4]) {
            const m = parseInt(noonMatch[4], 10)
            if (m < 60) parsedMinute = m
        }
        periodLabel = isMidnight ? "midnight" : "noon"
        textToClean = textToClean.replace(noonMatch[0], " ")
    }

    /**
     * Early morning dawn patterns (ตี 1 - ตี 12)
     */
    if (!timeMatched) {
        const dawnMatch = textToClean.match(
            /(?:ตอน)?\s*ตี\s*(\d{1,2})(?:\s*(?:โมง|ครึ่ง|(\d{1,2})\s*นาที|(\d{1,2})))?/,
        )
        if (dawnMatch) {
            const h = parseInt(dawnMatch[1], 10)
            if (h >= 1 && h <= 12) {
                timeMatched = true
                rawTimeMatch = dawnMatch[0].trim()
                parsedHour = h === 12 ? 0 : h
                if (dawnMatch[0].includes("ครึ่ง")) {
                    parsedMinute = 30
                } else if (dawnMatch[2]) {
                    parsedMinute = parseInt(dawnMatch[2], 10)
                } else if (dawnMatch[3]) {
                    const m = parseInt(dawnMatch[3], 10)
                    if (m < 60) parsedMinute = m
                }
                periodLabel = "late night / early morning"
                textToClean = textToClean.replace(dawnMatch[0], " ")
            }
        }
    }

    /**
     * Evening night patterns (1 ทุ่ม - 12 ทุ่ม)
     */
    if (!timeMatched) {
        const nightMatch = textToClean.match(
            /(?:ตอน)?\s*(\d{1,2})\s*ทุ่ม(?:\s*(?:ครึ่ง|(\d{1,2})\s*นาที|(\d{1,2})))?/,
        )
        if (nightMatch) {
            const h = parseInt(nightMatch[1], 10)
            if (h >= 1 && h <= 12) {
                timeMatched = true
                rawTimeMatch = nightMatch[0].trim()
                parsedHour = 18 + (h === 12 ? 0 : h)
                if (nightMatch[0].includes("ครึ่ง")) {
                    parsedMinute = 30
                } else if (nightMatch[2]) {
                    parsedMinute = parseInt(nightMatch[2], 10)
                } else if (nightMatch[3]) {
                    const m = parseInt(nightMatch[3], 10)
                    if (m < 60) parsedMinute = m
                }
                periodLabel = "night"
                textToClean = textToClean.replace(nightMatch[0], " ")
            }
        }
    }

    /**
     * Thai spoken hour patterns (X โมง / X เย็นโมง / X โมงเย็น / บ่าย X โมง)
     */
    if (!timeMatched) {
        const mongMatch = textToClean.match(
            /(?:ตอน)?\s*(?:(บ่าย)\s*)?(\d{1,2})\s*(?:(เย็น|เช้า|บ่าย)\s*โมง|โมง\s*(เย็น|เช้า|บ่าย)?|โมง)(?:\s*(?:(ครึ่ง)|(\d{1,2})\s*นาที|(\d{1,2})(?!\s*(?:บาท|บ\.|k\b))))?/,
        )
        if (mongMatch) {
            const rawHour = parseInt(mongMatch[2], 10)
            if (rawHour >= 1 && rawHour <= 12) {
                timeMatched = true
                rawTimeMatch = mongMatch[0].trim()
                const period = mongMatch[1] || mongMatch[3] || mongMatch[4]
                const { offsetHours, label } = resolvePeriodOffset(period)
                guessed = offsetHours === null
                const finalOffset = offsetHours !== null ? offsetHours : (rawHour <= 6 ? 12 : 0)

                let h24 = rawHour === 12 ? 0 : rawHour
                h24 = (h24 + finalOffset) % 24
                parsedHour = h24
                periodLabel = guessed ? "guessed" : label

                if (mongMatch[5]) {
                    parsedMinute = 30
                } else if (mongMatch[6]) {
                    parsedMinute = parseInt(mongMatch[6], 10)
                } else if (mongMatch[7]) {
                    const m = parseInt(mongMatch[7], 10)
                    if (m < 60) parsedMinute = m
                }

                textToClean = textToClean.replace(mongMatch[0], " ")
            }
        }
    }

    const date = new Date(now)
    if (daysAgo !== null) {
        date.setDate(date.getDate() - daysAgo)
    }

    if (parsedHour !== null) {
        date.setHours(parsedHour, parsedMinute, 0, 0)
    }

    const cleanedText = textToClean.replace(/\s+/g, " ").trim()

    /**
     * Determine confidence and warning descriptions
     */
    if (timeMatched) {
        const combinedRaw = [rawDateMatch, rawTimeMatch].filter(Boolean).join(" ")
        const warning = buildWarning({
            rawMatch: combinedRaw,
            hour: parsedHour ?? date.getHours(),
            minute: parsedMinute,
            periodLabel: guessed ? "guessed" : periodLabel,
            guessed,
        })

        return {
            date,
            cleanedText,
            confidence: guessed ? 0.55 : 0.9,
            warning,
        }
    }

    if (daysAgo !== null) {
        const dayLabel = daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`
        return {
            date,
            cleanedText,
            confidence: 0.9,
            warning: `Date set to ${dayLabel}; no specific time was mentioned, so the current time was kept.`,
        }
    }

    return {
        date: now,
        cleanedText: text,
        confidence: 0.7,
        warning: "No explicit date was found; current date/time was used.",
    }
}