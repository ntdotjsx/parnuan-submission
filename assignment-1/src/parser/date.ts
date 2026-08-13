
/**
 * Extract date/time from Thai text.
 *
 * Supported examples:
 *
 * เมื่อวาน
 * เมื่อวานตอน 5 โมง
 * เมื่อวานตอน 5 โมงครึ่ง
 */
export function extractDate(text: string): {
    date: Date
    cleanedText: string
} {
    const now = new Date()

    const timeMatch = text.match(
        /เมื่อวาน(?:ตอน)?\s*(\d{1,2})\s*โมง(ครึ่ง)?/,
    )

    if (timeMatch) {
        const hour = Number(timeMatch[1])
        const hasHalfHour = Boolean(timeMatch[2])

        const date = new Date(now)

        date.setDate(date.getDate() - 1)

        // Simplified assumption for this POC:
        // "5 โมง" = 17:00
        // "5 โมงครึ่ง" = 17:30
        date.setHours(
            hour + 12,
            hasHalfHour ? 30 : 0,
            0,
            0,
        )

        return {
            date,
            cleanedText: text
                .replace(timeMatch[0], "")
                .trim(),
        }
    }

    if (text.includes("เมื่อวาน")) {
        const date = new Date(now)

        date.setDate(date.getDate() - 1)

        return {
            date,
            cleanedText: text
                .replace("เมื่อวาน", "")
                .trim(),
        }
    }

    return {
        date: now,
        cleanedText: text,
    }
}