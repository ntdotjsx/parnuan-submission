import type { Transaction } from "../../types"
import { extractDate } from "./date"
import { splitCandidates, parseCandidate } from "./candidate"

/**
 *  Parses a string containing one or more transactions.
 *  Each transaction is expected to contain a description and an amount.
 * @param input - A string containing one or more transactions.
 * @returns An array of parsed Transaction objects.
 *
 * Example input:
 * "เมื่อวาน ข้าวมันไก่ 50 น้ำเปล่า 7"
 *
 * =>
 * [
 *   { description: "ข้าวมันไก่", amount: 50, date: "2023-09-14" },
 *   { description: "น้ำเปล่า", amount: 7, date: "2023-09-14" }
 * ]
 */
export function parseTransactions(
    input: string,
): Transaction[] {
    /**
     * ดึงข้อมูลวันและเวลาในระดับข้อความรวม (Global Date Result)
     */
    const globalDateResult = extractDate(input)

    /**
     * แยกข้อความออกเป็นส่วนย่อยตามคำเชื่อมภาษาไทย
     */
    const candidates = splitCandidates(input)

    /**
     * แปลงแต่ละ Candidate เป็น Transaction Document พร้อมตรวจสอบวันเวลาเฉพาะจุด
     */
    return candidates
        .map((candidate) => {
            const candidateDateResult = extractDate(candidate)
            const hasSpecificDate = candidateDateResult.confidence !== 0.7
            const resolvedDate = hasSpecificDate
                ? candidateDateResult.date
                : globalDateResult.date
            const resolvedConfidence = hasSpecificDate
                ? candidateDateResult.confidence
                : globalDateResult.confidence
            const resolvedWarning = hasSpecificDate
                ? candidateDateResult.warning
                : globalDateResult.warning

            return parseCandidate(
                candidateDateResult.cleanedText,
                resolvedDate,
                resolvedConfidence,
                resolvedWarning,
            )
        })
        .filter(
            (transaction): transaction is Transaction =>
                transaction !== null,
        )
}