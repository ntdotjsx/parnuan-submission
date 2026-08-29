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

    it('should extract relative days like "3 วันที่ 11โมง"', () => {
        const result = extractDate('3 วันที่ 11โมง ข้าวมันไก่ 50')
        const expected = new Date()
        expected.setDate(expected.getDate() - 3)

        expect(result.date.toDateString()).toBe(expected.toDateString())
        expect(result.date.getHours()).toBe(11)
        expect(result.date.getMinutes()).toBe(0)
        expect(result.cleanedText).toBe('ข้าวมันไก่ 50')
    })

    it('should extract relative days like "2 วันที่แล้ว 10 โมง"', () => {
        const result = extractDate('2 วันที่แล้ว 10 โมง ข้าวมันไก่ 50')
        const expected = new Date()
        expected.setDate(expected.getDate() - 2)

        expect(result.date.toDateString()).toBe(expected.toDateString())
        expect(result.date.getHours()).toBe(10)
        expect(result.date.getMinutes()).toBe(0)
        expect(result.cleanedText).toBe('ข้าวมันไก่ 50')
    })

    it('should extract spoken minutes like "5 โมง 11"', () => {
        const result = extractDate('5 โมง 11 ข้าวมันไก่ 50')

        expect(result.date.getHours()).toBe(17)
        expect(result.date.getMinutes()).toBe(11)
        expect(result.cleanedText).toBe('ข้าวมันไก่ 50')
    })

    it('should extract "6 เย็นโมง 20 นาที" and "6 โมงเย็น 20 นาที"', () => {
        const result1 = extractDate('6 เย็นโมง 20 นาที bts 45')
        expect(result1.date.getHours()).toBe(18)
        expect(result1.date.getMinutes()).toBe(20)
        expect(result1.cleanedText).toBe('bts 45')

        const result2 = extractDate('6 โมงเย็น 20 นาที bts 45')
        expect(result2.date.getHours()).toBe(18)
        expect(result2.date.getMinutes()).toBe(20)
        expect(result2.cleanedText).toBe('bts 45')
    })
})