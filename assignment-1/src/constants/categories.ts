import type { Category } from '../types'

export const CATEGORIES: Category[] = [
    {
        id: 'food',
        title: 'อาหาร',
    },
    {
        id: 'shopping',
        title: 'ช้อปปิ้ง',
    },
    {
        id: 'transport',
        title: 'ขนส่ง/เดินทาง',
    },
    {
        id: 'other',
        title: 'อื่นๆ',
    },
]

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
    food: [
        'ข้าว',
        'อาหาร',
        'น้ำ',
        'กาแฟ',
        'ก๋วยเตี๋ยว',
        'ข้าวมันไก่',
    ],

    shopping: [
        'ช้อปปิ้ง',
        'ซื้อของ',
        'เสื้อผ้า',
    ],

    transport: [
        'แท็กซี่',
        'รถ',
        'ค่าเดินทาง',
        'bts',
        'mrt',
    ],
}