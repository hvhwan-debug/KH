// Email kết quả bài kiểm tra: thiết kế hiện đại, văn phong chuyên nghiệp.
// - Chỉ dùng bảng (table) và CSS nội tuyến để hiển thị ổn định trên Gmail, Outlook và ứng dụng thư trên điện thoại.
// - Biểu đồ (thanh tiến độ, thanh theo mảng kiến thức) dựng bằng ô bảng có màu, không dùng ảnh nên không bị chặn tải ảnh.
// - KHÔNG kèm nội dung câu hỏi hay đáp án (đề dùng nhiều ngày, gửi qua email là làm lộ ngân hàng đề).
// - Không dùng chung khung với các email của ứng dụng khác (emails.layout) để thương hiệu và bố cục độc lập.
const quiz = require("./quiz");
const { cfg } = require("./config");

const C = {
  brand: "#067A8C", deep: "#055A68", dark: "#043B46", ink: "#0D2A31", body: "#2B4543", muted: "#5B7279", line: "#DCE7EA", soft: "#F5FAFB", page: "#EEF3F5",
  ok: "#17794A", bad: "#B3261E", warn: "#D68F1E", amber: "#8A5200", amberBg: "#FFF6E2", amberLine: "#EBCB84", track: "#E6EEF1"
};
const FONT = "'Be Vietnam Pro','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const { supportLine } = require("./supportline");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s, n) => String(s == null ? "" : s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n || 200);
const vn = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
const clock = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
const band = (p) => (p >= 80 ? K.green : p >= 60 ? K.amber : K.red);

// Tên đề thi dùng làm tiêu đề: tránh lặp "THI THỬ" khi tên đề đã có sẵn chữ đó
function displayTitle(settings) {
  const t = oneLine(settings.examTitle || "Bài kiểm tra", 150);
  // "Tên đề | GT": phần sau dấu | là kênh, hiện thành nhãn riêng thay vì dính vào tên
  const cut = t.lastIndexOf(" | "), main = cut > 0 ? t.slice(0, cut).trim() : t, chan = cut > 0 ? t.slice(cut + 3).trim().slice(0, 20) : "";
  return { title: t, main, chan, practice: !!settings.practice, hasTag: /thi\s*thử/i.test(t) };
}

// Thanh nhiều đoạn (đúng / sai / bỏ trống) bằng ô bảng
function segBar(parts, h) {
  const live = parts.filter((p) => p.v > 0), total = live.reduce((a, p) => a + p.v, 0) || 1;
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border-radius:99px;overflow:hidden;background:' + C.track + '"><tr>' +
    live.map((p) => '<td width="' + Math.max(1, Math.round(p.v / total * 100)) + '%" height="' + h + '" bgcolor="' + p.c + '" style="background:' + p.c + ';font-size:0;line-height:0;height:' + h + 'px">&nbsp;</td>').join("") + "</tr></table>";
}
function oneBar(pct, color, h) {
  const p = Math.max(2, Math.min(100, Math.round(pct)));
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border-radius:99px;overflow:hidden"><tr>' +
    '<td width="' + p + '%" height="' + h + '" bgcolor="' + color + '" style="background:' + color + ';font-size:0;line-height:0;height:' + h + 'px">&nbsp;</td>' +
    (p < 100 ? '<td width="' + (100 - p) + '%" height="' + h + '" bgcolor="' + C.track + '" style="background:' + C.track + ';font-size:0;line-height:0;height:' + h + 'px">&nbsp;</td>' : "") + "</tr></table>";
}
const eyebrow = (t, color) => '<div style="font-family:' + FONT + ';font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + (color || C.muted) + ';margin:0 0 12px">' + esc(t) + "</div>";
const sectionGap = '<tr><td style="height:26px;line-height:26px;font-size:0">&nbsp;</td></tr>';

function verifyLink(attempt) {
  const base = String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, "");
  return base + "/kiemtra/ketqua.html?t=" + encodeURIComponent(quiz.verifyToken(attempt.id));
}

