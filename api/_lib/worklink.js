// Link xác nhận nhân sự theo TỪNG QUẢN LÍ, có THỜI HẠN (trang /kiemtra/xacnhan.html#t=...).
// Người mở link không cần đăng nhập, chỉ thấy và chỉ bấm "Còn làm" / "Đã nghỉ" cho nhân viên của đúng quản lí ghi trên link,
// và chỉ tới hết hạn. Quản trị viên tạo / thu hồi link. Link là mã ngẫu nhiên lưu ở máy chủ (thu hồi được ngay).
const crypto = require("crypto");
const store = require("./store");
const quiz = require("./quiz");

const L_KEY = "kt/worklinks.json";
const MAX_DAYS = 90;
const AUDIT_MAX = 30;

async function getLinks() { return (await store.get(L_KEY)) || []; }
async function saveLinks(list) { await store.put(L_KEY, list.slice(-300)); }
const newToken = () => crypto.randomBytes(24).toString("base64url");
const tokenOk = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{30,40}$/.test(t);

// Tìm link còn hiệu lực theo mã. Trả về { link } hoặc { error, expired }.
async function resolve(token) {
  if (!tokenOk(token)) return { error: "Link không hợp lệ." };
  const l = (await getLinks()).find((x) => x.token === token);
  if (!l) return { error: "Link không tồn tại hoặc đã bị xoá." };
  if (l.revoked) return { error: "Link này đã bị thu hồi. Hãy xin quản trị viên link mới.", expired: true };
  if (Date.now() > l.exp) return { error: "Link đã hết hạn ngày " + vnDate(l.exp) + ". Hãy xin quản trị viên link mới.", expired: true };
  return { link: l };
}
function vnDate(ms) { const d = new Date(ms + 7 * 3600 * 1000); return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear(); }
// Hết hạn vào cuối ngày (23:59:59 giờ Việt Nam) của ngày "YYYY-MM-DD"
function endOfVnDay(day) { return Date.parse(day + "T23:59:59.999+07:00"); }

// Áp trạng thái làm việc lên một nhân viên (dùng chung cho tài khoản quản lí và link).
// opt: { left: true|false } hoặc { clear: true } (hoàn tác về chưa xác nhận). who: { by, byName }
function applyEmployment(c, opt, who) {
  const now = Date.now(), next = Object.assign({}, c);
  const from = c.left ? "đã nghỉ việc" : "đang làm việc";
  if (opt.clear) {
    delete next.left; delete next.leftAt; delete next.work;
    next.audit = (c.audit || []).concat([Object.assign({ at: now, kind: "edit", changes: { work: { from, to: "chưa xác nhận (hoàn tác)" } } }, who)]).slice(-AUDIT_MAX);
    return { next, changed: !!c.left };
  }
  const left = opt.left === true;
  next.work = Object.assign({ status: left ? "left" : "active", at: now }, who);
  if (left) { next.left = true; next.leftAt = c.left ? (c.leftAt || now) : now; } else { delete next.left; delete next.leftAt; }
  const changed = !!c.left !== left, entry = Object.assign({ at: now, kind: changed ? "edit" : "confirm" }, who);
  if (changed) entry.changes = { work: { from, to: left ? "đã nghỉ việc" : "đang làm việc" } };
  next.audit = (c.audit || []).concat([entry]).slice(-AUDIT_MAX);
  return { next, changed };
}

const rowOf = (c) => ({ code: c.code, name: c.name || "", title: quiz.titleOf(c), manager: c.manager || "", left: !!c.left, leftAt: c.leftAt || 0,
  work: c.work ? { status: c.work.status, byName: c.work.byName || c.work.by, at: c.work.at } : null });
const sortRows = (a, b) => String(a.manager).localeCompare(String(b.manager), "vi") || String(a.name).localeCompare(String(b.name), "vi");

module.exports = { getLinks, saveLinks, newToken, resolve, applyEmployment, rowOf, sortRows, endOfVnDay, vnDate, MAX_DAYS };
