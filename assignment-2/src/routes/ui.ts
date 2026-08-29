import { Hono } from 'hono'
import { Eta } from 'eta'
import { parseTransactions } from '../modules/parser/transaction'
import {
    getAllUsers,
    resolveUser,
    isMemoryEnabled,
    setMemoryEnabled,
    getMemoryMatch,
    learnTransactions,
    updateTransactionCategory,
    inspectUserMemory,
    getRecentTransactions,
    deleteUserMemoryKey,
    clearAllUserMemory,
} from '../modules/memory/service'
import { CATEGORIES, resolveCategory } from '../modules/constants/categories'

const eta = new Eta({ views: './src/views' })
export const uiRouter = new Hono()

/**
 * ฟังก์ชันตัวช่วยสำหรับค้นหาชื่อหมวดหมู่ภาษาไทยจาก Category ID
 */
const getCategoryTitle = (catId: string): string => {
    return resolveCategory(catId).title
}

/**
 * ฟังก์ชันเรนเดอร์การ์ด Memory Insights สำหรับอัปเดตแบบ Dynamic ผ่าน HTMX
 */
const renderMemoryInsightsCardHtml = (user: { id: string; name: string }, memories: Array<{
    keyword: string
    preferredCategoryTitle: string
    frequency: number
    confidence: number
}>): string => {
    const memoryItemsHtml = memories.length === 0
        ? `<div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center text-slate-500 text-xs">
            ยังไม่มีความจำที่บันทึกไว้สำหรับผู้ใช้นี้ (ทดลองพิมพ์และกดยืนยันบันทึกทางขวาเพื่อสอนระบบ)
           </div>`
        : `<div class="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
            ${memories.map((mem) => `
                <div class="p-3 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col gap-1.5 hover:border-pink-300 hover:bg-white transition-all shadow-2xs">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-bold text-slate-800 break-words">${mem.keyword}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <span class="text-[11px] bg-pink-50 text-[#d53583] border border-pink-200 px-2 py-0.5 rounded font-semibold">
                                ${mem.preferredCategoryTitle}
                            </span>
                            <button
                                hx-post="/ui/memory/delete"
                                hx-vals='{"userId": "${user.id}", "keyword": "${mem.keyword}"}'
                                hx-target="#memory-insights-card"
                                hx-swap="outerHTML"
                                hx-confirm="ต้องการลบความจำ '${mem.keyword}' ใช่หรือไม่?"
                                class="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all cursor-pointer"
                                title="ลบความจำคำนี้"
                            >
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/50">
                        <span>ใช้ไป: <strong class="text-slate-700">${mem.frequency} ครั้ง</strong></span>
                        <span class="text-emerald-600 font-semibold">มั่นใจ ${Math.round(mem.confidence * 100)}%</span>
                    </div>
                </div>
            `).join('')}
           </div>`

    const clearAllButton = memories.length > 0
        ? `<button
            hx-post="/ui/memory/clear"
            hx-vals='{"userId": "${user.id}"}'
            hx-target="#memory-insights-card"
            hx-swap="outerHTML"
            hx-confirm="ต้องการล้างความจำทั้งหมดของ ${user.name} ใช่หรือไม่?"
            class="text-[11px] text-red-500 hover:text-red-700 hover:underline font-medium cursor-pointer"
           >
            ล้างทั้งหมด
           </button>`
        : ''

    return `
        <div id="memory-insights-card" class="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col gap-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2">
                    <h2 class="text-sm font-bold text-slate-900">สิ่งที่ระบบจำได้ (Memory Insights)</h2>
                </div>
                <div class="flex items-center gap-2">
                    ${clearAllButton}
                    <span class="text-[11px] bg-pink-50 text-[#d53583] font-bold px-2.5 py-0.5 rounded-full border border-pink-200">
                        ${memories.length} คำ
                    </span>
                </div>
            </div>

            <p class="text-xs text-slate-500 -mt-1">
                คำศัพท์ที่เรียนรู้จากประวัติของ <strong class="text-slate-700">${user.name}</strong>
            </p>

            ${memoryItemsHtml}
        </div>
    `
}

/**
 * Route: GET /
 *
 * เรนเดอร์หน้าหลักของระบบ Dashboard:
 * - ดึงรายชื่อผู้ใช้ทั้งหมดจากฐานข้อมูล
 * - ตรวจสอบผู้ใช้ปัจจุบัน (จาก Query param ?userId= หรือ Default)
 * - ดึงสถานะการเปิดใช้งาน Memory, ข้อมูลความจำ (Insights), และประวัติรายการล่าสุด
 */
uiRouter.get('/', async (c) => {
    const users = await getAllUsers()
    const rawUserId = c.req.query('userId')
    const currentUser = (await resolveUser(rawUserId)) || users[0]

    const memoryEnabled = await isMemoryEnabled(currentUser.id)
    const memories = await inspectUserMemory(currentUser.id)
    const transactions = await getRecentTransactions(currentUser.id, 15)

    const html = await eta.renderAsync('index', {
        title: 'Parnuan Memory Dashboard',
        users,
        currentUser,
        memoryEnabled,
        memories,
        transactions,
        categories: CATEGORIES,
    })

    return c.html(html)
})

/**
 * Route: POST /ui/parse
 *
 * รับข้อความจากฟอร์มหน้าเว็บ ทำการ Parse และจับคู่ความจำของผู้ใช้ปัจจุบัน:
 * - เรียกใช้ Default Parser ร่วมกับ getMemoryMatch ของผู้ใช้
 * - เรนเดอร์หน้า review.eta ส่งกลับไปแสดงผลผ่าน HTMX
 */
uiRouter.post('/ui/parse', async (c) => {
    const body = await c.req.parseBody()
    const text = String(body.text ?? '')
    const userId = String(body.userId ?? '')

    const user = await resolveUser(userId)
    if (!user) {
        return c.html(`
            <div class="bg-red-50 border border-red-300 rounded-2xl p-6 text-center text-red-800">
                ไม่พบข้อมูลผู้ใช้ในระบบ กรุณาเลือกผู้ใช้งานใหม่อีกครั้ง
            </div>
        `, 404)
    }

    if (text.length > 5_000) {
        return c.html(`
            <div class="bg-red-50 border border-red-300 rounded-2xl p-6 text-center text-red-800">
                ข้อความยาวเกินไป (จำกัดไม่เกิน 5,000 ตัวอักษร)
            </div>
        `, 400)
    }

    const defaultTransactions = parseTransactions(text)

    /**
     * ค้นหาประวัติความจำของผู้ใช้เพื่อระบุหมวดหมู่ที่เคยบันทึกไว้
     */
    const transactions = await Promise.all(
        defaultTransactions.map(async (transaction) => {
            const memoryMatch = await getMemoryMatch(user.id, transaction.description)

            if (memoryMatch) {
                return {
                    ...transaction,
                    category: {
                        id: memoryMatch.categoryId,
                        title: memoryMatch.categoryTitle,
                    },
                    confidence: memoryMatch.confidence,
                    source: 'memory' as const,
                }
            }

            return {
                ...transaction,
                source: 'parser' as const,
            }
        }),
    )

    const memoryEnabled = await isMemoryEnabled(user.id)

    const html = await eta.renderAsync('review', {
        transactions,
        currentUser: user,
        memoryEnabled,
        categories: CATEGORIES,
    })

    return c.html(html)
})

/**
 * Route: POST /ui/confirm
 *
 * รับข้อมูลรายการที่ยืนยันจากหน้า Review และบันทึกลง MongoDB จริง (Passive Learning):
 * - คัดกรองรายการที่ถูกต้อง
 * - บันทึกลง Collection transactions
 * - เรนเดอร์ผลการบันทึกสำเร็จพร้อมอัปเดตสถิติความจำ
 */
uiRouter.post('/ui/confirm', async (c) => {
    const body = await c.req.parseBody({ all: true })
    const userId = String(body.userId ?? '')

    const user = await resolveUser(userId)
    if (!user) {
        return c.html(`
            <div class="bg-red-50 border border-red-300 rounded-2xl p-6 text-center text-red-800">
                ไม่พบข้อมูลผู้ใช้ในระบบ
            </div>
        `, 404)
    }

    const toArray = (val: unknown): string[] => {
        if (val === undefined || val === null) return []
        if (Array.isArray(val)) return val.map((v) => String(v).trim())
        return [String(val).trim()]
    }

    const ids = toArray(body.id)
    const descriptions = toArray(body.description)
    const amounts = toArray(body.amount)
    const categories = toArray(body.category)
    const dates = toArray(body.date)

    const items = descriptions
        .map((desc, i) => {
            const rawAmount = parseFloat(amounts[i] ?? '')
            const rawCat = categories[i] ?? 'other'

            const isDescValid = desc.length > 0 && desc.length <= 255
            const isAmountValid = Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount <= 1_000_000_000

            if (!isDescValid || !isAmountValid) return null

            const resolvedCat = resolveCategory(rawCat)

            return {
                id: ids[i] || undefined,
                description: desc,
                amount: rawAmount,
                categoryId: resolvedCat.id,
                categoryTitle: resolvedCat.title,
                date: dates[i] || new Date().toISOString(),
            }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

    if (items.length === 0) {
        return c.html(`
            <div class="bg-red-50 border border-red-300 rounded-2xl p-6 text-center text-red-800">
                ข้อมูลรายการไม่ถูกต้อง กรุณาตรวจสอบชื่อรายการและจำนวนเงิน
            </div>
        `, 400)
    }

    /**
     * บันทึกลง MongoDB จริง เพื่อให้ระบบเกิด Passive Learning
     */
    await learnTransactions(user.id, items)

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
    const escapeHtml = (str: string) =>
        str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')

    const itemsHtml = items
        .map(
            (item, index) => `
            <div class="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                        #${index + 1}
                    </span>
                    <div class="flex flex-col text-left">
                        <span class="text-sm font-semibold text-slate-800">${escapeHtml(item.description)}</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="text-xs bg-pink-50 text-pink-700 border border-pink-200 px-2 py-0.5 rounded font-medium">
                                ${escapeHtml(item.categoryTitle)}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-base font-bold text-emerald-600">
                        ${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                    </span>
                </div>
            </div>
        `,
        )
        .join('')

    return c.html(`
        <div id="receipt-drawer-backdrop" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300">
            <div class="fixed inset-0 -z-10 cursor-pointer" onclick="closeReceiptDrawer()"></div>

            <div class="bg-white w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] border border-emerald-200 relative animate-in slide-in-from-bottom duration-300">
                <!-- Top Mobile Handle -->
                <div class="w-full flex items-center justify-center pt-3 pb-1 sm:hidden bg-emerald-50/40">
                    <div class="w-12 h-1.5 bg-slate-300 rounded-full"></div>
                </div>

                <div class="px-6 pt-5 pb-4 flex flex-col items-center text-center gap-2 bg-gradient-to-b from-emerald-50/50 via-white to-white">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl shadow-sm">
                        ✓
                    </div>
                    <div>
                        <h2 class="text-lg font-bold text-slate-900">บันทึกรายการสำเร็จ!</h2>
                        <p class="text-xs text-slate-500 mt-0.5">
                            ระบบได้บันทึก ${items.length} รายการสำหรับ ${escapeHtml(user.name)} และซิงค์ความจำแล้ว
                        </p>
                    </div>
                </div>

                <div class="w-full border-b-2 border-dashed border-slate-200"></div>

                <div class="p-5 overflow-y-auto flex flex-col gap-3 flex-1 bg-slate-50/40">
                    <div class="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
                        ${itemsHtml}
                    </div>

                    <div class="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
                        <span class="text-xs font-semibold text-emerald-800">ยอดรวมทั้งสิ้น (Total Paid)</span>
                        <span class="text-lg font-extrabold text-emerald-700">
                            ${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                        </span>
                    </div>
                </div>

                <div class="p-4 sm:p-5 bg-white border-t-2 border-dashed border-slate-200">
                    <a href="/?userId=${user.id}" class="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md">
                        เสร็จสิ้น / กลับหน้าหลัก
                    </a>
                </div>
            </div>
        </div>

        <script>
            if (typeof toast !== 'undefined') {
                toast.success("บันทึกสำเร็จทั้งหมด ${items.length} รายการ (ระบบเรียนรู้แล้ว)");
            }
        </script>
    `)
})

/**
 * Route: POST /ui/settings/memory
 *
 * สลับการตั้งค่า เปิด หรือ ปิด ใช้งาน Memory ของผู้ใช้ผ่าน UI:
 * - อัปเดตการตั้งค่าใน Collection user_settings
 * - ส่งคืนสถานะสวิตช์ใหม่พร้อมส่ง Out-of-Band (OOB) Swap อัปเดต Profile Card ด้านบนทันที
 */
uiRouter.post('/ui/settings/memory', async (c) => {
    const body = await c.req.parseBody()
    const userId = String(body.userId ?? '')
    const enabled = body.enabled === 'true' || body.enabled === '1' || body.enabled === 'on'

    const user = await resolveUser(userId)
    if (!user) {
        return c.text('User not found', 404)
    }

    await setMemoryEnabled(user.id, enabled)

    const statusText = enabled ? 'เปิดใช้งานความจำแล้ว' : 'ปิดใช้งานความจำแล้ว'
    const badgeClass = enabled
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-50 text-slate-600 border-slate-200'

    const dotClass = enabled ? 'bg-emerald-500' : 'bg-slate-400'
    const profileStatusText = enabled ? 'เปิดใช้งานความจำ' : 'ปิดใช้งานความจำ'
    const toastMsg = enabled ? 'เปิดใช้งานความจำแล้ว' : 'ปิดใช้งานความจำแล้ว'

    return c.html(`
        <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass} transition-all">
            ${statusText}
        </span>

        <span id="user-avatar-dot" hx-swap-oob="true" class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${dotClass} transition-all"></span>

        <div id="user-memory-status" hx-swap-oob="true" class="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 transition-all">
            <span class="inline-block w-1.5 h-1.5 rounded-full ${dotClass}"></span>
            <span>${profileStatusText}</span>
            <span class="text-slate-300">•</span>
            <span class="text-slate-400 text-[11px] font-mono">${user.id}</span>
        </div>

        <script>
            if (typeof toast !== 'undefined') {
                toast.success('${toastMsg}');
            }
        </script>
    `)
})

/**
 * Route: POST /ui/transactions/edit
 *
 * แก้ไขหมวดหมู่ของรายการในอดีต (Demo Flow 2: Edit Past Transaction -> Sync Memory):
 * - อัปเดต Category ID และชื่อหมวดหมู่ใน MongoDB
 * - ส่งผลให้การจับคู่ความจำในอนาคตเปลี่ยนตามทันที
 */
uiRouter.post('/ui/transactions/edit', async (c) => {
    const body = await c.req.parseBody()
    const userId = String(body.userId ?? '')
    const transactionId = String(body.transactionId ?? '')
    const categoryInput = String(body.categoryId ?? '')

    const user = await resolveUser(userId)
    if (!user) {
        return c.text('User not found', 404)
    }

    const resolved = resolveCategory(categoryInput)
    const success = await updateTransactionCategory(user.id, transactionId, resolved.id, resolved.title)

    if (!success) {
        return c.html(`
            <script>
                if (typeof toast !== 'undefined') {
                    toast.error('แก้ไขหมวดหมู่ไม่สำเร็จ');
                }
            </script>
        `, 400)
    }

    const updatedMemories = await inspectUserMemory(user.id)
    const safeTitle = resolved.title.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <script>
            if (typeof toast !== 'undefined') {
                toast.success("อัปเดตเป็น '${safeTitle}' (ความจำซิงค์แล้ว)");
            }
        </script>
    `)
})

/**
 * Route: POST /ui/memory/delete
 *
 * ลบความจำสำหรับคำสำคัญที่ระบุ และส่งคืนการ์ด Memory Insights ฉบับอัปเดต
 */
uiRouter.post('/ui/memory/delete', async (c) => {
    const body = await c.req.parseBody()
    const userId = String(body.userId ?? '')
    const keyword = String(body.keyword ?? '')

    const user = await resolveUser(userId)
    if (!user) {
        return c.text('User not found', 404)
    }

    if (keyword) {
        await deleteUserMemoryKey(user.id, keyword)
    }

    const updatedMemories = await inspectUserMemory(user.id)
    const safeKeyword = keyword.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <script>
            if (typeof toast !== 'undefined') {
                toast.success("ลบความจำ '${safeKeyword}' สำเร็จ");
            }
        </script>
    `)
})

/**
 * Route: POST /ui/memory/clear
 *
 * ล้างความจำทั้งหมดของผู้ใช้ และส่งคืนการ์ด Memory Insights ฉบับว่างเปล่า
 */
uiRouter.post('/ui/memory/clear', async (c) => {
    const body = await c.req.parseBody()
    const userId = String(body.userId ?? '')

    const user = await resolveUser(userId)
    if (!user) {
        return c.text('User not found', 404)
    }

    await clearAllUserMemory(user.id)

    const updatedMemories = await inspectUserMemory(user.id)
    const safeName = user.name.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <script>
            if (typeof toast !== 'undefined') {
                toast.success("ล้างความจำทั้งหมดของ ${safeName} สำเร็จ");
            }
        </script>
    `)
})