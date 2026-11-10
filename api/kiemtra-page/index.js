// Phục vụ trang /kiemtra/ (trang thí sinh) nhưng chèn thêm thẻ Open Graph (og:title, og:description, og:image)
// theo ĐÚNG đề đang mở (lấy từ ?exam=<mã đề>), để khi dán link vào Zalo/Facebook/Messenger... phần xem trước hiện
// tên đề + trạng thái (đang mở/sắp mở/đã đóng) + giờ mở hoặc đóng, thay vì chỉ hiện tên ứng dụng chung chung.
// Nội dung trang (HTML/JS) giữ y nguyên như file tĩnh kiemtra/index.html — chỉ thêm vài dòng <meta> vào <head>.
// QUAN TRỌNG: hàm API và site tĩnh được triển khai ở HAI nơi khác nhau trong Azure Static Web Apps (không chung ổ
// đĩa), nên phải lấy trang tĩnh qua HTTP (fetch chính /kiemtra/index.html đã deploy), không được đọc file cục bộ.
const { reply } = require("../_lib/http");
const { cfg } = require("../_lib/config");
const quiz = require("../_lib/quiz");

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
  const base = cfg().appUrl;
  let html;
  try {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(base + "/kiemtra/index.html", { signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error("status " + r.status);
    html = await r.text();
  } catch (e) {
    context.log.error("kiemtra-page fetch static", e && e.message);
    // Lấy trang tĩnh thất bại (mạng, timeout…): CHUYỂN HƯỚNG sang trang thật thay vì chặn người làm bài lại.
    context.res = { status: 302, headers: { Location: "/kiemtra/index.html" + (req.originalUrl && req.originalUrl.indexOf("?") >= 0 ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "") } };
    return;
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
