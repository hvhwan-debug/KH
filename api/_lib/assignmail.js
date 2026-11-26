// Email "Thông báo bài kiểm tra mới" — gửi khi nhân viên được hệ thống gán vào một đề (api/_lib/examnotify.js).
// Nội dung theo đúng văn phong công văn nội bộ (trang trọng, có lời chào riêng từng người, mục THÔNG TIN BÀI
// KIỂM TRA, HƯỚNG DẪN THỰC HIỆN, đoạn ý nghĩa kết quả, lời nhắc và chữ ký đơn vị).
// Thiết kế: Modern Corporate / Premium EdTech / Minimalist — xanh dương chủ đạo, nền trắng/xám nhạt, card rõ ràng.
const { supportLine } = require("./supportline");
const { honorific } = require("./honorific");
let cfgFn = null; try { cfgFn = require("./config").cfg; } catch (e) { cfgFn = null; }
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

// Mẫu dùng chung cho "mời làm bài kiểm tra" (kind = "exam", mặc định) và "thông báo phát hành khóa học" (kind = "course").
// Cùng một bố cục, chỉ đổi nội dung theo loại: nhãn đầu thư, 3 ô thông số, nút bấm, các bước, lời nhắn.
// opts: { kind, name, org, title, description, format, questions, duration, attempts, lessons, tiles:[{icon,k,v}], openMs, deadlineMs,
//         ctaUrl, note, closing, manager, replaces, materials:[{title,type,url}] }
// (audience: tên cũ của description, vẫn nhận để tương thích)
// replaces = true: thư gửi lại thay thế thông báo trước (tiêu đề có [Cập nhật], nhãn "Thông báo cập nhật")
const defaultCourseNote = (h) => "Nội dung khóa học giúp " + h + " cập nhật kiến thức, kỹ năng cần thiết và áp dụng ngay vào công việc hằng ngày.";
const defaultCourseClosing = (h) => "Đề nghị " + h + " sắp xếp thời gian học và hoàn thành đúng thời hạn.";
const IC = { navy: "#0B1F4B", blue: "#1559C4", sky: "#3B82F6", pill: "#DAE8FB", tile: "#F3F8FF", tileLine: "#D6E4F7", panel: "#EEF5FD" };

