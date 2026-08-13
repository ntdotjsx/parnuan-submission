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