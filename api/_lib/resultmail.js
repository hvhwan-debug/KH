// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
// Nội dung và giao diện do resultemail.js dựng (khung riêng, độc lập với email của các ứng dụng khác trong repo).
const mail = require("./mail");
const { build } = require("./resultemail");

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, advice) {
  // Người đã nghỉ việc: không gửi (trả false = bỏ qua, không phải lỗi)
  try { const quiz = require("./quiz"), k = quiz.normCode(attempt.code); const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === k); if (c && quiz.isLeft(c)) return false; } catch (e) { /* không tra được hồ sơ thì giữ hành vi cũ */ }
  // Đính kèm ẢNH THẺ KẾT QUẢ (PNG) giống thẻ trên trang kết quả + ảnh QR nội tuyến (cid) cho giao diện email. Dựng ảnh lỗi / quá lâu / thiếu thư viện
  // thì vẫn gửi email bình thường: không kèm thẻ, không có ô QR.
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("dựng ảnh quá " + ms / 1000 + " giây")), ms))]);
  let card = null, qr = null;
  try { const sc = require("./sharecard"); card = { filename: sc.fileName(attempt), content: await within(sc.renderPng(attempt, settings), 10000), contentType: "image/png" }; }
  catch (e) { console.error("resultmail card:", (e && e.message) || e); }
  try { const sc = require("./sharecard"); qr = { filename: "ma-qr-xac-thuc.png", content: await within(sc.qrPng(attempt), 5000), contentType: "image/png", cid: "qr-ket-qua@kiemtra", contentDisposition: "inline" }; }
  catch (e) { console.error("resultmail qr:", (e && e.message) || e); }
  const m = build(attempt, settings, advice, { card: !!card, qrCid: qr ? qr.cid : "" });
  const atts = [card, qr].filter(Boolean);
  const sent = await mail.send({ fromName: mail.KT_NAME, to: attempt.email, subject: m.subject, html: m.html, text: m.text, attachments: atts.length ? atts : undefined });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
  return true;
}

module.exports = { send };
