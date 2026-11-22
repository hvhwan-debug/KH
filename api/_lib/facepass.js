// "VÉ" ĐĂNG NHẬP BẰNG KHUÔN MẶT: nhân viên vừa đăng nhập bằng khuôn mặt (kt-facelogin: đã qua thử thách quay mặt +
// nhận diện 1-N trong thư viện) thì KHÔNG phải quét mặt lần nữa ở bước bắt đầu làm bài (kt-start), nếu đề thi bật
// "Bỏ xác minh khuôn mặt lần hai khi đã đăng nhập bằng khuôn mặt" (faceLoginSkip, mặc định BẬT).
// Vé là chuỗi ký HMAC (cùng khoá với phiên đăng nhập), gắn với:
//   - mã nhân viên được nhận diện (không dùng được cho mã khác);
//   - dấu băm SHA-256 của ĐÚNG ảnh đã quét lúc đăng nhập (ảnh này được lưu làm ảnh xác nhận của bài, không đổi được ảnh khác);
//   - hạn dùng ngắn (FACE_PASS_TTL_MIN phút, mặc định 15).
// Tắt hẳn trên toàn hệ thống: FACE_PASS=off (mọi đề đều phải quét mặt lại như trước).
const crypto = require("crypto");
const session = require("./session");

const TTL_MS = Math.max(1, Math.min(120, Number(process.env.FACE_PASS_TTL_MIN) || 15)) * 60 * 1000;

const enabled = () => String(process.env.FACE_PASS || "on").toLowerCase() !== "off";
const hashOf = (photo) => crypto.createHash("sha256").update(String(photo || "")).digest("base64url");
const norm = (c) => String(c || "").trim().toUpperCase();

// Cấp vé sau khi đăng nhập bằng khuôn mặt thành công. info: { distance, second, ai }
function issue(code, photo, info) {
  if (!enabled() || !code || !photo) return "";
  const i = info || {};
  return session.sign({ k: "fpass", c: norm(code), h: hashOf(photo), d: i.distance != null ? Math.round(i.distance * 1000) / 1000 : null,
    s: i.second != null ? Math.round(i.second * 1000) / 1000 : null, ai: !!i.ai, at: Date.now(), exp: Date.now() + TTL_MS });
}

// Kiểm tra vé lúc bắt đầu làm bài. Trả { ok, code, rec } hoặc { ok:false, reason }
function verify(token, code, photo) {
  if (!enabled()) return { ok: false, reason: "off" };
  if (!token || typeof token !== "string" || token.length > 2000) return { ok: false, reason: "missing" };
  const p = session.verify(token); // sai chữ ký hoặc hết hạn -> null
  if (!p || p.k !== "fpass") return { ok: false, reason: "invalid" };
  if (p.c !== norm(code)) return { ok: false, reason: "code" };
  if (!photo || p.h !== hashOf(photo)) return { ok: false, reason: "photo" };
  return { ok: true, code: p.c, rec: { via: "faceLogin", at: p.at, d: p.d, s: p.s, ai: !!p.ai } };
}

// Chỉ kiểm tra chữ ký + mã NV (không cần ảnh): dùng để biết lần kt-check này là ngay sau đăng nhập bằng khuôn mặt
function peek(token, code) {
  if (!token || typeof token !== "string" || token.length > 2000) return false;
  const p = session.verify(token);
  return !!(p && p.k === "fpass" && p.c === norm(code));
}

// VÉ "VỪA ĐĂNG NHẬP BẰNG KHUÔN MẶT" (luôn cấp, kể cả khi FACE_PASS=off): chỉ dùng để kt-check biết lần kiểm tra mã NV + email này
// đến từ đăng nhập khuôn mặt -> KHÔNG bắt xác thực khuôn mặt thêm lần nữa vì chống dò (đã nhập sai nhiều lần).
// Gắn với mã nhân viên được nhận diện, hạn 15 phút. Không thay cho ảnh xác nhận lúc bắt đầu làm bài.
const LOGIN_TTL_MS = 15 * 60 * 1000;
function issueLogin(code) {
  if (!code) return "";
  return session.sign({ k: "flogin", c: norm(code), at: Date.now(), exp: Date.now() + LOGIN_TTL_MS });
}
function loginOk(token, code) {
  if (!token || typeof token !== "string" || token.length > 2000 || !code) return false;
  const p = session.verify(token);
  return !!(p && p.k === "flogin" && p.c === norm(code));
}

module.exports = { issue, verify, peek, enabled, TTL_MS, issueLogin, loginOk };
