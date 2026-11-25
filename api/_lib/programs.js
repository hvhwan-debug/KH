// Chương trình học: quản trị viên tạo chương trình, gửi email mời; người nhận bấm MỘT nút "Xác nhận tham gia" trong email là đăng ký xong.
// - Danh sách chương trình: kt/programs.json   { list: [program] }
// - Mời / đăng ký của từng chương trình: kt/program/<id>.json   { invited: {MÃ: {...}}, regs: {MÃ: {...}}, cancels: {MÃ: {...}} }
// - Liên kết trong email mang mã ký (HMAC) gồm mã chương trình + mã NV, không cần đăng nhập. Bộ quét link của hộp thư chỉ MỞ trang (GET),
//   còn việc đăng ký do trang gửi lên (POST có header riêng) nên không bị đăng ký nhầm.
const store = require("./store");
const session = require("./session");
const { cfg } = require("./config");

const LIST = "kt/programs.json";
const regKey = (id) => "kt/program/" + id + ".json";
const TOKEN_AGE = 180 * 24 * 3600 * 1000;
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const up = (s) => String(s || "").trim().toUpperCase();

async function list() { const d = (await store.get(LIST)) || {}; return Array.isArray(d.list) ? d.list : []; }
async function get(id) { return (await list()).find((p) => p.id === id) || null; }
async function regs(id) {
  const d = (await store.get(regKey(id))) || {};
  return { invited: d.invited || {}, regs: d.regs || {}, cancels: d.cancels || {} };
}

function clean(b, old) {
  const title = clip(b.title, 150);
  if (!title) return { error: "Vui lòng nhập tên chương trình." };
  const n = (v) => { const x = Math.round(Number(v)); return isFinite(x) && x > 0 ? x : 0; };
  const p = {
    id: (old && old.id) || "p" + Date.now().toString(36) + require("crypto").randomBytes(2).toString("hex"),
    title, desc: clip(b.desc, 2000), when: clip(b.when, 200), where: clip(b.where, 200),
    contact: clip(b.contact, 200), speaker: clip(b.speaker, 150),
    deadline: n(b.deadline) > 1e12 ? n(b.deadline) : 0,
    capacity: Math.min(n(b.capacity), 100000),
    status: b.status === "closed" ? "closed" : "open",
    createdAt: (old && old.createdAt) || Date.now(), updatedAt: Date.now(), by: (old && old.by) || clip(b.by, 120)
  };
  return { program: p };
}
async function save(b, by) {
  let out = null;
  await store.update(LIST, (cur) => {
    const c = cur && Array.isArray(cur.list) ? cur : { list: [] };
    const old = b.id ? c.list.find((x) => x.id === b.id) : null;
    if (b.id && !old) { out = { error: "Chương trình không còn tồn tại." }; return c; }
    const r = clean(Object.assign({}, b, { by }), old);
    if (r.error) { out = r; return c; }
    if (old) c.list[c.list.indexOf(old)] = r.program; else c.list.push(r.program);
    out = r; return c;
  });
  return out;
}
async function remove(id) {
  let gone = false;
  await store.update(LIST, (cur) => { const c = cur && Array.isArray(cur.list) ? cur : { list: [] }; c.list = c.list.filter((x) => { if (x.id === id) { gone = true; return false; } return true; }); return c; });
  if (gone) await store.put(regKey(id), { deleted: true, at: Date.now() });
  return gone;
}

// ---- mã ký trong liên kết email ----
function token(id, code) { return session.sign({ k: "pg", p: id, c: up(code), exp: Date.now() + TOKEN_AGE }); }
function readToken(t) {
  const p = session.verify(String(t || "").slice(0, 600));
  return p && p.k === "pg" && p.p && p.c && p.exp > Date.now() ? { id: String(p.p), code: up(p.c) } : null;
}
function joinUrl(id, code) { return (cfg().appUrl || "") + "/kiemtra/dangky.html?t=" + encodeURIComponent(token(id, code)); }

// Trạng thái chương trình đối với một người
function stateOf(p, R, code) {
  const k = up(code), taken = Object.keys(R.regs).length;
  if (R.regs[k]) return "registered";
  if (p.status === "closed") return "closed";
  if (p.deadline && Date.now() > p.deadline) return "expired";
  if (p.capacity && taken >= p.capacity) return "full";
  return "open";
}

