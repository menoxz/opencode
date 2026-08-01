<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="شعار فرع OpenCode">
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

يُنشر الفرع على npm تحت النطاق `@lux-tech` ويُثبّت ملفًا ثنائيًا باسم `opencode`،
تمامًا مثل الحزمة الرسمية. وهذا يعني أن الفرع **يستبدل** opencode الرسمي عندما
يكون كلاهما مثبتًا عالميًا — اقرأ **التعايش مع opencode الرسمي** قبل التثبيت.

### الموصى به: npm

```bash
npm install -g @lux-tech/opencode-ai
```

التحقق:

```bash
opencode --version
# opencode v1.18.55 (أو أحدث إصدار منشور)
```

الحزمة الوصفية `@lux-tech/opencode-ai` تقوم تلقائيًا بتنزيل الملف الثنائي الصحيح
لمنصتك من أحد الاعتماديات الاختيارية الاثني عشر (انظر **جدول الملفات الثنائية
للمنصات**) وتعرضه كملف `opencode` الثنائي.

### بديل: إصدارات GitHub (يدويًا)

تُنشر أرشيفات الإصدارات على
[صفحة الإصدارات](https://github.com/menoxz/opencode/releases) بصيغة `.tar.gz`
(لينكس) و`.zip` (ماك / ويندوز). يحتوي كل أرشيف على الملف الثنائي `opencode`
(أو `opencode.exe`) في جذره.

```bash
# مثال: لينكس x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # أعد التسمية لتجنب استبدال الملف الثنائي الرسمي
```

```powershell
# مثال: ويندوز x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### موقع الملف الثنائي

| طريقة التثبيت | مسار الملف الثنائي |
|---|---|
| npm (ويندوز) | `%APPDATA%\npm\opencode.exe` |
| npm (لينكس / ماك) | `$(npm prefix -g)/bin/opencode` |
| إصدار GitHub (يدويًا) | أينما وضعته |

### التحديث

```bash
# المحدّث المدمج (يجلب أحدث إصدار من @lux-tech/opencode-ai)
opencode upgrade

# أو عبر npm
npm update -g @lux-tech/opencode-ai
```

### الإزالة

```bash
npm uninstall -g @lux-tech/opencode-ai
```

على ويندوز، احذف أيضًا الملف الوسيط القديم (shim) إذا تركه npm:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## التعايش مع opencode الرسمي

**كلا من الفرع (`@lux-tech/opencode-ai`) وopencode الرسمي (`opencode-ai`)
يثبّتان ملفًا ثنائيًا باسم `opencode`.** تثبيت أحدهما عالميًا بعد الآخر يستبدل
الملف الثنائي السابق بصمت. لا يمكنك الاحتفاظ بكليهما كملف `opencode` العالمي
في نفس الوقت.

### أيّهما يجب أن تستخدم؟

| الحاجة | الاستخدام |
|---|---|
| خوادم MCP التي تعيد الاتصال تلقائيًا، hot reload، eval pipeline، memory consolidation، unified prompt | **هذا الفرع** (`@lux-tech/opencode-ai`) |
| الإصدار الرسمي الموثّق على نطاق واسع | [opencode الرسمي](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### الخيار أ — تثبيت عالمي واحد + `npx` للآخر (موصى به)

ثبّت الفرع عالميًا وشغّل opencode الرسمي عند الحاجة دون تثبيته عالميًا:

```bash
npm install -g @lux-tech/opencode-ai   # الفرع يصبح `opencode` العالمي

# استخدم opencode الرسمي دون المساس بالتثبيت العالمي:
npx -y opencode-ai@latest
```

أو العكس — أبقِ opencode الرسمي مثبتًا عالميًا وشغّل الفرع عند الحاجة:

```bash
npm install -g opencode-ai             # الرسمي يصبح `opencode` العالمي
npx -y @lux-tech/opencode-ai@latest    # تشغيل الفرع عند الحاجة
```

### الخيار ب — تثبيت كلاهما، مع إعادة تسمية أحدهما

ثبّت كلاهما، ثم أعد تسمية الملف الثنائي الثانوي حتى لا تتعارض الأمران:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # يستبدل `opencode` — نفّذ هذا ثانيًا
```

ثم على ويندوز أعد تسمية الملف الثنائي للفرع إلى `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # الفرع
opencode --version        # الرسمي
```

على لينكس / ماك:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # الفرع
opencode --version        # الرسمي
```

### التحقق من الملف الثنائي النشط حاليًا

```bash
which opencode                # مسار الملف الثنائي النشط
opencode --version            # إصدار الملف الثنائي النشط
opencode upgrade --help       # المحدّث المدمج يستهدف @lux-tech/opencode-ai
```

> [!TIP]
> المحدّث المدمج (`opencode upgrade`) يجلب دائمًا `@lux-tech/opencode-ai`.
> إذا أردت أن يتحدّث opencode **الرسمي** تلقائيًا، شغّله عبر
> `npx opencode-ai@latest` أو المثبّت الرسمي (انظر
> [opencode.ai](https://opencode.ai)).

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
