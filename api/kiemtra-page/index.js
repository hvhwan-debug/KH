// Phục vụ trang /kiemtra/ (trang thí sinh) nhưng chèn thêm thẻ Open Graph (og:title, og:description, og:image)
// theo ĐÚNG đề đang mở (lấy từ ?exam=<mã đề>), để khi dán link vào Zalo/Facebook/Messenger... phần xem trước hiện
// tên đề + trạng thái (đang mở/sắp mở/đã đóng) + giờ mở hoặc đóng, thay vì chỉ hiện tên ứng dụng chung chung.
// Nội dung trang (HTML/JS) giữ y nguyên như file tĩnh kiemtra/index.html — chỉ thêm vài dòng <meta> vào <head>.
const fs = require("fs");
const path = require("path");
const { reply } = require("../_lib/http");
const { cfg } = require("../_lib/config");
const quiz = require("../_lib/quiz");

const PAGE_PATH = path.join(__dirname, "..", "..", "kiemtra", "index.html");
const DEFAULT_TITLE = "Hệ thống kiểm tra đánh giá trực tuyến";
const DEFAULT_DESC = "Nền tảng kiểm tra trực tuyến. Nhập mã nhân viên và email để làm bài.";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Mô tả ngắn 1 dòng về trạng thái đề, dùng đúng giờ Việt Nam đã có sẵn (quiz.fmtVN)
function statusLine(settings, now) {
  const t = now || Date.now();
  if (settings.openAt && t < settings.openAt) {
    return "Sắp mở lúc " + quiz.fmtVN(settings.openAt) + (settings.closeAt ? " · đóng lúc " + quiz.fmtVN(settings.closeAt) : "") + ".";
  }
  if (settings.closeAt && t > settings.closeAt) return "Đã đóng lúc " + quiz.fmtVN(settings.closeAt) + ".";
  return "Đang mở" + (settings.closeAt ? " · đóng lúc " + quiz.fmtVN(settings.closeAt) : ", không giới hạn thời gian") + ".";
}

module.exports = async function (context, req) {
  let html;
  try {
    html = fs.readFileSync(PAGE_PATH, "utf8");
  } catch (e) {
    return reply(context, 500, { ok: false, error: "Không đọc được trang." });
  }

  let title = DEFAULT_TITLE, desc = DEFAULT_DESC;
  try {
    const examId = String((req.query && req.query.exam) || "").trim();
    if (examId && (await quiz.examKnown(examId))) {
      const settings = await quiz.getExamSettings(examId);
      if (settings.examTitle) title = String(settings.examTitle).trim().slice(0, 150);
      desc = statusLine(settings, Date.now());
    }
  } catch (e) {
    context.log.error("kiemtra-page meta", e && e.message); // lỗi tra cứu thì vẫn trả trang, chỉ dùng tiêu đề/mô tả mặc định
  }

  const base = cfg().appUrl;
  const metaTags =
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:image" content="' + esc(base) + '/kiemtra/icon-512.png">' +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="description" content="' + esc(desc) + '">';

  html = html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + "</title>" + metaTags);

  context.res = { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }, body: html };
};
