import { Hono } from 'hono'
import { Eta } from 'eta'
import { parseTransactions } from '../modules/parser/transaction'

const eta = new Eta({ views: './src/views' })
export const uiRouter = new Hono()

uiRouter.get('/', async (c) => {
    const html = await eta.renderAsync('index', { title: 'Parnuan Take-Home' })
    return c.html(html)
})

uiRouter.post('/ui/parse', async (c) => {
    const body = await c.req.parseBody()
    const text = String(body.text ?? '')
    const transactions = parseTransactions(text)
    const html = await eta.renderAsync('review', { transactions })
    return c.html(html)
})

uiRouter.post('/ui/confirm', async (c) => {
    const body = await c.req.parseBody({ all: true })

    console.log('Confirmed:', body)

    const toArray = (val: unknown): string[] => {
        if (val === undefined || val === null) return []
        if (Array.isArray(val)) return val.map((v) => String(v))
        return [String(val)]
    }

    const descriptions = toArray(body.description)
    const amounts = toArray(body.amount)
    const categories = toArray(body.category)
    const dates = toArray(body.date)

    const categoryMap: Record<string, { label: string; icon: string; color: string }> = {
        food: { label: 'อาหาร', icon: '🍔', color: 'bg-orange-50 text-orange-700 border-orange-200' },
        shopping: { label: 'ช้อปปิ้ง', icon: '🛍️', color: 'bg-purple-50 text-purple-700 border-purple-200' },
        transport: { label: 'เดินทาง', icon: '🚗', color: 'bg-blue-50 text-blue-700 border-blue-200' },
        other: { label: 'อื่นๆ', icon: '📦', color: 'bg-slate-50 text-slate-700 border-slate-200' },
    }

    const escapeHtml = (str: string) =>
        str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')

    const items = descriptions.map((desc, i) => {
        const amt = parseFloat(amounts[i] ?? '0') || 0
        const catKey = categories[i] ?? 'other'
        const cat = categoryMap[catKey] ?? {
            label: catKey,
            icon: '🏷️',
            color: 'bg-slate-50 text-slate-700 border-slate-200',
        }
        const dateStr = dates[i]
        const d = dateStr ? new Date(dateStr) : new Date()
        const formattedDate = !isNaN(d.getTime())
            ? `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
            : 'วันนี้'

        return {
            description: desc,
            amount: amt,
            category: cat,
            date: formattedDate,
        }
    })

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

    const itemsHtml = items
        .map(
            (item, index) => `
            <div class="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                #${index + 1}
                </span>
                <div class="flex flex-col text-left gap-0.5">
                <span class="text-sm font-semibold text-slate-800">${escapeHtml(item.description)}</span>
                <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span class="text-xs ${item.category.color} border px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-medium">
                    <span>${item.category.icon}</span> ${item.category.label}
                    </span>
                    <span class="text-xs text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-medium">
                    <span>📅</span> ${item.date}
                    </span>
                </div>
                </div>
            </div>
            <div class="text-right pl-3 shrink-0">
                <span class="text-base font-bold text-emerald-600">
                ฿${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            </div>
        `,
        )
        .join('')

    return c.html(`
        <div class="bg-white border border-emerald-300 rounded-2xl p-5 sm:p-7 shadow-md flex flex-col gap-5">
        <!-- Header -->
        <div class="flex flex-col items-center text-center gap-2">
            <div>
            <h2 class="text-xl sm:text-2xl font-bold text-slate-800">บันทึกรายการสำเร็จ!</h2>
            <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
                ระบบได้บันทึก ${items.length} รายการลงในระบบเรียบร้อยแล้ว
            </p>
            </div>
        </div>

        <!-- Confirmed Items List (Unified List Group) -->
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div class="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>รายการที่บันทึกแล้ว</span>
            <span>จำนวนเงิน</span>
            </div>
            <div class="divide-y divide-slate-200">
            ${itemsHtml}
            </div>
        </div>

        <!-- Total Summary -->
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <div class="flex items-center gap-2 text-emerald-800 text-sm font-medium">
            <span>🧾</span>
            <span>บันทึกสำเร็จทั้งหมด ${items.length} รายการ</span>
            </div>
            <div class="text-right">
            <span class="text-xs text-emerald-600 block">ยอดรวมทั้งสิ้น</span>
            <span class="text-xl font-bold text-emerald-700">
                ฿${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            </div>
        </div>
        </div>
    `)
})