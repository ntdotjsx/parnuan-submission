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
 * ฟังก์ชันเรนเดอร์คอมโพเนนต์แถบค้นหาและตัวกรองหมวดหมู่ (Filter Bar) สำหรับนำกลับมาใช้ซ้ำ
 */
const renderFilterBarHtml = (options: {
    scope: string
    placeholder: string
    showCategoryPills?: boolean
    compact?: boolean
}): string => {
    const { scope, placeholder, showCategoryPills = true, compact = false } = options
    const categories = [
        { id: 'all', label: 'ทั้งหมด', match: 'all' },
        { id: 'food', label: '🍔 อาหาร', match: 'อาหาร,food' },
        { id: 'shopping', label: '🛍️ ช้อปปิ้ง', match: 'ช้อปปิ้ง,shopping' },
        { id: 'transport', label: '🚗 ขนส่ง/เดินทาง', match: 'ขนส่ง,เดินทาง,transport' },
        { id: 'other', label: '📦 อื่นๆ', match: 'อื่นๆ,other' },
    ]

    return `
        <div class="filter-bar-component flex flex-col gap-2 w-full" data-scope="${scope}">
            <div class="relative flex items-center w-full">
                <svg class="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    id="${scope}-search-input"
                    placeholder="${escapeHtml(placeholder)}"
                    oninput="handleUniversalFilter('${scope}')"
                    class="w-full pl-9 pr-8 ${compact ? 'py-1.5 text-xs' : 'py-2 text-xs sm:text-sm'} bg-slate-50 rounded-xl focus:bg-white focus:border-[#d53583] focus:ring-2 focus:ring-pink-500/15 transition-all outline-none placeholder:text-slate-400 text-slate-800"
                />
                <button
                    type="button"
                    id="${scope}-search-clear"
                    onclick="clearUniversalFilter('${scope}')"
                    class="hidden absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    title="ล้างคำค้นหา"
                >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            ${showCategoryPills ? `
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                    <input type="hidden" id="${scope}-category-filter" value="all">
                    ${categories.map((cat) => `
                        <button
                            type="button"
                            data-category-value="${cat.match}"
                            onclick="setUniversalCategoryFilter('${scope}', '${cat.match}', this)"
                            class="category-pill-btn shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${cat.id === 'all' ? 'bg-[#d53583] text-white font-bold shadow-2xs shadow-pink-500/20 active-cat-pill' : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'}"
                        >
                            ${cat.label}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `
}

/**
 * ฟังก์ชันเรนเดอร์การ์ด Memory Insights สำหรับอัปเดตแบบ Dynamic ผ่าน HTMX พร้อมช่องค้นหาคำศัพท์
 */
const renderMemoryInsightsCardHtml = (user: { id: string; name: string }, memories: Array<{
    keyword: string
    preferredCategoryTitle: string
    frequency: number
    confidence: number
}>): string => {
    const searchBarHtml = memories.length > 0
        ? renderFilterBarHtml({ scope: 'mem', placeholder: 'ค้นหาคำศัพท์ หรือหมวดหมู่...', compact: true, showCategoryPills: true })
        : ''

    const memoryItemsHtml = memories.length === 0
        ? `<div class="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-5 text-center text-slate-500 text-xs">
            ยังไม่มีความจำที่บันทึกไว้สำหรับผู้ใช้นี้ (ทดลองพิมพ์และกดยืนยันบันทึกทางขวาเพื่อสอนระบบ)
           </div>`
        : `<div id="memory-items-container" class="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
            ${memories.map((mem) => `
                <div
                    class="memory-item-row p-3 bg-slate-50/80 rounded-xl flex flex-col gap-1.5 hover:border-pink-300 hover:bg-white transition-all shadow-2xs"
                    data-search="${escapeHtml(mem.keyword.toLowerCase())} ${escapeHtml(mem.preferredCategoryTitle.toLowerCase())}"
                    data-category="${escapeHtml(mem.preferredCategoryTitle.toLowerCase())}"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-bold text-slate-800 break-words">${escapeHtml(mem.keyword)}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <span class="text-[11px] bg-pink-50 text-[#d53583] border border-pink-200 px-2 py-0.5 rounded font-semibold">
                                ${escapeHtml(mem.preferredCategoryTitle)}
                            </span>
                            <button
                                hx-post="/ui/memory/delete"
                                hx-vals='{"userId": "${escapeHtml(user.id)}", "keyword": "${escapeHtml(mem.keyword)}"}'
                                hx-target="#memory-insights-card"
                                hx-swap="outerHTML"
                                hx-confirm="ต้องการลบความจำ '${escapeHtml(mem.keyword)}' ใช่หรือไม่?"
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
            <div id="mem-search-empty" class="hidden bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center text-slate-500 text-xs">
                ไม่พบคำศัพท์ที่ตรงกับการค้นหา
            </div>
           </div>`

    const clearAllButton = memories.length > 0
        ? `<button
            hx-post="/ui/memory/clear"
            hx-vals='{"userId": "${escapeHtml(user.id)}"}'
            hx-target="#memory-insights-card"
            hx-swap="outerHTML"
            hx-confirm="ต้องการล้างความจำทั้งหมดของ ${escapeHtml(user.name)} ใช่หรือไม่?"
            class="text-[11px] text-red-500 hover:text-red-700 hover:underline font-medium cursor-pointer"
           >
            ล้างทั้งหมด
           </button>`
        : ''

    return `
        <div id="memory-insights-card" class="bg-white rounded-2xl p-5 shadow-xs flex flex-col gap-3.5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2">
                    <h2 class="text-sm font-bold text-slate-900">สิ่งที่ระบบจำได้ (Memory Insights)</h2>
                </div>
                <div class="flex items-center gap-2">
                    ${clearAllButton}
                    <span id="memory-count-badge" class="text-[11px] bg-pink-50 text-[#d53583] font-bold px-2.5 py-0.5 rounded-full border border-pink-200">
                        ${memories.length} คำ
                    </span>
                </div>
            </div>

            <p class="text-xs text-slate-500 -mt-1">
                คำศัพท์ที่เรียนรู้จากประวัติของ <strong class="text-slate-700">${escapeHtml(user.name)}</strong>
            </p>

            ${searchBarHtml}
            ${memoryItemsHtml}
        </div>
    `
}

/**
 * ฟังก์ชันช่วยแปลงข้อความสำหรับป้องกัน XSS ใน HTML
 */
const escapeHtml = (str: string): string => {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * ฟังก์ชันเรนเดอร์ไอคอนและชื่อหมวดหมู่
 */
const renderCategoryLabelHtml = (categoryId: string, categoryTitle: string): string => {
    if (categoryTitle === 'อาหาร' || categoryId === 'food') return '🍔 อาหาร (food)'
    if (categoryTitle === 'ช้อปปิ้ง' || categoryId === 'shopping') return '🛍️ ช้อปปิ้ง (shopping)'
    if (categoryTitle === 'ขนส่ง/เดินทาง' || categoryId === 'transport') return '🚗 ขนส่ง/เดินทาง (transport)'
    if (categoryTitle === 'อื่นๆ' || categoryId === 'other') return '📦 อื่นๆ (other)'
    return `✨ ${escapeHtml(categoryTitle)}`
}

/**
 * ฟังก์ชันช่วยแปลงวันที่และเวลาของรายการธุรกรรมให้แสดงผลแบบกระชับสวยงาม
 */
const formatTransactionDate = (dateVal: string | Date | undefined): string => {
    if (!dateVal) return ''
    try {
        const d = new Date(dateVal)
        if (isNaN(d.getTime())) return ''
        const datePart = d.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
        })
        const timePart = d.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
        return `${datePart} • ${timePart} น.`
    } catch {
        return ''
    }
}

/**
 * ฟังก์ชันเรนเดอร์การ์ด History & Real-time Edit สำหรับอัปเดตแบบ Dynamic ผ่าน HTMX OOB Swap
 */
const renderRecentTransactionsCardHtml = (
    user: { id: string; name: string },
    txs: Array<{
        id: string
        description: string
        amount: number
        categoryId: string
        categoryTitle: string
        date?: string
        createdAt?: Date
    }>,
): string => {
    const filterBarHtml = txs.length > 0
        ? renderFilterBarHtml({ scope: 'tx', placeholder: 'ค้นหารายการ, จำนวนเงิน, หรือ ID...', showCategoryPills: true })
        : ''

    const listHtml = txs.length === 0
        ? `<div class="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm">
            ยังไม่มีประวัติรายการสำหรับ ${escapeHtml(user.name)}
           </div>`
        : `<div id="recent-transactions-list" class="divide-y divide-slate-100 rounded-2xl bg-white overflow-hidden">
            ${txs.map((tx, idx) => {
            const formattedDate = formatTransactionDate(tx.date || tx.createdAt)
            const searchString = `${tx.description} ${tx.amount} ${tx.id} ${formattedDate} ${tx.categoryTitle} ${tx.categoryId}`.toLowerCase()
            return `
                    <div
                        class="transaction-list-row p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                        data-search="${escapeHtml(searchString)}"
                        data-category="${escapeHtml(tx.categoryTitle.toLowerCase())},${escapeHtml(tx.categoryId.toLowerCase())}"
                    >
                        <div class="flex items-center gap-3 w-full sm:w-auto">
                            <span class="w-8 h-8 rounded-xl bg-slate-100/90 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0  shadow-2xs">
                                #${idx + 1}
                            </span>
                            <div class="flex flex-col min-w-0">
                                <span class="text-sm font-bold text-slate-900 truncate">${escapeHtml(tx.description)}</span>
                                <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                    ${formattedDate ? `<span>${formattedDate}</span><span class="text-slate-300">•</span>` : ''}
                                    <span class="font-mono text-slate-400">#${escapeHtml(tx.id.slice(0, 8))}</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-3 justify-between sm:justify-end w-full sm:w-auto pt-2 sm:pt-0 border-t border-slate-100 sm:border-0">
                            <span class="text-sm sm:text-base font-extrabold text-slate-900 tabular-nums shrink-0">
                                ${tx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="text-xs font-semibold text-slate-500">บาท</span>
                            </span>

                            <form hx-post="/ui/transactions/edit" hx-swap="none" class="flex items-center gap-2 shrink-0">
                                <input type="hidden" name="userId" value="${escapeHtml(user.id)}">
                                <input type="hidden" name="transactionId" value="${escapeHtml(tx.id)}">
                                <div class="w-44 sm:w-56">
                                    <div class="relative custom-category-dropdown w-full">
                                        <input type="hidden" name="categoryId" class="category-hidden-input" value="${escapeHtml(tx.categoryTitle)}">
                                        <button type="button" onclick="toggleCategoryMenu(this)" class="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white rounded-xl hover:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 shadow-2xs transition-all flex items-center justify-between cursor-pointer group gap-1.5">
                                            <span class="selected-category-label flex items-center gap-1.5 truncate">
                                                ${renderCategoryLabelHtml(tx.categoryId, tx.categoryTitle)}
                                            </span>
                                            <svg class="w-3.5 h-3.5 text-slate-400 group-hover:text-[#d53583] transition-transform duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        <div class="category-menu-popover hidden absolute right-0 top-full mt-1.5 w-60 max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1 max-h-60 overflow-y-auto">
                                            <button type="button" onclick="selectCategoryItem(this, 'อาหาร', true)" class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-pink-50 hover:text-[#d53583] rounded-xl transition-all flex items-center justify-between cursor-pointer">
                                                <span>🍔 อาหาร (food)</span>
                                            </button>
                                            <button type="button" onclick="selectCategoryItem(this, 'ช้อปปิ้ง', true)" class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-pink-50 hover:text-[#d53583] rounded-xl transition-all flex items-center justify-between cursor-pointer">
                                                <span>🛍️ ช้อปปิ้ง (shopping)</span>
                                            </button>
                                            <button type="button" onclick="selectCategoryItem(this, 'ขนส่ง/เดินทาง', true)" class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-pink-50 hover:text-[#d53583] rounded-xl transition-all flex items-center justify-between cursor-pointer">
                                                <span>🚗 ขนส่ง/เดินทาง (transport)</span>
                                            </button>
                                            <button type="button" onclick="selectCategoryItem(this, 'อื่นๆ', true)" class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-pink-50 hover:text-[#d53583] rounded-xl transition-all flex items-center justify-between cursor-pointer">
                                                <span>📦 อื่นๆ (other)</span>
                                            </button>
                                            <div class="border-t border-slate-100 my-1"></div>
                                            <div class="custom-category-action-area">
                                                <button type="button" onclick="showCustomCategoryInput(this)" class="custom-category-trigger-btn w-full text-left px-3 py-1.5 text-xs font-bold text-[#d53583] bg-pink-50 hover:bg-pink-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer">
                                                    <span>✏️ + พิมพ์หมวดหมู่เอง...</span>
                                                </button>
                                                <div class="custom-category-input-box hidden flex items-center gap-1.5 p-1 bg-pink-50 rounded-xl border border-pink-200 mt-1">
                                                    <input type="text" placeholder="พิมพ์ชื่อหมวดหมู่..." class="custom-category-text w-full px-2 py-1 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#d53583] focus:ring-1 focus:ring-pink-500" onkeydown="if(event.key==='Enter'){ event.preventDefault(); applyCustomCategoryInline(this, true); }" />
                                                    <button type="button" onclick="applyCustomCategoryInline(this, true)" class="px-2.5 py-1 text-xs font-bold text-white bg-[#d53583] hover:bg-[#b51f68] rounded-lg transition-all cursor-pointer shrink-0 shadow-xs">
                                                        ตกลง
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                `
        }).join('')}
            <div id="tx-search-empty" class="hidden p-8 text-center text-slate-500 text-xs">
                ไม่พบรายการที่ตรงกับการค้นหา
            </div>
           </div>`

    return `
        <section id="recent-transactions-card" class="bg-white rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                    <div class="flex items-center gap-2">
                        <h2 class="text-base font-bold text-slate-900">
                            ประวัติรายการล่าสุด (History & Real-time Edit)
                        </h2>
                        <span id="transactions-count-badge" class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            ${txs.length} รายการ
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">
                        ทดสอบ Demo Flow 2: เมื่อแก้ไขหมวดหมู่ของรายการในอดีต ความจำของระบบจะเปลี่ยนตามทันที
                    </p>
                </div>
                <div class="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/70">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Real-time Sync</span>
                </div>
            </div>
            ${filterBarHtml}
            ${listHtml}
        </section>
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
     * บันทึกลง MongoDB จริง เพื่อให้ระบบเกิด Passive Learning พร้อมป้องกันรายการซ้ำ
     */
    const result = await learnTransactions(user.id, items)

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

    const duplicateNoticeHtml = result.skippedDuplicates > 0
        ? `<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <span>⚠️</span>
            <span>พบรายการซ้ำเดิม ${result.skippedDuplicates} รายการ (ชื่อเดียวกันและเวลาเดียวกัน) ระบบจึงข้ามการบันทึกซ้ำ</span>
           </div>`
        : ''

    const toastMsg = result.skippedDuplicates > 0
        ? `บันทึกสำเร็จ ${result.insertedCount} รายการ (ข้ามรายการซ้ำ ${result.skippedDuplicates} รายการ)`
        : `บันทึกสำเร็จทั้งหมด ${items.length} รายการ (ระบบเรียนรู้แล้ว)`

    return c.html(`
        <div id="receipt-drawer-backdrop" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300">
            <div class="fixed inset-0 -z-10 cursor-pointer" onclick="closeReceiptDrawer()"></div>

            <div class="bg-white w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] border border-emerald-200 relative animate-in slide-in-from-bottom duration-300">
                <!-- Top Mobile Handle -->
                <div class="w-full flex items-center justify-center pt-3 pb-1 sm:hidden bg-emerald-50/40">
                    <div class="w-12 h-1.5 bg-slate-300 rounded-full"></div>
                </div>

                <div class="px-6 pt-5 pb-4 flex flex-col items-center text-center gap-2 bg-gradient-to-b from-emerald-50/50 via-white to-white">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900">บันทึกรายการสำเร็จ!</h2>
                        <p class="text-xs text-slate-500 mt-0.5">
                            ระบบได้บันทึก ${result.insertedCount} รายการสำหรับ ${escapeHtml(user.name)} และซิงค์ความจำแล้ว
                        </p>
                    </div>
                </div>

                <div class="w-full border-b-2 border-dashed border-slate-200"></div>

                <div class="p-5 overflow-y-auto flex flex-col gap-3 flex-1 bg-slate-50/40">
                    ${duplicateNoticeHtml}

                    <div class="rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
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
                toast.success("${toastMsg}");
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

    const statusText = enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'
    const badgeClass = enabled
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
        : 'bg-slate-100 text-slate-600 border-slate-200'

    const dotClass = enabled ? 'bg-emerald-500' : 'bg-slate-400'
    const toastMsg = enabled ? 'เปิดใช้งานความจำแล้ว' : 'ปิดใช้งานความจำแล้ว'

    return c.html(`
        <div id="user-memory-badge">
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass} transition-all">
                <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
                ${statusText}
            </span>
        </div>

        <span id="user-avatar-dot" hx-swap-oob="true" class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${dotClass} transition-all"></span>

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
    const recentTransactions = await getRecentTransactions(user.id, 15)
    const safeTitle = resolved.title.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <div id="recent-transactions-card" hx-swap-oob="outerHTML">
            ${renderRecentTransactionsCardHtml(user, recentTransactions)}
        </div>
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
 * ลบความจำสำหรับคำสำคัญที่ระบุ และส่งคืนการ์ด Memory Insights พร้อมประวัติล่าสุดฉบับอัปเดต
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
    const recentTransactions = await getRecentTransactions(user.id, 15)
    const safeKeyword = keyword.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <div id="recent-transactions-card" hx-swap-oob="outerHTML">
            ${renderRecentTransactionsCardHtml(user, recentTransactions)}
        </div>
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
 * ล้างความจำทั้งหมดของผู้ใช้ และส่งคืนการ์ด Memory Insights พร้อมประวัติล่าสุดฉบับว่างเปล่า
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
    const recentTransactions = await getRecentTransactions(user.id, 15)
    const safeName = user.name.replace(/'/g, "\\'")

    return c.html(`
        ${renderMemoryInsightsCardHtml(user, updatedMemories)}
        <div id="recent-transactions-card" hx-swap-oob="outerHTML">
            ${renderRecentTransactionsCardHtml(user, recentTransactions)}
        </div>
        <script>
            if (typeof toast !== 'undefined') {
                toast.success("ล้างความจำทั้งหมดของ ${safeName} สำเร็จ");
            }
        </script>
    `)
})
