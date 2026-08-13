export type Category = {
    id: string
    title: string
}

export type Transaction = {
    id: string
    description: string
    amount: number
    category: Category | null
    date: string
    // confidence: number //ความมั่นใจในการจัดหมวดหมู่ของรายการธุรกรรม
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