// Dữ liệu dùng chung cho bản HTML và bản chữ
function model(attempt, settings, advice) {
  const t = displayTitle(settings), ps = quiz.passState(attempt.pct, settings), a = advice || {}, an = a.analysis || null;
  const total = attempt.total || 0, wrong = attempt.wrong != null ? attempt.wrong : Math.max(0, total - (attempt.score || 0) - (attempt.blank || 0)), blank = attempt.blank || 0;
  const dur = attempt.submittedAt && attempt.startedAt ? Math.round((attempt.submittedAt - attempt.startedAt) / 1000) : null;
  let name = oneLine(attempt.name || "bạn", 80);
  if (name === name.toLocaleUpperCase("vi-VN") && /\p{L}{2}/u.test(name)) name = name.toLocaleLowerCase("vi-VN").replace(/(^|\s)(\p{L})/gu, (x, a, b) => a + b.toLocaleUpperCase("vi-VN")); // "TEST HỆ THỐNG" → "Test Hệ Thống"
  const status = t.practice ? "THI THỬ" + (ps === null ? "" : ps ? " · ĐẠT" : " · CHƯA ĐẠT") : ps === null ? "ĐÃ HOÀN THÀNH" : ps ? "ĐẠT" : "CHƯA ĐẠT";
  const color = t.practice ? C.warn : ps === false ? C.bad : ps === true ? C.ok : C.brand;
  const subject = (t.practice && !t.hasTag ? "[THI THỬ] " : "") + "Kết quả " + t.title + ": " + attempt.pct + "% (" + attempt.score + "/" + total + " câu đúng)";
  const intro = "Bài làm của bạn đã được ghi nhận. Dưới đây là kết quả và một vài gợi ý để lần sau làm tốt hơn.";
  const when = vn(attempt.submittedAt), whenShort = when.replace(/^(\d{2}:\d{2}):\d{2}\s*/, "$1 · ");
  // Xưng hô trong lời chào: "Anh Cường" / "Chị Hoa" (chỉ Anh hoặc Chị); không đủ căn cứ thì gọi thẳng tên, không dùng "Anh/Chị"
  const given = oneLine(attempt.name, 80) ? name.split(/\s+/).pop() : "", hon = given ? require("./honorific").honorific(attempt.name, true) : "";
  const greet = given ? (hon ? hon + " " : "") + given : oneLine(attempt.code, 40) || "bạn";
  return { t, ps, a, an, total, wrong, blank, dur, name, greet, status, color, subject, intro, when, whenShort, url: verifyLink(attempt), proof: quiz.proofCode(attempt.id) };
}

