const { missing } = require("./config");
const { userFromReq } = require("./session");

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

module.exports = { reply, guardConfigured, requireAjax, requireUser };
