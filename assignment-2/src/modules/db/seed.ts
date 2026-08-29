import type { UserDoc } from './models'

export async function seedUsersIfEmpty() {
    const database = (await import('./index')).getDb()
    const usersCollection = database.collection<UserDoc>('users')

    const count = await usersCollection.countDocuments()
    if (count > 0) return

    console.log('[Seed] Seeding mock users into database...')

    const now = new Date()
    const mockUsers: UserDoc[] = [
        {
            id: 'user_nut',
            name: 'นัท',
            avatar: "https://www.ntdotjsx.site/static/keke.png",
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'user_title',
            name: 'เติ้ลแฟนนัท',
            avatar: "https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/441c860e7f1b149894fe2203fe023368~tplv-tiktokx-cropcenter:1080:1080.jpeg?dr=14579&refresh_token=af160d0c&x-expires=1788181200&x-signature=p5Me4aMShJx%2FI%2FJoEbazdR5x3VQ%3D&t=4d5b0474&ps=13740610&shp=a5d48078&shcp=81f88b70&idc=my2",
            createdAt: now,
            updatedAt: now,
        },
    ]

    await usersCollection.insertMany(mockUsers)
    console.log('[Seed] Mock users created successfully.')
}