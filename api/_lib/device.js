// Ghi nhận thiết bị thí sinh dùng khi làm bài (loại máy, hệ điều hành, trình duyệt, đời máy, IP...)
// để quản lí đối chiếu. Chỉ đọc từ User-Agent + vài gợi ý do trình duyệt gửi lên, không dùng cookie theo dõi.
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n || 60);

function ipOf(req) {
  const h = (req && req.headers) || {};
  let ip = String(h["x-azure-clientip"] || h["x-forwarded-for"] || h["x-client-ip"] || "").split(",")[0].trim();
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];            // "1.2.3.4:5678"
  else if (/^\[.+\]:\d+$/.test(ip)) ip = ip.slice(1, ip.lastIndexOf("]"));   // "[ipv6]:port"
  return clip(ip, 45);
}

function parseUA(ua, hints) {
  const u = String(ua || ""), m = (re) => { const x = u.match(re); return x ? x : null; };
  let os = "", browser = "", model = "", type = "Máy tính";
  let x;
  if ((x = m(/Windows NT (\d+\.\d+)/))) os = "Windows " + ({ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[x[1]] || x[1]);
  else if ((x = m(/Android (\d+(?:\.\d+)?)/))) os = "Android " + x[1];
  else if ((x = m(/(?:iPhone|CPU) OS (\d+)_(\d+)/))) os = "iOS " + x[1] + "." + x[2];
  else if ((x = m(/Mac OS X (\d+)[._](\d+)/))) os = "macOS " + x[1] + "." + x[2];
  else if (/CrOS/.test(u)) os = "ChromeOS";
  else if (/Linux/.test(u)) os = "Linux";
  if (hints.platformVersion && /^Windows/.test(os)) os = parseInt(hints.platformVersion, 10) >= 13 ? "Windows 11" : "Windows 10";

  const B = [[/Zalo/i, "Zalo"], [/FBAN|FBAV|FB_IAB/, "Facebook"], [/Instagram/, "Instagram"], [/coc_coc_browser\/(\d+)/, "Cốc Cốc"],
    [/EdgA?\/(\d+)/, "Edge"], [/OPR\/(\d+)/, "Opera"], [/SamsungBrowser\/(\d+)/, "Samsung Internet"], [/CriOS\/(\d+)/, "Chrome"],
    [/FxiOS\/(\d+)/, "Firefox"], [/Firefox\/(\d+)/, "Firefox"], [/Chrome\/(\d+)/, "Chrome"], [/Version\/(\d+)[\d.]* .*Safari/, "Safari"]];
  for (const [re, name] of B) { const r = u.match(re); if (r) { browser = name + (r[1] ? " " + r[1] : ""); break; } }

  if (/iPad/.test(u) || (/Macintosh/.test(u) && hints.touch)) { type = "Máy tính bảng"; model = "iPad"; if (/^macOS/.test(os)) os = "iPadOS"; }
  else if (/iPhone/.test(u)) { type = "Điện thoại"; model = "iPhone"; }
  else if (/Android/.test(u)) {
    type = /Mobile/.test(u) ? "Điện thoại" : "Máy tính bảng";
    const am = u.match(/Android [^;)]*;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/i);
    if (am && am[1] && am[1].trim() !== "K" && !/^wv$/i.test(am[1].trim())) model = am[1].trim();
  }
  if (hints.model) model = hints.model;
  return { type, os, browser, model };
}

// hintsIn: gợi ý từ trình duyệt (màn hình, múi giờ, ngôn ngữ, cảm ứng, đời máy) - không tin tuyệt đối, chỉ để tham khảo
function capture(req, hintsIn, stage) {
  const h = hintsIn && typeof hintsIn === "object" ? hintsIn : {};
  const hints = { model: clip(h.model, 40), platformVersion: clip(h.platformVersion, 20), touch: !!h.touch };
  const ua = clip((req.headers || {})["user-agent"], 400);
  return Object.assign(parseUA(ua, hints), {
    ip: ipOf(req), screen: /^\d{2,5}x\d{2,5}$/.test(String(h.screen || "")) ? String(h.screen) : "",
    tz: clip(h.tz, 40), lang: clip(h.lang, 20), ua, stage: stage || "", at: Date.now()
  });
}
const sig = (d) => d ? [d.type, d.os, d.browser, d.model].join("|") : "";
const label = (d) => d ? [d.type, d.model, d.os, d.browser].filter(Boolean).join(" · ") : "";

// Ghi thiết bị vào bài làm. Chỉ thêm mục mới khi thiết bị hoặc IP khác lần trước (giữ tối đa 10 mục).
function record(attempt, dev) {
  const log = Array.isArray(attempt.devices) ? attempt.devices : (attempt.device ? [attempt.device] : []);
  const last = log[log.length - 1];
  if (!last || sig(last) !== sig(dev) || last.ip !== dev.ip) log.push(dev);
  attempt.devices = log.slice(-10);
  if (!attempt.device) attempt.device = dev;
}
// Tóm tắt gọn để lưu vào chỉ mục kết quả (danh sách, xuất Excel)
function brief(attempt) {
  const log = Array.isArray(attempt.devices) ? attempt.devices : (attempt.device ? [attempt.device] : []);
  if (!log.length) return null;
  const first = log[0];
  return { label: label(first), type: first.type, ip: first.ip, changed: new Set(log.map(sig)).size > 1, ipCount: new Set(log.map((d) => d.ip).filter(Boolean)).size };
}
module.exports = { capture, record, brief, label, ipOf };
