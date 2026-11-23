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
  return { t, ps, a, an, total, wrong, blank, dur, name, status, color, subject, intro, when, whenShort, url: verifyLink(attempt), proof: quiz.proofCode(attempt.id) };
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
  const FOOTER_ROW = '<tr><td align="center" bgcolor="#0A1F44" style="padding:20px 22px 22px;background:#0A1F44;background-image:linear-gradient(140deg,#071A3E,#0F2E6E);font-family:' + TF + ';color:#9FB6DD;font-size:11px;line-height:17px;"><div style="font-size:13px;line-height:19px;font-weight:800;color:#ffffff;padding-bottom:6px;">Hệ thống Kiểm tra &amp; Đánh giá Trực tuyến</div>Email tự động từ hệ thống kiểm tra, vui lòng không trả lời email này.<br>Email chứa thông tin cá nhân của bạn, vui lòng không chuyển tiếp cho người khác.</td></tr>';
  const m = model(attempt, settings, advice), t = m.t, a = m.a, an = m.an;
  const compliance = attempt.compliancePoints;
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "") + ". " + (a.headline || "Xem kết quả và gợi ý ôn tập của bạn.");
  const who = oneLine(attempt.name, 80) ? m.name : oneLine(attempt.code, 40);
  const pctN = Math.max(0, Math.min(100, Number(attempt.pct) || 0)), total = m.total || 0, score = attempt.score || 0;
  const base = String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, ""), studyUrl = base + "/kiemtra/hoclieu.html";
  const pass = quiz.passScoreOf(settings) || null;
  const stColor = t.practice ? K.amber : m.ps === false ? K.red : m.ps === true ? K.green : K.blue;
  const ringColor = m.ps === false ? K.red : m.ps === true ? K.green : pctN >= 80 ? K.green : pctN >= 60 ? K.amber : K.red;
  const td = (style, inner, attrs) => "<td" + (attrs ? " " + attrs : "") + ' style="font-family:' + TF + ";" + style + '">' + inner + "</td>";
  const T = (inner, attrs, style) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (attrs ? " " + attrs : "") + (style ? ' style="' + style + '"' : "") + ">" + inner + "</table>";
  const row = (inner, cls, style) => '<tr><td class="' + (cls || "pad") + '" style="padding:0 32px;' + (style || "") + '">' + inner + "</td></tr>";
  const gap = (h) => '<tr><td style="height:' + h + "px;line-height:" + h + 'px;font-size:0;">&nbsp;</td></tr>';
  const card = (inner, extra) => T("<tr>" + td("padding:0;", inner) + "</tr>", 'width="100%" bgcolor="#FFFFFF"', "background:#FFFFFF;border:1px solid " + K.line + ";border-radius:14px;border-collapse:separate;overflow:hidden;" + (extra || ""));
  const h2 = (txt) => '<div style="font-family:' + TF + ";font-size:16px;line-height:22px;font-weight:bold;color:" + K.navy + ';padding:0 0 10px;">' + txt + "</div>";

  // ---- 1. Đầu thư: logo + tên hệ thống
  const brand = row(T("<tr>" + (art.logo ? td("padding:0 12px 0 0;", img("logo", 40, 40, "")) : "") +
    td("font-size:15px;line-height:20px;font-weight:bold;color:" + K.navy + ";", "Hệ thống kiểm tra đánh giá trực tuyến") + "</tr>"), "pad", "padding-top:22px;padding-bottom:4px;");

  // ---- 2. Lời chào (ngắn gọn, một lần)
  const hello = row('<div style="font-family:' + TF + ";font-size:18px;line-height:25px;font-weight:bold;color:" + K.navy + ';">Xin chào ' + esc(who) + ",</div>" +
    '<div style="font-family:' + TF + ";font-size:14px;line-height:21px;color:" + K.body + ';padding-top:3px;">Bài làm của bạn đã được ghi nhận. Kết quả chi tiết như sau.</div>', "pad", "padding-top:14px;padding-bottom:18px;");

  // ---- 3. THẺ KẾT QUẢ (một khối): đề + trạng thái | huy hiệu hoặc vòng % | người làm + điểm + thanh | 3 chỉ số
  const stMark = m.ps === false && !t.practice ? "&#10005;" : m.ps === true && !t.practice ? "&#10003;" : "";
  const statusPill = T("<tr>" + td("background:#ffffff;border-radius:20px;padding:5px 13px 5px " + (stMark ? 7 : 13) + "px;white-space:nowrap;",
    (stMark ? '<span style="display:inline-block;width:18px;height:18px;line-height:18px;border-radius:9px;background:' + stColor + ";color:#ffffff;font-size:11px;font-weight:bold;text-align:center;vertical-align:middle;margin-right:7px;\">" + stMark + "</span>" : "") +
    '<span style="font-size:13.5px;line-height:19px;font-weight:bold;color:' + stColor + ';vertical-align:middle;">' + esc(m.status) + "</span>" + (pass && !t.practice ? '<span style="font-size:12.5px;color:' + K.muted + ';vertical-align:middle;"> &nbsp;|&nbsp; Ngưỡng đạt ' + esc(pass) + "%</span>" : ""), 'bgcolor="#FFFFFF"') + "</tr>");
  const cardHead = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F3E9E" style="background:#0F3E9E;background-image:linear-gradient(135deg,#0B3489 0%,#1F6FE5 100%);"><tr>' +
    '<td class="hero-l" style="padding:20px 24px 20px;font-family:' + TF + ';">' +
    '<div style="font-size:11.5px;line-height:16px;font-weight:bold;letter-spacing:1.2px;color:#BFDBFF;">KẾT QUẢ BÀI KIỂM TRA' + (t.chan ? " &nbsp;·&nbsp; KÊNH " + esc(t.chan.toUpperCase()) : "") + "</div>" +
    '<div class="hero-title" style="font-size:21px;line-height:28px;font-weight:bold;color:#ffffff;padding:6px 0 14px;">' + esc(t.main) + "</div>" + statusPill + "</td></tr></table>";

  const useBadge = !t.practice && [0, 10, 15, 20].indexOf(compliance) >= 0 && !!art.hero;
  const visual = useBadge ? img("hero", 190, 146, "Điểm tuân thủ " + compliance, "margin:0 auto;")
    : art.ring ? img("ring", 190, 190, attempt.pct + "% tỉ lệ trả lời đúng", "margin:0 auto;")
    : '<div style="font-family:' + TF + ";font-size:52px;line-height:58px;font-weight:800;color:" + ringColor + ';">' + esc(attempt.pct) + '%</div><div style="font-family:' + TF + ";font-size:13px;color:" + K.muted + ';">Tỉ lệ trả lời đúng</div>';
  const showPctLine = useBadge || !art.ring;
  const meta = [oneLine(attempt.code, 40) ? "Mã NV: " + esc(oneLine(attempt.code, 40)) : "", oneLine(attempt.manager, 80) ? "Quản lý: " + esc(oneLine(attempt.manager, 80)) : ""].filter(Boolean).join("<br>");
  const bar = segBar([{ v: score, c: K.green }, { v: m.wrong, c: K.red }, { v: m.blank, c: "#B8C4DA" }], 10);
  const legend = '<span style="color:' + K.green + '">&#9679;</span> Đúng <b style="color:' + K.ink + '">' + esc(score) + '</b> &nbsp; <span style="color:' + K.red + '">&#9679;</span> Sai <b style="color:' + K.ink + '">' + esc(m.wrong) + '</b> &nbsp; <span style="color:#B8C4DA">&#9679;</span> Bỏ trống <b style="color:' + K.ink + '">' + esc(m.blank) + "</b>";
  const body = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>' +
    '<td class="col ring-col" width="230" align="center" valign="middle" style="padding:20px 8px 20px 20px;">' + visual + "</td>" +
    '<td class="col info-col" valign="middle" style="padding:20px 24px 20px 12px;font-family:' + TF + ';">' +
    '<div class="person-name" style="font-size:20px;line-height:26px;font-weight:bold;color:' + K.navy + ';">' + esc(who) + "</div>" +
    (meta ? '<div style="font-size:13px;line-height:19px;color:' + K.muted + ';padding-top:2px;">' + meta + "</div>" : "") +
    '<div style="padding-top:12px;white-space:nowrap;"><span class="big-score" style="font-size:38px;line-height:44px;font-weight:800;color:' + K.deep + ';">' + esc(score) + "/" + esc(total) + '</span><span style="font-size:15px;font-weight:600;color:' + K.body + ';"> câu đúng</span></div>' +
    (showPctLine ? '<div style="font-size:14px;line-height:20px;color:' + K.body + ';padding-top:2px;">Tỉ lệ đúng: <b style="color:' + ringColor + ';">' + esc(attempt.pct) + "%</b></div>" : "") +
    '<div style="padding-top:12px;">' + bar + "</div>" +
    '<div style="font-size:12.5px;line-height:18px;color:' + K.muted + ';padding-top:8px;">' + legend + "</div></td></tr></table>";

  const whenT = m.when.split(" ")[0] || "", whenD = m.when.split(" ")[1] || "";
  const cells = [];
  if (compliance != null) cells.push({ ic: "ic-clip", k: t.practice ? "Tuân thủ (nếu thi thật)" : "Điểm tuân thủ", v: compliance + " điểm" });
  if (m.dur != null) cells.push({ ic: "ic-clock", k: "Thời gian làm bài", v: clock(m.dur) });
  cells.push({ ic: "ic-cal", k: "Nộp bài lúc", v: whenT, s: whenD });
  const mw = Math.floor(10000 / cells.length) / 100;
  const metrics = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F7FF" style="background:#F2F7FF;border-top:1px solid ' + K.line + ';"><tr>' + cells.map((c, i) =>
    '<td class="metric" width="' + mw + '%" align="center" valign="middle" style="padding:14px 6px;' + (i < cells.length - 1 ? "border-right:1px solid " + K.line + ";" : "") + 'font-family:' + TF + ';">' +
    '<div style="font-size:12px;line-height:17px;color:' + K.muted + ';">' + esc(c.k) + "</div>" +
    '<div class="m-val" style="font-size:' + (c.s ? 17 : 20) + "px;line-height:26px;font-weight:800;color:" + K.navy + ';">' + esc(c.v) + "</div>" +
    (c.s ? '<div style="font-size:12px;line-height:16px;color:' + K.muted + ';">' + esc(c.s) + "</div>" : "") + "</td>").join("") + "</tr></table>";
  const resultCard = row(card(cardHead + body + metrics));

  const practiceNote = t.practice
    ? gap(14) + row(T("<tr>" + td("padding:11px 15px;font-size:13px;line-height:20px;color:#6b4a00;", "<b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> " +
        (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.")) + "</tr>", 'width="100%" bgcolor="#FFF6E2"', "background:#FFF6E2;border:1px solid #EBCB84;border-radius:10px;border-collapse:separate;"))
    : "";

  // ---- 4. Phân tích theo mảng kiến thức + chỉ số khác (chỉ khi có dữ liệu)
  let cats = "", grid = "";
  if (an) {
    if (an.random != null) {
      cats = '<div style="font-family:' + TF + ';font-size:13px;line-height:1.7;color:#6B4A00;background:#FFF6E2;border:1px solid #F0DDB0;border-radius:10px;padding:11px 14px">Kết quả gần bằng mức chọn bừa (khoảng ' + esc(an.random) + "%) nên chưa phản ánh kiến thức theo từng mảng. Hãy làm lại nghiêm túc để có phân tích chính xác.</div>";
    } else if ((an.categories || []).length) {
      cats = '<div style="font-family:' + TF + ";font-size:12.5px;color:" + K.muted + ';margin:0 0 12px">Mảng yếu nhất ở trên</div>' +
        an.categories.map((c) =>
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 13px"><tr><td style="font-family:' + TF + ";font-size:13.5px;font-weight:600;color:" + K.ink + '">' + esc(oneLine(c.name, 60)) + "</td>" +
          '<td align="right" width="96" style="width:96px;font-family:' + TF + ";font-size:12.5px;color:" + K.muted + ';white-space:nowrap"><b style="color:' + K.ink + '">' + esc(c.ok) + "/" + esc(c.n) + "</b> · " + esc(c.pct) + "%</td></tr>" +
          '<tr><td colspan="2" style="padding-top:6px">' + oneBar(c.pct, band(c.pct), 8) + "</td></tr></table>").join("") +
        '<div style="font-family:' + TF + ";font-size:11.5px;color:" + K.muted + '"><span style="color:' + K.green + '">&#9679;</span> từ 80% &nbsp; <span style="color:' + K.amber + '">&#9679;</span> 60 đến 79% &nbsp; <span style="color:' + K.red + '">&#9679;</span> dưới 60%</div>';
    }
    const facts = [];
    if (an.avgSec != null && an.limitSec) facts.push({ k: "Tốc độ làm bài trung bình", v: an.avgSec + " giây/câu", s: "Giới hạn " + an.limitSec + " giây mỗi câu" });
    if (an.timeouts > 0) facts.push({ k: "Câu hết giờ", v: an.timeouts + " câu", s: "chưa kịp trả lời" });
    if (an.prev && an.prev.pct != null) { const d = (an.pct || 0) - an.prev.pct; facts.push({ k: "So với kỳ trước", v: (d > 0 ? "▲ +" : d < 0 ? "▼ " : "≈ ") + d + " điểm %", c: d >= 5 ? K.green : d <= -5 ? K.red : K.ink, s: (an.prev.period ? "Kỳ " + an.prev.period + ": " : "Trước đó: ") + an.prev.pct + "%" }); }
    if (an.nextBand && an.total) facts.push({ k: "Mốc tuân thủ kế tiếp", v: an.nextBand.points + " điểm", s: "Cần đúng " + an.nextBand.needCorrect + "/" + an.total + " câu (thiếu " + an.nextBand.gap + ")" });
    grid = facts.map((f, i) =>
      '<tr><td valign="middle" style="padding:11px 0;' + (i ? "border-top:1px solid #E4ECF8;" : "") + "font-family:" + TF + '"><div style="font-size:13px;font-weight:600;color:' + K.ink + '">' + esc(f.k) + '</div><div style="font-size:12px;color:' + K.muted + ';margin-top:2px">' + esc(f.s) + "</div></td>" +
      '<td align="right" valign="middle" style="padding:11px 0 11px 12px;' + (i ? "border-top:1px solid #E4ECF8;" : "") + "font-family:" + TF + ";font-size:16px;font-weight:800;color:" + (f.c || K.ink) + ';white-space:nowrap">' + esc(f.v) + "</td></tr>").join("");
  }
  const analysis = (cats || grid)
    ? gap(18) + row(card('<div style="padding:18px 20px 10px;">' + h2("Phân tích kết quả") + cats +
        (grid ? (cats ? '<div style="height:8px;line-height:8px;font-size:0;border-bottom:1px solid #E4ECF8;">&nbsp;</div>' : "") + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + grid + "</table>" : "") + "</div>"))
    : "";

  // ---- 5. Nhận xét và gợi ý ôn tập (một khối, viền nhấn bên trái)
  const topicName = lc1((t.main.split(":").pop() || t.main).trim());
  const portrait = a.portrait || a.summary || "";
  const lead = m.ps === false
    ? "Kết quả chưa đạt ngưỡng yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Bạn nên ôn tập thêm kiến thức về " + esc(topicName) + ((a.topics || []).length ? ", đặc biệt là " + esc((a.topics || []).slice(0, 2).map(lc1).join(" và ")) : "") + "."
    : m.ps === true
      ? "Chúc mừng bạn đã đạt ngưỡng yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Hãy tiếp tục củng cố kiến thức về " + esc(topicName) + " để giữ vững phong độ."
      : (a.headline || portrait) ? "" : "Bạn có thể ôn tập thêm kiến thức về " + esc(topicName) + " để làm tốt hơn ở lần sau.";
  const li = (arr, mark) => arr.map((x, i) => '<div style="padding:0 0 4px 18px;text-indent:-18px;">' + (mark === "n" ? "<b>" + (i + 1) + ".</b>" : "&#8226;") + "&nbsp; " + esc(x) + "</div>").join("");
  const extra = [
    a.headline || portrait ? '<div style="padding-top:10px;">' + (a.headline ? "<b>" + esc(a.headline) + "</b> " : "") + esc(portrait) + "</div>" : "",
    (a.strengths || []).length ? '<div style="padding-top:10px;"><b style="color:#237447;">Điểm mạnh</b>' + li(a.strengths) + "</div>" : "",
    (a.topics || []).length > 2 ? '<div style="padding-top:10px;"><b style="color:#95600e;">Nội dung cần củng cố</b>' + li(a.topics) + "</div>" : "",
    (a.actions || []).length ? '<div style="padding-top:10px;"><b style="color:' + K.navy + ';">Việc nên làm tiếp theo</b>' + li(a.actions, "n") + "</div>" : "",
    a.goal ? '<div style="padding-top:6px;"><b style="color:#8a5500;">Mục tiêu lần tới.</b> ' + esc(String(a.goal).replace(/^Lần tới:\s*/i, "")) + "</div>" : ""
  ].join("");
  const tips = gap(18) + row(T("<tr>" +
    td("padding:16px 20px;font-size:14.5px;line-height:22px;color:" + K.ink + ";",
      h2("Nhận xét và gợi ý ôn tập") + (lead ? "<div>" + lead + "</div>" : "") +
      (extra ? '<div style="font-size:13.5px;line-height:21px;color:' + K.body + ';">' + extra + "</div>" : "") +
      (a.source === "ai" ? '<div style="font-size:11.5px;line-height:17px;color:#8A6D3B;padding-top:10px;">Nhận xét được AI tổng hợp từ dữ liệu bài làm.</div>' : ""), 'valign="top"') +
    "</tr>", 'width="100%" bgcolor="#FFF8E8"', "background:#FFF8E8;border:1px solid #F5D98E;border-left:4px solid " + K.amber + ";border-radius:12px;border-collapse:separate;"));

  // ---- 6. Một nút chính + một liên kết phụ
  const ctaFail = m.ps !== true;
  const cta = gap(22) + '<tr><td align="center" class="pad" style="padding:0 32px;">' +
    T("<tr>" + '<td align="center" bgcolor="#1663E6" style="background:#1663E6;background-image:linear-gradient(90deg,#0E56D8,#2F80F6);border-radius:30px;">' +
      '<a href="' + esc(ctaFail ? studyUrl : m.url) + '" target="_blank" style="display:block;padding:14px 32px;font-family:' + TF + ';font-size:16.5px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;white-space:nowrap;">' +
      (art["ic-book"] && ctaFail ? '<img src="cid:' + art["ic-book"] + '" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;width:24px;height:24px;margin-right:9px;">' : "") +
      '<span style="vertical-align:middle;">' + (ctaFail ? "Xem học liệu ôn tập" : "Xem kết quả chi tiết") + " &#8594;</span></a></td></tr>", 'class="cta" align="center"', "margin:0 auto;") +
    '<div style="font-family:' + TF + ';font-size:13px;line-height:20px;padding-top:10px;"><a href="' + esc(ctaFail ? m.url : studyUrl) + '" target="_blank" style="color:' + K.blue + ';text-decoration:none;font-weight:600;">' + (ctaFail ? "Xem kết quả chi tiết" : "Xem học liệu") + "</a></div></td></tr>";

  // ---- 7. Xác thực + QR + hỗ trợ + chân thư (không còn khối lời chúc có hình riêng)
  const wish = m.ps === true ? "Chúc mừng bạn! Hãy tiếp tục phát huy ở những lần kiểm tra tiếp theo." : "Chúc bạn ôn tập hiệu quả và đạt kết quả tốt hơn ở lần kiểm tra tiếp theo!";
  const verify = gap(22) +
    '<tr><td class="pad" style="padding:0 32px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7FAFC;border:1px solid ' + K.line + ';border-radius:12px;border-collapse:separate;"><tr>' +
    '<td valign="middle" style="padding:14px 16px;font-family:' + TF + ';"><div style="font-size:13.5px;line-height:20px;font-weight:bold;color:' + K.deep + ';">' + esc(wish) + "</div>" +
    '<div style="font-size:12.5px;line-height:19px;font-weight:bold;color:#1E7A4C;padding-top:10px;">&#10003; Đã xác thực bởi hệ thống lúc ' + esc(vn(Date.now())) + "</div>" +
    '<div style="font-size:11.5px;line-height:18px;color:' + K.muted + ';padding-top:2px;">Mã minh chứng: <b>' + esc(m.proof) + "</b>" + (cardNote ? ". Thẻ kết quả (ảnh PNG) được đính kèm theo email này." : "") + "</div>" +
    '<div style="font-size:12px;line-height:19px;color:' + K.body + ';padding-top:8px;">' + esc(supportLine(attempt.manager)) + "</div></td>" +
    (qrCid ? '<td width="86" align="center" valign="middle" style="padding:14px 16px 14px 0;font-family:' + TF + ';"><a href="' + esc(m.url) + '" target="_blank"><img class="footer-qr" src="cid:' + qrCid + '" width="76" height="76" alt="QR xem kết quả" style="display:block;margin:0 auto;width:76px;height:76px;border:1px solid ' + K.line + ';border-radius:6px;"></a>' +
      '<div style="font-size:10px;line-height:15px;color:' + K.muted + ';padding-top:4px;">Quét QR xem bản gốc</div></td>' : "") +
    "</tr></table></td></tr>" +
    FOOTER_ROW;

  const css =
    "body{margin:0!important;padding:0!important;background:" + K.page + ";-webkit-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;-ms-interpolation-mode:bicubic}a{color:" + K.blue + "}" +
    ".shell{width:100%;max-width:640px}" +
    "@media screen and (max-width:600px){.outer{padding:0!important}.shell{border-radius:0!important;border-left:0!important;border-right:0!important}.pad{padding-left:16px!important;padding-right:16px!important}" +
    ".hero-l{padding:16px!important}.hero-title{font-size:19px!important;line-height:25px!important}" +
    ".stack,.stack>tbody,.stack>tbody>tr,.stack>tbody>tr>td.col{display:block!important;width:100%!important}.ring-col{padding:16px 16px 0!important;text-align:center!important}.info-col{padding:12px 16px 18px!important}" +
    ".person-name{font-size:19px!important}.big-score{font-size:34px!important}" +
    ".metric{padding:12px 3px!important}.m-val{font-size:16px!important;line-height:22px!important}.footer-qr{width:70px!important;height:70px!important}}";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title><style>" + css + "</style></head>" +
    '<body style="margin:0;padding:0;background:' + K.page + ";font-family:" + TF + ";color:" + K.ink + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + K.page + '">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + K.page + '" style="width:100%;background:' + K.page + ';"><tr><td align="center" class="outer" style="padding:22px 10px;">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="shell" align="center" bgcolor="#FFFFFF" style="margin:0 auto;width:100%;max-width:640px;background:#FFFFFF;border:1px solid ' + K.line + ';border-radius:20px;border-collapse:separate;overflow:hidden;text-align:left;">' +
    brand + hello + resultCard + practiceNote + analysis + tips + cta + verify +
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

// Bản chữ thuần: đọc được trên mọi ứng dụng thư, cùng nội dung và cùng thứ tự với bản HTML
function textOf(attempt, settings, m, cardNote) {
  const t = m.t, a = m.a, an = m.an, compliance = attempt.compliancePoints, L = [];
  L.push("KẾT QUẢ BÀI KIỂM TRA", t.main + (t.chan ? " · Kênh " + t.chan : "") + (t.practice ? "  [THI THỬ - KHÔNG PHẢI THI CHÍNH THỨC]" : ""), "Nộp lúc " + m.whenShort, "", "Chào " + m.name + ",", "", m.intro, "");
  L.push("KẾT QUẢ", "- Tỉ lệ trả lời đúng: " + attempt.pct + "% (" + attempt.score + "/" + m.total + " câu)", "- Đúng " + (attempt.score || 0) + " · Sai " + m.wrong + " · Bỏ trống " + m.blank);
  if (m.ps !== null) L.push("- Kết quả: " + (m.ps ? "ĐẠT" : "CHƯA ĐẠT") + (settings.passScore ? " (ngưỡng " + settings.passScore + "%)" : ""));
  if (compliance != null) L.push("- " + (t.practice ? "Điểm tuân thủ (nếu thi thật): " : "Điểm tuân thủ học tập: ") + compliance + " điểm");
  if (m.dur != null) L.push("- Thời gian hoàn thành: " + clock(m.dur));
  if (t.practice) L.push("", "Lưu ý: Đây là bài thi thử, không phải kỳ kiểm tra chính thức" + (compliance != null ? "; điểm tuân thủ chỉ để hình dung nếu thi thật." : "."));
  if (an && an.random != null) L.push("", "PHÂN TÍCH", "Kết quả gần bằng mức chọn bừa (khoảng " + an.random + "%) nên chưa phản ánh kiến thức theo từng mảng; hãy làm lại nghiêm túc để có phân tích chính xác.");
  else if (an && (an.categories || []).length) { L.push("", "KẾT QUẢ THEO MẢNG KIẾN THỨC (mảng yếu nhất ở trên)"); an.categories.forEach((c) => L.push("- " + oneLine(c.name, 60) + ": " + c.ok + "/" + c.n + " (" + c.pct + "%)")); }
  if (an) {
    const x = [];
    if (an.avgSec != null && an.limitSec) x.push("- Tốc độ làm bài trung bình: " + an.avgSec + " giây/câu (giới hạn " + an.limitSec + " giây)");
    if (an.timeouts > 0) x.push("- Câu hết giờ: " + an.timeouts + " câu");
    if (an.prev && an.prev.pct != null) { const d = (an.pct || 0) - an.prev.pct; x.push("- So với " + (an.prev.period ? "kỳ " + an.prev.period : "lần trước") + " (" + an.prev.pct + "%): " + (d > 0 ? "+" : "") + d + " điểm phần trăm"); }
    if (an.nextBand && an.total) x.push("- Mốc tuân thủ kế tiếp: " + an.nextBand.points + " điểm, cần đúng " + an.nextBand.needCorrect + "/" + an.total + " câu (thiếu " + an.nextBand.gap + ")");
    if (x.length) L.push("", "CHỈ SỐ KHÁC", ...x);
  }
  if (a.headline || (a.actions || []).length) {
    L.push("", "NHẬN XÉT DÀNH RIÊNG CHO BẠN" + (a.source === "ai" ? " (gợi ý bởi AI)" : ""));
    if (a.headline) L.push(a.headline);
    if (a.portrait || a.summary) L.push("Cách bạn đã làm bài: " + (a.portrait || a.summary));
    (a.strengths || []).forEach((x) => L.push("* Điểm mạnh: " + x));
    (a.topics || []).forEach((x) => L.push("- Chủ đề nên ôn lại: " + x));
    (a.actions || []).forEach((x, i) => L.push((i + 1) + ". " + x));
    if (a.goal) L.push("Mục tiêu " + String(a.goal).charAt(0).toLowerCase() + String(a.goal).slice(1));
  }
  L.push("", "HỌC LIỆU ÔN TẬP", String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, "") + "/kiemtra/hoclieu.html", "", "XÁC THỰC KẾT QUẢ", m.url, "Mã minh chứng: " + m.proof, ...(cardNote ? ["Thẻ kết quả (ảnh PNG) được đính kèm theo email này."] : []), "", "BIÊN NHẬN NỘP BÀI", "Họ và tên: " + oneLine(attempt.name, 80), "Mã nhân viên: " + oneLine(attempt.code, 40), "Quản lí: " + (oneLine(attempt.manager, 80) || "(chưa rõ)"),
    "Nộp bài lúc: " + vn(attempt.submittedAt), "", supportLine(attempt.manager), "", "Chúc bạn học tập và làm việc hiệu quả.", "", "Trân trọng,", "Hệ thống kiểm tra trực tuyến", "", "--",
    "Email tự động từ hệ thống kiểm tra, vui lòng không trả lời trực tiếp. Có thắc mắc về kết quả, hãy liên hệ quản lí trực tiếp hoặc quản trị viên phụ trách. Email chứa thông tin cá nhân, vui lòng không chuyển tiếp.");
  return L.join("\n");
}

// Thông số để mailart.js vẽ vòng tỉ lệ và huy hiệu: cùng quy tắc màu với build()
function artSpec(attempt, settings) {
  const ps = quiz.passState(attempt.pct, settings), p = Math.max(0, Math.min(100, Number(attempt.pct) || 0));
  const cp = attempt.compliancePoints;
  return { comp: !settings.practice && [0, 10, 15, 20].indexOf(cp) >= 0 ? cp : null, pct: p, state: settings.practice ? null : ps, color: ps === false ? K.red : ps === true ? K.green : p >= 80 ? K.green : p >= 60 ? K.amber : K.red };
}

module.exports = { build, model, esc, artSpec };
