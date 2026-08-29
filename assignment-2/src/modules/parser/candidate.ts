import type { Transaction } from "./types"
import { createId } from "../utils"
import { findCategory } from "../utils"
/**
 * Split one message into transaction candidates.
 * @param text - A string containing one or more transaction candidates.
 * @returns An array of transaction candidate strings.
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
        .replace(/และก็/g, "|")
        .replace(/และ/g, "|")
        .replace(/\s+แล้ว\s+/g, "|")
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
                    /^(.+?\s\d+(?:\.\d+)?(?!\s*(?:โมง|ทุ่ม|นาที|วัน|ชม\.)))\s+(?=\S)/,
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
 * @param candidate - A string containing a transaction candidate.
 * @param date - The date associated with the transaction.
 * @param dateConfidence - The confidence score of the extracted date.
 * @param dateWarning - An optional warning related to the extracted date.
 * @returns A Transaction object or null if parsing fails.
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
    dateConfidence: number,
    dateWarning?: string,
): Transaction | null {
    const match = candidate.match(
        /(.+?)\s+(\d+(?:\.\d+)?)$/,
    )

    if (!match) return null

    const description = match[1].trim()
    const amount = Number(Number(match[2]).toFixed(2)) // แก้ปัญหา ถ้าผู้ใช้พิมพ์ ข้าวมันไก่ 50.123456789 ตัวเลขจะถูกแปลงเป็น float ยาวๆ ซึ่งในระบบเงินตราควรมีทศนิยมไม่เกิน 2 ตำแหน่ง หรือ สตางค์

    /**
     * Validation ข้อมูล Transaction
     *
     * ตรวจสอบว่า:
     * - description ต้องไม่ว่าง และมีความยาวไม่เกิน 255 ตัวอักษร
     * - amount ต้องเป็นตัวเลขที่มีค่าจริง (finite number)
     * - amount ต้องมากกว่า 0
     * - amount ต้องไม่เกิน 1,000,000,000
     *
     * ตัวอย่างข้อมูลที่ผ่าน:
     *   description = "ข้าวมันไก่"
     *   amount = 60
     *
     * ตัวอย่างข้อมูลที่ไม่ผ่าน:
     *   description = ""        // ไม่มีรายละเอียด
     *   amount = NaN             // ไม่ใช่ตัวเลขที่ถูกต้อง
     *   amount = -50             // จำนวนเงินติดลบ
     *   amount = 0               // จำนวนเงินต้องมากกว่า 0
     *   amount = 1_000_000_001   // เกินขอบเขตที่กำหนด
     */
    if (
        !description ||
        description.length > 255 ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1_000_000_000
    ) {
        return null;
    }

    // Find the most likely category for the transaction description
    const categoryResult = findCategory(description)

    const warning: string[] = []

    if (categoryResult.warning) {
        warning.push(categoryResult.warning)
    }

    if (dateWarning) {
        warning.push(dateWarning)
    }

    /*
     * Category confidence has more weight because
     * it directly affects transaction classification.
     */
    const confidence = Number(
        (categoryResult.confidence * 0.7 + dateConfidence * 0.3).toFixed(2),
    )

    const validDate = !isNaN(date.getTime()) ? date : new Date() // ป้องกัน Crash date.toISOString() เมื่อเจอ Invalid Date

    return {
        id: createId(),
        description,
        amount,
        category: categoryResult.category,
        date: validDate.toISOString(),
        confidence,
        warning: warning.length > 0 ? warning : undefined,
    }
}