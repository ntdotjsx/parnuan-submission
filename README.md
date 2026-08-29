# Parnuan Software Engineer Intern — Take-Home Submission

ยินดีต้อนรับสู่ Repository การส่ง Take-Home Challenge สำหรับตำแหน่ง **Software Engineer Intern** ของ **Parnuan** ครับ

โปรเจกต์นี้จัดทำขึ้นโดยมีความตั้งใจที่จะแสดงกระบวนการคิด (Thought Process), การแก้ปัญหาภายใต้ความกำกวม (Operating under Ambiguity), การชั่งน้ำหนักข้อดีข้อเสีย (Trade-offs) และการส่งมอบซอฟต์แวร์ที่ทำงานได้จริง เรียบง่าย และตอบโจทย์ผู้ใช้งานจริงเป็นหลัก

---

## ข้อสังเกตและการพัฒนาอย่างต่อเนื่อง (Self-Reflection & Iterative Growth)

หลังจากที่พัฒนา Assignment 1 เสร็จสิ้นตามกรอบเวลา (เน้น Proof-of-Concept ของ Core Parsing Flow) ผมได้กลับมาทบทวนโค้ดและพบว่า Assignment 1 ยังมีจุดบกพร่องและช่องโหว่หลายประการอันเกิดจากการลืม Validate อย่างรัดกุม เช่น:
- การขาดการจัดการ XSS Attack / HTML Escaping ในบางจุดของ View Template
- การไม่มีกลไก Deduplication ทำให้สามารถบันทึกรายการที่มีชื่อและเวลาเดียวกันซ้ำซ้อนได้
- การตรวจสอบความถูกต้องของ Input Payload ที่ยังไม่ครอบคลุมทุก Edge Case

**เหตุผลที่ผมไม่ย้อนกลับไปแก้ไขโค้ดใน Assignment 1:**
ผมตั้งใจมองว่า Assignment 1 เป็นตัวแทนของชิ้นงาน Phase 1 ที่ถูกส่งมอบไปแล้วตาม Time-budget ที่กำหนด การย้อนกลับไปแก้ไขย้อนหลังอาจทำให้ไม่เห็นกระบวนการคิดและจุดเริ่มต้นที่แท้จริง

ผมจึงเลือกนำข้อผิดพลาดและช่องโหว่ทั้งหมด **มาแก้ไข ปรับปรุง และออกแบบใหม่อย่างถี่ถ้วนใน Assignment 2** แทน:
- เพิ่มการ Sanitization และ HTML Escaping ทุกจุดของ UI และ API
- จัดการ Data Integrity และ Unique Constraints บน MongoDB
- วางระบบ Validation ที่เข้มงวดทั้งขาเข้าและขาออก
- เพิ่มระบบ Error Handling และ Toast Notification แบบ Real-time เพื่อประสบการณ์ใช้งานที่ปลอดภัยและสมบูรณ์

---

## ความตั้งใจและแนวคิดในการพัฒนา (Developer's Mindset & Intention)

ในการทำ Take-Home ครั้งนี้ ผมตั้งใจวางแนวทางการทำงานไว้ 4 เรื่องหลัก:

1. **Focus on Core Flow & Real User Experience (ไม่ Over-engineering):**
   - แทนที่จะเสียเวลาไปกับการ Setup เครื่องมือที่ซับซ้อนเกินจำเป็น เช่น React SPA ขนาดใหญ่ หรือการยัดเยียด LLM ในจุดที่ไม่จำเป็น ผมเลือกใช้ **Hono + HTMX + Tailwind CSS บน Bun** เพื่อให้ได้ระบบที่เบา เร็ว และโฟกัสที่การแปลงข้อความเป็นข้อมูล (Parsing) กับประสบการณ์การตรวจทานของ User (Review Flow) ได้อย่างเต็มที่
2. **Human-in-the-loop & Transparency (ออกแบบโดยคำนึงถึงความจริง):**
   - ภาษาธรรมชาติของมนุษย์มีความกำกวมสูงมาก ระบบที่ดีจึงไม่ควร "เดาแล้วบันทึกให้เองแบบหลับหูหลับตา" แต่ต้องแสดงผลลัพธ์พร้อมระดับความมั่นใจ (Confidence Score) และมีหน้าจอให้ผู้ใช้ตรวจสอบ แก้ไข (Inspect/Edit) ได้สะดวกรวดเร็วก่อนยืนยันเสมอ
3. **Robust Data Architecture (สถาปัตยกรรมข้อมูลที่เชื่อถือได้):**
   - ใน Assignment 2 ผมเลือกใช้แนวคิด **Dynamic Derived View ผ่าน MongoDB Aggregation Pipeline** แทนการสร้างตาราง `memories` แยกต่างหาก การ Derive ความจำจากประวัติธุรกรรมโดยตรงช่วยป้องกันปัญหา Synchronization Drift ระหว่าง Store ความจำอิสระกับ Transaction Source of Truth ทำให้ประวัติการเงินและความจำของระบบซิงค์ตรงกันเสมอแบบ Real-time