// opts.card = true: email có đính kèm ảnh thẻ kết quả; opts.qrCid = mã cid ảnh QR; opts.art = { khoá: cid } các hình minh hoạ do mailart.js vẽ
// (logo, hero, ring, badge, bulb, grad, ic-*). Thiếu hình nào thì phần đó tự chuyển sang bản chữ, email vẫn đầy đủ thông tin.
// Bố cục theo mẫu "Kết quả bài kiểm tra": dải xanh đầu thư + nhãn trạng thái, lời chào, vòng tỉ lệ đúng | thông tin người làm,
// dải 3 chỉ số, hộp "Gợi ý cho bạn", nút học liệu, lời chúc cuối thư. Chỉ dùng bảng + CSS nội tuyến; chuyển màu có màu nền dự phòng cho Outlook.
const TF = "'Be Vietnam Pro','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const K = { navy: "#0F2A5C", ink: "#1B2F55", body: "#3A4C6E", muted: "#5D6F8E", blue: "#1F6FE5", deep: "#0B4FC4", line: "#DCE7F7", soft: "#F2F7FF", page: "#EAF2FE", red: "#F0394A", green: "#18A957", amber: "#D68F1E", pink: "#E5246B" };
// Viết thường chữ đầu để ghép giữa câu ("ôn tập thêm kiến thức về sản phẩm…"); giữ nguyên nếu là mã/viết tắt
// hoặc tên viết hoa toàn bộ (vd "SR2 - KỸ NĂNG…" không thành "sR2").
const lc1 = (s) => { const v = String(s || ""), w = v.split(/\s+/)[0] || ""; return w.length > 1 && w === w.toLocaleUpperCase("vi-VN") ? v : v.charAt(0).toLocaleLowerCase("vi-VN") + v.slice(1); };
function build(attempt, settings, advice, opts) {
  opts = opts || {};
  const cardNote = !!opts.card, qrCid = opts.qrCid ? String(opts.qrCid).replace(/[^\w.@-]/g, "") : "";
  const art = {}; Object.keys(opts.art || {}).forEach((k) => { art[k] = String(opts.art[k]).replace(/[^\w.@-]/g, ""); });
  const img = (k, w, h, alt, style) => (art[k] ? '<img src="cid:' + art[k] + '" width="' + w + '"' + (h ? ' height="' + h + '"' : "") + ' alt="' + esc(alt || "") + '" style="display:block;border:0;outline:none;width:' + w + "px;" + (h ? "height:" + h + "px;" : "height:auto;") + (style || "") + '">' : "");
  const m = model(attempt, settings, advice), t = m.t, a = m.a;
  const compliance = attempt.compliancePoints;
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "");
  const pctN = Math.max(0, Math.min(100, Number(attempt.pct) || 0)), total = m.total || 0, score = attempt.score || 0;
  const base = String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, ""), studyUrl = base + "/kiemtra/hoclieu.html";
  const pass = quiz.passScoreOf(settings) || null;
  const stColor = t.practice ? K.amber : m.ps === false ? K.red : m.ps === true ? K.green : K.blue;
  const ringColor = m.ps === false ? K.red : m.ps === true ? K.green : pctN >= 80 ? K.green : pctN >= 60 ? K.amber : K.red;
  const td = (style, inner, attrs) => "<td" + (attrs ? " " + attrs : "") + ' style="font-family:' + TF + ";" + style + '">' + inner + "</td>";
  const T = (inner, attrs, style) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (attrs ? " " + attrs : "") + (style ? ' style="' + style + '"' : "") + ">" + inner + "</table>";
  const row = (inner, cls, style) => '<tr><td class="' + (cls || "pad") + '" style="padding:0 28px;' + (style || "") + '">' + inner + "</td></tr>";
  const gap = (h) => '<tr><td style="height:' + h + "px;line-height:" + h + 'px;font-size:0;">&nbsp;</td></tr>';

  // ---- 1. Đầu thư + lời chào
  const brand = row(T("<tr>" + (art.logo ? td("padding:0 10px 0 0;", img("logo", 32, 32, "")) : "") +
    td("font-size:14px;line-height:19px;font-weight:bold;color:" + K.navy + ";", "Hệ thống kiểm tra đánh giá trực tuyến") + "</tr>"), "pad", "padding-top:20px;");
  const hello = row('<div style="font-family:' + TF + ";font-size:19px;line-height:26px;font-weight:bold;color:" + K.navy + ';">Xin chào ' + esc(m.greet) + ",</div>" +
    '<div style="font-family:' + TF + ";font-size:14.5px;line-height:21px;color:" + K.body + ';padding-top:2px;">Đây là kết quả bài kiểm tra của bạn.</div>', "pad", "padding-top:16px;padding-bottom:16px;");

  // ---- 2. Thẻ kết quả: tên đề + trạng thái | huy hiệu (hoặc vòng %) + điểm | một dòng giờ giấc
  const stMark = m.ps === false && !t.practice ? "&#10005;" : m.ps === true && !t.practice ? "&#10003;" : "";
  const statusPill = T("<tr>" + td("background:#ffffff;border-radius:20px;padding:5px 13px 5px " + (stMark ? 7 : 13) + "px;white-space:nowrap;",
    (stMark ? '<span style="display:inline-block;width:18px;height:18px;line-height:18px;border-radius:9px;background:' + stColor + ";color:#ffffff;font-size:11px;font-weight:bold;text-align:center;vertical-align:middle;margin-right:7px;\">" + stMark + "</span>" : "") +
    '<span style="font-size:13.5px;line-height:19px;font-weight:bold;color:' + stColor + ';vertical-align:middle;">' + esc(m.status) + "</span>", 'bgcolor="#FFFFFF"') + "</tr>");
  const head = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F3E9E" style="background:#0F3E9E;background-image:linear-gradient(135deg,#0B3489 0%,#1F6FE5 100%);"><tr>' +
    '<td style="padding:18px 20px;font-family:' + TF + ';">' +
    '<div class="hero-title" style="font-size:18px;line-height:24px;font-weight:bold;color:#ffffff;padding-bottom:10px;">' + esc(t.main) + (t.chan ? ' <span style="font-size:12px;font-weight:600;color:#BFDBFF;">· Kênh ' + esc(t.chan) + "</span>" : "") + "</div>" + statusPill + "</td></tr></table>";
  const useBadge = !t.practice && [0, 10, 15, 20].indexOf(compliance) >= 0 && !!art.hero;
  const visual = useBadge ? img("hero", 112, 86, "Điểm tuân thủ " + compliance, "margin:0 auto;")
    : art.ring ? img("ring", 100, 100, attempt.pct + "% tỉ lệ trả lời đúng", "margin:0 auto;")
    : '<div style="font-family:' + TF + ";font-size:34px;line-height:40px;font-weight:800;color:" + ringColor + ';">' + esc(attempt.pct) + "%</div>";
  const meta = [oneLine(attempt.code, 40) ? "Mã NV: " + esc(oneLine(attempt.code, 40)) : "", oneLine(attempt.manager, 80) ? "Quản lý: " + esc(oneLine(attempt.manager, 80)) : ""].filter(Boolean).join("<br>");
  const body = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="128" align="center" valign="middle" style="width:128px;padding:16px 0 16px 14px;">' + visual + "</td>" +
    '<td valign="middle" style="padding:16px 18px 16px 12px;font-family:' + TF + ';">' +
    '<div style="white-space:nowrap;"><span style="font-size:34px;line-height:40px;font-weight:800;color:' + K.deep + ';">' + esc(score) + "/" + esc(total) + '</span><span style="font-size:15px;font-weight:600;color:' + K.body + ';"> câu đúng</span></div>' +
    '<div style="font-size:14px;line-height:20px;color:' + K.body + ';">Tỉ lệ đúng: <b style="color:' + ringColor + ';">' + esc(attempt.pct) + "%</b></div>" +
    (meta ? '<div style="font-size:12.5px;line-height:18px;color:' + K.muted + ';padding-top:6px;">' + meta + "</div>" : "") + "</td></tr></table>";
  const times = '<div style="font-family:' + TF + ";font-size:12.5px;line-height:19px;color:" + K.muted + ';text-align:center;padding:10px 14px;background:#F2F7FF;border-top:1px solid ' + K.line + ';">' +
    (m.dur != null ? "Làm bài trong <b style=\"color:" + K.ink + '">' + esc(clock(m.dur)) + "</b> &nbsp;·&nbsp; " : "") + "Nộp lúc <b style=\"color:" + K.ink + '">' + esc(m.whenShort) + "</b></div>";
  const resultCard = row(T("<tr>" + td("padding:0;", head + body + times) + "</tr>", 'width="100%" bgcolor="#FFFFFF"', "background:#FFFFFF;border:1px solid " + K.line + ";border-radius:14px;border-collapse:separate;overflow:hidden;"));

  const practiceNote = t.practice
    ? gap(12) + row('<div style="font-family:' + TF + ';font-size:12.5px;line-height:19px;color:#6b4a00;"><b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> ' +
        (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + "</div>")
    : "";

  // ---- 3. Gợi ý: chỉ một hai câu, không khung
  const act = (a.actions || [])[0];
  const lead = m.ps === false
    ? "Kết quả chưa đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Bạn nên ôn lại học liệu rồi làm lại."
    : m.ps === true ? "Chúc mừng bạn đã đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Hãy tiếp tục phát huy!" : "";
  const tips = lead || (m.ps === false && act)
    ? gap(16) + row('<div style="font-family:' + TF + ";font-size:14.5px;line-height:22px;color:" + K.ink + ';">' + esc(lead) + "</div>" +
        (m.ps === false && act ? '<div style="font-family:' + TF + ";font-size:13.5px;line-height:21px;color:" + K.body + ';padding-top:6px;"><b>Nên làm:</b> ' + esc(act) + "</div>" : ""))
    : "";

  // ---- 4. Một nút
  const ctaFail = m.ps !== true;
  const cta = gap(20) + '<tr><td align="center" class="pad" style="padding:0 28px;">' +
    T("<tr>" + '<td align="center" bgcolor="#1663E6" style="background:#1663E6;background-image:linear-gradient(90deg,#0E56D8,#2F80F6);border-radius:30px;">' +
      '<a href="' + esc(ctaFail ? studyUrl : m.url) + '" target="_blank" style="display:block;padding:13px 30px;font-family:' + TF + ';font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;white-space:nowrap;">' +
      (ctaFail ? "Xem học liệu ôn tập" : "Xem kết quả chi tiết") + " &#8594;</a></td></tr>", 'class="cta" align="center"', "margin:0 auto;") + "</td></tr>";

  // ---- 5. Chân thư gọn: xác thực + hỗ trợ
  const verify = gap(22) + '<tr><td class="pad" style="padding:14px 28px 18px;border-top:1px solid ' + K.line + ';font-family:' + TF + ';font-size:12px;line-height:18px;color:' + K.muted + ';">' +
    '<div><span style="color:#1E7A4C;font-weight:bold;">&#10003; Đã xác thực</span> lúc ' + esc(vn(Date.now())) + " &nbsp;·&nbsp; Mã minh chứng <b>" + esc(m.proof) + '</b> &nbsp;·&nbsp; <a href="' + esc(m.url) + '" target="_blank" style="color:' + K.blue + ';text-decoration:none;font-weight:600;">Xem bản gốc</a></div>' +
    (cardNote ? '<div style="padding-top:3px;">Thẻ kết quả (ảnh PNG) được đính kèm.</div>' : "") +
    '<div style="padding-top:6px;color:' + K.body + ';">' + esc(supportLine(attempt.manager)) + "</div></td></tr>" +
    '<tr><td align="center" bgcolor="#0A1F44" style="padding:12px 20px;background:#0A1F44;font-family:' + TF + ';color:#9FB6DD;font-size:11px;line-height:16px;">Email tự động, vui lòng không trả lời. Email chứa thông tin cá nhân, vui lòng không chuyển tiếp.</td></tr>';

  const css =
    "body{margin:0!important;padding:0!important;background:" + K.page + ";-webkit-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;-ms-interpolation-mode:bicubic}a{color:" + K.blue + "}" +
    ".shell{width:100%;max-width:600px}" +
    "@media screen and (max-width:600px){.outer{padding:0!important}.shell{border-radius:0!important;border-left:0!important;border-right:0!important}.pad{padding-left:16px!important;padding-right:16px!important}.hero-title{font-size:17px!important;line-height:23px!important}}";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title><style>" + css + "</style></head>" +
    '<body style="margin:0;padding:0;background:' + K.page + ";font-family:" + TF + ";color:" + K.ink + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + K.page + '">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + K.page + '" style="width:100%;background:' + K.page + ';"><tr><td align="center" class="outer" style="padding:20px 10px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="shell" align="center" bgcolor="#FFFFFF" style="margin:0 auto;width:100%;max-width:600px;background:#FFFFFF;border:1px solid ' + K.line + ';border-radius:18px;border-collapse:separate;overflow:hidden;text-align:left;">' +
    brand + hello + resultCard + practiceNote + tips + cta + verify +
    "</table></td></tr></table></body></html>";

  return { subject: m.subject, html: harden(html), text: textOf(attempt, settings, m, cardNote) };
}

