/**
 * Standalone Logs page, served at GET /logs.
 *
 * Deliberately independent from the embedded GUI web UI (packages/app): it is a
 * single self-contained HTML document with no bundler, no framework and no
 * client-side route state. It reads the same public HTTP API as any other client
 * (GET /session and GET /session/{id}/message) and renders two things per
 * session:
 *
 * - the raw trajectory: every message and every part, including synthetic parts
 *   that the GUI transcript hides, so the log is a faithful record;
 * - the injected prompt context, read from the persisted carrier parts
 *   (metadata.injection = "instructions" | "context") with their provenance:
 *   instruction source paths for AGENTS.md files, and section labels plus sizes
 *   for the system/agent prompt, environment and skills.
 *
 * Everything is rendered client-side from plain fetch, so the page works against
 * any opencodev2 server version that exposes those two endpoints.
 */

const STYLES = `
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#21262d;--fg:#c9d1d9;--dim:#8b949e;--accent:#58a6ff;--warn:#d29922;--inj:#a371f7}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
header.top{display:flex;align-items:baseline;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:2}
header.top h1{font-size:14px;margin:0;color:var(--accent);font-weight:600}
header.top .meta{color:var(--dim);font-size:11px}
header.top .grow{flex:1}
header.top input{background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:3px 8px;border-radius:6px;font:inherit;min-width:220px}
main{display:grid;grid-template-columns:300px 1fr;height:calc(100vh - 41px)}
aside{border-right:1px solid var(--line);overflow:auto;background:#0b0f14}
aside .head{padding:8px 12px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em;position:sticky;top:0;background:#0b0f14}
ul.slist{list-style:none;margin:0;padding:0}
ul.slist li{padding:8px 12px;border-bottom:1px solid var(--line);cursor:pointer}
ul.slist li:hover{background:var(--panel)}
ul.slist li.sel{background:#1f2937;box-shadow:inset 2px 0 0 var(--accent)}
ul.slist .sid{color:var(--fg);font-size:11px}
ul.slist .ttl{color:var(--accent);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ul.slist .up{color:var(--dim);font-size:10px}
section#stream{overflow:auto;padding:12px 16px}
.msg{border:1px solid var(--line);border-radius:8px;margin:0 0 12px;background:var(--panel);overflow:hidden}
.msg>.hd{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--line);background:#11161d}
.badge{font-size:10px;letter-spacing:.06em;padding:1px 7px;border-radius:999px;border:1px solid var(--line);text-transform:uppercase}
.badge.user{color:#7ee787;border-color:#2ea043}
.badge.assistant{color:var(--accent);border-color:#1f6feb}
.badge.system{color:var(--dim)}
.badge.tool{color:var(--warn);border-color:#9e6a03}
.badge.reasoning{color:var(--dim)}
.badge.step{color:var(--dim)}
.badge.synthetic{color:var(--inj);border-color:#8957e5}
.hd .who{font-weight:600}
.hd .when,.hd .model,.hd .tok{color:var(--dim);font-size:11px}
.msg .parts{padding:6px 10px 10px}
.part{border-left:2px solid var(--line);padding:2px 0 2px 9px;margin:7px 0}
.part .l1{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.part .l1 .txt{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70ch}
.part .l1 .num{color:var(--dim);font-size:10px;margin-left:auto}
details.inj{border:1px solid #3d2b6b;border-radius:8px;margin:9px 0;background:#140f22}
details.inj>summary{cursor:pointer;padding:6px 10px;color:var(--inj);font-size:11px;letter-spacing:.04em;list-style:none;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
details.inj>summary::-webkit-details-marker{display:none}
details.inj>summary::before{content:"▸";color:var(--dim)}
details.inj[open]>summary::before{content:"▾"}
details.inj .body{padding:4px 10px 10px;border-top:1px solid #2c2044}
.sec{border:1px solid #2c2044;border-radius:6px;margin:8px 0;background:#100c1a}
.sec>summary{cursor:pointer;padding:5px 8px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:11px}
.sec>summary .lbl{color:var(--inj)}
.sec>summary .sz{color:var(--dim);margin-left:auto;font-size:10px}
.sec>summary .prov{color:var(--dim);font-size:10px}
pre{margin:0;padding:8px;background:#0a0d12;border:1px solid var(--line);border-radius:6px;overflow:auto;max-height:420px;white-space:pre-wrap;word-break:break-word;color:var(--fg);font-size:11.5px}
ul.paths{margin:6px 0;padding-left:18px}
ul.paths li{color:var(--dim);word-break:break-all}
.empty{color:var(--dim);padding:24px}
.err{border:1px solid #f85149;border-radius:8px;padding:10px;color:#ff7b72;background:#2d1117;white-space:pre-wrap;margin:0 0 12px}
.tag{font-size:10px;padding:0 6px;border-radius:4px;border:1px solid var(--line);color:var(--dim)}
.tag.trunc{color:var(--warn);border-color:#9e6a03}
`

