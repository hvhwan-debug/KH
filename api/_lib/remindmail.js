// Email "Nhắc làm bài kiểm tra" — gửi cho người đã được giao đề nhưng CHƯA nộp bài, khi đề sắp đóng.
// Nội dung theo mẫu: lời chào, tên bài kiểm tra, giờ đóng bài (lấy từ closeAt thực tế của đề), lưu ý thời hạn.
const { honorific } = require("./honorific");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "'Be Vietnam Pro','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const C = { navy: "#0A1F44", brand: "#1559C4", ink: "#101B33", body: "#3B465C", muted: "#6B7690", line: "#E3E8F1", soft: "#F2F5FA", page: "#EEF2F8", warnBg: "#FFF6E0", warnLine: "#F0D58A", warnInk: "#7A4B00" };

// "HH:mm" và "dd/mm/yyyy" theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy chủ
function vnParts(ms) {
  const v = new Date(ms + 7 * 3600000), p = (n) => String(n).padStart(2, "0");
  return { time: p(v.getUTCHours()) + ":" + p(v.getUTCMinutes()), date: p(v.getUTCDate()) + "/" + p(v.getUTCMonth() + 1) + "/" + v.getUTCFullYear() };
}
// "còn 2 ngày 3 giờ" / "còn 5 giờ 20 phút" / "còn 12 phút"
function remainText(ms) {
  if (ms <= 0) return "đã đóng";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d > 0) return "còn " + d + " ngày" + (h ? " " + h + " giờ" : "");
  if (h > 0) return "còn " + h + " giờ" + (mi ? " " + mi + " phút" : "");
  return "còn " + Math.max(1, mi) + " phút";
}
function properName(name) {
  const n = String(name || "").trim();
  if (n && n === n.toLocaleUpperCase("vi") && /\p{L}{2}/u.test(n)) return n.toLocaleLowerCase("vi").replace(/(^|\s)(\p{L})/gu, (x, a, b) => a + b.toLocaleUpperCase("vi"));
  return n;
}

// opts: { name, title, closeAtMs, ctaUrl, now, honorific }
function build(opts) {
  opts = opts || {};
  const name = properName(opts.name) || "Anh/Chị";
  const title = String(opts.title || "Bài kiểm tra").trim();
  const hon = ["Anh", "Chị", "Anh/Chị"].indexOf(opts.honorific) >= 0 ? opts.honorific : honorific(opts.name);
  const p = vnParts(opts.closeAtMs);
  const when = p.time + " ngày " + p.date;
  const left = remainText(opts.closeAtMs - (opts.now || Date.now()));
  const ctaUrl = /^https?:\/\//i.test(opts.ctaUrl || "") ? opts.ctaUrl : "#";
  const subject = "Nhắc làm bài kiểm tra: " + title;

  const l1 = hon + " hiện có bài kiểm tra “" + title + "” chưa hoàn thành.";
  const l2 = "Bài kiểm tra sẽ kết thúc vào lúc " + when + " (" + left + ").";
  const l3 = hon + " vui lòng lưu ý thời hạn trên và hoàn thành bài kiểm tra trước khi hệ thống đóng bài.";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + C.page + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + '"><tr><td align="center" style="padding:28px 14px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid ' + C.line + ';border-radius:16px;border-collapse:separate;overflow:hidden">' +
    '<tr><td style="background:' + C.navy + ';padding:22px 28px;font-family:' + FONT + ';font-size:18px;font-weight:800;color:#fff">Nhắc làm bài kiểm tra</td></tr>' +
    '<tr><td style="padding:24px 28px 0;font-family:' + FONT + ';font-size:14.5px;line-height:1.75;color:' + C.body + '">' +
    '<div>Thân gửi: <b style="color:' + C.ink + '">' + esc(name) + '</b>,</div>' +
    '<div style="margin-top:8px">' + esc(hon) + ' hiện có bài kiểm tra <b style="color:' + C.ink + '">“' + esc(title) + '”</b> chưa hoàn thành.</div></td></tr>' +
    '<tr><td style="padding:16px 28px 0;font-family:' + FONT + '"><div style="background:' + C.warnBg + ';border:1px solid ' + C.warnLine + ';border-radius:12px;padding:12px 16px;font-size:14px;line-height:1.7;color:' + C.warnInk + '">' +
    'Bài kiểm tra sẽ kết thúc vào lúc <b>' + esc(p.time) + '</b> ngày <b>' + esc(p.date) + '</b> <span style="color:' + C.muted + '">(' + esc(left) + ')</span>.</div></td></tr>' +
    '<tr><td style="padding:16px 28px 0;font-family:' + FONT + ';font-size:14.5px;line-height:1.75;color:' + C.body + '">' + esc(l3) + '</td></tr>' +
    '<tr><td align="center" style="padding:22px 28px 4px"><a href="' + esc(ctaUrl) + '" target="_blank" style="display:inline-block;padding:14px 40px;background:' + C.brand + ';border-radius:12px;font-family:' + FONT + ';font-size:15px;font-weight:800;color:#fff;text-decoration:none">VÀO LÀM BÀI</a></td></tr>' +
    '<tr><td style="padding:20px 28px 26px;font-family:' + FONT + ';font-size:14px;line-height:1.75;color:' + C.body + '">Trân trọng!</td></tr>' +
    '<tr><td style="padding:0 28px 22px;font-family:' + FONT + ';font-size:11px;color:#9AA7BD;text-align:center">Đây là email được gửi tự động. Vui lòng không trả lời email này.</td></tr>' +
    '</table></td></tr></table></body></html>';

  const text = ["Thân gửi: " + name + ",", l1, l2, l3, ctaUrl, "", "Trân trọng!", "", "-- Đây là email được gửi tự động. Vui lòng không trả lời email này."].join("\n");
  return { subject, html, text };
}
module.exports = { build, vnParts, remainText };
