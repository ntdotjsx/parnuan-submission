import { describe, expect, it } from 'vitest'
import {
    splitCandidates,
    parseCandidate,
} from '../parser/candidate'

describe('splitCandidates', () => {
    it('should parse a single transaction', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
        ])
    })

    it('should split multiple transactions', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50 น้ำเปล่า 7',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำเปล่า 7',
        ])
    })

    it('should split transactions using "และ"', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50 และ น้ำเปล่า 7',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำเปล่า 7',
        ])
    })

    it('should split transactions using "และก็"', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50 และก็ น้ำเปล่า 7',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำเปล่า 7',
        ])
    })

    it('should split transactions using "แล้วก็"', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50 แล้วก็ น้ำเปล่า 7',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำเปล่า 7',
        ])
    })

    it('should handle mixed Thai conjunctions', () => {
        const result = splitCandidates(
            'ข้าวมันไก่ 50 และ น้ำ Pepsi 15 และก็ lm แดง 70',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำ Pepsi 15',
            'lm แดง 70',
        ])
    })

    it('should support decimal amounts', () => {
        const result = splitCandidates(
            'กาแฟ 45.50 น้ำ 10',
        )

        expect(result).toEqual([
            'กาแฟ 45.50',
            'น้ำ 10',
        ])
    })

    it('should trim whitespace', () => {
        const result = splitCandidates(
            '  ข้าวมันไก่ 50   และ   น้ำเปล่า 7  ',
        )

        expect(result).toEqual([
            'ข้าวมันไก่ 50',
            'น้ำเปล่า 7',
        ])
    })

    it('should return an empty array for empty input', () => {
        const result = splitCandidates('')

        expect(result).toEqual([])
    })

    it('should keep an unparseable candidate', () => {
        const result = splitCandidates(
            'ข้อความที่ไม่มีจำนวนเงิน',
        )

        expect(result).toEqual([
            'ข้อความที่ไม่มีจำนวนเงิน',
        ])
    })
})

describe('parseCandidate', () => {
    const date = new Date(
        '2026-08-13T10:30:00.000Z',
    )

    it('should parse a valid transaction candidate', () => {
        const result = parseCandidate(
            'ข้าวมันไก่ 50',
            date,
        )

        expect(result).not.toBeNull()

        expect(result).toMatchObject({
            description: 'ข้าวมันไก่',
            amount: 50,
            category: null,
            date: date.toISOString(),
        })
    })

    it('should parse decimal amounts', () => {
        const result = parseCandidate(
            'กาแฟ 45.50',
            date,
        )

        expect(result).not.toBeNull()

        expect(result).toMatchObject({
            description: 'กาแฟ',
            amount: 45.5,
        })
    })

    it('should return null for a candidate without an amount', () => {
        const result = parseCandidate(
            'ข้าวมันไก่',
            date,
        )

        expect(result).toBeNull()
    })

    it('should return null for an empty candidate', () => {
        const result = parseCandidate(
            '',
            date,
        )

        expect(result).toBeNull()
    })

    it('should generate a unique ID', () => {
        const first = parseCandidate(
            'ข้าวมันไก่ 50',
            date,
        )

        const second = parseCandidate(
            'ข้าวมันไก่ 50',
            date,
        )

        expect(first).not.toBeNull()
        expect(second).not.toBeNull()

        expect(first!.id).not.toBe(
            second!.id,
        )
    })
})