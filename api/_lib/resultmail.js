// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
// Nội dung và giao diện do resultemail.js dựng (khung riêng, độc lập với email của các ứng dụng khác trong repo).
const mail = require("./mail");
const { build, artSpec } = require("./resultemail");

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, advice) {
  // Người đã nghỉ việc: không gửi (trả false = bỏ qua, không phải lỗi)
  try { const quiz = require("./quiz"), k = quiz.normCode(attempt.code); const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === k); if (c && quiz.isLeft(c)) return false; } catch (e) { /* không tra được hồ sơ thì giữ hành vi cũ */ }
  // Đính kèm ẢNH THẺ KẾT QUẢ (PNG) giống thẻ trên trang kết quả + ảnh QR nội tuyến (cid) cho giao diện email. Dựng ảnh lỗi / quá lâu / thiếu thư viện
  // thì vẫn gửi email bình thường: không kèm thẻ, không có ô QR.
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("dựng ảnh quá " + ms / 1000 + " giây")), ms))]);
  let card = null;
  try { const sc = require("./sharecard"); card = { filename: sc.fileName(attempt), content: await within(sc.renderPng(attempt, settings), 10000), contentType: "image/png" }; }
  catch (e) { console.error("resultmail card:", (e && e.message) || e); }
  // Hình minh hoạ giao diện (logo, ảnh đầu thư, vòng tỉ lệ đúng, biểu tượng): lỗi thì gửi bản không hình
  let art = null;
  try { const s = artSpec(attempt, settings); art = await within(require("./mailart").render(s.pct, s.state, s.color, s.comp), 8000); }
  catch (e) { console.error("resultmail art:", (e && e.message) || e); }
  // Thẻ kết quả "sống": ảnh vẽ lại mỗi lần mở thư (api/result-img). Thử dựng trước; lỗi / thiếu thư viện / chưa cấu hình địa chỉ web thì dùng thẻ tĩnh như cũ.
  let live = null;
  try {
    const base = String(require("./config").cfg().appUrl || "").replace(/\/+$/, "");
    if (base && attempt.id) { await within(require("./resultart").card(attempt, settings), 8000); live = base + "/api/result-img?a=" + encodeURIComponent(attempt.id) + "&s=" + require("../result-img").sig(attempt.id); }
  } catch (e) { console.error("resultmail live:", (e && e.message) || e); }
  const m = build(attempt, settings, advice, { card: !!card, qrCid: "", art: art ? art.cid : null, live });
  const atts = [card].concat(art ? art.atts : []).filter(Boolean);
  const sent = await mail.send({ fromName: mail.KT_NAME, to: attempt.email, subject: m.subject, html: m.html, text: m.text, attachments: atts.length ? atts : undefined });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
  return true;
}

module.exports = { send };
