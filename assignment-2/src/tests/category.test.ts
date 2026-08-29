import { describe, expect, it } from 'vitest'
import { findCategory } from '../modules/utils'

describe('findCategory', () => {
    it('should return food category for food-related description', () => {
        const result = findCategory('ข้าวมันไก่')

        expect(result.category.id).toBe('food')
    })

    it('should return shopping category for shopping-related description', () => {
        const result = findCategory('ซื้อเสื้อผ้า')

        expect(result.category.id).toBe('shopping')
    })

    it('should return transport category for transport-related description', () => {
        const result = findCategory('นั่งแท็กซี่')

        expect(result.category.id).toBe('transport')
    })

    it('should return other category when no keyword matches', () => {
        const result = findCategory('ค่าซ่อมคอมพิวเตอร์')

        expect(result.category.id).toBe('other')
    })

    it('should match keywords case-insensitively', () => {
        const result = findCategory('BTS ไปห้าง')

        expect(result.category.id).toBe('transport')
    })

    it('should match a keyword contained within a longer description', () => {
        const result = findCategory('กินข้าวกับเพื่อน')

        expect(result.category.id).toBe('food')
    })
})