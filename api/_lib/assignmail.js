// Email "Thông báo bài kiểm tra mới" — gửi khi nhân viên được hệ thống gán vào một đề (api/_lib/examnotify.js).
// Nội dung theo đúng văn phong công văn nội bộ (trang trọng, có lời chào riêng từng người, mục THÔNG TIN BÀI
// KIỂM TRA, HƯỚNG DẪN THỰC HIỆN, đoạn ý nghĩa kết quả, lời nhắc và chữ ký đơn vị).
// Thiết kế: Modern Corporate / Premium EdTech / Minimalist — xanh dương chủ đạo, nền trắng/xám nhạt, card rõ ràng.
const { supportLine } = require("./supportline");
const { honorific } = require("./honorific");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "'Be Vietnam Pro','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const C = {
  navy: "#0A1F44", deep: "#0F2E6E", brand: "#1559C4", brand2: "#2E7BF0",
  ink: "#101B33", body: "#3B465C", muted: "#6B7690", line: "#E3E8F1", soft: "#F2F5FA", page: "#EEF2F8"
};
const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function vnDeadline(ms) {
  const v = new Date(ms + 7 * 3600000);
  const hh = String(v.getUTCHours()).padStart(2, "0"), mi = String(v.getUTCMinutes()).padStart(2, "0");
  const dd = String(v.getUTCDate()).padStart(2, "0"), mo = String(v.getUTCMonth() + 1).padStart(2, "0"), yy = v.getUTCFullYear();
  return hh + ":" + mi + " ngày " + dd + "/" + mo + "/" + yy + " (" + WD[v.getUTCDay()] + ")";
}

// "NGUYỄN VĂN A" -> "Nguyễn Văn A"; giữ nguyên nếu tên đã viết hoa/thường chữ cái đầu bình thường
function properName(name) {
  const n = String(name || "").trim();
  if (n && n === n.toLocaleUpperCase("vi") && /\p{L}{2}/u.test(n)) {
    return n.toLocaleLowerCase("vi").replace(/(^|\s)(\p{L})/gu, (x, a, b) => a + b.toLocaleUpperCase("vi"));
  }
  return n;
}

// Lời nhắn mặc định: dùng chung cho mọi loại đề (kiến thức sản phẩm, kỹ năng bán hàng, quy trình...), không nói riêng một chủ đề.
// Từng đề có thể ghi lời nhắn / câu kết riêng ở form đề thi (exam.inviteNote / exam.inviteClosing); {xung_ho} được thay bằng Anh/Chị.
const defaultNote = (h) => "Kết quả bài kiểm tra giúp đánh giá mức độ nắm vững nội dung đã được đào tạo, đồng thời giúp " + h + " chủ động nhận ra những phần cần củng cố để áp dụng tốt hơn trong công việc.";
const defaultClosing = (h) => "Đề nghị " + h + " sắp xếp thời gian làm bài nghiêm túc và hoàn thành đúng thời hạn.";
const fill = (t, h) => String(t || "").replace(/\{xung_ho\}/gi, h).trim();

