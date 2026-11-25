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

// Email chúc mừng: ảnh nền xanh có ruy băng/confetti (kiemtra/email-bg-birthday.jpg, đặt trên web vì Gmail không hiện nền CSS dạng cid).
// Có đủ phương án dự phòng: thuộc tính background + màu nền (Gmail/Apple Mail), VML (Outlook bản máy tính); không tải được ảnh thì vẫn là nền xanh nhạt.
function cardHtml(name) {
  const bg = cfg().appUrl + "/kiemtra/email-bg-birthday.jpg?v=1", F = "'Be Vietnam Pro',Arial,sans-serif";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF3FF"><tr><td align="center" style="padding:20px 10px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-radius:18px"><tr>' +
    '<td background="' + bg + '" bgcolor="#DCEBFF" valign="top" style="background-color:#DCEBFF;background-image:url(' + bg + ');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:18px;padding:46px 30px">' +
    '<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="frame" src="' + bg + '" color="#DCEBFF" /><v:textbox inset="30,46,30,46"><![endif]-->' +
    '<div style="font-family:' + F + ';background-color:#ffffff;background-color:rgba(255,255,255,0.9);border-radius:16px;padding:32px 26px;text-align:center">' +
    '<div style="font-size:34px;line-height:1">🎉🎂</div>' +
    '<div style="font-size:22px;font-weight:800;color:#0B3F94;margin-top:12px;line-height:1.35">Chúc mừng sinh nhật ' + esc(name) + '!</div>' +
    '<div style="font-size:14px;color:#3B465C;margin-top:14px;line-height:1.75">Chúc bạn một ngày sinh nhật thật vui vẻ, nhiều sức khoẻ và luôn giữ vững nhiệt huyết trong công việc. Cảm ơn bạn đã là một phần của đội ngũ!</div>' +
    '<div style="font-size:13px;color:#6B7690;margin-top:22px">— Đào tạo Kinh doanh —</div></div>' +
    '<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->' +
    '</td></tr></table></td></tr></table>';
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

module.exports = { run, today, todayMD, cardHtml };
