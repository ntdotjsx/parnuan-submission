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
     * Extracts a date and optional time reference from Thai text.
     *
     * Supported patterns:
     * - เมื่อวาน
     * - เมื่อวานตอน 5 โมง
     * - เมื่อวานตอน 5 โมงครึ่ง
     *
     * Returns the resolved date and the input text with the
     * recognized date/time expression removed.
     */
    // 1: Extract date/time information
    const dateResult = extractDate(input)
    /**
     * Splits a message into individual transaction candidates.
     *
     * Supports multiple transactions separated by Thai conjunctions
     * such as "และ" and "แล้วก็".
     */
    // 2: Split the remaining text into transaction candidates
    const candidates = splitCandidates(
        dateResult.cleanedText,
    )
    // 3: Parse each candidate into a structured Transaction object
    return candidates
        .map((candidate) =>
            parseCandidate(
                candidate,
                dateResult.date,
                dateResult.confidence,
                dateResult.warning
            ),
        )
        .filter(
            (transaction): transaction is Transaction =>
                transaction !== null,
        )
}