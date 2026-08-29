import { describe, expect, it } from 'vitest'
import { extractDate } from '../modules/parser/date'

describe('extractDate', () => {
    it('should extract yesterday date', () => {
        const result = extractDate(
            'เมื่อวาน ข้าวมันไก่ 50',
        )

        const expected = new Date()
        expected.setDate(expected.getDate() - 1)

        expect(result.date.toDateString()).toBe(
            expected.toDateString(),
        )

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50',
        )
    })

    it('should extract yesterday at a specific hour', () => {
        const result = extractDate(
            'เมื่อวานตอน 5 โมง ข้าวมันไก่ 50',
        )

        expect(result.date.getHours()).toBe(17)
        expect(result.date.getMinutes()).toBe(0)

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50',
        )
    })

    it('should extract yesterday at half past the hour', () => {
        const result = extractDate(
            'เมื่อวานตอน 5 โมงครึ่ง ข้าวมันไก่ 50',
        )

        expect(result.date.getHours()).toBe(17)
        expect(result.date.getMinutes()).toBe(30)

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50',
        )
    })

    it('should support "เมื่อวาน" without "ตอน"', () => {
        const result = extractDate(
            'เมื่อวาน 5 โมง ข้าวมันไก่ 50',
        )

        expect(result.date.getHours()).toBe(17)
        expect(result.date.getMinutes()).toBe(0)

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50',
        )
    })

    it('should return current date when no date reference is provided', () => {
        const before = new Date()

        const result = extractDate(
            'ข้าวมันไก่ 50',
        )

        const after = new Date()

        expect(result.date.getTime()).toBeGreaterThanOrEqual(
            before.getTime(),
        )

        expect(result.date.getTime()).toBeLessThanOrEqual(
            after.getTime(),
        )

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50',
        )
    })

    it('should preserve the input when no date reference is found', () => {
        const result = extractDate(
            'ข้าวมันไก่ 50 น้ำ 7',
        )

        expect(result.cleanedText).toBe(
            'ข้าวมันไก่ 50 น้ำ 7',
        )
    })
})