4. **ความจริงใจและโปร่งใสในการทำงาน (Work Transparency):**
   - ในช่วงที่ทำโปรเจกต์นี้ ผมกำลังทำโปรเจกต์จบ (Senior Project) ควบคู่ไปด้วย จึงต้องบริหารเวลาอย่างเข้มงวด โดยผมได้บันทึกเวลาทำงานผ่าน **WakaTime** เพื่อแสดงเวลาและกระบวนการทำงานจริง
   - ผมใช้ AI เป็น Accelerator ในการช่วยระดมความคิด ร่างโครง UI และ Generate Test Cases จากนั้นนำมา Review, Refactor Logic และเขียน Core Architecture ด้วยตัวเองทุกส่วน

---

## เส้นทางและโครงสร้างโปรเจกต์ (Assignments Navigation)

Repository นี้แบ่งออกเป็น 2 Assignments หลักพร้อม Landing Hub สำหรับการตรวจสอบ:

```text
parnuan-submission/
├── assignment-1/               # [Required] Text -> Transaction Flow
│   ├── src/                    # Parser engine, Date extractor, Web UI routes
│   │   └── tests/              # Unit tests (40 tests, 68 assertions)
│   ├── static/                 # Styles & assets
│   ├── ASSIGNMENT.md           # เอกสารโจทย์ Assignment 1
│   ├── Dockerfile              # Docker container spec สำหรับ Assignment 1
│   └── README.md               # เอกสารสรุปเชิงลึกของ Assignment 1
│
├── assignment-2/               # [Bonus] Memory / Learn from Corrections
│   ├── src/                    # Memory engine, MongoDB models, Dashboard UI
│   │   └── tests/              # Unit tests (64 tests, 177 assertions)
│   ├── static/                 # Assets & icons
│   ├── ASSIGNMENT.md           # เอกสารโจทย์ Assignment 2
│   ├── Dockerfile              # Docker container spec สำหรับ Assignment 2
│   └── README.md               # เอกสารสรุปเชิงลึกของ Assignment 2
│
├── portal/                     # [Landing Hub] Submission launcher & live docs viewer
│   ├── Dockerfile              # Nginx web server container spec
│   └── index.html              # Swiss-minimalist portal UI & documentation reader
│
├── docker-compose.yml          # Orchestration สำหรับทุก Service (Portal, Apps, DB, DbGate)
└── README.md                   # เอกสารภาพรวมหลัก (หน้านี้)
```

---

## สรุปเนื้อหาของแต่ละ Assignment

### 1. [Assignment 1 — Text -> Transaction Flow](./assignment-1/README.md) `[Required]`
> **โฟกัส:** Parsing ภาษาไทย, Product Inference, การจัดการความกำกวม และ Review Flow

* **สิ่งที่พัฒนา:**
  * **Rule-based & Regex Parsing Engine:** แยกรายการเดี่ยว/หลายรายการในข้อความเดียว เช่น `ข้าวมันไก่ 50 น้ำเปล่า 7 แล้วก็ช้อปปิ้ง 500`
  * **Contextual Thai Date/Time Extraction:** สกัดวันเวลาคำภาษาไทย เช่น `เมื่อวานตอน 5 โมงครึ่ง` แปลงเป็น ISO Timestamp ที่ถูกต้อง
  * **Category Classification & Confidence Scoring:** จับคู่หมวดหมู่อัตโนมัติ พร้อมประเมินคะแนนความมั่นใจ
  * **Interactive Review & Confirm UI:** หน้าเว็บสำหรับให้ผู้ใช้ตรวจสอบ แก้ไข และกดยืนยันบันทึกข้อมูล
* **เอกสารฉบับเต็ม:** [อ่าน README ของ Assignment 1](./assignment-1/README.md)

---

### 2. [Assignment 2 — Memory & Learn from Corrections](./assignment-2/README.md) `[Optional / Bonus]`
> **โฟกัส:** Personalization, Data Modeling, Multi-user Isolation และ Trust & Transparency

* **สิ่งที่พัฒนา:**
  * **Passive Learning System:** เรียนรู้พฤติกรรมผู้ใช้จากประวัติธุรกรรมจริงที่กดยืนยัน (Confirmed Transactions) โดยไม่ต้องสอนกฎเอง
  * **Multi-User Isolation:** แยกความจำของผู้ใช้แต่ละคนอย่างเด็ดขาด (เช่น "นัท" จัด `ข้าวมันไก่` เป็น `ข้าวเช้า`, "เติ้ล" จัดเป็น `อาหาร`)
  * **Derived Memory Layer (MongoDB Aggregation):** คำนวณความจำแบบ on-demand ด้วย Majority Rule + Recency Tie-Breaker ไม่เกิดปัญหาข้อมูลค้างเมื่อมีการแก้ไขหรือลบ
  * **Inspectable & Manageable Memory Dashboard:** หน้าแดชบอร์ดแบบ 2 คอลัมน์ สามารถดูคำที่ระบบจำได้ ลบคำที่ไม่ต้องการ ล้างความจำทั้งหมด หรือปิดสวิตช์ระบบความจำได้ตามใจชอบ
