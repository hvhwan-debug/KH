const { missing } = require("./config");
const { userFromReq, clearCookie } = require("./session");
const store = require("./store");
const SESSION_MS = 30 * 24 * 3600 * 1000; // phải khớp MAX_AGE trong session.js

function reply(context, status, body, headers) {
  context.res = {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {}),
    body
  };
}

// Chặn truy cập khi chưa cấu hình đủ; trả về true nếu đã trả lời.
function guardConfigured(context) {
  const m = missing();
  if (m.length) {
    reply(context, 503, { ok: false, avail: false, error: "Tính năng đăng nhập chưa được cấu hình trên máy chủ." });
    return true;
  }
  return false;
}

// Yêu cầu ghi dữ liệu phải có header tùy chỉnh để chống giả mạo yêu cầu từ trang khác (CSRF).
function requireAjax(context, req) {
  const h = req.headers || {};
  if (String(h["x-requested-with"] || "").toLowerCase() !== "livotec") {
    reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
    return false;
  }
  return true;
}

function requireUser(context, req) {
  const u = userFromReq(req);
  if (!u || !u.uid || !u.email) {
    reply(context, 401, { ok: false, error: "Chưa đăng nhập." });
    return null;
  }
  return u;
}

// Phiên là cookie có chữ ký nên bản thân nó không thu hồi được. Ở đây đối chiếu với hồ sơ tài khoản:
// tài khoản bị khoá, hoặc phiên được cấp trước thời điểm "đăng xuất mọi thiết bị" (sessAfter) đều bị từ chối.
async function sessionState(u) {
  let ud = null;
  try { ud = await store.get("user/" + u.uid + ".json"); } catch (e) { return "ok"; }
  if (!ud) return "ok";
  if (ud.disabled) return "disabled";
  if (ud.sessAfter && u.exp && (u.exp - SESSION_MS) < ud.sessAfter) return "revoked";
  return "ok";
}
async function requireUserActive(context, req) {
  const u = requireUser(context, req);
  if (!u) return null;
  const st = await sessionState(u);
  if (st === "disabled") { reply(context, 403, { ok: false, disabled: true, error: "Tài khoản đã bị khoá. Hãy liên hệ quản trị viên." }, { "Set-Cookie": clearCookie() }); return null; }
  if (st === "revoked") { reply(context, 401, { ok: false, error: "Phiên đăng nhập đã hết hiệu lực, hãy đăng nhập lại." }, { "Set-Cookie": clearCookie() }); return null; }
  return u;
}

module.exports = { reply, guardConfigured, requireAjax, requireUser, requireUserActive, sessionState };
