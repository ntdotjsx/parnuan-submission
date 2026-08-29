export type Category = {
    id: string
    title: string
}

export type Transaction = {
    id: string
    description: string
    amount: number
    category: Category
    date: string
    confidence: number //ความมั่นใจโดยรวมของรายการ (ผสมจาก category confidence และ date confidence)
    warning?: string[] //คำเตือนหรือข้อความแจ้งเตือนที่เกี่ยวข้องกับรายการธุรกรรม
}

export type ExtractDateResult = {
    date: Date
    cleanedText: string
    confidence: number
    warning?: string
}

export type FindCategoryResult = {
    category: Category
    confidence: number
    warning?: string
}