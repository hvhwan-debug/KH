// Công khai: thẻ KẾT QUẢ "sống" trong email kết quả. Ứng dụng mail tải ảnh MỖI LẦN người nhận mở thư, nên điểm, tỉ lệ đúng,
// ĐẠT / CHƯA ĐẠT và nhận xét luôn theo dữ liệu mới nhất (vd quản trị sửa đáp án rồi chấm lại, thư cũ cũng đổi theo).
// Có chữ ký (a + s) gắn với đúng mã bài làm nên không dò được bài khác; ảnh chỉ có tên đề và điểm, không có câu hỏi hay đáp án.
const crypto = require("crypto");
const { cfg } = require("../_lib/config");

function sig(id) { return crypto.createHmac("sha256", cfg().secret || "x").update("rsimg:" + id).digest("base64url").slice(0, 22); }
function send(context, buf) {
  context.res = { status: 200, isRaw: true, body: buf, headers: {
    "Content-Type": "image/png", "Content-Length": String(buf.length),
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0",
    "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff"
  } };
}
module.exports = async function (context, req) {
  try {
    const q = req.query || {}, id = String(q.a || "").slice(0, 80);
    const ok = id && q.s && String(q.s).length === 22 && crypto.timingSafeEqual(Buffer.from(String(q.s)), Buffer.from(sig(id)));
    if (!ok) { context.res = { status: 404, body: "" }; return; }
    const quiz = require("../_lib/quiz");
    const attempt = await quiz.getAttempt(id);
    if (!attempt || attempt.status !== "submitted") { context.res = { status: 404, body: "" }; return; }
    const settings = await quiz.getExamSettings(attempt.period || "");
    const r = await require("../_lib/resultart").card(attempt, settings);
    send(context, r.png);
  } catch (e) {
    context.log.error("result-img", e && e.message);
    context.res = { status: 500, body: "" };
  }
};
module.exports.sig = sig;