* **เอกสารฉบับเต็ม:** [อ่าน README ของ Assignment 2](./assignment-2/README.md)

---

## Tech Stack ภาพรวม

| ชั้นของระบบ | เทคโนโลยีที่เลือกใช้ | เหตุผล |
|---|---|---|
| **Runtime** | [Bun](https://bun.sh/) (v1.2+) | ความเร็วสูง ติดตั้งง่าย มี Native TypeScript & Test Runner ในตัว |
| **Language** | TypeScript | Type-safe ชัดเจน ลดบั๊กใน Data Model และ Parsing Logic |
| **Web Server** | [Hono](https://hono.dev/) | Web Framework ขนาดเล็ก เร็ว เหมาะกับทั้ง REST API และ SSR |
| **Frontend & UI** | [HTMX](https://htmx.org/) + [Eta](https://eta.js.org/) + [Tailwind CSS](https://tailwindcss.com/) | พัฒนา Dynamic UI ได้รวดเร็ว โค้ดกระชับ ไม่ต้องใช้ Build Pipeline ของ SPA |
| **Database (Assign 2)** | MongoDB (ผ่าน Docker) | ยืดหยุ่น เหมาะกับการทำ Aggregation Pipeline เพื่อสร้าง Derived View |
| **Testing** | Bun Test | รัน Unit Tests รวมทั้งสิ้น **104 tests (245 assertions)** ได้รวดเร็วระดับมิลลิวินาที (100% Passing) |

---

## วิธีการติดตั้งและรันโปรเจกต์ (Quick Start)

### วิธีที่ 1: รันทุกระบบพร้อมกันด้วย Docker Compose (แนะนำสำหรับพี่ๆ ผู้ตรวจ)

เพียงคำสั่งเดียว ระบบจะ Build และเริ่มทำงานทุก Container พร้อมกัน (Assignment 1, Assignment 2, MongoDB, DbGate และ Landing Hub):

```bash
docker compose up -d --build
```

เมื่อระบบเริ่มทำงานเรียบร้อย สามารถเปิดเข้าใช้งานได้ทันทีผ่าน Browser:

- **Submission Hub (หน้าหลักรวมลิงก์ทั้งหมด):** [http://localhost:3000](http://localhost:3000)
- **Assignment 1 (Text -> Transaction Flow):** [http://localhost:3001](http://localhost:3001)
- **Assignment 2 (Personalized Memory Engine):** [http://localhost:3002](http://localhost:3002)
- **DbGate (MongoDB Web GUI):** [http://localhost:3003](http://localhost:3003)

คำสั่งตรวจสอบสถานะและ Logs:
```bash
# ตรวจสอบสถานะทุก Container
docker compose ps

# ดู Logs การทำงานทั้งหมด
docker compose logs -f
```

---

### วิธีที่ 2: รันแบบ Standalone ด้วย Bun (Local Development)

หากต้องการรันหรือทดสอบโค้ดบนเครื่องโดยตรง (ต้องมี Bun v1.2+):

#### รัน Assignment 1
```bash
cd assignment-1
bun install
bun test          # รัน Unit Tests (40 tests, 68 assertions)
bun dev           # เปิดเว็บที่ http://localhost:3000
```

#### รัน Assignment 2
```bash
# 1. เปิด MongoDB ผ่าน Docker จาก root
docker compose up mongodb -d

# 2. เข้าโฟลเดอร์ assignment-2
cd assignment-2
bun install
bun test          # รัน Unit Tests (64 tests, 177 assertions)
bun dev           # เปิดเว็บที่ http://localhost:3000
```

---

## บันทึกเวลาและการทำงาน (Time Tracking)

* **Assignment 1:** ใช้เวลาพัฒนาจริงประมาณ ~3 ชั่วโมง (วิเคราะห์โจทย์, ทำ Core Parser, ทำ Review UI, เขียน Tests และเอกสาร)
* **Assignment 2:** ใช้เวลาพัฒนาจริงประมาณ ~4.5 ชั่วโมง (ออกแบบ Data Model, เขียน Aggregation Pipeline, ทำ Sidebar Dashboard, จัดการ State และ Tests)
* **บันทึกเวลา WakaTime:** สามารถตรวจสอบเวลาการโค้ดจริงได้ที่ [WakaTime Project Summary](https://wakatime.com/@b5617e76-29cb-4464-8898-c452637c23bd/projects/usaecwkszz?start=2026-08-23&end=2026-08-29)

---

## ข้อมูลผู้จัดทำ (Contact)

- **ผู้พัฒนา:** ธนพล พ่ออามาตย์ นัท (ntdotjsx)
- **ตำแหน่งที่สมัคร:** Software Engineer Intern — Parnuan
- **เบอร์โทรศัทพ์:** 0826419844
- **ไลน์:** 9nut000777
- **อีเมล:** 0ms.ntdotjsx@gmail.com
- **other contact:** https://www.ntdotjsx.site/
