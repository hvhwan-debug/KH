// Chúc mừng sinh nhật tự động: mỗi lần chạy (cron), kiểm tra ai có ngày sinh (lấy ngày + tháng từ ngày sinh đã khai) trùng HÔM NAY
// theo giờ Việt Nam, gửi email chúc mừng — mỗi người chỉ gửi đúng 1 lần/năm (đánh dấu birthdayWishedYear).
const quiz = require("./quiz");
const mail = require("./mail");
const { cfg } = require("./config");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function todayMD() {
  const v = new Date(Date.now() + 7 * 3600000);
  return String(v.getUTCMonth() + 1).padStart(2, "0") + "-" + String(v.getUTCDate()).padStart(2, "0");
}
function todayYear() {
  return new Date(Date.now() + 7 * 3600000).getUTCFullYear();
}

function cardHtml(name) {
  return '<div style="font-family:\'Be Vietnam Pro\',Arial,sans-serif;max-width:520px;margin:0 auto;padding:30px 26px;background:#ffffff;border:1px solid #E3E8F1;border-radius:18px">' +
    '<div style="font-size:34px;text-align:center;line-height:1">🎉🎂</div>' +
    '<div style="font-size:20px;font-weight:800;color:#0B3F94;text-align:center;margin-top:10px">Chúc mừng sinh nhật ' + esc(name) + '!</div>' +
    '<div style="font-size:14px;color:#3B465C;text-align:center;margin-top:12px;line-height:1.75">Chúc bạn một ngày sinh nhật thật vui vẻ, nhiều sức khoẻ và luôn giữ vững nhiệt huyết trong công việc. Cảm ơn bạn đã là một phần của đội ngũ!</div>' +
    '<div style="font-size:13px;color:#6B7690;text-align:center;margin-top:20px">— Đào tạo Kinh doanh —</div></div>';
}

// Gửi email chúc mừng cho ai sinh nhật hôm nay và CHƯA được chúc trong năm nay. Gọi từ cron, chạy lại nhiều lần/ngày vẫn an toàn.
async function run() {
  const md = todayMD(), yr = todayYear();
  const candidates = await quiz.getCandidates();
  const todays = candidates.filter((c) => !quiz.isLeft(c) && quiz.birthMD(c.birthDate) === md);
  let sent = 0;
  let touched = false;
  for (const c of todays) {
    if (c.birthdayWishedYear === yr) continue; // đã gửi năm nay rồi, không gửi lại
    if (c.email) {
      try {
        const name = c.name || c.code;
        await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: "🎉 Chúc mừng sinh nhật " + name + "!", html: cardHtml(name), text: "Chúc mừng sinh nhật " + name + "! Chúc bạn một ngày thật vui vẻ, nhiều sức khoẻ." });
        sent++;
      } catch (e) { /* lỗi gửi riêng người này: bỏ qua, thử lại lượt cron sau trong cùng ngày */ continue; }
    }
    c.birthdayWishedYear = yr; touched = true; // đánh dấu đã xử lý (có email hay không) để không lặp lại trong ngày
  }
  if (touched) await quiz.saveCandidates(candidates);
  return { sent, date: md, today: todays.map((c) => ({ code: c.code, name: c.name || c.code })) };
}

// Danh sách sinh nhật hôm nay, dùng cho banner trang quản trị (không gửi email, chỉ xem).
async function today() {
  const md = todayMD();
  const candidates = await quiz.getCandidates();
  return candidates.filter((c) => !quiz.isLeft(c) && quiz.birthMD(c.birthDate) === md).map((c) => ({ code: c.code, name: c.name || c.code, manager: c.manager || "" }));
}

module.exports = { run, today, todayMD };
