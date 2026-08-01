<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo fork OpenCode">
    </picture>
  </a>
</p>
<p align="center">Trợ lý lập trình AI mã nguồn mở — fork từ cộng đồng.

> **Thông báo về fork** — kho lưu trữ này (`menoxz/opencode`) là một fork của
> [opencode chính thức](https://github.com/anomalyco/opencode) do cộng đồng
> thực hiện với các tính năng bổ sung (MCP auto-reconnect, hot reload, eval pipeline,
> memory consolidation, unified prompt). Nó **không liên kết** với đội ngũ
> opencode chính thức. **Xem sự khác biệt của fork →**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="Giấy phép" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
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

[![Giao diện terminal OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Cài đặt (fork)

Fork được phát hành trên npm dưới scope `@lux-tech` và cài đặt lệnh của nó dưới dạng
**`opencodev2`** — một tệp nhị phân riêng biệt **cùng tồn tại** với opencode chính thức
(được cài từ `opencode-ai`). Nó cũng dùng các thư mục dữ liệu/cấu hình riêng
(`~/.local/share/opencodev2`, `~/.config/opencodev2`), vì vậy cả hai sản phẩm có thể
chạy song song mà không đụng đến dữ liệu của nhau. Ở lần khởi động tương tác đầu tiên,
fork đề xuất nhập cấu hình, khóa API và lịch sử phiên opencode hiện có của bạn — bản
cài đặt gốc vẫn nguyên vẹn. Hãy đọc **sự cùng tồn tại với opencode chính thức** trước
khi cài đặt.

### Khuyến nghị: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Xác minh:

```bash
opencodev2 --version
# 1.18.59 (hoặc phiên bản mới nhất đã phát hành)
```

Gói meta `@lux-tech/opencode-ai` tự động tải xuống tệp nhị phân đúng cho nền tảng
của bạn từ một trong 12 phụ thuộc tùy chọn (xem **bảng tệp nhị phân theo nền tảng**)
và cung cấp nó dưới dạng lệnh `opencodev2`.

### Thay thế: GitHub Releases (thủ công)

Các kho lưu trữ phát hành được đăng trên
[trang releases](https://github.com/menoxz/opencode/releases) dưới dạng `.tar.gz`
(Linux) và `.zip` (macOS / Windows). Mỗi kho lưu trữ chứa tệp nhị phân CLI đã biên
dịch ở thư mục gốc — khi cài thủ công, hãy đổi tên nó thành `opencodev2` để không
bao giờ xung đột với tệp nhị phân `opencode` chính thức.

```bash
# Ví dụ: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # tên riêng, không xung đột với tệp nhị phân chính thức
```

```powershell
# Ví dụ: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Vị trí tệp nhị phân

| Phương pháp cài đặt | Đường dẫn tệp nhị phân |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (thủ công) | bất cứ nơi nào bạn đặt nó |

### Cập nhật

```bash
# Bộ cập nhật tích hợp (tải phiên bản mới nhất của @lux-tech/opencode-ai)
opencodev2 upgrade

# Hoặc qua npm
npm update -g @lux-tech/opencode-ai
```

### Gỡ cài đặt

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Trên Windows, hãy xóa cả shim cũ nếu npm để lại:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Cùng tồn tại với opencode chính thức

Fork (`@lux-tech/opencode-ai`) cài đặt lệnh của nó dưới dạng **`opencodev2`**, còn
opencode chính thức (`opencode-ai`) cài `opencode`. Hai tên không bao giờ xung đột
và fork dùng các thư mục dữ liệu riêng (`~/.local/share/opencodev2`,
`~/.config/opencodev2`, `~/.local/state/opencodev2`, `~/.cache/opencodev2`), vì vậy
**cả hai có thể được cài đặt và sử dụng cùng lúc**.

### Trình hướng dẫn di trú khi khởi động lần đầu

Ở lần khởi động tương tác đầu tiên, `opencodev2` phát hiện xem có bản cài đặt
opencode trước đó (cấu hình, khóa API, phiên) hay không và hỏi bạn làm gì:

- **Nhập (khuyến nghị)** — sao chép cấu hình, thông tin xác thực (`auth.json`) và
  lịch sử phiên (`opencode.db`) từ các thư mục opencode gốc vào các thư mục
  opencodev2. Dữ liệu gốc vẫn nguyên vẹn.
- **Sau** — bắt đầu với dữ liệu mới và hỏi lại ở lần khởi động sau.
- **Không bao giờ** — bắt đầu với dữ liệu opencodev2 trống (một tệp đánh dấu ngăn
  các lần hỏi sau).

Môi trường không đầu cuối (CI, script) có thể ép hành vi:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # nhập không tương tác
OPENCODEV2_MIGRATE=skip opencodev2 ...   # bỏ qua và đánh dấu đã quyết định
```

Trình hướng dẫn chỉ chạy một lần cho mỗi thư mục dữ liệu (tệp đánh dấu
`.migrate-state` ghi lại quyết định). Sau khi nhập, cơ sở dữ liệu được sao chép thuộc
về opencodev2 — các lần di trú cơ sở dữ liệu opencodev2 sau đó không bao giờ chạm vào
bản cài đặt opencode gốc.

### Nên dùng cái nào?

| Nhu cầu | Sử dụng |
|---|---|
| Các MCP server tự động kết nối lại, hot reload, eval pipeline, memory consolidation, unified prompt | **Fork này** (`opencodev2`) |
| Bản phát hành chính thức, được kiểm chứng rộng rãi | [opencode chính thức](https://github.com/anomalyco/opencode) (`opencode`) |

Cả hai vẫn được cập nhật độc lập:

```bash
opencodev2 upgrade        # cập nhật fork (@lux-tech/opencode-ai)
opencode upgrade          # cập nhật opencode chính thức (opencode-ai)
```

---

## Tệp nhị phân theo nền tảng

`@lux-tech/opencode-ai` được phân phối dưới dạng gói meta với 12 tệp nhị phân
tùy chọn theo nền tảng (tất cả được phát hành cùng một phiên bản):

| Gói | Nền tảng / CPU | Ghi chú |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPU không có AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPU không có AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, không có AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPU không có AVX2 |

---

## Agents (Tác nhân)

OpenCode bao gồm hai agent tích hợp sẵn mà bạn có thể chuyển đổi bằng phím `Tab`.

- **build** — mặc định, agent có toàn quyền truy cập cho công việc phát triển
- **plan** — agent chỉ đọc để phân tích và khám phá mã
  - Từ chối chỉnh sửa tệp theo mặc định
  - Hỏi quyền trước khi chạy lệnh bash
  - Lý tưởng để khám phá các codebase lạ hoặc lên kế hoạch thay đổi

Ngoài ra còn có subagent **general** cho các tìm kiếm phức tạp và tác vụ nhiều
bước. Nó được sử dụng nội bộ và có thể được gọi bằng `@general` trong tin nhắn.

Fork còn cung cấp thêm agent **planner** tự động phân rã tác vụ trước khi thực thi.
Tìm hiểu thêm về
[agents trong tài liệu chính thức](https://opencode.ai/docs/agents) — hành vi
tương thích với upstream.

---

## Tài liệu

- **Tài liệu riêng của fork** nằm trong kho lưu trữ này: [`docs/`](./docs)
  (kiến trúc, ADR, hot reload & thiết kế MCP) và [`CHANGELOG.md`](./CHANGELOG.md).
- **Tài liệu cấu hình chung** tương thích với tài liệu chính thức:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Khác biệt của fork

Fork này (`menoxz/opencode`) thêm các tính năng sau so với upstream:

| Tính năng | Mô tả |
|---------|-------------|
| **MCP Auto-reconnect** | Các MCP server bị mất kết nối được phát hiện (sự kiện transport + health ping) và tự động kết nối lại với backoff theo cấp số nhân — không còn trạng thái "connected" cũ hoặc phiên chết |
| **Hot Reload** | Agents, plugins và MCP server tự động tải lại khi tệp thay đổi — không cần khởi động lại |
| **Eval Pipeline** | Đánh giá dựa trên SQLite với phát hiện hồi quy, phân tích xu hướng và lệnh CLI so sánh |
| **Memory Consolidation** | Bộ nhớ xuyên phiên với tự động suy giảm, phát hiện mẫu và phân tích sau sự cố |
| **Unified Prompt** | Một `core.txt` duy nhất thay thế 10 prompt riêng cho từng mô hình — sạch hơn, nhỏ hơn, dễ bảo trì hơn |
| **Continuous Improvement** | Phương pháp là tài liệu sống — cập nhật skills hiện có với changelog thay vì tạo bản sao trùng lặp |
| **Planner Integration** | Agent `planner` tích hợp sẵn tự động phân rã tác vụ trước khi thực thi |
| **Danh tính opencodev2 + di trú** | Cài đặt dưới dạng `opencodev2` với các thư mục dữ liệu riêng, cùng tồn tại với opencode chính thức; trình hướng dẫn khởi động đầu tiên nhập cấu hình, khóa API và lịch sử phiên theo yêu cầu |

Các tính năng mới được quản lý phiên bản trong [`CHANGELOG.md`](./CHANGELOG.md).

---

## Đóng góp

Nếu bạn muốn đóng góp cho fork này, vui lòng đọc
[tài liệu đóng góp](./CONTRIBUTING.md) trước khi gửi pull request. Các pull
request nhắm tới nhánh `dev`.

---

## Xây dựng trên nền tảng OpenCode

Nếu bạn đang làm việc trên một dự án liên quan đến OpenCode và sử dụng "opencode"
như một phần tên của nó, ví dụ "opencode-dashboard" hoặc "opencode-mobile",
vui lòng thêm ghi chú vào README của bạn để làm rõ rằng dự án không được xây
dựng bởi đội ngũ OpenCode và không liên kết với chúng tôi dưới bất kỳ hình thức nào.

---

**Báo cáo sự cố** trên [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Mã nguồn** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