function build(opts) {
  opts = opts || {};
  const isCourse = opts.kind === "course";
  const name = properName(opts.name);
  const org = opts.org || "Đào tạo Kinh doanh";
  const title = String(opts.title || (isCourse ? "Khóa học" : "Bài kiểm tra")).trim();
  const description = String(opts.description || opts.audience || "").trim().slice(0, 500);
  const format = opts.format || (isCourse ? "Học trực tuyến" : "Trắc nghiệm trực tuyến");
  const deadline = opts.deadlineMs ? vnDeadline(opts.deadlineMs) : "";
  const opensLater = opts.openMs && opts.openMs > Date.now() ? vnDeadline(opts.openMs) : ""; // chưa mở: báo giờ mở để người nhận không vào sớm rồi tưởng lỗi
  const questions = opts.questions ? String(opts.questions) + " câu" : "", duration = String(opts.duration || ""), attempts = String(opts.attempts || "");
  // Xưng hô theo tên: Anh / Chị; không chắc thì giữ "Anh/Chị" (opts.honorific cho phép chỉ định tay)
  const hon = ["Anh", "Chị", "Anh/Chị"].indexOf(opts.honorific) >= 0 ? opts.honorific : honorific(opts.name);
  const subject = (opts.replaces ? "[Cập nhật] " : "") + (isCourse ? "Khóa học mới dành cho " + hon + ": " + title : hon + " có bài kiểm tra mới: " + title);   // cùng cách xưng hô với nội dung thư
  const note = fill(opts.note, hon) || (isCourse ? defaultCourseNote(hon) : defaultNote(hon));
  const closing = fill(opts.closing, hon) || (isCourse ? defaultCourseClosing(hon) : defaultClosing(hon));
  const ctaUrl = /^https?:\/\//i.test(opts.ctaUrl || "") ? opts.ctaUrl : "#";
  const support = supportLine(opts.manager);
  const shortUrl = ctaUrl.replace(/^https?:\/\//, "");
  const base = String((cfgFn && cfgFn().appUrl) || "https://kh.io.vn").replace(/\/+$/, "");
  const img = (n, w, extra) => '<img src="' + base + "/mail-assets/" + n + '.png" width="' + w + '" height="' + w + '" alt="" style="display:block;width:' + w + "px;height:" + w + "px;border:0;" + (extra || "") + '">';

  const guide = opensLater
    ? hon + " vui lòng nhấn nút bên dưới để vào trang " + (isCourse ? "học" : "làm bài") + " từ " + opensLater + (deadline ? " và hoàn thành trước " + deadline : "") + ". Trước giờ mở, trang sẽ hiện đồng hồ đếm ngược."
    : hon + " vui lòng nhấn nút bên dưới để truy cập hệ thống và hoàn thành " + (isCourse ? "khóa học" : "bài kiểm tra") + (deadline ? " trước thời hạn quy định." : ".");
  const days = opts.deadlineMs ? Math.ceil((opts.deadlineMs - Date.now()) / 86400000) : null;
  const left = days == null ? "" : days <= 0 ? "Hết hạn hôm nay" : days === 1 ? "Còn 1 ngày" : "Còn " + days + " ngày";
  const F = "font-family:" + FONT + ";";
  const T = (inner, attrs, style) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (attrs ? " " + attrs : "") + (style ? ' style="' + style + '"' : "") + ">" + inner + "</table>";

  // ---- Đầu thư: biểu tượng + tên hệ thống ----
  const brand =
    '<tr><td class="px" style="padding:26px 28px 0;' + F + '">' + T("<tr>" +
      '<td width="62" valign="middle" style="width:62px;">' + img("ic-laptop", 46) + "</td>" +
      '<td valign="middle" style="' + F + '"><span style="display:inline-block;padding:4px 14px;border-radius:999px;background:' + IC.pill + ";font-size:14px;line-height:20px;font-weight:700;color:" + IC.blue + ';">Hệ thống Kiểm tra</span>' +
      '<div style="font-size:21px;line-height:27px;font-weight:800;color:' + IC.navy + ';padding-top:4px;">Đánh giá trực tuyến</div></td></tr>', 'width="100%"') +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td width="46" height="3" bgcolor="' + IC.navy + '" style="width:46px;height:3px;line-height:3px;font-size:0;background:' + IC.navy + ';border-radius:3px;">&nbsp;</td></tr></table></td></tr>';

  // ---- Tên + mô tả (trái) | hình laptop (phải) ----
  const eyebrow = opts.replaces ? "Thông báo cập nhật" : isCourse ? "Khóa học mới" : "Bài kiểm tra mới";
  const heroRow =
    '<tr><td style="padding:0;">' + T("<tr>" +
      '<td class="hl px" valign="top" style="padding:26px 0 26px 28px;' + F + '">' +
        '<div style="font-size:16px;line-height:22px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:' + IC.sky + ';">' + eyebrow + "</div>" +
        '<div class="h1" style="font-size:31px;line-height:38px;font-weight:800;letter-spacing:-.015em;color:' + IC.navy + ';padding-top:8px;">' + esc(title) + "</div>" +
        (description ? '<div style="font-size:15px;line-height:23px;color:#4B5B78;padding-top:12px;">' + esc(description) + "</div>" : "") + "</td>" +
      '<td class="hr" width="250" valign="bottom" align="right" style="width:250px;padding:0;">' +
        '<img src="' + base + '/mail-assets/hero-laptop.png" width="250" alt="" style="display:block;width:250px;height:auto;border:0;"></td>' +
    "</tr>", 'width="100%"') + "</td></tr>";

  // ---- Dải hạn chót / giờ mở ----
  const whenLabel = opensLater ? "Mở lúc" : (isCourse ? "Hoàn thành trước" : "Hạn hoàn thành");
  const whenValue = opensLater || deadline;
  const wm = String(whenValue).match(/^(.*?)\s*\((.*)\)\s*$/), whenMain = wm ? wm[1] : whenValue, whenSub = wm ? "(" + wm[2] + ")" : "";
  const urgent = days != null && days <= 1;
  const bannerBlock = whenValue
    ? '<tr><td class="px" style="padding:6px 28px 0;">' + T("<tr>" +
        '<td width="74" valign="middle" align="center" style="width:74px;padding:16px 0 16px 18px;">' + img("ic-calendar-w", 46) + "</td>" +
        '<td valign="middle" style="padding:16px 14px 16px 12px;' + F + '">' +
          '<div style="font-size:14px;line-height:19px;color:#CFE0FF;">' + whenLabel + "</div>" +
          '<div class="bv" style="font-size:20px;line-height:27px;font-weight:800;color:#ffffff;padding-top:1px;">' + esc(whenMain) + "</div>" +
          (whenSub ? '<div style="font-size:14px;line-height:20px;font-weight:600;color:#DCE9FF;">' + esc(whenSub) + "</div>" : "") + "</td>" +
        (left && !opensLater ? '<td class="bp" width="1" style="width:1px;padding:14px 0;"><div style="width:1px;height:62px;background:#5C86D0;font-size:0;line-height:0;">&nbsp;</div></td>' +
          '<td class="bp" align="center" valign="middle" style="padding:0 18px;' + F + '"><span style="display:inline-block;padding:10px 18px 10px 14px;border-radius:999px;background:' + (urgent ? "#FFE9DF" : "#E4F0FF") + ';font-size:17px;line-height:22px;font-weight:800;color:' + (urgent ? "#C2410C" : "#1559C4") + ';white-space:nowrap;">' +
          '<img src="' + base + '/mail-assets/ic-clock.png" width="22" height="22" alt="" style="vertical-align:middle;border:0;width:22px;height:22px;"> <span style="vertical-align:middle;">&nbsp;' + esc(left) + "</span></span></td>" : "") +
      "</tr>", 'width="100%" bgcolor="#0B4DB5"', "background:#0B4DB5;background-image:linear-gradient(100deg,#0A3F95 0%,#0B56C4 100%);border-radius:18px;border-collapse:separate;") + "</td></tr>"
    : "";

  // ---- Lời chào ----
  const greetBlock =
    '<tr><td class="px" style="padding:24px 28px 0;' + F + '">' +
    '<div style="font-size:19px;line-height:26px;font-weight:800;color:' + IC.navy + ';">Chào ' + hon + (name ? " " + esc(name) : "") + ",</div>" +
    '<div style="font-size:15px;line-height:24px;color:' + C.body + ';padding-top:6px;">' + esc(org) + " thông báo " +
    (isCourse ? 'khóa học <b style="color:' + C.ink + ';">\u201c' + esc(title) + "\u201d</b> vừa được phát hành dành cho " + hon + "." : hon + ' đã được giao bài kiểm tra <b style="color:' + C.ink + ';">\u201c' + esc(title) + "\u201d</b>.") +
    " Thông tin chi tiết như sau:</div></td></tr>";

  // ---- Ba ô thông số ----
  const tiles = (Array.isArray(opts.tiles) && opts.tiles.length ? opts.tiles.filter((x) => x && x.k && x.v)
    : isCourse ? [opts.lessons && { icon: "book", k: "Số bài học", v: String(opts.lessons) }, duration && { icon: "timer", k: "Thời lượng", v: duration }, { icon: "laptop", k: "Hình thức", v: format }]
    : [questions && { icon: "doc", k: "Số câu hỏi", v: questions }, duration && { icon: "timer", k: "Thời gian làm bài", v: duration }, attempts && { icon: "refresh", k: "Số lượt làm", v: attempts }]).filter(Boolean).slice(0, 4);
  const tw = tiles.length ? Math.floor(100 / tiles.length) : 100;
  const tileBlock = tiles.length
    ? '<tr><td class="px" style="padding:20px 28px 0;">' + T("<tr>" + tiles.map((x, i) =>
        '<td class="tile" width="' + tw + '%" valign="top" style="padding:0 ' + (i < tiles.length - 1 ? 5 : 0) + "px 0 " + (i ? 5 : 0) + 'px;">' +
        T('<tr><td width="52" valign="middle" style="width:52px;padding:15px 0 15px 14px;">' + img("ic-" + (x.icon || "doc"), 36) + "</td>" +
          '<td valign="middle" style="padding:13px 10px 13px 8px;' + F + '"><div style="font-size:13px;line-height:18px;color:' + C.muted + ';">' + esc(x.k) + "</div>" +
          '<div class="tv" style="font-size:18px;line-height:24px;font-weight:800;color:' + IC.navy + ';padding-top:2px;">' + esc(x.v) + "</div></td></tr>",
          'width="100%" bgcolor="' + IC.tile + '"', "background:" + IC.tile + ";border:1px solid " + IC.tileLine + ";border-radius:16px;border-collapse:separate;") +
        "</td>").join("") + "</tr>", 'width="100%"') + "</td></tr>"
    : "";

  // ---- Nút bấm + đường dẫn ----
  const ctaText = opensLater ? (isCourse ? "Mở trang học" : "Mở trang làm bài") : (isCourse ? "Vào học ngay" : "Vào làm bài ngay");
  const cta =
    '<tr><td align="center" class="px" style="padding:26px 28px 0;' + F + '">' +
    T('<tr><td align="center" bgcolor="#1559C4" style="border-radius:999px;background:#1559C4;background-image:linear-gradient(100deg,#0F4BB0 0%,#2E7BF0 100%);box-shadow:0 12px 24px -12px rgba(21,89,196,.9);">' +
      '<a class="btn" href="' + esc(ctaUrl) + '" target="_blank" style="display:inline-block;padding:17px 64px;' + F + 'font-size:19px;line-height:26px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px;white-space:nowrap;">' + ctaText + " &#8594;</a></td></tr>", 'class="ctat" align="center"') +
    '<div style="font-size:13px;line-height:20px;color:' + C.muted + ';padding-top:12px;"><img src="' + base + '/mail-assets/ic-link.png" width="16" height="16" alt="" style="vertical-align:middle;border:0;width:16px;height:16px;"> Hoặc truy cập: <a href="' + esc(ctaUrl) + '" target="_blank" style="color:' + C.brand + ';text-decoration:underline;word-break:break-all;">' + esc(shortUrl) + "</a></div>" +
    "</td></tr>";

  // ---- Hướng dẫn thực hiện (3 bước) ----
  const steps = [
    ["laptop", "Mở đường dẫn", opensLater ? "Từ " + opensLater.replace(/\s*\(.*\)$/, "") + ", bằng Chrome hoặc Safari" : "Bằng Chrome hoặc Safari, không mở trong Zalo/Facebook"],
    ["user", "Đăng nhập", "Xác thực danh tính theo hướng dẫn trên màn hình"],
    ["check", isCourse ? "Học và hoàn thành" : "Làm bài và nộp", isCourse ? (deadline ? "Hoàn thành trước thời hạn" : "Học hết nội dung khóa học") : (deadline ? "Nhấn Nộp bài trước khi hết hạn" : "Nhấn Nộp bài khi hoàn thành")]
  ];
  const stepCells = steps.map((x, i) =>
    '<td class="st" width="31%" valign="top" style="padding:0;' + F + '">' + T("<tr>" +
      '<td width="40" valign="top" style="width:40px;padding-top:30px;"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;text-align:center;background:#2E7BF0;background-image:linear-gradient(145deg,#4A93F7,#1559C4);' + F + 'font-size:15px;font-weight:800;color:#ffffff;">' + (i + 1) + "</div></td>" +
      '<td valign="top" style="' + F + '"><div style="padding-bottom:4px;">' + img("ic-" + x[0], 30) + '</div><div style="font-size:16px;line-height:21px;font-weight:800;color:' + IC.navy + ';">' + esc(x[1]) + '</div><div style="font-size:13px;line-height:19px;color:' + C.muted + ';padding-top:2px;">' + esc(x[2]) + "</div></td></tr>", 'width="100%"') + "</td>").join(
    '<td class="sc" width="3%" valign="middle" align="center" style="padding:30px 0 0;">' + img("ic-chevron", 18, "margin:0 auto;opacity:.6;") + "</td>");
  const stepBlock =
    '<tr><td class="px" style="padding:26px 28px 0;' + F + '">' +
    '<div style="border-top:1px solid ' + C.line + ';font-size:0;line-height:0;height:1px;">&nbsp;</div>' +
    '<div style="padding:20px 0 4px;"><img src="' + base + '/mail-assets/accent.png" width="40" height="22" alt="" style="vertical-align:middle;border:0;"> <span style="font-size:20px;line-height:26px;font-weight:800;color:' + IC.navy + ';vertical-align:middle;">&nbsp;Hướng dẫn thực hiện</span></div>' +
    T("<tr>" + stepCells + "</tr>", 'width="100%"') + "</td></tr>";

  // ---- Tài liệu ôn tập / học liệu gắn kèm (nếu có) ----
  const materials = Array.isArray(opts.materials) ? opts.materials.filter((m) => m && m.url && m.title) : [];
  const matTitle = isCourse ? "Tài liệu của khóa học" : "Tài liệu ôn tập cho bài này";
  const matDesc = isCourse ? "Nên xem trước khi học. Mở ở trang Học liệu (cần xác thực khuôn mặt)." : "Nên xem trước tài liệu bài. Mở ở trang Học liệu (cần xác thực khuôn mặt).";
  const materialsBlock = materials.length
    ? '<tr><td class="px" style="padding:24px 28px 0;' + F + '">' + T("<tr>" +
        '<td class="mc" width="50%" valign="middle" style="padding:18px 8px 18px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="62" valign="top" style="width:62px;">' + img("ic-book", 46) + "</td>" +
          '<td valign="top" style="' + F + '"><div style="font-size:18px;line-height:24px;font-weight:800;color:' + IC.navy + ';">' + matTitle + '</div><div style="font-size:13px;line-height:19px;color:' + C.muted + ';padding-top:4px;">' + matDesc + "</div></td></tr></table></td>" +
        '<td class="mc" width="50%" valign="middle" style="padding:14px 14px 14px 0;">' + materials.map((m, i) => T("<tr>" +
          '<td width="30" valign="middle" style="width:30px;padding:10px 0 10px 12px;">' + img(m.type === "video" ? "ic-play" : "ic-doc", 20) + "</td>" +
          '<td valign="middle" style="padding:10px 6px;' + F + '"><a href="' + esc(m.url) + '" target="_blank" style="font-size:14px;line-height:19px;font-weight:700;color:' + C.brand + ';text-decoration:none;">' + esc(m.title) + "</a></td>" +
          '<td width="26" valign="middle" style="width:26px;padding:10px 12px 10px 0;">' + img("ic-arrow", 16) + "</td></tr>", 'width="100%" bgcolor="#ffffff"', "background:#ffffff;border-radius:12px;border-collapse:separate;" + (i ? "margin-top:8px;" : ""))).join("") + "</td></tr>",
        'width="100%" bgcolor="' + IC.panel + '"', "background:" + IC.panel + ";border:1px solid " + IC.tileLine + ";border-radius:18px;border-collapse:separate;") + "</td></tr>"
    : "";

  // ---- Ý nghĩa + lời nhắc (khung cam nhạt) ----
  const noteBlock =
    '<tr><td class="px" style="padding:22px 28px 0;' + F + '">' + T("<tr>" +
      '<td width="50" valign="middle" style="width:50px;padding:16px 0 16px 16px;">' + img("ic-info", 30) + "</td>" +
      '<td class="nc" valign="middle" style="padding:14px 14px 14px 10px;' + F + 'font-size:13.5px;line-height:21px;color:#5A4B33;">' + esc(note) + "</td>" +
      '<td class="nc" width="38%" valign="middle" style="padding:14px 18px 14px 16px;border-left:1px solid #F3D9A8;' + F + 'font-size:14px;line-height:21px;font-weight:800;color:#B45309;">' + esc(closing) + "</td></tr>",
      'width="100%" bgcolor="#FFF6E6"', "background:#FFF6E6;border:1px solid #F8E3BC;border-radius:16px;border-collapse:separate;") + "</td></tr>";

  // ---- Hỗ trợ ----
  const supportBlock =
    '<tr><td class="px" style="padding:22px 28px 0;' + F + '">' + T("<tr>" +
      '<td width="58" valign="top" style="width:58px;">' + img("ic-headset", 40) + "</td>" +
      '<td valign="top" style="' + F + '"><div style="font-size:18px;line-height:24px;font-weight:800;color:' + IC.navy + ';">' + esc(org) + '</div><div style="font-size:14px;line-height:21px;color:' + C.muted + ';padding-top:2px;">' + esc(support) + "</div></td></tr>", 'width="100%"') + "</td></tr>";

  // ---- Chân thư: nền xanh đậm + sóng ----
  const wave = base + "/mail-assets/mail-wave.png";
  const footer =
    '<tr><td style="padding:26px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td class="ft" bgcolor="#0B3F94" background="' + wave + '" style="background-color:#0B3F94;background-image:url(' + wave + ');background-repeat:no-repeat;background-position:center bottom;background-size:100% auto;padding:26px 28px 120px;' + F + '">' + T("<tr>" +
      '<td width="62" valign="top" style="width:62px;">' + img("ic-book-w", 44) + "</td>" +
      '<td valign="top" style="' + F + '"><div style="font-size:18px;line-height:24px;font-weight:800;color:#ffffff;">Hệ thống Đào tạo &amp; Đánh giá Trực tuyến</div>' +
      '<div style="font-size:13px;line-height:20px;color:#CFE0FF;padding-top:4px;">Nơi nâng cao kiến thức, rèn luyện năng lực và tuân thủ đào tạo, đồng hành cùng đội ngũ Kinh doanh phát triển bền vững.</div>' +
      '<div style="font-size:12px;line-height:18px;color:#A9C2EE;padding-top:8px;">Email được gửi tự động, vui lòng không trả lời email này.</div></td></tr>', 'width="100%"') + "</td></tr>";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(subject) + "</title>" +
    "<style>table{border-collapse:collapse}a{color:" + C.brand + "}" +
    "@media only screen and (max-width:560px){.wrap{padding:0!important}.card{border-radius:0!important;border-left:0!important;border-right:0!important}" +
    ".px{padding-left:18px!important;padding-right:18px!important}.hl{padding:22px 18px 8px 18px!important;display:block!important;width:100%!important}.hr{display:none!important}.h1{font-size:25px!important;line-height:31px!important}" +
    ".tile{display:block!important;width:100%!important;padding:0 0 8px!important}.tv{font-size:17px!important}.bp{display:none!important}.bv{font-size:18px!important}" +
    ".st{display:block!important;width:100%!important;padding:0 0 14px!important}.sc{display:none!important}.mc{display:block!important;width:100%!important;padding:12px!important}.nc{display:block!important;width:auto!important;border-left:0!important;padding:4px 14px 12px!important}" +
    ".ctat{width:100%!important}.btn{padding:16px 20px!important;display:block!important}.ft{padding:22px 18px 100px!important}}</style></head>" +
    '<body style="margin:0;padding:0;background:#EAF2FC;-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#EAF2FC">' + esc(title) + (deadline ? " · Hạn " + esc(deadline) : "") + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAF2FC" style="background:#EAF2FC"><tr><td class="wrap" align="center" style="padding:28px 12px">' +
    '<table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;background-image:linear-gradient(180deg,#E3EFFF 0,#F6FAFF 280px,#ffffff 420px);border:1px solid #D9E6F7;border-radius:22px;border-collapse:separate;overflow:hidden;box-shadow:0 24px 50px -30px rgba(10,31,68,.5)">' +
    brand + heroRow + bannerBlock + greetBlock + tileBlock + cta + stepBlock + materialsBlock + noteBlock + supportBlock + footer +
    "</table></td></tr></table></body></html>";

  const kindLabel = isCourse ? "KHÓA HỌC" : "BÀI KIỂM TRA";
  const textRows = (isCourse ? [
    description ? "- Nội dung: " + description : "", "- Hình thức: " + format, opts.lessons ? "- Số bài học: " + opts.lessons : "", duration ? "- Thời lượng: " + duration : "",
    opensLater ? "- Mở lúc: " + opensLater : "", deadline ? "- Hoàn thành trước: " + deadline : ""
  ] : [
    description ? "- Nội dung: " + description : "", "- Hình thức: " + format, questions ? "- Số câu hỏi: " + questions : "", duration ? "- Thời gian làm bài: " + duration : "",
    attempts ? "- Số lượt làm: " + attempts : "", opensLater ? "- Mở đề lúc: " + opensLater : "", deadline ? "- Thời hạn hoàn thành: " + deadline : ""
  ]).filter((x) => x !== "");
  const text = [
    "Chào " + hon + (name ? " " + name : "") + ",",
    isCourse ? org + " thông báo khóa học \u201c" + title + "\u201d vừa được phát hành dành cho " + hon + "." : org + " thông báo " + hon + " đã được giao bài kiểm tra: \u201c" + title + "\u201d.", "",
    "THÔNG TIN " + kindLabel, ...textRows, "",
    "HƯỚNG DẪN THỰC HIỆN",
    guide,
    ctaUrl, "",
    ...(materials.length ? [(isCourse ? "TÀI LIỆU CỦA KHÓA HỌC" : "TÀI LIỆU ÔN TẬP CHO BÀI NÀY") + " (nên xem trước, mở ở trang Học liệu):", ...materials.map((m) => "- " + m.title + ": " + m.url), ""] : []),
    note, closing, "",
    support, "",
    "Trân trọng,", org, "",
    "--", "Hệ thống Kiểm tra & Đánh giá Trực tuyến", "Đây là email được gửi tự động. Vui lòng không trả lời email này."
  ].filter((x) => x !== undefined).join("\n");

  return { subject, html, text };
}

module.exports = { build, defaultNote, defaultClosing, defaultCourseNote, defaultCourseClosing };
