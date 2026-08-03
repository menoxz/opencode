<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="شعار فرع OpenCode">
    </picture>
  </a>
</p>
<p align="center">وكيل البرمجة بالذكاء الاصطناعي مفتوح المصدر — فرع من مجتمع المطورين.

> **إشعار الفرع (Fork)** — هذا المستودع (`menoxz/opencode`) هو فرع من
> [opencode الرسمي](https://github.com/anomalyco/opencode) من مجتمع المطورين
> مع ميزات إضافية (MCP auto-reconnect، hot reload، eval pipeline،
> memory consolidation، unified prompt). وهو **غير تابع** لفريق opencode الرسمي.
> **انظر اختلافات الفرع ←**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="الرخصة" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
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

[![واجهة OpenCode الطرفية](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## التثبيت (الفرع)

يُنشر الفرع على npm تحت النطاق `@lux-tech` ويُثبّت أمره باسم **`opencodev2`** — ملف
ثنائي منفصل **يتعايش** مع opencode الرسمي (المثبَّت من `opencode-ai`). كما يستخدم
أدلة بيانات/إعدادات خاصة به (`~/.local/share/opencodev2`، `~/.config/opencodev2`)،
لذلك يمكن تشغيل المنتجين جنبًا إلى جنب دون المساس ببيانات بعضهما. عند أول تشغيل
تفاعلي، يعرض الفرع استيراد إعدادات opencode ومفاتيح API وسجلّ الجلسات الحالية —
يبقى التثبيت الأصلي كما هو. اقرأ **التعايش مع opencode الرسمي**.

### الموصى به: npm

```bash
npm install -g @lux-tech/opencode-ai
```

التحقق:

```bash
opencodev2 --version
# 1.18.59 (أو أحدث إصدار منشور)
```

الحزمة الوصفية `@lux-tech/opencode-ai` تقوم تلقائيًا بتنزيل الملف الثنائي الصحيح
لمنصتك من أحد الاعتماديات الاختيارية الاثني عشر (انظر **جدول الملفات الثنائية
للمنصات**) وتعرضه كأمر `opencodev2`.

### بديل: إصدارات GitHub (يدويًا)

تُنشر أرشيفات الإصدارات على
[صفحة الإصدارات](https://github.com/menoxz/opencode/releases) بصيغة `.tar.gz`
(لينكس) و`.zip` (ماك / ويندوز). يحتوي كل أرشيف على الملف الثنائي CLI المُجمَّع في
جذره — عند التثبيت يدويًا أعد تسميته إلى `opencodev2` حتى لا يتعارض أبدًا مع الملف
الثنائي `opencode` الرسمي.

```bash
# مثال: لينكس x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # اسم منفصل، لا تعارض مع الملف الثنائي الرسمي
```

```powershell
# مثال: ويندوز x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### موقع الملف الثنائي

| طريقة التثبيت | مسار الملف الثنائي |
|---|---|
| npm (ويندوز) | `%APPDATA%\npm\opencodev2.exe` |
| npm (لينكس / ماك) | `$(npm prefix -g)/bin/opencodev2` |
| إصدار GitHub (يدويًا) | أينما وضعته |

### التحديث

```bash
# المحدّث المدمج (يجلب أحدث إصدار من @lux-tech/opencode-ai)
opencodev2 upgrade

# أو عبر npm
npm update -g @lux-tech/opencode-ai
```

### الإزالة

```bash
npm uninstall -g @lux-tech/opencode-ai
```

على ويندوز، احذف أيضًا الملف الوسيط القديم (shim) إذا تركه npm:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## التعايش مع opencode الرسمي

يثبّت الفرع (`@lux-tech/opencode-ai`) أمره باسم **`opencodev2`** بينما يثبّت opencode
الرسمي (`opencode-ai`) اسم `opencode`. الاسمَان لا يتعارضان أبدًا، ويستخدم الفرع
أدلة البيانات الخاصة به (`~/.local/share/opencodev2`، `~/.config/opencodev2`،
`~/.local/state/opencodev2`، `~/.cache/opencodev2`)، لذلك **يمكن تثبيت الاثنين
واستخدامهما في نفس الوقت**.

### معالج الترحيل عند التشغيل الأول

عند أول تشغيل تفاعلي، يكتشف `opencodev2` ما إذا كان هناك تثبيت opencode سابق
(إعدادات، مفاتيح API، جلسات) ويسألك عما تريد فعله:

- **استيراد (موصى به)** — ينسخ إعداداتك وبيانات اعتمادك (`auth.json`) وسجلّ الجلسات
  (`opencode.db`) من أدلة opencode الأصلية إلى أدلة opencodev2. تبقى البيانات
  الأصلية كما هي.
- **لاحقًا** — يبدأ ببيانات فارغة ويسأل مجددًا عند التشغيل التالي.
- **أبدًا** — يبدأ ببيانات opencodev2 فارغة (ملف علامة يمنع الأسئلة اللاحقة).

يمكن للبيئات غير التفاعلية (CI، السكربتات) فرض السلوك:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # استيراد غير تفاعلي
OPENCODEV2_MIGRATE=skip opencodev2 ...   # تخطٍّ ووضع علامة كأنه قُرِّر
```

يعمل المعالج مرة واحدة فقط لكل دليل بيانات (يسجّل ملف العلامة `.migrate-state`
القرار). بعد الاستيراد، تعود قاعدة البيانات المنسوخة إلى opencodev2 — ولا تلمس
ترحيلات قاعدة بيانات opencodev2 اللاحقة تثبيت opencode الأصلي أبدًا.

### أيّهما يجب أن تستخدم؟

| الحاجة | الاستخدام |
|---|---|
| خوادم MCP التي تعيد الاتصال تلقائيًا، hot reload، eval pipeline، memory consolidation، unified prompt | **هذا الفرع** (`opencodev2`) |
| الإصدار الرسمي الموثّق على نطاق واسع | [opencode الرسمي](https://github.com/anomalyco/opencode) (`opencode`) |

يبقى كلاهما محدَّثًا بشكل مستقل:

```bash
opencodev2 upgrade        # تحديث الفرع (@lux-tech/opencode-ai)
opencode upgrade          # تحديث opencode الرسمي (opencode-ai)
```

---

## الملفات الثنائية للمنصات

يُوزَّع `@lux-tech/opencode-ai` كحزمة وصفية تحتوي على 12 ملفًا ثنائيًا
اختياريًا للمنصات (جميعها منشورة بنفس الإصدار):

| الحزمة | المنصة / المعالج | ملاحظات |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | معالجات بدون AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | معالجات بدون AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl، بدون AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | معالجات بدون AVX2 |

---

## الوكلاء (Agents)

يتضمن OpenCode وكيلين مدمجين يمكنك التبديل بينهما بمفتاح `Tab`.

- **build** — الافتراضي، وكيل بصلاحيات كاملة لأعمال التطوير
- **plan** — وكيل للقراءة فقط لتحليل واستكشاف الكود
  - يرفض تعديل الملفات افتراضيًا
  - يطلب الإذن قبل تشغيل أوامر bash
  - مثالي لاستكشاف قواعد أكواد غير مألوفة أو التخطيط للتغييرات

يتضمن أيضًا وكيلًا فرعيًا **general** للبحث المعقد والمهام متعددة الخطوات.
يُستخدم داخليًا ويمكن استدعاؤه باستخدام `@general` في الرسائل.

يوفر الفرع أيضًا وكيل **planner** الذي يفكّك المهام تلقائيًا قبل التنفيذ.
تعرّف على المزيد حول
[الوكلاء في التوثيق الرسمي](https://opencode.ai/docs/agents) — السلوك متوافق
مع المشروع الأصلي (upstream).

---

## التوثيق

- **توثيق خاص بالفرع** موجود في هذا المستودع: [`docs/`](./docs)
  (البنية المعمارية، ADR، hot reload وتصميم MCP) و[`CHANGELOG.md`](./CHANGELOG.md).
- **توثيق الإعداد العام** متوافق مع التوثيق الرسمي:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## اختلافات الفرع

يضيف هذا الفرع (`menoxz/opencode`) الميزات التالية فوق المشروع الأصلي:

| الميزة | الوصف |
|---------|-------------|
| **MCP Auto-reconnect** | يتم اكتشاف خوادم MCP التي انقطعت اتصالاتها (أحداث النقل + فحص الصحة) وإعادة توصيلها تلقائيًا مع تأخير أسي — لا مزيد من حالة "connected" القديمة أو الجلسات الميتة |
| **Hot Reload** | يتم إعادة تحميل الوكلاء والإضافات وخوادم MCP تلقائيًا عند تغيير الملفات — لا حاجة لإعادة التشغيل |
| **Eval Pipeline** | تقييم قائم على SQLite مع اكتشاف الانحدارات وتحليل الاتجاهات وأوامر CLI للمقارنة |
| **Memory Consolidation** | ذاكرة عبر الجلسات مع تلاشٍ تلقائي واكتشاف الأنماط وتحليل ما بعد الحادث |
| **Unified Prompt** | ملف `core.txt` واحد يحل محل 10 مطالبات خاصة بالنماذج — أنظف وأصغر وأسهل في الصيانة |
| **Continuous Improvement** | الأساليب وثائق حية — حدّث المهارات (skills) الحالية مع سجل التغييرات بدلًا من إنشاء نسخ مكررة |
| **Planner Integration** | وكيل `planner` المدمج يفكّك المهام تلقائيًا قبل التنفيذ |
| **هوية opencodev2 + الترحيل** | يُثبَّت باسم `opencodev2` مع أدلة بيانات خاصة به، فيتعايش مع opencode الرسمي; معالج التشغيل الأول يستورد إعداداتك ومفاتيح API وسجلّ الجلسات عند الطلب |

تُرقَّم الميزات الجديدة في [`CHANGELOG.md`](./CHANGELOG.md).

---

## المساهمة

إذا كنت مهتمًا بالمساهمة في هذا الفرع، يرجى قراءة
[توثيق المساهمة](./CONTRIBUTING.md) قبل إرسال pull request. تستهدف طلبات
السحب (pull requests) فرع `dev`.

---

## البناء فوق OpenCode

إذا كنت تعمل على مشروع متعلق بـ OpenCode ويستخدم "opencode" كجزء من اسمه،
على سبيل المثال "opencode-dashboard" أو "opencode-mobile"، يرجى إضافة ملاحظة
في README الخاص بك لتوضيح أنه لم يُبنَ بواسطة فريق OpenCode وليس مرتبطًا بنا
بأي شكل.

---

**أبلغ عن المشكلات** على [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**المصدر** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
