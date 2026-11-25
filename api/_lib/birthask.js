// "Xin ngày sinh" khi nhân viên tương tác với hệ thống (vào Học liệu, tra cứu lịch sử, làm bài xong...): nhắc nhẹ, bỏ qua được.
// Máy chủ chỉ phát "vé ngắn hạn" SAU KHI đã nhận diện được người đó (khuôn mặt / mã NV + email), vé gắn với đúng một mã NV
// và hết hạn sau 20 phút; trang kt-birth chỉ nhận ngày sinh kèm vé hợp lệ nên không ai khai hộ / sửa ngày sinh của người khác.
const session = require("./session");
const quiz = require("./quiz");

const TTL_MS = 20 * 60 * 1000;
const issue = (code) => session.sign({ k: "bd", c: String(code || ""), exp: Date.now() + TTL_MS });
function codeOf(tok) { const p = session.verify(String(tok || "")); return p && p.k === "bd" && p.c ? String(p.c) : ""; }

// Khối gửi cho trình duyệt, hoặc null nếu không cần hỏi (đã khai đủ ngày/tháng/năm, hoặc quản trị viên tắt tính năng).
async function forCandidate(c) {
  try {
    if (!c || !c.code || quiz.hasBirthYear(c.birthDate)) return null;
    if ((await quiz.getSettings()).askBirthDate === false) return null;
    return { tok: issue(c.code), md: quiz.birthMD(c.birthDate) };
  } catch (e) { return null; }
}
async function forCode(code) {
  try {
    const k = quiz.normCode(code); if (!k) return null;
    const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === k) || (await quiz.findTestByCode(k));
    return forCandidate(c);
  } catch (e) { return null; }
}
module.exports = { issue, codeOf, forCandidate, forCode, TTL_MS };
