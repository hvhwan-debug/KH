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
    contact: clip(b.contact, 200),
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

// ---- email mời ----
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function vnTime(ms) {
  if (!ms) return "";
  const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " ngày " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}
function greet(name) {
  const h = require("./honorific").honorific(name, true), parts = String(name || "").trim().split(/\s+/), given = parts[parts.length - 1] || "";
  return "Chào " + (h ? h + " " + given : (name || "bạn")) + ",";
}
function inviteMail(p, cand) {
  const url = joinUrl(p.id, cand.code);
  const rows = [["🗓", "Thời gian", p.when], ["📍", "Địa điểm / hình thức", p.where], ["⏳", "Hạn đăng ký", p.deadline ? vnTime(p.deadline) : ""],
    ["👥", "Số chỗ", p.capacity ? p.capacity + " người" : ""], ["☎", "Liên hệ", p.contact]].filter((r) => r[2]);
  const C = { navy: "#0A1F44", brand: "#1559C4", ink: "#101B33", body: "#3B465C", muted: "#6B7690", line: "#E3E8F1", soft: "#F2F6FC", page: "#EEF2F8" };
  const F = "'Be Vietnam Pro',Arial,Helvetica,sans-serif";
  const html = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>' +
    '<body style="margin:0;padding:0;background:' + C.page + '"><div style="display:none;max-height:0;overflow:hidden">Mời tham gia: ' + esc(p.title) + ' · bấm một nút để đăng ký</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + '"><tr><td align="center" style="padding:28px 14px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ' + C.line + ';border-radius:18px;border-collapse:separate;overflow:hidden;font-family:' + F + '">' +
    '<tr><td style="background:' + C.brand + ';background:linear-gradient(135deg,#2E7BF0,#0F2E6E);padding:22px 28px;color:#fff">' +
    '<div style="font-size:12px;letter-spacing:.12em;font-weight:700;opacity:.85">THƯ MỜI THAM GIA CHƯƠNG TRÌNH HỌC</div>' +
    '<div style="font-size:22px;font-weight:800;line-height:1.3;margin-top:6px">' + esc(p.title) + '</div></td></tr>' +
    '<tr><td style="padding:24px 28px 8px;color:' + C.body + ';font-size:15px;line-height:1.65">' +
    '<p style="margin:0 0 12px;color:' + C.ink + ';font-weight:600">' + esc(greet(cand.name)) + '</p>' +
    (p.desc ? '<p style="margin:0 0 14px">' + esc(p.desc).replace(/\n/g, "<br>") + '</p>' : '<p style="margin:0 0 14px">Bạn được mời tham gia chương trình học dưới đây.</p>') +
    (rows.length ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.soft + ';border-radius:12px;margin:4px 0 6px">' +
      rows.map((r) => '<tr><td style="padding:9px 14px;width:26px;font-size:16px;vertical-align:top">' + r[0] + '</td><td style="padding:9px 14px 9px 0;font-size:14px"><span style="color:' + C.muted + '">' + esc(r[1]) + ':</span> <b style="color:' + C.ink + '">' + esc(r[2]) + '</b></td></tr>').join("") + '</table>' : '') +
    '</td></tr><tr><td align="center" style="padding:14px 28px 6px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#16A34A" style="border-radius:14px;background:#16A34A">' +
    '<a href="' + esc(url) + '" target="_blank" style="display:inline-block;padding:16px 40px;font-family:' + F + ';font-size:17px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px">✅&nbsp; Xác nhận tham gia</a></td></tr></table>' +
    '<div style="margin-top:10px;font-size:13px;color:' + C.muted + '">Chỉ cần bấm <b>một lần</b> là đăng ký xong. Không muốn tham gia thì bỏ qua email này.</div></td></tr>' +
    '<tr><td style="padding:18px 28px 22px;font-size:11.5px;line-height:1.6;color:#94A0B8;border-top:1px solid ' + C.line + ';margin-top:12px">' +
    'Liên kết dành riêng cho ' + esc(cand.name || cand.code) + ' (mã NV ' + esc(cand.code) + '), vui lòng không chuyển tiếp. Nếu nút không bấm được, mở liên kết sau:<br><a href="' + esc(url) + '" style="color:' + C.brand + ';word-break:break-all">' + esc(url) + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = greet(cand.name) + "\n\nMời tham gia chương trình: " + p.title + "\n" + (p.desc ? p.desc + "\n" : "") +
    rows.map((r) => r[1] + ": " + r[2]).join("\n") + "\n\nXác nhận tham gia (chỉ cần mở liên kết):\n" + url + "\n\nKhông muốn tham gia thì bỏ qua email này.";
  return { subject: "Mời tham gia: " + p.title, html, text };
}

module.exports = { list, get, regs, save, remove, token, readToken, joinUrl, stateOf, act, markInvited, inviteMail, vnTime, up };
