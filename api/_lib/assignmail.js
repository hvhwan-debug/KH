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

const defaultNote = (h) => "Kết quả bài kiểm tra là cơ sở để đánh giá mức độ nắm bắt kiến thức sản phẩm, đồng thời giúp mỗi " + h + " chủ động nhận diện và củng cố những nội dung cần cải thiện trong quá trình tư vấn, bán hàng.";
const defaultClosing = (h) => "Đề nghị " + h + " nghiêm túc thực hiện và hoàn thành đúng thời hạn.";

// opts: { name, org, title, audience, format, deadlineMs, ctaUrl, note, closing, manager, replaces }
// replaces = true: thư gửi lại, thay thế thông báo đã gửi trước đó (có dòng báo bỏ qua thư cũ, tiêu đề có [Cập nhật])
function build(opts) {
  opts = opts || {};
  const name = properName(opts.name);
  const org = opts.org || "Đào tạo Kinh doanh";
  const title = String(opts.title || "Bài kiểm tra").trim();
  const subject = (opts.replaces ? "[Cập nhật] " : "") + "Bạn có bài kiểm tra mới: " + title;
  const audience = opts.audience ? String(opts.audience).trim() : "";
  const format = opts.format || "Trắc nghiệm trực tuyến";
  const deadline = opts.deadlineMs ? vnDeadline(opts.deadlineMs) : "";
  // Xưng hô theo tên: Anh / Chị; không chắc thì giữ "Anh/Chị" (opts.honorific cho phép chỉ định tay)
  const hon = ["Anh", "Chị", "Anh/Chị"].indexOf(opts.honorific) >= 0 ? opts.honorific : honorific(opts.name);
  const note = opts.note || defaultNote(hon);
  const closing = opts.closing || defaultClosing(hon);
  const ctaUrl = /^https?:\/\//i.test(opts.ctaUrl || "") ? opts.ctaUrl : "#";
  const support = supportLine(opts.manager);
  const replaceNote = opts.replaces ? "Email này thay thế thông báo đã gửi trước đó. Vui lòng dùng thông tin trong email này và bỏ qua email cũ." : "";

  const row = (label, value, strong) => !value ? "" :
    '<tr><td style="padding:9px 0;' + (strong ? "border-top:1px solid " + C.line + ";" : "") + 'font-family:' + FONT + ';font-size:13.5px;color:' + C.muted + ';width:150px;vertical-align:top">' + esc(label) + '</td>' +
    '<td style="padding:9px 0;' + (strong ? "border-top:1px solid " + C.line + ";" : "") + 'font-family:' + FONT + ';font-size:14px;font-weight:' + (strong ? "800" : "600") + ';color:' + (strong ? C.brand : C.ink) + '">' + esc(value) + '</td></tr>';

  // ---- Khu vực 1: Header — dải gradient xanh dương đậm, biểu tượng hệ thống + tên nhận diện + tiêu đề chính ----
  const head =
    '<tr><td bgcolor="' + C.deep + '" style="background:' + C.deep + ';background-image:linear-gradient(135deg,' + C.navy + ' 0%,' + C.deep + ' 55%,' + C.brand + ' 100%);padding:30px 32px 26px;border-radius:20px 20px 0 0">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="40" height="40" valign="middle" align="center" style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,.14);font-family:' + FONT + ';font-size:17px">&#128221;</td>' +
    '<td style="padding-left:12px;font-family:' + FONT + '">' +
    '<div style="font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#AFC8F5">Hệ thống Kiểm tra &amp; Đánh giá Trực tuyến</div>' +
    '</td></tr></table>' +
    '<div class="h1" style="font-family:' + FONT + ';font-size:22px;line-height:1.35;font-weight:800;color:#ffffff;letter-spacing:-.01em;margin:18px 0 0">Thông báo bài kiểm tra mới</div>' +
    '</td></tr>';

  // ---- Khu vực 2a: Lời chào + câu thông báo ----
  const greetBlock =
    '<tr><td style="padding:26px 32px 0;font-family:' + FONT + '">' +
    '<div style="font-size:14.5px;line-height:1.75;color:' + C.body + '">Chào ' + hon + (name ? ' <b style="color:' + C.ink + '">' + esc(name) + '</b>' : '') + ',</div>' +
    '<div style="font-size:14.5px;line-height:1.75;color:' + C.body + ';margin-top:8px">' + esc(org) + ' thông báo ' + hon + ' đã được giao bài kiểm tra: <b style="color:' + C.ink + '">\u201c' + esc(title) + '\u201d</b>.</div>' +
    '</td></tr>';

  const replaceBlock = replaceNote
    ? '<tr><td style="padding:14px 32px 0;font-family:' + FONT + '"><div style="font-size:13px;line-height:1.65;color:#7A4B00;background:#FFF6E0;border:1px solid #F0D58A;border-radius:10px;padding:10px 14px">' + esc(replaceNote) + '</div></td></tr>'
    : '';

  // ---- Khu vực 2b: THÔNG TIN BÀI KIỂM TRA — danh sách nhãn/giá trị, dòng hạn hoàn thành được nhấn mạnh ----
  const infoRows = row("Đối tượng", audience) + row("Nội dung", title) + row("Hình thức", format) + row("Thời hạn hoàn thành", deadline, true);
  const infoBlock = (audience || title || format || deadline)
    ? '<tr><td style="padding:22px 32px 0;font-family:' + FONT + '">' +
      '<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:' + C.muted + ';margin:0 0 8px">Thông tin bài kiểm tra</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:' + C.soft + ';border:1px solid ' + C.line + ';border-radius:12px"><tr><td style="padding:4px 16px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + infoRows + '</table>' +
      '</td></tr></table></td></tr>'
    : '';

  // ---- Khu vực 3: HƯỚNG DẪN THỰC HIỆN + CTA ----
  const cta =
    '<tr><td style="padding:24px 32px 0;font-family:' + FONT + '">' +
    '<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:' + C.muted + ';margin:0 0 8px">Hướng dẫn thực hiện</div>' +
    '<div style="font-size:14px;line-height:1.75;color:' + C.body + '">' + hon + ' vui lòng nhấn nút bên dưới để truy cập hệ thống và hoàn thành bài kiểm tra trước thời hạn quy định.</div>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:20px 32px 6px;font-family:' + FONT + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:12px;background:' + C.brand + ';background-image:linear-gradient(120deg,' + C.brand + ',' + C.brand2 + ')">' +
    '<a href="' + esc(ctaUrl) + '" target="_blank" style="display:inline-block;padding:16px 46px;font-family:' + FONT + ';font-size:15px;font-weight:800;letter-spacing:.03em;color:#ffffff;text-decoration:none;border-radius:12px">VÀO LÀM BÀI</a>' +
    '</td></tr></table>' +
    '</td></tr>';

  // ---- Hỗ trợ: liên hệ ĐTKD Kênh GT hoặc quản lí trực tiếp ----
  const supportBlock =
    '<tr><td style="padding:20px 32px 0;font-family:' + FONT + '">' +
    '<div style="border-left:3px solid ' + C.brand + ';background:' + C.soft + ';border-radius:0 10px 10px 0;padding:11px 14px;font-size:13.5px;line-height:1.7;color:' + C.body + '">' + esc(support) + '</div>' +
    '</td></tr>';

  // ---- Khu vực 2c/4: ý nghĩa kết quả + lời nhắc + chữ ký ----
  const closingBlock =
    '<tr><td style="padding:22px 32px 0;font-family:' + FONT + '">' +
    '<div style="font-size:13.5px;line-height:1.75;color:' + C.body + '">' + esc(note) + '</div>' +
    '<div style="font-size:13.5px;line-height:1.75;color:' + C.ink + ';font-weight:700;margin-top:12px">' + esc(closing) + '</div>' +
    '<div style="font-size:14px;line-height:1.75;color:' + C.body + ';margin-top:20px">Trân trọng,<br><b style="color:' + C.ink + '">' + esc(org) + '</b></div>' +
    '</td></tr>';

  // ---- Footer — tối giản, chỉ một dòng nhận diện + một dòng miễn trừ ----
  const footer =
    '<tr><td style="padding:22px 32px 28px;font-family:' + FONT + '">' +
    '<div style="border-top:1px solid ' + C.line + ';padding-top:14px;text-align:center">' +
    '<div style="font-size:12.5px;font-weight:700;color:' + C.ink + '">Hệ thống Kiểm tra &amp; Đánh giá Trực tuyến</div>' +
    '<div style="font-size:11px;color:#9AA7BD;margin-top:8px">Đây là email được gửi tự động. Vui lòng không trả lời email này.</div>' +
    '</div></td></tr>';

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(subject) + '</title>' +
    '<style>@media only screen and (max-width:540px){.wrap{padding:14px 8px!important}.h1{font-size:19px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + C.page + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + C.page + '">' + esc(title) + (deadline ? " · Hạn " + esc(deadline) : "") + '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + '"><tr><td class="wrap" align="center" style="padding:30px 16px">' +
    '<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border:1px solid ' + C.line + ';border-radius:20px;border-collapse:separate;overflow:hidden;box-shadow:0 20px 44px -26px rgba(10,31,68,.35)">' +
    head + greetBlock + replaceBlock + infoBlock + cta + supportBlock + closingBlock + footer +
    '</table></td></tr></table></body></html>';

  const textRows = [
    audience ? "- Đối tượng: " + audience : "", "- Nội dung: " + title, "- Hình thức: " + format,
    deadline ? "- Thời hạn hoàn thành: " + deadline : ""
  ].filter((x) => x !== "");
  const text = [
    "Chào " + hon + (name ? " " + name : "") + ",",
    org + " thông báo " + hon + " đã được giao bài kiểm tra: \u201c" + title + "\u201d.", ...(replaceNote ? [replaceNote] : []), "",
    "THÔNG TIN BÀI KIỂM TRA", ...textRows, "",
    "HƯỚNG DẪN THỰC HIỆN",
    hon + " vui lòng nhấn vào liên kết bên dưới để truy cập hệ thống và hoàn thành bài kiểm tra trước thời hạn quy định.",
    ctaUrl, "",
    note, closing, "",
    support, "",
    "Trân trọng,", org, "",
    "--", "Hệ thống Kiểm tra & Đánh giá Trực tuyến", "Đây là email được gửi tự động. Vui lòng không trả lời email này."
  ].filter((x) => x !== undefined).join("\n");

  return { subject, html, text };
}

module.exports = { build };
