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
// Câu hỏi sau khi đăng ký (không bắt buộc): kỳ vọng + tình huống muốn chia sẻ. Quản trị viên sửa được từng chương trình.
const ASK_DEFAULT = {
  q1: "Bạn kỳ vọng điều gì nhất sau buổi học?",
  opts: ["Kỹ năng chốt đơn", "Xử lý lời từ chối", "Kiến thức sản phẩm", "Tư vấn đúng nhu cầu khách", "Chăm sóc khách sau bán", "Học kinh nghiệm từ người giỏi"],
  q2: "Có tình huống thực tế nào bạn muốn được giải đáp hoặc chia sẻ trong buổi học không?"
};
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const up = (s) => String(s || "").trim().toUpperCase();

async function list() { const d = (await store.get(LIST)) || {}; return Array.isArray(d.list) ? d.list : []; }
async function get(id) { return (await list()).find((p) => p.id === id) || null; }
async function regs(id) {
  const d = (await store.get(regKey(id))) || {};
  return { invited: d.invited || {}, regs: d.regs || {}, cancels: d.cancels || {}, answers: d.answers || {} };
}

function clean(b, old) {
  const title = clip(b.title, 150);
  if (!title) return { error: "Vui lòng nhập tên chương trình." };
  const n = (v) => { const x = Math.round(Number(v)); return isFinite(x) && x > 0 ? x : 0; };
  const p = {
    id: (old && old.id) || "p" + Date.now().toString(36) + require("crypto").randomBytes(2).toString("hex"),
    title, desc: clip(b.desc, 2000), when: clip(b.when, 200), where: clip(b.where, 200),
    contact: clip(b.contact, 200), speaker: clip(b.speaker, 150),
    live: b.live === false ? false : true,
    org: clip(b.org, 120), tagline: clip(b.tagline, 140), audience: clip(b.audience, 200), phone: clip(b.phone, 40), email: clip(b.email, 120),
    ask: b.ask === false ? false : true,
    q1: clip(b.q1, 200) || ASK_DEFAULT.q1, q2: clip(b.q2, 200) || ASK_DEFAULT.q2,
    opts: (Array.isArray(b.opts) ? b.opts : ASK_DEFAULT.opts).map((x) => clip(x, 60)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 10),
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

// Lưu câu trả lời kỳ vọng / tình huống (chỉ người ĐÃ đăng ký; gửi lại = cập nhật). Giữ lại nếu người đó huỷ rồi đăng ký lại.
async function answer(id, code, b) {
  const p = await get(id);
  if (!p) return { error: "Chương trình này không còn tồn tại.", status: 404 };
  if (p.ask === false) return { error: "Chương trình này không thu thập câu trả lời.", status: 400 };
  const k = up(code), opts = (Array.isArray(b.opts) ? b.opts : []).map((x) => clip(x, 60)).filter((x) => (p.opts || []).indexOf(x) >= 0).slice(0, 10);
  const a = { opts, expect: clip(b.expect, 600), story: clip(b.story, 1500), at: Date.now() };
  if (!a.opts.length && !a.expect && !a.story) return { error: "Bạn chưa chọn hoặc viết gì.", status: 400 };
  let res = null;
  await store.update(regKey(id), (cur) => {
    const c = cur && typeof cur === "object" && !cur.deleted ? cur : {};
    c.regs = c.regs || {}; c.answers = c.answers || {};
    if (!c.regs[k]) { res = { error: "Bạn cần đăng ký trước khi chia sẻ.", status: 400 }; return c; }
    a.first = (c.answers[k] && c.answers[k].first) || a.at;
    c.answers[k] = a; res = { ok: true, answer: a }; return c;
  });
  return res;
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
// ---- email mời theo mẫu "Thư mời tham gia" (Đào tạo Kinh doanh GT) ----
// Ảnh đầu thư + biểu tượng do inviteart.js dựng (PNG/JPEG gắn nội tuyến). Bố cục bảng + CSS nội tuyến cho Outlook/Gmail.
const REASONS_DEFAULT = ["Cập nhật kiến thức sản phẩm mới nhất", "Nâng cao kỹ năng tư vấn và xử lý tình huống thực tế", "Giao lưu, chia sẻ kinh nghiệm cùng đồng nghiệp", "Ứng dụng ngay vào công việc để tăng hiệu quả bán hàng"];
const ORG_DEFAULT = "Đào tạo Kinh doanh GT";
const splitPipe = (s) => { const x = String(s || "").split("|").map((v) => v.trim()).filter(Boolean); return { main: x[0] || "", sub: x.slice(1).join(" · ") }; };
function dateVN(ms) { const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0"); return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); }
async function inviteMail(p, cand, stats) {
  const url = joinUrl(p.id, cand.code), np = nameParts(cand.name), taken = (stats && stats.taken) || 0;
  const left = p.capacity ? Math.max(0, p.capacity - taken) : null, D = splitDesc(p.desc), org = p.org || ORG_DEFAULT;
  const C = { navy: "#0B2A6B", brand: "#1559C4", ink: "#1C2B4A", body: "#33425E", muted: "#6B7A96", line: "#E1E8F3", tile: "#F1F6FD" };
  const FF = "'Be Vietnam Pro',Segoe UI,Arial,Helvetica,sans-serif";
  // hình
  const atts = [], cid = (k) => "cid:pg-" + k;
  let hero = null, I = null;
  try { const A = require("./inviteart"); hero = await A.hero(p); I = await A.icons(); } catch (e) { hero = null; I = null; }
  const live = p.live !== false && !!cfg().appUrl;
  const liveUrl = (k) => { const s = require("../program-img/index.js").sig(p.id); return cfg().appUrl + "/api/program-img?p=" + encodeURIComponent(p.id) + "&k=" + k + "&s=" + s; };
  let info = null;
  if (!live) { try { const R = await regs(p.id); info = await require("./inviteart").infoCard(p, { taken: Object.keys(R.regs).length, state: stateOf(p, R, "") }); } catch (e) { info = null; } }
  if (hero && !live) atts.push({ filename: "thu-moi.jpg", content: hero, contentType: "image/jpeg", cid: "pg-hero" });
  if (info) atts.push({ filename: "thong-tin.png", content: info, contentType: "image/png", cid: "pg-info" });
  const heroSrc = live ? liveUrl("hero") : cid("hero"), infoSrc = live ? liveUrl("info") : (info ? cid("info") : "");
  const used = {};
  const img = (k, w, extra) => { if (!I || !I[k]) return ""; used[k] = 1; return '<img src="' + cid(k) + '" width="' + w + '" height="' + w + '" alt="" style="display:block;width:' + w + 'px;height:' + w + 'px;border:0' + (extra || "") + '">'; };
  const when = splitPipe(p.when), where = splitPipe(p.where);
  const tile = (ic, label, v) => '<td class="tl" width="50%" valign="top" style="padding:0 6px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.tile + ';border-radius:14px"><tr>' +
    '<td width="64" valign="top" style="padding:20px 0 18px 20px">' + img(ic, 44) + '</td><td valign="top" style="padding:20px 18px 18px 14px">' +
    '<div style="font-size:12.5px;letter-spacing:.06em;color:' + C.muted + ';text-transform:uppercase">' + label + '</div>' +
    '<div style="margin-top:4px;font-size:17px;font-weight:800;color:' + C.navy + ';line-height:1.35">' + esc(v.main) + '</div>' +
    (v.sub ? '<div style="margin-top:3px;font-size:13.5px;color:' + C.body + ';line-height:1.45">' + esc(v.sub) + '</div>' : '') + '</td></tr></table></td>';
  const tiles = [when.main ? tile("calendar", "Thời gian", when) : "", where.main ? tile("pin", "Hình thức / địa điểm", where) : ""].filter(Boolean);
  const gains = (D.gains.length ? D.gains : REASONS_DEFAULT).slice(0, 4), gIc = ["bulb", "chart", "group", "target"];
  const reason = (g, i) => '<td class="rs" width="' + Math.floor(100 / gains.length) + '%" valign="top" align="center" style="padding:6px 10px 4px;' + (i ? 'border-left:1px solid #D5E1F2;' : '') + '">' +
    '<div style="width:46px;margin:0 auto">' + img(gIc[i], 46) + '</div><div style="margin-top:12px;font-size:13.5px;line-height:1.5;color:' + C.ink + '">' + esc(g) + '</div></td>';
  const named = /^(chương trình|khoá|khóa|lớp|buổi|hội thảo|workshop)(?=\s|$)/i.test(String(p.title).normalize("NFC").trim()); // (\b không dùng được với chữ có dấu) // tên đã nói rõ loại: không lặp "chương trình"
  const intro = esc(org) + ' trân trọng mời ' + esc(np.call) + (live ? ' đăng ký tham gia chương trình đào tạo dưới đây.' : ' đăng ký tham gia ' + (named ? '' : 'chương trình ') + '<b style="color:' + C.navy + '">' + esc(p.title) + '</b>.') +
    (D.intro.length ? '<br>' + D.intro.map(esc).join('<br>') : '');
  const seats = p.capacity ? (left > 0 ? (left <= Math.max(3, Math.ceil(p.capacity * 0.2)) ? '🔥 Chỉ còn <b style="color:#C2410C">' + left + ' chỗ</b>' : 'Còn <b style="color:' + C.navy + '">' + left + '/' + p.capacity + ' chỗ</b>') : '<b>Đã đủ chỗ</b>') + (taken ? ' · ' + taken + ' đồng nghiệp đã đăng ký' : '')
    : (taken ? taken + ' đồng nghiệp đã đăng ký' : '');
  const contactName = p.contact || org;
  const fm = (function () { const h = require("./honorific").honorific(cand.name) || "Anh/Chị", nm = String(cand.name || "").trim(); return { h, to: nm ? h + " " + nm : h }; })();
  const infoAlt = [when.main ? "Thời gian: " + [when.main, when.sub].filter(Boolean).join(", ") : "", where.main ? "Hình thức: " + [where.main, where.sub].filter(Boolean).join(", ") : "", p.audience ? "Đối tượng: " + p.audience : "",
    p.deadline ? "Hạn đăng ký: trước " + vnTime(p.deadline) : "", p.phone ? "Liên hệ: " + p.phone : ""].filter(Boolean).join(" · ");
  const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<style>@media only screen and (max-width:560px){.pad{padding-left:20px!important;padding-right:20px!important}.tl{display:block!important;width:100%!important;padding:0 0 12px!important}.tls{padding:0 20px!important}.rs{display:inline-block!important;width:46%!important;border-left:0!important;padding:10px 2%!important}.cta a{padding:17px 26px!important;font-size:16px!important}.ft td{display:block!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:#EEF3FA">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(org) + ' trân trọng mời ' + esc(np.call) + ' tham gia "' + esc(p.title) + '"' + (p.deadline ? ' · hạn đăng ký ' + dateVN(p.deadline) : '') + '. Bấm một nút là đăng ký.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;border-collapse:separate;overflow:hidden;font-family:' + FF + ';color:' + C.body + '">' +
    // ảnh đầu thư
    '<tr><td style="padding:0;background:#EAF2FD">' + ((hero || live) ? '<img src="' + esc(heroSrc) + '" width="640" alt="Thư mời tham gia: ' + esc(p.title) + '" style="display:block;width:100%;max-width:640px;height:auto;border:0">'
      : '<div style="padding:34px 32px"><div style="display:inline-block;background:#DCE8FB;color:' + C.brand + ';font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">THƯ MỜI THAM GIA</div><div style="margin-top:14px;font-size:28px;font-weight:800;color:' + C.navy + ';line-height:1.25">' + esc(p.title) + '</div></div>') + '</td></tr>' +
    // lời chào
    '<tr><td class="pad" style="padding:30px 36px 6px;font-size:16px;line-height:1.65;color:' + C.ink + '">Chào ' + esc(np.call) + ',<br>' + intro + '</td></tr>' +
    // thẻ thông tin: ảnh do máy chủ vẽ lúc mở thư (thời gian, hình thức, đối tượng, người chia sẻ, hạn, số chỗ, liên hệ, trạng thái)
    (infoSrc ? '<tr><td class="pad" style="padding:18px 36px 0"><img src="' + esc(infoSrc) + '" width="560" alt="' + esc(infoAlt) + '" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:14px;font-size:14px;line-height:1.6;color:' + C.body + '">' +
      (live ? '<div style="margin-top:8px;font-size:11.5px;color:#98A6BE">ⓘ Thông tin luôn cập nhật theo hệ thống. Không thấy hình? Bấm “Hiển thị hình ảnh” hoặc mở trang đăng ký.</div>' : '') + '</td></tr>'
      : (tiles.length ? '<tr><td class="tls" style="padding:16px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + tiles.join("") + '</tr></table></td></tr>' : '')) +
    // nút
    '<tr><td align="center" style="padding:26px 20px 6px"><table role="presentation" cellpadding="0" cellspacing="0" class="cta"><tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:40px;background:' + C.brand + ';background:linear-gradient(180deg,#1E6AD8,#1152B8)">' +
      '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:20px 54px;font-family:' + FF + ';font-size:18px;font-weight:800;letter-spacing:.02em;color:#ffffff;text-decoration:none;border-radius:40px">ĐĂNG KÝ THAM GIA NGAY &nbsp;&rarr;</a></td></tr></table>' +
      (p.deadline && !infoSrc ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td valign="middle" style="padding-right:8px">' + img("clock", 20) + '</td><td valign="middle" style="font-size:14.5px;color:' + C.body + '">Thời hạn đăng ký: <b style="color:' + C.navy + '">trước ' + vnTime(p.deadline).replace(" ngày ", " ngày ") + '</b>' + (leftText(p.deadline) ? ' <span style="color:#C2410C;font-weight:700">(' + leftText(p.deadline) + ')</span>' : '') + '</td></tr></table>' : '') +
      (seats && !infoSrc ? '<div style="margin-top:8px;font-size:13.5px;color:' + C.muted + '">' + seats + '</div>' : '') +
      '<div style="margin-top:6px;font-size:12.5px;color:' + C.muted + '">Chỉ cần 1 lần bấm · không cần đăng nhập</div></td></tr>' +
    // vì sao nên tham gia
    '<tr><td class="pad" style="padding:26px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.tile + ';border-radius:16px"><tr><td style="padding:22px 18px 22px">' +
      '<div style="padding:0 14px 14px;font-size:18px;font-weight:800;color:' + C.navy + '">VÌ SAO NÊN THAM GIA?</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + gains.map(reason).join("") + '</tr></table></td></tr></table></td></tr>' +
    // liên hệ
    ((p.phone || p.email || p.contact) && !infoSrc ? '<tr><td class="pad" style="padding:24px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ' + C.line + '"><tr><td style="padding-top:18px"><table role="presentation" cellpadding="0" cellspacing="0" class="ft"><tr>' +
      '<td valign="middle" style="padding-right:16px">' + img("phone", 52) + '</td><td valign="middle" style="font-size:13.5px;line-height:1.7;color:' + C.body + '">Mọi thắc mắc vui lòng liên hệ: <b style="color:' + C.navy + '">' + esc(contactName) + '</b><br>' +
      [p.phone ? 'Điện thoại: <b style="color:' + C.navy + '">' + esc(p.phone) + '</b>' : '', p.email ? 'Email: <a href="mailto:' + esc(p.email) + '" style="color:' + C.brand + ';font-weight:700;text-decoration:none">' + esc(p.email) + '</a>' : ''].filter(Boolean).join(' &nbsp;|&nbsp; ') +
      '</td></tr></table></td></tr></table></td></tr>' : '') +
    // ký tên
    '<tr><td class="pad" style="padding:22px 36px 8px;font-size:14.5px;line-height:1.6;color:' + C.ink + '">Trân trọng,<br><b style="color:' + C.navy + '">' + esc(org) + '</b></td></tr>' +
    // chân thư: xưng hô trang trọng "Anh/Chị <họ tên>" (chắc chắn thì "Anh"/"Chị"), liên kết dự phòng dạng chữ
    '<tr><td class="pad" style="padding:14px 36px 26px"><div style="border-top:1px solid ' + C.line + ';padding-top:14px;font-size:12px;line-height:1.7;color:#7C8AA5">' +
      'Thư mời này được gửi riêng đến ' + esc(fm.to) + ' (Mã nhân viên: ' + esc(cand.code) + '). Vui lòng không chuyển tiếp email này cho người khác.<br>' +
      'Nếu ' + esc(fm.h) + ' không có nhu cầu tham gia chương trình, vui lòng bỏ qua email này.<br>' +
      'Trong trường hợp không thể nhấn nút đăng ký, ' + esc(fm.h) + ' vui lòng truy cập đường dẫn dưới đây để đăng ký:<br>' +
      '<a href="' + esc(url) + '" target="_blank" style="color:' + C.brand + ';font-weight:700;text-decoration:underline">Liên kết đăng ký chương trình</a></div></td></tr>' +
    '</table></td></tr></table></body></html>';
  // chỉ gắn biểu tượng THỰC SỰ có trong thư (các ô thời gian / địa điểm / liên hệ đã nằm trong thẻ thông tin thì không gắn nữa)
  if (I) Object.keys(used).filter((k) => html.indexOf("cid:pg-" + k + '"') >= 0).forEach((k) => atts.push({ filename: k + ".png", content: I[k], contentType: "image/png", cid: "pg-" + k }));
  const text = "Chào " + np.call + ",\n" + org + " trân trọng mời " + np.call + " đăng ký tham gia" + (named ? " " : " chương trình ") + p.title + "\n" + (D.intro.length ? D.intro.join("\n") + "\n" : "") + "\n" +
    [["Thời gian", [when.main, when.sub].filter(Boolean).join(" – ")], ["Hình thức / địa điểm", [where.main, where.sub].filter(Boolean).join(" – ")], ["Đối tượng", p.audience], ["Người chia sẻ", p.speaker], ["Hạn đăng ký", p.deadline ? "trước " + vnTime(p.deadline) : ""]].filter((r) => r[1]).map((r) => r[0] + ": " + r[1]).join("\n") +
    "\n\nĐĂNG KÝ THAM GIA NGAY (chỉ 1 lần bấm):\n" + url + "\n\nVì sao nên tham gia?\n" + gains.map((g) => "  • " + g).join("\n") +
    ((p.phone || p.email) ? "\n\nLiên hệ: " + contactName + [p.phone ? " · ĐT " + p.phone : "", p.email ? " · " + p.email : ""].join("") : "") + "\n\nTrân trọng,\n" + org +
    "\n\n---\nThư mời này được gửi riêng đến " + fm.to + " (Mã nhân viên: " + cand.code + "). Vui lòng không chuyển tiếp email này cho người khác.\n" +
    "Nếu " + fm.h + " không có nhu cầu tham gia chương trình, vui lòng bỏ qua email này.\n" +
    "Trong trường hợp không thể nhấn nút đăng ký, " + fm.h + " vui lòng truy cập đường dẫn dưới đây để đăng ký:\n" + url;
  const subject = "Thư mời đăng ký chương trình đào tạo dành cho " + np.call + ": " + p.title + (left != null && left > 0 && left <= Math.max(3, Math.ceil(p.capacity * 0.2)) ? " (chỉ còn " + left + " chỗ)" : "");
  let previewHtml = html; atts.forEach((a) => { previewHtml = previewHtml.split("cid:" + a.cid).join("data:" + a.contentType + ";base64," + a.content.toString("base64")); });
  return { subject, html, text, attachments: atts.length ? atts : undefined, previewHtml };
}

module.exports = { ORG_DEFAULT, ASK_DEFAULT, answer, list, get, regs, save, remove, token, readToken, joinUrl, stateOf, act, markInvited, inviteMail, vnTime, up };