// Đăng ký / huỷ (dùng store.update để không mất lượt khi nhiều người bấm cùng lúc)
async function act(id, code, op, meta) {
  const p = await get(id);
  if (!p) return { error: "Chương trình này không còn tồn tại.", status: 404 };
  const k = up(code); let res = null;
  await store.update(regKey(id), (cur) => {
    const c = cur && typeof cur === "object" && !cur.deleted ? cur : {};
    c.invited = c.invited || {}; c.regs = c.regs || {}; c.cancels = c.cancels || {};
    const inv = c.invited[k] || {};
    if (op === "join") {
      if (c.regs[k]) { res = { state: "registered", already: true }; return c; }
      const st = stateOf(p, c, k);
      if (st !== "open") { res = { state: st }; return c; }
      c.regs[k] = { at: Date.now(), name: inv.name || "", email: inv.email || "", ua: clip(meta && meta.ua, 160) };
      delete c.cancels[k];
      res = { state: "registered" }; return c;
    }
    if (op === "cancel") {
      if (!c.regs[k]) { res = { state: stateOf(p, c, k) }; return c; }
      if (p.status === "closed" || (p.deadline && Date.now() > p.deadline)) { res = { state: "registered", locked: true }; return c; }
      c.cancels[k] = { at: Date.now(), regAt: c.regs[k].at, name: c.regs[k].name, email: c.regs[k].email };
      delete c.regs[k];
      res = { state: stateOf(p, c, k), cancelled: true }; return c;
    }
    res = { error: "Thao tác không hợp lệ.", status: 400 }; return c;
  });
  const R = await regs(id);
  return Object.assign({ program: p, taken: Object.keys(R.regs).length }, res);
}

async function markInvited(id, sent) {
  await store.update(regKey(id), (cur) => {
    const c = cur && typeof cur === "object" && !cur.deleted ? cur : {};
    c.invited = c.invited || {};
    sent.forEach((s) => { const o = c.invited[s.code] || { n: 0 }; c.invited[s.code] = { name: s.name, email: s.email, at: Date.now(), n: (o.n || 0) + 1, first: o.first || Date.now() }; });
    return c;
  });
}

// ---- email mời (thiết kế để người đọc muốn đăng ký ngay) ----
// Bố cục: ảnh minh hoạ đầu thư -> lời chào riêng -> tên chương trình + lời hứa -> "Bạn sẽ nhận được" (mỗi dòng "-" trong phần giới thiệu)
// -> 3 ô thông tin (thời gian / địa điểm / hạn) -> giảng viên -> số chỗ còn lại + số đồng nghiệp đã đăng ký (số THẬT, không bịa)
// -> MỘT nút lớn "Giữ chỗ của tôi" -> 3 bước đơn giản -> chân thư. Bảng + CSS nội tuyến cho Outlook/Gmail; ảnh gắn nội tuyến (cid).
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function vnTime(ms) {
  if (!ms) return "";
  const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " ngày " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}
