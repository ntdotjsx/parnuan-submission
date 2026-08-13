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