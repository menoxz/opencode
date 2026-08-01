<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="โลโก้ OpenCode fork">
    </picture>
  </a>
</p>
<p align="center">เอเจนต์เขียนโค้ดด้วย AI แบบโอเพนซอร์ส — ฟอร์กของชุมชน

> **ประกาศฟอร์ก** — ที่เก็บนี้ (`menoxz/opencode`) เป็นฟอร์กของชุมชนจาก [opencode อย่างเป็นทางการ](https://github.com/anomalyco/opencode)
> พร้อมฟีเจอร์เพิ่มเติม (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt)
> **ไม่ได้เกี่ยวข้อง** กับทีม opencode อย่างเป็นทางการ
> **ดูความแตกต่างของฟอร์ก →**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="License" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode เทอร์มินัล UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## การติดตั้ง (fork)

ฟอร์กนี้เผยแพร่บน npm ภายใต้สโคป `@lux-tech` และติดตั้งไบนารีชื่อ `opencode` เช่นเดียวกับแพ็กเกจอย่างเป็นทางการ หมายความว่าเมื่อติดตั้งทั้งสองแบบ global ฟอร์กจะ**แทนที่** opencode อย่างเป็นทางการ — โปรดอ่าน**การอยู่ร่วมกับ opencode อย่างเป็นทางการ**ก่อนติดตั้ง

### แนะนำ: npm

```bash
npm install -g @lux-tech/opencode-ai
```

ตรวจสอบ:

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

เมตาแพ็กเกจ `@lux-tech/opencode-ai` จะดาวน์โหลดไบนารีที่ถูกต้องสำหรับแพลตฟอร์มของคุณโดยอัตโนมัติจากหนึ่งใน 12 ดีเพนเดนซีแบบทางเลือก (ดู**ตารางไบนารีตามแพลตฟอร์ม**) และเปิดเผยเป็นไบนารี `opencode`

### ทางเลือก: GitHub Releases (ด้วยตนเอง)

อาร์ไคฟ์ของรุ่นเผยแพร่ถูกโพสต์ที่[หน้าปล่อยรุ่น](https://github.com/menoxz/opencode/releases) ในรูปแบบ `.tar.gz` (Linux) และ `.zip` (macOS / Windows) แต่ละอาร์ไคฟ์มีไบนารี `opencode` (หรือ `opencode.exe`) อยู่ที่รากของมัน

```bash
# Example: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # rename to avoid clobbering the official binary
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### ตำแหน่งของไบนารี

| วิธีติดตั้ง | เส้นทางไบนารี |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (ด้วยตนเอง) | ที่ใดก็ตามที่คุณวางไว้ |

### อัปเดต

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### ถอนการติดตั้ง

```bash
npm uninstall -g @lux-tech/opencode-ai
```

บน Windows ให้ลบ shim ที่ล้าสมัยที่ npm ทิ้งไว้ด้วย:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## การอยู่ร่วมกับ opencode อย่างเป็นทางการ

**ทั้งฟอร์ก (`@lux-tech/opencode-ai`) และ opencode อย่างเป็นทางการ (`opencode-ai`) ต่างติดตั้งไบนารีชื่อ `opencode`** การติดตั้งตัวใดตัวหนึ่งแบบ global ทับอีกตัวจะแทนที่ไบนารีก่อนหน้าอย่างเงียบ ๆ คุณไม่สามารถเก็บทั้งคู่เป็น `opencode` ระดับ global พร้อมกันได้

### ควรใช้ตัวไหน?

| ความต้องการ | ใช้ |
|---|---|
| MCP servers ที่ auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **ฟอร์กนี้** (`@lux-tech/opencode-ai`) |
| รุ่นอย่างเป็นทางการที่ผ่านการตรวจสอบอย่างกว้างขวาง | [opencode อย่างเป็นทางการ](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### ตัวเลือก A — ติดตั้งแบบ global หนึ่งตัว + ใช้ `npx` สำหรับอีกตัว (แนะนำ)

ติดตั้งฟอร์กแบบ global และรัน opencode อย่างเป็นทางการตามความต้องการโดยไม่ต้องติดตั้งแบบ global:

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

หรือกลับกัน — คง opencode อย่างเป็นทางการเป็น global และรันฟอร์กตามความต้องการ:

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### ตัวเลือก B — ติดตั้งทั้งคู่ แล้วเปลี่ยนชื่อหนึ่งตัว

ติดตั้งทั้งคู่ แล้วเปลี่ยนชื่อไบนารีรองเพื่อให้สองคำสั่งไม่ชนกัน:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

จากนั้นบน Windows เปลี่ยนชื่อไบนารีของฟอร์กเป็น `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

บน Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### ตรวจสอบว่าไบนารีใดทำงานอยู่

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> ตัวอัปเดตในตัว (`opencode upgrade`) จะดึง `@lux-tech/opencode-ai` เสมอ
> หากต้องการให้ opencode **อย่างเป็นทางการ** อัปเดตอัตโนมัติ ให้รันผ่าน `npx opencode-ai@latest` หรือตัวติดตั้งอย่างเป็นทางการ
> (ดู [opencode.ai](https://opencode.ai))

---

## ไบนารีตามแพลตฟอร์ม

`@lux-tech/opencode-ai` เผยแพร่เป็นเมตาแพ็กเกจที่มีไบนารีตามแพลตฟอร์ม 12 ตัว (เผยแพร่ที่เวอร์ชันเดียวกันทั้งหมด):

| แพ็กเกจ | แพลตฟอร์ม / CPU | หมายเหตุ |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPU ที่ไม่มี AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPU ที่ไม่มี AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, ไม่มี AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPU ที่ไม่มี AVX2 |

---

## เอเจนต์

OpenCode มีเอเจนต์ในตัวสองตัวที่คุณสามารถสลับได้ด้วยปุ่ม `Tab`

- **build** - ค่าเริ่มต้น เอเจนต์สิทธิ์เต็มสำหรับงานพัฒนา
- **plan** - เอเจนต์อ่านอย่างเดียวสำหรับการวิเคราะห์และสำรวจโค้ด
  - ปฏิเสธการแก้ไขไฟล์โดยค่าเริ่มต้น
  - ขออนุญาตก่อนรันคำสั่ง bash
  - เหมาะสำหรับสำรวจโค้ดเบสที่ไม่คุ้นเคยหรือวางแผนการเปลี่ยนแปลง

นอกจากนี้ยังมีเอเจนต์ย่อย **general** สำหรับการค้นหาที่ซับซ้อนและงานหลายขั้นตอน ใช้ภายในและสามารถเรียกใช้ได้ด้วยการพิมพ์ `@general` ในข้อความ

ฟอร์กยังมาพร้อมเอเจนต์ **planner** ที่แยกย่อยงานโดยอัตโนมัติก่อนดำเนินการ เรียนรู้เพิ่มเติมเกี่ยวกับ[เอเจนต์ในเอกสารอย่างเป็นทางการ](https://opencode.ai/docs/agents) — พฤติกรรมเข้ากันได้กับ upstream

---

## เอกสารประกอบ

- **เอกสารเฉพาะของฟอร์ก** อยู่ในที่เก็บนี้: [`docs/`](./docs) (สถาปัตยกรรม, ADRs, การออกแบบ hot reload และ MCP) และ [`CHANGELOG.md`](./CHANGELOG.md)
- **เอกสารการกำหนดค่าทั่วไป** เข้ากันได้กับเอกสารอย่างเป็นทางการ: [opencode.ai/docs](https://opencode.ai/docs)

---

## ความแตกต่างของฟอร์ก

ฟอร์กนี้ (`menoxz/opencode`) เพิ่มฟีเจอร์ต่อไปนี้เหนือ upstream:

| ฟีเจอร์ | คำอธิบาย |
|---|---|
| **MCP Auto-reconnect** | เซิร์ฟเวอร์ MCP ที่การเชื่อมต่อขาดจะถูกตรวจพบ (เหตุการณ์ transport + การ ping สุขภาพ) และเชื่อมต่อใหม่โดยอัตโนมัติด้วย exponential backoff — ไม่มีสถานะ "เชื่อมต่อแล้ว" ที่ค้างหรือเซสชันที่ตายอีกต่อไป |
| **Hot Reload** | เอเจนต์ ปลั๊กอิน และเซิร์ฟเวอร์ MCP โหลดใหม่โดยอัตโนมัติเมื่อไฟล์เปลี่ยน — ไม่ต้องรีสตาร์ท |
| **Eval Pipeline** | การประเมินที่ใช้ SQLite พร้อมการตรวจจับ regression การวิเคราะห์แนวโน้ม และคำสั่ง compare CLI |
| **Memory Consolidation** | หน่วยความจำข้ามเซสชัน พร้อมการสลายอัตโนมัติ การตรวจจับรูปแบบ และการวิเคราะห์หลังจบ |
| **Unified Prompt** | `core.txt` ไฟล์เดียวแทนพรอมป์ตเฉพาะโมเดล 10 ตัว — สะอาดกว่า เล็กกว่า ดูแลง่ายกว่า |
| **Continuous Improvement** | เมธอดคือเอกสารที่มีชีวิต — อัปเดตสกิลที่มีอยู่ด้วย changelog แทนการสร้างซ้ำซ้อน |
| **Planner Integration** | เอเจนต์ `planner` ในตัวแยกย่อยงานก่อนดำเนินการโดยอัตโนมัติ |

ฟีเจอร์ใหม่ถูกบันทึกเวอร์ชันใน [`CHANGELOG.md`](./CHANGELOG.md)

---

## การมีส่วนร่วม

หากคุณสนใจมีส่วนร่วมกับฟอร์กนี้ โปรดอ่าน[เอกสารการมีส่วนร่วม](./CONTRIBUTING.md)ก่อนส่ง pull request พูลรีเควสต์จะมุ่งไปที่สาขา `dev`

---

## การสร้างบน OpenCode

หากคุณทำงานในโปรเจกต์ที่เกี่ยวข้องกับ OpenCode และใช้ "opencode" เป็นส่วนหนึ่งของชื่อ เช่น "opencode-dashboard" หรือ "opencode-mobile" โปรดเพิ่มหมายเหตุใน README ของคุณเพื่อชี้แจงว่าไม่ได้สร้างโดยทีม OpenCode และไม่ได้เกี่ยวข้องกับเราในทางใด

---

**รายงานปัญหา** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**ซอร์สโค้ด** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
