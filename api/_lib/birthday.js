// Chúc mừng sinh nhật tự động: mỗi lần chạy (cron), kiểm tra ai có ngày sinh (lấy ngày + tháng từ ngày sinh đã khai) trùng HÔM NAY
// theo giờ Việt Nam, gửi email chúc mừng — mỗi người chỉ gửi đúng 1 lần/năm (đánh dấu birthdayWishedYear).
const quiz = require("./quiz");
const mail = require("./mail");
const { cfg } = require("./config");
const { honorific } = require("./honorific");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function todayMD() {
  const v = new Date(Date.now() + 7 * 3600000);
  return String(v.getUTCMonth() + 1).padStart(2, "0") + "-" + String(v.getUTCDate()).padStart(2, "0");
}
function todayYear() {
  return new Date(Date.now() + 7 * 3600000).getUTCFullYear();
}

// Email chúc mừng sinh nhật theo mẫu thiết kế: đầu thư (logo + tên hệ thống), tiêu đề "Chúc mừng Sinh nhật!", lời chào theo tên (Anh/Chị),
// 3 đoạn lời chúc có biểu tượng, hình minh hoạ, khung lời chúc và nút "Truy cập hệ thống".
// Hình nằm trong kiemtra/bd-*.png + nền kiemtra/email-bg-birthday.jpg, tải từ web (Gmail không hiện ảnh dạng cid trong nền CSS).
// Chữ luôn là chữ thật (đọc được khi tắt ảnh); Outlook bản máy tính không hỗ trợ ảnh nền nên hiện nền xanh nhạt phẳng.
function cardHtml(name) {
  const base = cfg().appUrl + "/kiemtra/", img = (f) => base + f + "?v=1", F = "'Be Vietnam Pro',Arial,sans-serif";
  const full = String(name || "").trim(), given = full.split(/\s+/).pop() || full;
  const hon = honorific(full), who = (hon + " " + given).trim();      // "Anh Hoan" / "Chị Thảo" / "Anh/Chị Tài" khi chưa chắc
  const para = (ic, text) => '<tr><td width="56" valign="top" style="padding:0 12px 16px 0"><img src="' + img(ic) + '" width="44" alt="" style="display:block;border:0;width:44px;height:auto"></td>' +
    '<td valign="top" style="padding:0 0 16px;font-family:' + F + ';font-size:15px;line-height:1.7;color:#1E2B45">' + text + '</td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF3FF"><tr><td align="center" style="padding:20px 10px">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-radius:20px">' +
    // Đầu thư
    '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:20px 20px 0 0;border-bottom:1px solid #E1EAF6;padding:16px 26px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:14px"><img src="' + img("bd-logo.png") + '" width="38" alt="" style="display:block;border:0;width:38px;height:auto"></td>' +
    '<td valign="middle" style="border-left:1px solid #C9D8EE;padding-left:14px;font-family:' + F + ';font-size:16px;font-weight:700;color:#0B3F94;line-height:1.35">Hệ thống kiểm tra &amp; đánh giá trực tuyến</td></tr></table></td></tr>' +
    // Thân thư trên ảnh nền
    '<tr><td background="' + img("email-bg-birthday.jpg") + '" bgcolor="#E6F1FF" valign="top" style="background-color:#E6F1FF;background-image:url(' + img("email-bg-birthday.jpg") + ');background-size:cover;background-position:center bottom;background-repeat:no-repeat;border-radius:0 0 20px 20px;padding:26px 0 50px">' +
    '<div style="text-align:center"><img src="' + img("bd-title.png") + '" width="380" alt="Chúc mừng Sinh nhật!" style="border:0;max-width:92%;width:380px;height:auto"></div>' +
    '<div style="font-family:' + F + ';font-size:19px;color:#111C33;padding:16px 32px 14px">Xin chào <span style="color:#1D6FEA;font-weight:800">' + esc(who) + ',</span></div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="top" style="padding:0 6px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    para("bd-ic1.png", "Mỗi tuổi mới là một chương mới của hành trình trưởng thành. Mỗi trải nghiệm là một bài học, mỗi thử thách là một cơ hội để khám phá những giới hạn mới của bản thân.") +
    para("bd-ic2.png", "Nhân ngày đặc biệt này, chúc " + esc(hon) + " luôn giữ được tinh thần ham học hỏi, sự tò mò để khám phá những điều mới và nguồn năng lượng tích cực để không ngừng phát triển.") +
    para("bd-ic3.png", "Mong rằng tuổi mới sẽ mang đến nhiều kiến thức mới, những trải nghiệm đáng giá, những bước tiến trong sự nghiệp và thật nhiều niềm vui trong cuộc sống.") +
    '</table></td>' +
    '<td width="215" valign="middle" align="center" style="padding:0 14px 0 0"><img src="' + img("bd-illus.png") + '" width="205" alt="" style="display:block;border:0;width:205px;max-width:100%;height:auto"></td></tr></table>' +
    // Khung lời chúc
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 26px 26px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#E4F0FD" style="background-color:#E4F0FD;border-radius:18px;padding:20px 22px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:18px"><img src="' + img("bd-award.png") + '" width="46" alt="" style="display:block;border:0;width:46px;height:auto"></td>' +
    '<td valign="middle" style="border-left:2px solid #A9CBF7;padding-left:18px;font-family:' + F + ';font-size:16px;line-height:1.6;font-weight:700;font-style:italic;color:#0B2A66">Chúc ' + esc(hon) + ' tuổi mới:<br>Học hỏi không ngừng – Phát triển mỗi ngày – Thành công trên hành trình riêng!</td></tr></table>' +
    '</td></tr></table></td></tr></table>' +
    // Nút
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1D6FEA" style="background-color:#1D6FEA;background-image:linear-gradient(180deg,#2F86FF,#1558D8);border-radius:999px">' +
    '<a href="' + esc(base) + '" target="_blank" style="display:inline-block;padding:15px 40px;font-family:' + F + ';font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px">&#8599;&nbsp; Truy cập hệ thống</a></td></tr></table>' +
    '<div style="font-family:' + F + ';font-size:13px;color:#5B6B86;text-align:center;padding-top:20px">— Đào tạo Kinh doanh —</div>' +
    '</td></tr></table></td></tr></table>';
}
function cardText(name) {
  const full = String(name || "").trim(), given = full.split(/\s+/).pop() || full, hon = honorific(full);
  return "Chúc mừng Sinh nhật!\n\nXin chào " + hon + " " + given + ",\n\nMỗi tuổi mới là một chương mới của hành trình trưởng thành. Mỗi trải nghiệm là một bài học, mỗi thử thách là một cơ hội để khám phá những giới hạn mới của bản thân.\n\nNhân ngày đặc biệt này, chúc " + hon + " luôn giữ được tinh thần ham học hỏi, sự tò mò để khám phá những điều mới và nguồn năng lượng tích cực để không ngừng phát triển.\n\nMong rằng tuổi mới sẽ mang đến nhiều kiến thức mới, những trải nghiệm đáng giá, những bước tiến trong sự nghiệp và thật nhiều niềm vui trong cuộc sống.\n\nChúc " + hon + " tuổi mới: Học hỏi không ngừng – Phát triển mỗi ngày – Thành công trên hành trình riêng!\n\nTruy cập hệ thống: " + cfg().appUrl + "/kiemtra/\n\n— Đào tạo Kinh doanh —";
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
        await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: "🎉 Chúc mừng sinh nhật " + name + "!", html: cardHtml(name), text: cardText(name) });
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

module.exports = { run, today, todayMD, cardHtml, cardText };
