// COOKIE TRANG THÍ SINH (chỉ đặt khi thí sinh đã ĐỒNG Ý ở thông báo cookie). Cả hai đều HttpOnly (mã trang không đọc được), SameSite=Lax.
//  - kt_bid : mã ngẫu nhiên nhận diện TRÌNH DUYỆT (không chứa thông tin cá nhân), hạn 400 ngày. Có kt_bid = đã đồng ý.
//             Ghi kèm vào nhật ký đăng nhập + thiết bị của bài làm để quản trị viên biết các lần vào có cùng một trình duyệt không.
//  - kt_cand: phiên đăng nhập thí sinh (mã NV + email, ký HMAC), hạn 2 giờ: tải lại trang / mở lại tab thì vào lại ngay màn xác nhận
//             và làm tiếp bài đang dở. Vẫn phải xác thực khuôn mặt khi bắt đầu làm bài như bình thường.
// Mỗi phản hồi chỉ đặt MỘT cookie (Azure Functions không bảo đảm nhiều Set-Cookie trong một phản hồi).
const crypto = require("crypto");
const session = require("./session");
const { cfg } = require("./config");

const BID_AGE = 400 * 24 * 3600, CAND_AGE = 2 * 3600;
const sec = () => (cfg().cookieInsecure ? "" : "; Secure");
const base = (name, val, age) => name + "=" + val + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + age + sec();

function parse(req) {
  const out = {}, raw = String(((req && req.headers) || {}).cookie || ((req && req.headers) || {}).Cookie || "");
  raw.split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { out[k] = p.slice(i + 1).trim(); } } });
  return out;
}
const BID_RE = /^[A-Za-z0-9_-]{20,40}$/;
function bidFromReq(req) { const v = parse(req).kt_bid; return v && BID_RE.test(v) ? v : ""; }
function newBid() { return crypto.randomBytes(16).toString("base64url"); }
const bidCookie = (bid) => base("kt_bid", bid, BID_AGE);
const clearBid = () => base("kt_bid", "", 0);

function candCookie(code, email) { return base("kt_cand", session.sign({ k: "cand", c: String(code || ""), e: String(email || ""), exp: Date.now() + CAND_AGE * 1000 }), CAND_AGE); }
function candFromReq(req) { const p = session.verify(parse(req).kt_cand); return p && p.k === "cand" && p.c && p.e ? { code: p.c, email: p.e } : null; }
const clearCand = () => base("kt_cand", "", 0);

// PHIÊN HỌC LIỆU (kt_hl): đặt sau khi xác thực khuôn mặt vào trang Học liệu, hạn 8 giờ. HttpOnly, ký HMAC; tải lại trang không phải quét lại.
// Là cookie phiên đăng nhập (cần thiết để trang hoạt động) nên không phụ thuộc lựa chọn cookie phân tích.
const HL_AGE = 8 * 3600;
function hlCookie(code, name) { return base("kt_hl", session.sign({ k: "hl", c: String(code || ""), n: String(name || "").slice(0, 80), exp: Date.now() + HL_AGE * 1000 }), HL_AGE); }
function hlFromReq(req) { const p = session.verify(parse(req).kt_hl); return p && p.k === "hl" && p.c ? { code: p.c, name: p.n || "" } : null; }
const clearHl = () => base("kt_hl", "", 0);

function attach(context, cookie) { if (context && context.res && cookie) context.res.headers = Object.assign({}, context.res.headers, { "Set-Cookie": cookie }); }

module.exports = { parse, bidFromReq, newBid, bidCookie, clearBid, candCookie, candFromReq, clearCand, hlCookie, hlFromReq, clearHl, attach, BID_AGE, CAND_AGE, HL_AGE };
