<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode ফর্ক লোগো">
    </picture>
  </a>
</p>
<p align="center">ওপেন সোর্স এআই কোডিং এজেন্ট — কমিউনিটি ফর্ক।

> **ফর্ক বিজ্ঞপ্তি** — এই রিপোজিটরি (`menoxz/opencode`) হলো [অফিসিয়াল opencode](https://github.com/anomalyco/opencode)-এর
> একটি কমিউনিটি ফর্ক, যেখানে অতিরিক্ত ফিচার রয়েছে (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt)।
> এটি অফিসিয়াল opencode টিমের সাথে **সম্পর্কিত নয়**।
> **ফর্কের পার্থক্য দেখুন →**</p>
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

[![OpenCode টার্মিনাল UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## ইনস্টলেশন (ফর্ক)

ফর্কটি npm-এ `@lux-tech` স্কোপের অধীনে প্রকাশিত হয় এবং অফিসিয়াল প্যাকেজের মতোই `opencode` নামে একটি বাইনারি ইনস্টল করে। এর মানে হলো, দুটোই গ্লোবালি ইনস্টল করলে ফর্কটি অফিসিয়াল opencode-কে **প্রতিস্থাপন** করে — ইনস্টল করার আগে **অফিসিয়াল opencode-এর সাথে সহাবস্থান** পড়ুন।

### প্রস্তাবিত: npm

```bash
npm install -g @lux-tech/opencode-ai
```

যাচাই করুন:

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

মেটা-প্যাকেজ `@lux-tech/opencode-ai` তার ১২টি অপশনাল ডিপেনডেন্সির একটি থেকে সঠিক প্ল্যাটফর্মের বাইনারি স্বয়ংক্রিয়ভাবে ডাউনলোড করে (দেখুন **প্ল্যাটফর্ম বাইনারির তালিকা**) এবং সেটিকে `opencode` বাইনারি হিসেবে প্রকাশ করে।

### বিকল্প: GitHub Releases (ম্যানুয়াল)

রিলিজ আর্কাইভগুলো [রিলিজ পেজে](https://github.com/menoxz/opencode/releases) `.tar.gz` (Linux) এবং `.zip` (macOS / Windows) ফরম্যাটে প্রকাশিত হয়। প্রতিটি আর্কাইভের রুটে `opencode` (বা `opencode.exe`) বাইনারি থাকে।

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

### বাইনারির অবস্থান

| ইনস্টল পদ্ধতি | বাইনারির পাথ |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub রিলিজ (ম্যানুয়াল) | যেখানে খুশি রাখুন |

### আপডেট

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### আনইনস্টল

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows-এ, npm রেখে যাওয়া পুরনো shim-ও মুছে ফেলুন:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## অফিসিয়াল opencode-এর সাথে সহাবস্থান

**ফর্ক (`@lux-tech/opencode-ai`) এবং অফিসিয়াল opencode (`opencode-ai`) দুটোই `opencode` নামে একটি বাইনারি ইনস্টল করে।** একটির পরে অন্যটি গ্লোবালি ইনস্টল করলে আগের বাইনারিটি নীরবে প্রতিস্থাপিত হয়। দুটোকে একই সময়ে গ্লোবাল `opencode` হিসেবে রাখা সম্ভব নয়।

### কোনটি ব্যবহার করবেন?

| প্রয়োজনে | ব্যবহার |
|---|---|
| MCP সার্ভার যা auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **এই ফর্ক** (`@lux-tech/opencode-ai`) |
| অফিসিয়াল, ব্যাপকভাবে যাচাইকৃত রিলিজ | [অফিসিয়াল opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### বিকল্প A — একটি গ্লোবাল ইনস্টল + অন্যটির জন্য `npx` (প্রস্তাবিত)

ফর্কটি গ্লোবালি ইনস্টল করুন এবং অফিসিয়াল opencode গ্লোবালি ইনস্টল না করেই প্রয়োজন অনুযায়ী চালান:

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

অথবা উল্টোটা করুন — অফিসিয়াল opencode-কে গ্লোবাল রাখুন এবং ফর্কটি প্রয়োজন অনুযায়ী চালান:

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### বিকল্প B — দুটোই ইনস্টল করে একটি নাম পরিবর্তন

দুটোই ইনস্টল করুন, তারপর সেকেন্ডারি বাইনারির নাম পরিবর্তন করুন যাতে দুটি কমান্ড সংঘর্ষ না করে:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

তারপর Windows-এ ফর্ক বাইনারির নাম পরিবর্তন করে `opencode-fork.exe` করুন:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

Linux / macOS-এ:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### কোন বাইনারিটি বর্তমানে সক্রিয় তা পরীক্ষা করুন

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> বিল্ট-ইন আপডেটার (`opencode upgrade`) সর্বদা `@lux-tech/opencode-ai` আনয়ন করে।
> আপনি যদি **অফিসিয়াল** opencode-কে স্বয়ংক্রিয়ভাবে আপডেট করতে চান, তাহলে `npx opencode-ai@latest` অথবা অফিসিয়াল ইনস্টলারের
> মাধ্যমে চালান (দেখুন [opencode.ai](https://opencode.ai))।

---

## প্ল্যাটফর্ম বাইনারি

`@lux-tech/opencode-ai` একটি মেটা-প্যাকেজ হিসেবে প্রকাশিত হয় যাতে ১২টি প্ল্যাটফর্ম-নির্দিষ্ট বাইনারি থাকে (সবগুলো একই ভার্সনে প্রকাশিত):

| প্যাকেজ | প্ল্যাটফর্ম / CPU | নোট |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | AVX2 ছাড়া CPU |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | AVX2 ছাড়া CPU |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, AVX2 নেই |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | AVX2 ছাড়া CPU |

---

## এজেন্ট

OpenCode-এ দুটি বিল্ট-ইন এজেন্ট রয়েছে যা আপনি `Tab` কী দিয়ে স্যুইচ করতে পারেন।

- **build** - ডিফল্ট, ডেভেলপমেন্ট কাজের জন্য পূর্ণ-অ্যাক্সেস এজেন্ট
- **plan** - বিশ্লেষণ এবং কোড এক্সপ্লোরেশনের জন্য রিড-অনলি এজেন্ট
  - ডিফল্টভাবে ফাইল এডিট প্রত্যাখ্যান করে
  - bash কমান্ড চালানোর আগে অনুমতি চায়
  - অপরিচিত কোডবেস এক্সপ্লোর বা পরিবর্তন পরিকল্পনার জন্য আদর্শ

এছাড়াও জটিল অনুসন্ধান এবং মাল্টিস্টেপ কাজের জন্য একটি **general** সাবএজেন্ট অন্তর্ভুক্ত। এটি অভ্যন্তরীণভাবে ব্যবহৃত হয় এবং মেসেজে `@general` লিখে ডাকা যায়।

ফর্কটিতে আরও একটি **planner** এজেন্ট রয়েছে যা এক্সিকিউশনের আগে কাজগুলো স্বয়ংক্রিয়ভাবে ভাগ করে। [অফিসিয়াল ডক্সের এজেন্ট](https://opencode.ai/docs/agents) সম্পর্কে আরও জানুন — আচরণ upstream-এর সাথে সামঞ্জস্যপূর্ণ।

---

## ডকুমেন্টেশন

- **ফর্ক-নির্দিষ্ট ডক্স** এই রিপোজিটরিতেই রয়েছে: [`docs/`](./docs) (আর্কিটেকচার, ADR, hot reload ও MCP ডিজাইন) এবং [`CHANGELOG.md`](./CHANGELOG.md)।
- **সাধারণ কনফিগারেশন ডক্স** অফিসিয়াল ডকুমেন্টেশনের সাথে সামঞ্জস্যপূর্ণ: [opencode.ai/docs](https://opencode.ai/docs)।

---

## ফর্কের পার্থক্য

এই ফর্কটি (`menoxz/opencode`) upstream-এর উপরে নিম্নলিখিত ফিচার যোগ করে:

| ফিচার | বিবরণ |
|---|---|
| **MCP Auto-reconnect** | যেসব MCP সার্ভারের সংযোগ বিচ্ছিন্ন হয় সেগুলো শনাক্ত করা হয় (transport ইভেন্ট + হেলথ পিং) এবং exponential backoff-সহ স্বয়ংক্রিয়ভাবে পুনরায় সংযুক্ত হয় — আর কোনো পুরনো "connected" স্ট্যাটাস বা মৃত সেশন নেই |
| **Hot Reload** | ফাইল পরিবর্তনে এজেন্ট, প্লাগইন এবং MCP সার্ভার স্বয়ংক্রিয়ভাবে রিলোড হয় — রিস্টার্ট লাগে না |
| **Eval Pipeline** | SQLite-ভিত্তিক ইভালুয়েশন যাতে রয়েছে regression শনাক্তকরণ, ট্রেন্ড বিশ্লেষণ এবং compare CLI কমান্ড |
| **Memory Consolidation** | ক্রস-সেশন মেমোরি যাতে রয়েছে অটো-ডিকে, প্যাটার্ন শনাক্তকরণ এবং পোস্ট-মর্টেম বিশ্লেষণ |
| **Unified Prompt** | একটি একক `core.txt` ১০টি মডেল-নির্দিষ্ট প্রম্পট প্রতিস্থাপন করে — পরিষ্কার, ছোট, রক্ষণাবেক্ষণ সহজ |
| **Continuous Improvement** | মেথডগুলো হলো জীবন্ত ডকুমেন্ট — ডুপ্লিকেট তৈরি না করে changelog-সহ বিদ্যমান স্কিল আপডেট করুন |
| **Planner Integration** | বিল্ট-ইন `planner` এজেন্ট এক্সিকিউশনের আগে কাজ স্বয়ংক্রিয়ভাবে ভাগ করে |

নতুন ফিচারগুলো [`CHANGELOG.md`](./CHANGELOG.md)-তে ভার্সন করা হয়।

---

## অবদান

আপনি যদি এই ফর্কে অবদান রাখতে আগ্রহী হন, তাহলে পুল রিকোয়েস্ট জমা দেওয়ার আগে আমাদের [অবদান ডক্স](./CONTRIBUTING.md) পড়ুন। পুল রিকোয়েস্টগুলো `dev` ব্রাঞ্চে লক্ষ্য করা হয়।

---

## OpenCode-এর উপর বিল্ডিং

আপনি যদি OpenCode-এর সাথে সম্পর্কিত কোনো প্রজেক্টে কাজ করেন এবং নামের অংশ হিসেবে "opencode" ব্যবহার করেন, যেমন "opencode-dashboard" বা "opencode-mobile", তাহলে আপনার README-তে একটি নোট যোগ করুন যে এটি OpenCode টিম দ্বারা নির্মিত নয় এবং আমাদের সাথে কোনোভাবেই যুক্ত নয়।

---

**সমস্যা রিপোর্ট করুন** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**সোর্স** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