const SCRIPT = String.raw`
var qs = new URLSearchParams(location.search);
var selected = qs.get("session");
var showSynthetic = true;

function esc(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function chars(n) {
  n = Number(n) || 0;
  if (n < 1000) return n + " chars";
  if (n < 1000000) return (n / 1000).toFixed(1) + "k chars";
  return (n / 1000000).toFixed(2) + "M chars";
}

function when(v) {
  if (!v) return "";
  var d = typeof v === "number" ? new Date(v) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function get(url) {
  return fetch(url, { headers: { accept: "application/json" } }).then(function (r) {
    return r.text().then(function (t) {
      if (!r.ok) throw new Error(r.status + " " + url + "\n" + t.slice(0, 400));
      try { return JSON.parse(t); } catch (e) { throw new Error("invalid JSON from " + url); }
    });
  });
}

function partText(part) {
  if (typeof part.text === "string") return part.text;
  if (part.state && typeof part.state.output === "string") return part.state.output;
  if (part.state && typeof part.state.title === "string") return part.state.title;
  if (part.state && typeof part.state.error === "string") return part.state.error;
  if (part.state && part.state.status) return "status=" + part.state.status;
  return "";
}

function injectionBlock(part) {
  var meta = part.metadata || {};
  if (meta.injection === "instructions") {
    var sources = Array.isArray(meta.sources) ? meta.sources : [];
    var items = sources.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    return "<details class=\"inj\" open><summary>INJECT &middot; instructions &middot; " + sources.length +
      " source(s)</summary><div class=\"body\"><div class=\"tag\">provenance: instruction files injected into context</div>" +
      (items ? "<ul class=\"paths\">" + items + "</ul>" : "") +
      "<pre>" + esc(part.text || "") + "</pre></div></details>";
  }
  if (meta.injection === "context") {
    var secs = Array.isArray(meta.sections) ? meta.sections : [];
    var body = secs.map(function (s) {
      return "<details class=\"sec\" open><summary><span class=\"lbl\">" + esc(s.section) + "</span>" +
        "<span>" + esc(s.label || "") + "</span>" +
        (s.truncated ? "<span class=\"tag trunc\">truncated</span>" : "") +
        "<span class=\"sz\">" + chars(s.size !== undefined ? s.size : (s.text || "").length) + "</span></summary>" +
        "<pre>" + esc(s.text || "") + "</pre></details>";
    }).join("");
    if (!body) body = "<div class=\"empty\">no sections recorded</div>";
    return "<details class=\"inj\" open><summary>CONTEXT &middot; injected prompt context &middot; " + secs.length +
      " section(s)</summary><div class=\"body\">" + body + "</div></details>";
  }
  return "";
}

function renderPart(part, index) {
  var type = part.type || "unknown";
  var meta = part.metadata || {};
  var inj = injectionBlock(part);
  var synth = part.synthetic === true || part.ignored === true;
  var size = partText(part).length;
  var badges = "<span class=\"badge " + esc(type) + "\">" + esc(type) + "</span>";
  if (synth) badges += "<span class=\"badge synthetic\">synthetic</span>";
  if (meta.injection) badges += "<span class=\"badge synthetic\">injection</span>";
  if (part.ignored === true) badges += "<span class=\"badge system\">ignored by model</span>";
  var body = "";
  if (inj) {
    body = inj;
  } else {
    var preview = partText(part);
    if (preview) {
      body = "<pre>" + esc(preview) + "</pre>";
    } else {
      body = "<div class=\"empty\">" + esc(JSON.stringify(part, null, 2)) + "</div>";
    }
  }
  return "<div class=\"part\"><div class=\"l1\">" + badges +
    "<span class=\"num\">#" + (index + 1) + " &middot; " + chars(size) + "</span></div>" + body + "</div>";
}

function renderMessage(entry) {
  var info = entry.info || {};
  var parts = Array.isArray(entry.parts) ? entry.parts : [];
  var role = info.role || "unknown";
  var time = info.time || {};
  var tokens = info.tokens || {};
  var tok = tokens.total || tokens.input || tokens.output;
  var html = "<div class=\"msg\"><div class=\"hd\">";
  html += "<span class=\"badge " + esc(role) + "\">" + esc(role) + "</span>";
  if (info.modelID || info.providerID) {
    html += "<span class=\"model\">" + esc((info.providerID || "") + (info.modelID ? "/" + info.modelID : "")) + "</span>";
  }
  if (info.id) html += "<span class=\"when\">" + esc(info.id) + "</span>";
  html += "<span class=\"when\">" + esc(when(time.created)) + "</span>";
  if (tok) html += "<span class=\"tok\">tokens " + esc(tok) + "</span>";
  if (info.error) html += "<span class=\"tok\">error</span>";
  html += "</div>";
  var shown = parts.filter(function (p) { return showSynthetic || p.synthetic !== true; });
  html += "<div class=\"parts\">";
  if (!shown.length) html += "<div class=\"empty\">no parts</div>";
  shown.forEach(function (p, i) { html += renderPart(p, i); });
  html += "</div></div>";
  return html;
}

function fail(err) {
  document.getElementById("stream").innerHTML =
    "<div class=\"err\">" + esc(String(err && err.message ? err.message : err)) + "</div>";
}

// Full-session export. The live view deliberately loads only a bounded window
// (some sessions run to thousands of messages and hundreds of megabytes); the
// complete history is fetched on demand, page by page, so it is never hydrated
// until the user asks for it. GET /session/{id}/message returns a page plus an
// X-Next-Cursor header, so following the before cursor walks the whole session.
var PAGE_SIZE = 500;

function setExportStatus(text) {
  var el = document.getElementById("export-status");
  if (el) el.textContent = text || "";
}

function download(obj, filename) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 0);
}

async function exportSession(id) {
  var all = [];
  var before = null;
  for (var page = 0; page < 100000; page++) {
    var url = "/session/" + encodeURIComponent(id) + "/message?limit=" + PAGE_SIZE +
      (before ? "&before=" + encodeURIComponent(before) : "");
    var r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(r.status + " " + url);
    var items = await r.json();
    if (!Array.isArray(items)) throw new Error("unexpected payload from " + url);
    all = all.concat(items);
    setExportStatus("exporting " + all.length + " messages ...");
    var next = r.headers.get("X-Next-Cursor");
    if (!next || items.length === 0) break;
    before = next;
  }
  // Pages are followed cursor by cursor; order the record chronologically by id.
  all.sort(function (a, b) {
    var x = a && a.info ? a.info.id : "";
    var y = b && b.info ? b.info.id : "";
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return { sessionID: id, exportedAt: new Date().toISOString(), count: all.length, messages: all };
}

function select(id) {
  selected = id;
  var url = new URL(location.href);
  url.searchParams.set("session", id);
  history.replaceState(null, "", url.toString());
  var exportBtn = document.getElementById("export");
  if (exportBtn) exportBtn.disabled = false;
  setExportStatus("");
  Array.prototype.forEach.call(document.querySelectorAll("ul.slist li"), function (li) {
    li.className = li.getAttribute("data-id") === id ? "sel" : "";
  });
  document.getElementById("stream").innerHTML = "<div class=\"empty\">loading " + esc(id) + " ...</div>";
  get("/session/" + encodeURIComponent(id) + "/message?limit=" + PAGE_SIZE)
    .then(function (data) {
      var msgs = Array.isArray(data) ? data : (data && Array.isArray(data.messages) ? data.messages : []);
      var html = "<div class=\"empty\">" + msgs.length + " message(s) &middot; " + esc(id) + "</div>";
      msgs.forEach(function (m) { html += renderMessage(m); });
      document.getElementById("stream").innerHTML = html;
    })
    .catch(fail);
}

function loadSessions(filter) {
  get("/session").then(function (list) {
    if (!Array.isArray(list)) throw new Error("/session did not return an array");
    var ul = document.getElementById("session-list");
    var rows = list.filter(function (s) {
      if (!filter) return true;
      var hay = ((s.title || "") + " " + (s.id || "")).toLowerCase();
      return hay.indexOf(filter.toLowerCase()) >= 0;
    });
    if (!rows.length) {
      ul.innerHTML = "<li class=\"empty\">no session</li>";
      return;
    }
    ul.innerHTML = rows.map(function (s) {
      var t = s.time || {};
      return "<li data-id=\"" + esc(s.id) + "\" class=\"" + (s.id === selected ? "sel" : "") + "\">" +
        "<span class=\"ttl\">" + esc(s.title || "(untitled)") + "</span>" +
        "<span class=\"sid\">" + esc(s.id) + "</span>" +
        "<span class=\"up\">" + esc(when(t.updated || t.created)) + "</span></li>";
    }).join("");
    Array.prototype.forEach.call(ul.querySelectorAll("li[data-id]"), function (li) {
      li.addEventListener("click", function () { select(li.getAttribute("data-id")); });
    });
    if (!selected && rows.length) select(rows[0].id);
  }).catch(fail);
}

document.addEventListener("DOMContentLoaded", function () {
  var f = document.getElementById("filter");
  var t = null;
  f.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () { loadSessions(f.value.trim()); }, 200);
  });
  var syn = document.getElementById("syn");
  syn.addEventListener("change", function () {
    showSynthetic = syn.checked;
    if (selected) select(selected);
  });
  document.getElementById("refresh").addEventListener("click", function () {
    loadSessions(f.value.trim());
  });
  document.getElementById("export").addEventListener("click", function () {
    if (!selected) return;
    var btn = this;
    btn.disabled = true;
    setExportStatus("exporting ...");
    exportSession(selected)
      .then(function (data) {
        download(data, "opencode-" + selected + "-logs.json");
        setExportStatus("exported " + data.count + " message(s)");
      })
      .catch(function (e) {
        setExportStatus("export failed: " + (e && e.message ? e.message : e));
      })
      .then(function () { btn.disabled = false; });
  });
  loadSessions("");
  if (selected) select(selected);
});
`

export function logsPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>opencodev2 Logs</title>
<style>${STYLES}</style>
</head>
<body>
<header class="top">
  <h1>opencodev2 Logs</h1>
  <span class="meta">standalone page &mdash; independent from the GUI web UI</span>
  <span class="grow"></span>
  <input id="filter" type="search" placeholder="filter sessions" />
  <label class="meta"><input id="syn" type="checkbox" checked /> synthetic parts</label>
  <button id="refresh" type="button">refresh</button>
  <button id="export" type="button" disabled>export full</button>
  <span class="meta" id="export-status"></span>
</header>
<main>
  <aside>
    <div class="head">Sessions</div>
    <ul class="slist" id="session-list"></ul>
  </aside>
  <section id="stream"><div class="empty">loading sessions ...</div></section>
</main>
<script>${SCRIPT}<\/script>
</body>
</html>`
}