// opts: { name, org, title, description, format, questions, duration, attempts, openMs, deadlineMs, ctaUrl, note, closing, manager, replaces }
// (audience: tên cũ của description, vẫn nhận để tương thích)
// replaces = true: thư gửi lại, thay thế thông báo đã gửi trước đó (có dòng báo bỏ qua thư cũ, tiêu đề có [Cập nhật])
function build(opts) {
  opts = opts || {};
  const name = properName(opts.name);
  const org = opts.org || "Đào tạo Kinh doanh";
  const title = String(opts.title || "Bài kiểm tra").trim();
  const subject = (opts.replaces ? "[Cập nhật] " : "") + "Bạn có bài kiểm tra mới: " + title;
  const description = String(opts.description || opts.audience || "").trim().slice(0, 500);
  const format = opts.format || "Trắc nghiệm trực tuyến";
  const deadline = opts.deadlineMs ? vnDeadline(opts.deadlineMs) : "";
  const opensLater = opts.openMs && opts.openMs > Date.now() ? vnDeadline(opts.openMs) : ""; // đề chưa mở: báo giờ mở để thí sinh không vào sớm rồi tưởng lỗi
  const questions = opts.questions ? String(opts.questions) + " câu" : "", duration = String(opts.duration || ""), attempts = String(opts.attempts || "");
  // Xưng hô theo tên: Anh / Chị; không chắc thì giữ "Anh/Chị" (opts.honorific cho phép chỉ định tay)
  const hon = ["Anh", "Chị", "Anh/Chị"].indexOf(opts.honorific) >= 0 ? opts.honorific : honorific(opts.name);
  const note = fill(opts.note, hon) || defaultNote(hon);
  const closing = fill(opts.closing, hon) || defaultClosing(hon);
  const ctaUrl = /^https?:\/\//i.test(opts.ctaUrl || "") ? opts.ctaUrl : "#";
  const support = supportLine(opts.manager);
  const replaceNote = opts.replaces ? "Email này thay thế thông báo đã gửi trước đó. Vui lòng dùng thông tin trong email này và bỏ qua email cũ." : "";

  const guide = opensLater
    ? hon + " vui lòng nhấn nút bên dưới để vào trang làm bài từ " + opensLater + (deadline ? " và hoàn thành trước " + deadline : "") + ". Trước giờ mở đề, trang sẽ hiện đồng hồ đếm ngược."
    : hon + " vui lòng nhấn nút bên dưới để truy cập hệ thống và hoàn thành bài kiểm tra" + (deadline ? " trước thời hạn quy định." : ".");
  const days = opts.deadlineMs ? Math.ceil((opts.deadlineMs - Date.now()) / 86400000) : null;
  const left = days == null ? "" : days <= 0 ? "Hết hạn hôm nay" : days === 1 ? "Còn 1 ngày" : "Còn " + days + " ngày";
  const F = "font-family:" + FONT + ";";
  const T = (inner, attrs, style) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (attrs ? " " + attrs : "") + (style ? ' style="' + style + '"' : "") + ">" + inner + "</table>";
  const shortUrl = ctaUrl.replace(/^https?:\/\//, "");

  // ---- Đầu thư: biểu tượng + tên hệ thống | đơn vị gửi ----
  const brand =
    '<tr><td class="px" style="padding:24px 28px 18px;">' + T("<tr>" +
      '<td width="42" height="42" align="center" valign="middle" bgcolor="' + C.brand + '" style="width:42px;height:42px;border-radius:12px;background:' + C.brand + ';background-image:linear-gradient(145deg,' + C.brand2 + ',' + C.deep + ');' + F + 'font-size:20px;font-weight:800;color:#ffffff;">&#10003;</td>' +
      '<td style="padding-left:12px;' + F + 'font-size:14px;line-height:19px;font-weight:800;color:' + C.navy + ';">Hệ thống kiểm tra<br>đánh giá trực tuyến</td>' +
      '<td class="org" align="right" valign="middle" style="' + F + '"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:' + C.soft + ';border:1px solid ' + C.line + ';font-size:12px;font-weight:700;color:' + C.deep + ';white-space:nowrap;">' + esc(org) + "</span></td>" +
    "</tr>", 'width="100%"') + "</td></tr>";

  // ---- Dải chính: xanh đêm, ánh sáng toả góc phải, tên bài + hạn chót ----
  const whenLabel = opensLater ? "Mở đề lúc" : "Hạn hoàn thành";
  const whenValue = opensLater || deadline;
  const whenBox = whenValue
    ? '<div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>' +
      T("<tr>" + '<td style="padding:12px 16px;' + F + '">' +
        '<div style="font-size:11px;line-height:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9FC3FF;">' + whenLabel + "</div>" +
        '<div style="font-size:16px;line-height:23px;font-weight:800;color:#ffffff;padding-top:3px;">' + esc(whenValue) + "</div>" +
        (opensLater && deadline ? '<div style="font-size:12.5px;line-height:18px;color:#C9DCFF;padding-top:2px;">Hạn hoàn thành: ' + esc(deadline) + "</div>" : "") + "</td>" +
        (left && !opensLater ? '<td align="right" valign="middle" style="padding:12px 14px 12px 0;' + F + '"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:' + (days != null && days <= 2 ? "#FF5A6A" : "#FFC53D") + ';font-size:12.5px;font-weight:800;color:' + (days != null && days <= 2 ? "#ffffff" : "#3A2600") + ';white-space:nowrap;">' + esc(left) + "</span></td>" : "") +
        "</tr>", 'width="100%" bgcolor="#123A86"', "background:#123A86;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);border-radius:14px;border-collapse:separate;")
    : "";
  const hero =
    '<tr><td class="hx" style="padding:0 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.deep + '" style="background:' + C.deep + ';background-image:radial-gradient(420px 260px at 100% 0%,rgba(120,190,255,.55) 0%,rgba(120,190,255,0) 70%),radial-gradient(300px 200px at 0% 100%,rgba(46,123,240,.45) 0%,rgba(46,123,240,0) 70%),linear-gradient(140deg,#071A3E 0%,' + C.deep + ' 55%,' + C.brand + ' 100%);border-radius:20px;border-collapse:separate;">' +
    '<tr><td class="hp" style="padding:28px 28px 26px;' + F + '">' +
    '<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);font-size:11px;line-height:15px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ffffff;">' + (opts.replaces ? "Thông báo cập nhật" : "Bài kiểm tra mới") + "</span>" +
    '<div class="h1" style="font-size:25px;line-height:33px;font-weight:800;letter-spacing:-.01em;color:#ffffff;padding-top:14px;">' + esc(title) + "</div>" +
    (description ? '<div style="font-size:14.5px;line-height:22px;color:#CFE0FF;padding-top:8px;">' + esc(description) + "</div>" : "") +
    whenBox +
    "</td></tr></table></td></tr>";

  // ---- Lời chào ----
  const greetBlock =
    '<tr><td class="px" style="padding:26px 28px 0;' + F + '">' +
    '<div style="font-size:18px;line-height:26px;font-weight:800;color:' + C.navy + ';">Chào ' + hon + (name ? " " + esc(name) : "") + ",</div>" +
    '<div style="font-size:14.5px;line-height:23px;color:' + C.body + ';padding-top:6px;">' + esc(org) + " thông báo " + hon + ' đã được giao bài kiểm tra <b style="color:' + C.ink + ';">\u201c' + esc(title) + '\u201d</b>. Thông tin chi tiết ở bên dưới.</div>' +
    "</td></tr>";

  const replaceBlock = replaceNote
    ? '<tr><td class="px" style="padding:14px 28px 0;' + F + '"><div style="font-size:13px;line-height:20px;color:#7A4B00;background:#FFF6E0;border:1px solid #F0D58A;border-radius:12px;padding:11px 14px;">' + esc(replaceNote) + "</div></td></tr>"
    : "";

  // ---- Ba ô thông số: số câu | thời gian | số lượt ----
  const tiles = [questions && { k: "Số câu hỏi", v: questions }, duration && { k: "Thời gian làm bài", v: duration }, attempts && { k: "Số lượt làm", v: attempts }].filter(Boolean);
  const tw = tiles.length ? Math.floor(100 / tiles.length) : 100;
  const tileBlock = tiles.length
    ? '<tr><td class="px" style="padding:22px 28px 0;">' + T("<tr>" + tiles.map((x, i) =>
        '<td class="tile" width="' + tw + '%" valign="top" style="padding:0 ' + (i < tiles.length - 1 ? 5 : 0) + "px 0 " + (i ? 5 : 0) + 'px;">' +
        T("<tr><td style=\"padding:14px 14px 13px;" + F + "\">" +
          '<div style="font-size:12px;line-height:16px;font-weight:600;color:' + C.muted + ';">' + esc(x.k) + "</div>" +
          '<div class="tv" style="font-size:16px;line-height:22px;font-weight:800;color:' + C.navy + ';padding-top:4px;">' + esc(x.v) + "</div></td></tr>",
          'width="100%" bgcolor="' + C.soft + '"', "background:" + C.soft + ";background-image:linear-gradient(160deg,#F7FAFF,#EDF3FC);border:1px solid " + C.line + ";border-radius:14px;border-collapse:separate;") +
        "</td>").join("") + "</tr>", 'width="100%"') +
      '<div style="' + F + 'font-size:12.5px;line-height:18px;color:' + C.muted + ';padding-top:10px;">Hình thức: <b style="color:' + C.ink + ';">' + esc(format) + "</b></div></td></tr>"
    : "";

  // ---- Nút vào làm bài ----
  const cta =
    '<tr><td align="center" class="px" style="padding:26px 28px 0;' + F + '">' +
    T('<tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:14px;background:' + C.brand + ';background-image:linear-gradient(100deg,' + C.deep + ' 0%,' + C.brand + ' 45%,' + C.brand2 + ' 100%);box-shadow:0 14px 28px -14px rgba(21,89,196,.95);">' +
      '<a class="btn" href="' + esc(ctaUrl) + '" target="_blank" style="display:inline-block;padding:16px 54px;' + F + 'font-size:16px;line-height:22px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px;white-space:nowrap;">' + (opensLater ? "Mở trang làm bài" : "Vào làm bài ngay") + " &#8594;</a></td></tr>", 'class="ctat" align="center"') +
    '<div style="font-size:12px;line-height:18px;color:' + C.muted + ';padding-top:10px;">Hoặc mở đường dẫn: <a href="' + esc(ctaUrl) + '" target="_blank" style="color:' + C.brand + ';text-decoration:none;font-weight:600;">' + esc(shortUrl) + "</a></div>" +
    "</td></tr>";

  // ---- Ba bước thực hiện ----
  const steps = [
    ["Mở đường dẫn", opensLater ? "Từ " + opensLater.replace(/\s*\(.*\)$/, "") + ", bằng Chrome hoặc Safari" : "Bằng Chrome hoặc Safari, không mở trong Zalo/Facebook"],
    ["Đăng nhập", "Xác thực danh tính theo hướng dẫn trên màn hình"],
    ["Làm bài và nộp", deadline ? "Hoàn thành trước " + deadline.replace(/\s*\(.*\)$/, "") : "Nộp bài khi làm xong"]
  ];
  const stepBlock =
    '<tr><td class="px" style="padding:26px 28px 0;' + F + '">' +
    '<div style="font-size:15px;line-height:21px;font-weight:800;color:' + C.navy + ';padding-bottom:12px;">Hướng dẫn thực hiện</div>' +
    steps.map((x, i) => T("<tr>" +
      '<td width="34" valign="top" style="padding:' + (i ? 12 : 0) + 'px 0 0;"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;text-align:center;background:' + C.brand + ';background-image:linear-gradient(145deg,' + C.brand2 + ',' + C.deep + ');' + F + 'font-size:13px;font-weight:800;color:#ffffff;">' + (i + 1) + "</div></td>" +
      '<td valign="top" style="padding:' + (i ? 12 : 0) + 'px 0 0 10px;' + F + '"><div style="font-size:14px;line-height:20px;font-weight:700;color:' + C.ink + ';">' + esc(x[0]) + '</div><div style="font-size:13px;line-height:19px;color:' + C.muted + ';">' + esc(x[1]) + "</div></td>" +
      "</tr>", 'width="100%"')).join("") +
    "</td></tr>";

  // ---- Ý nghĩa kết quả + lời nhắc + chữ ký ----
  const closingBlock =
    '<tr><td class="px" style="padding:26px 28px 0;' + F + '">' +
    T('<tr><td style="padding:16px 18px;border-left:4px solid ' + C.brand + ';' + F + '">' +
      '<div style="font-size:14px;line-height:22px;color:' + C.body + ';">' + esc(note) + "</div>" +
      '<div style="font-size:14px;line-height:22px;font-weight:700;color:' + C.ink + ';padding-top:10px;">' + esc(closing) + "</div></td></tr>",
      'width="100%" bgcolor="' + C.soft + '"', "background:" + C.soft + ";border-radius:0 14px 14px 0;border-collapse:separate;") +
    '<div style="font-size:14px;line-height:22px;color:' + C.body + ';padding-top:22px;">Trân trọng,</div>' +
    '<div style="font-size:15px;line-height:22px;font-weight:800;color:' + C.navy + ';">' + esc(org) + "</div>" +
    '<div style="font-size:12.5px;line-height:19px;color:' + C.muted + ';padding-top:12px;">' + esc(support) + "</div>" +
    "</td></tr>";

  // ---- Chân thư: dải xanh đêm ----
  const footer =
    '<tr><td style="padding:28px 0 0;"></td></tr>' +
    '<tr><td align="center" bgcolor="' + C.navy + '" style="background:' + C.navy + ';background-image:linear-gradient(140deg,#071A3E,' + C.deep + ');padding:20px 24px 22px;' + F + '">' +
    '<div style="font-size:13px;line-height:19px;font-weight:800;color:#ffffff;letter-spacing:.02em;">Hệ thống Kiểm tra &amp; Đánh giá Trực tuyến</div>' +
    '<div style="font-size:11.5px;line-height:18px;color:#9FB6DD;padding-top:6px;">Email được gửi tự động, vui lòng không trả lời email này.<br>Mọi thắc mắc về bài kiểm tra, vui lòng liên hệ ' + esc(org) + ".</div>" +
    "</td></tr>";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(subject) + "</title>" +
    "<style>table{border-collapse:collapse}a{color:" + C.brand + "}" +
    "@media only screen and (max-width:560px){.wrap{padding:0!important}.card{border-radius:0!important;border-left:0!important;border-right:0!important}" +
    ".px{padding-left:18px!important;padding-right:18px!important}.hx{padding:0 10px!important}.hp{padding:22px 18px 20px!important}.h1{font-size:21px!important;line-height:28px!important}" +
    ".org{display:none!important}.tile{padding:0 3px!important}.tile td{padding:11px 10px!important}.tv{font-size:14px!important;line-height:19px!important}.ctat{width:100%!important}.btn{padding:15px 20px!important;display:block!important}}</style></head>" +
    '<body style="margin:0;padding:0;background:' + C.page + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + C.page + '">' + esc(title) + (deadline ? " · Hạn " + esc(deadline) : "") + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.page + '" style="background:' + C.page + '"><tr><td class="wrap" align="center" style="padding:30px 12px">' +
    '<table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ' + C.line + ';border-radius:22px;border-collapse:separate;overflow:hidden;box-shadow:0 24px 50px -28px rgba(10,31,68,.45)">' +
    brand + hero + greetBlock + replaceBlock + tileBlock + cta + stepBlock + closingBlock + footer +
    "</table></td></tr></table></body></html>";

  const textRows = [
    description ? "- Nội dung: " + description : "", "- Hình thức: " + format, questions ? "- Số câu hỏi: " + questions : "", duration ? "- Thời gian làm bài: " + duration : "",
    attempts ? "- Số lượt làm: " + attempts : "", opensLater ? "- Mở đề lúc: " + opensLater : "", deadline ? "- Thời hạn hoàn thành: " + deadline : ""
  ].filter((x) => x !== "");
  const text = [
    "Chào " + hon + (name ? " " + name : "") + ",",
    org + " thông báo " + hon + " đã được giao bài kiểm tra: \u201c" + title + "\u201d.", ...(replaceNote ? [replaceNote] : []), "",
    "THÔNG TIN BÀI KIỂM TRA", ...textRows, "",
    "HƯỚNG DẪN THỰC HIỆN",
    guide,
    ctaUrl, "",
    note, closing, "",
    support, "",
    "Trân trọng,", org, "",
    "--", "Hệ thống Kiểm tra & Đánh giá Trực tuyến", "Đây là email được gửi tự động. Vui lòng không trả lời email này."
  ].filter((x) => x !== undefined).join("\n");

  return { subject, html, text };
}

module.exports = { build, defaultNote, defaultClosing };
