export interface UserTransaction {
    id: string
    userId: string
    description: string
    normalizedKey: string  // คำที่ผ่านการ normalize (เช่น ตัดเว้นวรรค/lowercase)
    amount: number
    categoryId: string
    createdAt: string
    updatedAt: string
}

export interface LearnedMemory {
    keyword: string
    preferredCategoryId: string
    confidence: number
    frequency: number
    lastUsedAt: string
    source: 'memory'
}

export interface UserSettings {
    userId: string
    memoryEnabled: boolean
}