// Gia cố cho mọi ứng dụng thư: mọi <table>/<td> có thuộc tính width (hoặc align) đều được khai báo THÊM bằng CSS
// (width / text-align), vì mỗi bộ máy hiển thị chỉ tin một trong hai. Nhờ đó thanh biểu đồ, thẻ, cột số luôn đúng chiều ngang.
function harden(html) {
  const px = (w) => (w.slice(-1) === "%" ? w : w + "px");
  return html.replace(/<(table|td)\b([^>]*)>/g, (m, tag, attrs) => {
    const w = /\swidth="(\d+%?)"/.exec(attrs), al = tag === "td" ? /\salign="(left|right|center)"/.exec(attrs) : null;
    let add = "";
    if (w && !/[\s;"]width\s*:/.test(attrs)) add += "width:" + px(w[1]) + ";";
    if (al && !/[\s;"]text-align\s*:/.test(attrs)) add += "text-align:" + al[1] + ";";
    if (!add) return m;
    return "<" + tag + (/\sstyle="/.test(attrs) ? attrs.replace(/\sstyle="/, ' style="' + add) : attrs + ' style="' + add + '"') + ">";
  });
}

// Bản chữ thuần: ngắn, cùng nội dung chính với bản HTML
function textOf(attempt, settings, m, cardNote) {
  const t = m.t, a = m.a, compliance = attempt.compliancePoints, pass = quiz.passScoreOf(settings) || null, L = [];
  const base = String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, "");
  L.push("Xin chào " + m.greet + ",", "", "Đây là kết quả bài kiểm tra của bạn.", "");
  L.push(t.main + (t.chan ? " · Kênh " + t.chan : "") + (t.practice ? "  [THI THỬ - KHÔNG PHẢI THI CHÍNH THỨC]" : ""));
  L.push("- Kết quả: " + (m.ps === null ? "ĐÃ HOÀN THÀNH" : m.ps ? "ĐẠT" : "CHƯA ĐẠT") + " · " + (attempt.score || 0) + "/" + m.total + " câu đúng (" + attempt.pct + "%)");
  if (compliance != null) L.push("- " + (t.practice ? "Điểm tuân thủ (nếu thi thật): " : "Điểm tuân thủ: ") + compliance + " điểm");
  L.push("- " + (m.dur != null ? "Làm bài trong " + clock(m.dur) + " · " : "") + "Nộp lúc " + m.whenShort);
  if (m.ps === false) { L.push("", "Kết quả chưa đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Bạn nên ôn lại học liệu rồi làm lại."); if ((a.actions || [])[0]) L.push("Nên làm: " + a.actions[0]); }
  else if (m.ps === true) L.push("", "Chúc mừng bạn đã đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Hãy tiếp tục phát huy!");
  L.push("", m.ps === true ? "Xem kết quả chi tiết: " + m.url : "Học liệu ôn tập: " + base + "/kiemtra/hoclieu.html", m.ps === true ? "" : "Xem kết quả chi tiết: " + m.url);
  L.push("", "Đã xác thực bởi hệ thống · Mã minh chứng: " + m.proof + (cardNote ? " · Thẻ kết quả (ảnh PNG) được đính kèm." : ""), supportLine(attempt.manager), "", "--", "Email tự động, vui lòng không trả lời. Email chứa thông tin cá nhân, vui lòng không chuyển tiếp.");
  return L.filter((x, i, arr) => !(x === "" && arr[i - 1] === "")).join("\n");
}

// Thông số để mailart.js vẽ vòng tỉ lệ và huy hiệu: cùng quy tắc màu với build()
function artSpec(attempt, settings) {
  const ps = quiz.passState(attempt.pct, settings), p = Math.max(0, Math.min(100, Number(attempt.pct) || 0));
  const cp = attempt.compliancePoints;
  return { comp: !settings.practice && [0, 10, 15, 20].indexOf(cp) >= 0 ? cp : null, pct: p, state: settings.practice ? null : ps, color: ps === false ? K.red : ps === true ? K.green : p >= 80 ? K.green : p >= 60 ? K.amber : K.red };
}

module.exports = { build, model, esc, artSpec };
