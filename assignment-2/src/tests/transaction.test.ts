import { describe, expect, it } from 'vitest'
import { parseTransactions } from '../modules/parser/transaction'

describe('parseTransactions', () => {
    it('should parse a single transaction', () => {
        const result = parseTransactions(
            'ข้าวมันไก่ 50',
        )

        expect(result).toHaveLength(1)

        expect(result[0]).toMatchObject({
            description: 'ข้าวมันไก่',
            amount: 50,
        })
    })

    it('should parse multiple transactions', () => {
        const result = parseTransactions(
            'ข้าวมันไก่ 50 น้ำเปล่า 7',
        )

        expect(result).toHaveLength(2)

        expect(result[0]).toMatchObject({
            description: 'ข้าวมันไก่',
            amount: 50,
        })

        expect(result[1]).toMatchObject({
            description: 'น้ำเปล่า',
            amount: 7,
        })
    })

    it('should parse transactions separated by Thai conjunctions', () => {
        const result = parseTransactions(
            'ข้าวมันไก่ 50 และ น้ำ Pepsi 15 และก็ lm แดง 70',
        )

        expect(result).toHaveLength(3)

        expect(result.map((transaction) => transaction.description))
            .toEqual([
                'ข้าวมันไก่',
                'น้ำ Pepsi',
                'lm แดง',
            ])

        expect(result.map((transaction) => transaction.amount))
            .toEqual([50, 15, 70])
    })

    it('should extract yesterday date from the input', () => {
        const result = parseTransactions(
            'เมื่อวาน ข้าวมันไก่ 50',
        )

        expect(result).toHaveLength(1)

        const date = new Date(result[0].date)
        const now = new Date()

        expect(date.getDate()).toBe(
            now.getDate() - 1,
        )
    })

    it('should extract yesterday with time', () => {
        const result = parseTransactions(
            'เมื่อวานตอน 5 โมงครึ่ง ข้าวมันไก่ 50',
        )

        expect(result).toHaveLength(1)

        const date = new Date(result[0].date)

        expect(date.getHours()).toBe(17)
        expect(date.getMinutes()).toBe(30)
    })

    it('should ignore invalid transaction candidates', () => {
        const result = parseTransactions(
            'ข้าวมันไก่ 50 ข้อความที่ไม่มีจำนวนเงิน',
        )

        expect(result).toHaveLength(1)

        expect(result[0]).toMatchObject({
            description: 'ข้าวมันไก่',
            amount: 50,
        })
    })

    it('should return an empty array when no transaction can be parsed', () => {
        const result = parseTransactions(
            'วันนี้อากาศดีมาก',
        )

        expect(result).toEqual([])
    })

    it('should parse multi-transaction inputs with individual dates', () => {
        const result = parseTransactions(
            '3 วันที่ 11โมง ข้าวมันไก่ 50 แล้ว 2 วันที่แล้ว 10 โมง ช้อปปิ้ง 500',
        )

        expect(result).toHaveLength(2)
        expect(result[0].description).toBe('ข้าวมันไก่')
        expect(result[0].amount).toBe(50)
        expect(result[1].description).toBe('ช้อปปิ้ง')
        expect(result[1].amount).toBe(500)

        const d1 = new Date(result[0].date)
        const d2 = new Date(result[1].date)
        expect(d1.getHours()).toBe(11)
        expect(d2.getHours()).toBe(10)
    })
})