function leftText(ms) {
  const d = ms - Date.now(); if (d <= 0) return "";
  const days = Math.floor(d / 864e5), hrs = Math.floor(d / 36e5);
  return days >= 1 ? "còn " + days + " ngày" : hrs >= 1 ? "chỉ còn " + hrs + " giờ" : "sắp hết hạn";
}
function nameParts(name) {
  const h = require("./honorific").honorific(name, true), parts = String(name || "").trim().split(/\s+/), given = parts[parts.length - 1] || "";
  return { call: h ? h + " " + given : (name || "bạn"), short: h ? h + " " + given : (given || "bạn") };
}
function greet(name) { return "Chào " + nameParts(name).call + ","; }
// Phần giới thiệu: các dòng bắt đầu bằng "-", "•", "+" hoặc "*" là LỢI ÍCH; còn lại là đoạn mô tả
function splitDesc(desc) {
  const lines = String(desc || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean), out = { intro: [], gains: [] };
  lines.forEach((l) => { const m = l.match(/^[-•+*✓✔]\s*(.+)$/); if (m) out.gains.push(m[1]); else out.intro.push(l); });
  return out;
}
// Ảnh đầu thư: tranh minh hoạ theo chủ đề (aiimage.artImage), cắt dải ngang 1200x500. Nhớ đệm theo chương trình.
const heroCache = new Map();
async function heroImage(p) {
  const key = p.id + ":" + (p.updatedAt || 0);
  if (heroCache.has(key)) return heroCache.get(key);
  const A = require("./aiimage"), { createCanvas, loadImage } = require("@napi-rs/canvas");
  const img = await loadImage(await A.artImage({ title: p.title, desc: p.desc, catName: "", type: "pdf" }));
  const W = 1200, H = 500, cv = createCanvas(W, H), c = cv.getContext("2d"), s = W / img.width;
  c.drawImage(img, 0, (H - img.height * s) / 2 - 20, W, img.height * s);
  const buf = await cv.encode("jpeg", 86);
  if (heroCache.size > 50) heroCache.clear();
  heroCache.set(key, buf);
  return buf;
}
// stats: { taken } số người đã đăng ký hiện tại (để hiện chỗ còn lại / đồng nghiệp đã đăng ký)
async function inviteMail(p, cand, stats) {
  const url = joinUrl(p.id, cand.code), np = nameParts(cand.name), taken = (stats && stats.taken) || 0;
  const left = p.capacity ? Math.max(0, p.capacity - taken) : null, D = splitDesc(p.desc);
  const C = { navy: "#0A1F44", brand: "#1559C4", ink: "#101B33", body: "#3B465C", muted: "#6B7690", line: "#E3E8F1", soft: "#F3F7FD", page: "#EAF0F8", green: "#16A34A", gold: "#F5B400" };
  const F = "'Be Vietnam Pro',Segoe UI,Arial,Helvetica,sans-serif";
  let hero = null; try { hero = await heroImage(p); } catch (e) { hero = null; }
  let band = ["#1F6FE5", "#0E2C66"]; try { const A = require("./aiimage"); band = A.PAL[A.themeOf({ title: p.title, desc: p.desc })] || band; } catch (e) { /* giữ màu mặc định */ }
  const tile = (ic, label, val, sub) => '<td class="tile" valign="top" style="padding:0 5px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ' + C.line + ';border-radius:14px"><tr><td style="padding:14px 14px 12px">' +
    '<div style="font-size:22px;line-height:1">' + ic + '</div><div style="margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.08em;color:' + C.muted + ';text-transform:uppercase">' + label + '</div>' +
    '<div style="margin-top:3px;font-size:14.5px;font-weight:700;color:' + C.ink + ';line-height:1.4">' + esc(val) + '</div>' + (sub ? '<div style="margin-top:3px;font-size:12px;font-weight:700;color:#C2410C">' + esc(sub) + '</div>' : '') + '</td></tr></table></td>';
  const tiles = [p.when ? tile("🗓️", "Thời gian", p.when) : "", p.where ? tile("📍", "Địa điểm", p.where) : "", p.deadline ? tile("⏳", "Hạn đăng ký", vnTime(p.deadline).replace(" ngày ", " · "), leftText(p.deadline)) : ""].filter(Boolean);
  const btn = (label) => '<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td align="center" bgcolor="' + C.green + '" style="border-radius:16px;background:' + C.green + ';background:linear-gradient(135deg,#22C55E,#15803D);box-shadow:0 10px 24px -10px rgba(21,128,61,.7)">' +
    '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:18px 44px;font-family:' + F + ';font-size:18px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:16px;letter-spacing:.01em">' + label + '</a></td></tr></table>';
  const pct = p.capacity ? Math.min(100, Math.round(taken / p.capacity * 100)) : 0;
  const scarcity = p.capacity ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0"><tr><td style="font-size:14px;color:' + C.ink + '">' +
      (left > 0 ? (left <= Math.max(3, Math.ceil(p.capacity * 0.2)) ? '🔥 <b>Chỉ còn ' + left + ' chỗ</b>' : '🎟️ <b>Còn ' + left + ' / ' + p.capacity + ' chỗ</b>') : '<b>Đã đủ chỗ</b>') +
      (taken > 0 ? '<span style="color:' + C.muted + '"> · ' + taken + ' đồng nghiệp đã đăng ký</span>' : '') + '</td></tr>' +
      '<tr><td style="padding-top:8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E3EAF5;border-radius:99px"><tr>' +
      (pct > 0 ? '<td width="' + pct + '%" style="background:' + (left <= 3 ? "#F97316" : C.brand) + ';border-radius:99px;height:8px;font-size:0;line-height:0">&nbsp;</td>' : '') + (pct < 100 ? '<td style="height:8px;font-size:0;line-height:0">&nbsp;</td>' : '') + '</tr></table></td></tr></table>'
    : (taken > 0 ? '<div style="font-size:14px;color:' + C.ink + '">👥 <b>' + taken + ' đồng nghiệp</b> đã đăng ký</div>' : '');
  const step = (n, t, s) => '<td class="step" valign="top" width="33%" style="padding:0 6px;text-align:center"><div style="width:34px;height:34px;line-height:34px;margin:0 auto;border-radius:50%;background:' + C.brand + ';color:#fff;font-weight:800;font-size:15px">' + n + '</div>' +
    '<div style="margin-top:8px;font-size:13.5px;font-weight:700;color:' + C.ink + '">' + t + '</div><div style="margin-top:2px;font-size:12px;color:' + C.muted + ';line-height:1.45">' + s + '</div></td>';
  const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<style>@media only screen and (max-width:560px){.pad{padding-left:20px!important;padding-right:20px!important}.tile{display:block!important;width:100%!important;padding:0 0 10px!important}.tiles{padding:16px 15px 0!important}.h1{font-size:25px!important}.step{display:block!important;width:100%!important;padding:0 0 14px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + C.page + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(np.short) + ' ơi, một chỗ trong "' + esc(p.title) + '" đang chờ bạn' + (left != null && left > 0 ? " (còn " + left + " chỗ)" : "") + '. Bấm một nút là giữ chỗ.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + '"><tr><td align="center" style="padding:26px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;border-collapse:separate;overflow:hidden;font-family:' + F + ';box-shadow:0 20px 50px -30px rgba(10,40,100,.45)">' +
    // đầu thư
    '<tr><td style="background:' + band[1] + ';background:linear-gradient(135deg,' + band[0] + ',' + band[1] + ');padding:0">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:20px 28px 0;font-size:12px;font-weight:800;letter-spacing:.14em;color:#BFD6FF">🎓 THƯ MỜI THAM GIA CHƯƠNG TRÌNH HỌC</td></tr></table>' +
      (hero ? '<img src="cid:pghero" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin-top:14px">' : '<div style="height:24px"></div>') + '</td></tr>' +
    // lời chào + tiêu đề
    '<tr><td class="pad" style="padding:26px 32px 4px">' +
      '<div style="font-size:15px;color:' + C.body + '">' + esc(greet(cand.name)) + '</div>' +
      '<div style="margin-top:6px;font-size:15px;color:' + C.body + ';line-height:1.6">Bạn được chọn để tham gia chương trình:</div>' +
      '<h1 class="h1" style="margin:10px 0 0;font-size:28px;line-height:1.25;font-weight:900;color:' + C.navy + ';letter-spacing:-.02em">' + esc(p.title) + '</h1>' +
      (D.intro.length ? '<p style="margin:12px 0 0;font-size:15.5px;line-height:1.65;color:' + C.body + '">' + D.intro.map(esc).join("<br>") + '</p>' : '') +
    '</td></tr>' +
    // lợi ích
    (D.gains.length ? '<tr><td class="pad" style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:16px"><tr><td style="padding:16px 18px 10px">' +
      '<div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:#15803D">SAU BUỔI HỌC, BẠN SẼ</div>' +
      D.gains.slice(0, 6).map((g) => '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:9px"><tr><td valign="top" style="padding-right:10px"><div style="width:22px;height:22px;line-height:22px;border-radius:50%;background:#22C55E;color:#fff;text-align:center;font-size:13px;font-weight:800">✓</div></td><td style="font-size:15px;line-height:1.5;color:' + C.ink + ';font-weight:600">' + esc(g) + '</td></tr></table>').join("") +
      '</td></tr></table></td></tr>' : '') +
    // 3 ô thông tin
    (tiles.length ? '<tr><td class="tiles" style="padding:20px 27px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + tiles.join("") + '</tr></table></td></tr>' : '') +
    (p.speaker ? '<tr><td class="pad" style="padding:6px 32px 0;font-size:14.5px;color:' + C.body + '">🎤 Người chia sẻ: <b style="color:' + C.ink + '">' + esc(p.speaker) + '</b></td></tr>' : '') +
    // số chỗ + nút
    '<tr><td class="pad" style="padding:20px 32px 0">' + scarcity + '</td></tr>' +
    '<tr><td align="center" style="padding:24px 20px 8px">' + btn("✅&nbsp; Giữ chỗ của tôi") +
      '<div style="margin-top:12px;font-size:13px;color:' + C.muted + '">Chỉ <b style="color:' + C.ink + '">1 lần bấm</b> · không cần đăng nhập · huỷ được nếu bận</div></td></tr>' +
    // 3 bước
    '<tr><td class="pad" style="padding:22px 26px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.soft + ';border-radius:16px"><tr><td style="padding:18px 10px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      step(1, "Bấm “Giữ chỗ”", "Hệ thống ghi tên bạn ngay") + step(2, "Nhận xác nhận", "Trang báo đăng ký thành công") + step(3, "Đến lớp", p.when ? esc(p.when) : "Theo lịch của chương trình") +
    '</tr></table></td></tr></table></td></tr>' +
    (p.contact ? '<tr><td class="pad" style="padding:14px 32px 0;font-size:13.5px;color:' + C.body + '">Cần hỏi thêm? Liên hệ <b style="color:' + C.ink + '">' + esc(p.contact) + '</b></td></tr>' : '') +
    '<tr><td class="pad" style="padding:22px 32px 26px"><div style="border-top:1px solid ' + C.line + ';padding-top:16px;font-size:11.5px;line-height:1.6;color:#94A0B8">' +
      'Thư mời dành riêng cho ' + esc(cand.name || cand.code) + ' (mã NV ' + esc(cand.code) + '), vui lòng không chuyển tiếp. Không muốn tham gia thì chỉ cần bỏ qua email này.<br>Nút không bấm được? Mở liên kết: <a href="' + esc(url) + '" style="color:' + C.brand + ';word-break:break-all">' + esc(url) + '</a></div></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = greet(cand.name) + "\n\nBạn được chọn để tham gia chương trình: " + p.title + "\n" + (D.intro.length ? D.intro.join("\n") + "\n" : "") +
    (D.gains.length ? "\nSau buổi học, bạn sẽ:\n" + D.gains.map((g) => "  ✓ " + g).join("\n") + "\n" : "") +
    [["Thời gian", p.when], ["Địa điểm", p.where], ["Hạn đăng ký", p.deadline ? vnTime(p.deadline) : ""], ["Người chia sẻ", p.speaker], ["Liên hệ", p.contact]].filter((r) => r[1]).map((r) => r[0] + ": " + r[1]).join("\n") +
    (left != null ? "\nCòn " + left + " / " + p.capacity + " chỗ." : "") + "\n\nGiữ chỗ (chỉ 1 lần bấm):\n" + url + "\n\nKhông muốn tham gia thì bỏ qua email này.";
  const subject = "🎓 " + np.short + " ơi, mời bạn tham gia: " + p.title + (left != null && left > 0 && left <= Math.max(3, Math.ceil(p.capacity * 0.2)) ? " (chỉ còn " + left + " chỗ)" : "");
  const attachments = hero ? [{ filename: "chuong-trinh.jpg", content: hero, contentType: "image/jpeg", cid: "pghero" }] : undefined;
  const previewHtml = hero ? html.replace("cid:pghero", "data:image/jpeg;base64," + hero.toString("base64")) : html;
  return { subject, html, text, attachments, previewHtml };
}

module.exports = { list, get, regs, save, remove, token, readToken, joinUrl, stateOf, act, markInvited, inviteMail, vnTime, up };
