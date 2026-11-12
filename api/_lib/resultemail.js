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
const band = (p) => (p >= 80 ? C.ok : p >= 60 ? C.warn : C.bad);

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

// opts.card = true: email có đính kèm ảnh thẻ kết quả; opts.qrCid = mã cid của ảnh QR đính kèm nội tuyến (không có thì bỏ ô QR).
// Cấu trúc theo mẫu email_ket_qua_M25_outlook_mobile_optimized: chỉ dùng bảng + kiểu nội tuyến + màu phẳng (không chuyển màu, đổ bóng, hình tròn)
// để hiển thị đúng cả trong Outlook máy tính; có CSS riêng cho điện thoại (<= 600px).
const TF = "Arial,Helvetica,sans-serif";
function build(attempt, settings, advice, opts) {
  opts = opts || {};
  const cardNote = !!opts.card, qrCid = opts.qrCid ? String(opts.qrCid).replace(/[^\w.@-]/g, "") : "";
  const m = model(attempt, settings, advice), t = m.t, a = m.a, an = m.an;
  const compliance = attempt.compliancePoints;
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "") + ". " + (a.headline || "Xem phân tích và lời khuyên của bạn.");
  const who = oneLine(attempt.name, 80) ? m.name : oneLine(attempt.code, 40);
  const pctN = Math.max(0, Math.min(100, Number(attempt.pct) || 0)), total = m.total || 0, score = attempt.score || 0;

  // ---- Màu nhãn trạng thái + màu số điểm (mốc: >= 90 xanh lá, 70-89 xanh dương, 60-69 vàng, < 60 đỏ)
  const stColor = t.practice ? "#b7791f" : m.ps === false ? "#c0392b" : m.ps === true ? "#1e8e5a" : "#2a7fc9";
  const scColor = pctN >= 90 ? "#1e9e63" : pctN >= 70 ? "#2a7fc9" : pctN >= 60 ? "#d68f1e" : "#c8423a";
  const pad = (top, bottom, extra) => 'class="pad" style="padding:' + top + "px 28px " + bottom + "px;background:#ffffff;" + (extra || "") + '"';

  // ---- Đầu thư
  const header =
    '<tr><td class="pad" bgcolor="#123b65" style="padding:24px 28px 21px;background:#123b65;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="top"><div style="font-family:' + TF + ';font-size:11px;line-height:16px;letter-spacing:1.8px;font-weight:bold;color:#a9d9f2;">KẾT QUẢ BÀI KIỂM TRA' + (t.chan ? " · KÊNH " + esc(String(t.chan).toUpperCase()) : "") + "</div>" +
    '<div class="top-title" style="font-family:' + TF + ';font-size:25px;line-height:32px;font-weight:bold;color:#ffffff;padding-top:6px;">' + esc(t.main) + "</div></td>" +
    '<td align="right" valign="top" style="padding-left:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + stColor + '" style="background:' + stColor + ';border-radius:18px;padding:8px 10px;font-family:' + TF + ';color:#ffffff;font-size:11px;line-height:15px;font-weight:bold;white-space:nowrap;">' + esc(m.status) + "</td></tr></table></td>" +
    "</tr></table></td></tr>";

  const practiceNote = t.practice
    ? '<tr><td ' + pad(16, 0) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff6e2" style="background:#fff6e2;border:1px solid #ebcb84;border-radius:9px;"><tr><td style="padding:10px 14px;font-family:' + TF + ';font-size:12px;line-height:19px;color:#6b4a00;"><b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> ' +
      (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + "</td></tr></table></td></tr>"
    : "";

  // ---- Tóm tắt kết quả: tỉ lệ đúng (trái) | người làm bài + thanh đúng / sai / bỏ trống (phải)
  const segs = [[score, "#28b77a"], [m.wrong, "#e9786b"], [m.blank, "#b9c6d2"]].filter((x) => x[0] > 0 && total > 0);
  const bar = segs.length
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:5px;background:#e8eef3;"><tr>' +
      segs.map((x) => '<td width="' + Math.max(1, Math.round(x[0] / total * 100)) + '%" bgcolor="' + x[1] + '" height="9" style="height:9px;background:' + x[1] + ';font-size:1px;line-height:1px;">&nbsp;</td>').join("") + "</tr></table>"
    : "";
  const summary =
    '<tr><td ' + pad(22, 20) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="score-layout"><tr>' +
    '<td class="score-col" width="34%" align="center" valign="middle" style="padding:4px 14px 4px 0;border-right:1px solid #e3ebf2;font-family:' + TF + ';">' +
    '<div style="font-size:10px;line-height:15px;letter-spacing:1px;color:#71849a;font-weight:bold;">TỈ LỆ TRẢ LỜI ĐÚNG</div>' +
    '<div class="score-number" style="font-size:48px;line-height:54px;font-weight:bold;color:' + scColor + ';">' + esc(attempt.pct) + '%</div>' +
    '<div style="font-size:12px;line-height:18px;color:#667b91;">' + esc(score) + "/" + esc(total) + " câu đúng</div></td>" +
    '<td class="score-col" width="66%" valign="middle" style="padding:4px 0 4px 20px;font-family:' + TF + ';">' +
    '<div class="person-name" style="font-size:23px;line-height:29px;font-weight:bold;color:#173b60;">' + esc(who) + "</div>" +
    '<div style="font-size:13px;line-height:21px;color:#5e748a;padding-top:5px;">Mã NV: ' + esc(oneLine(attempt.code, 40)) + "</div>" +
    (oneLine(attempt.manager, 80) ? '<div style="font-size:13px;line-height:21px;color:#5e748a;">Quản lý: ' + esc(oneLine(attempt.manager, 80)) + "</div>" : "") +
    '<div style="font-size:12px;line-height:18px;color:#60758a;padding-top:10px;">KẾT QUẢ BÀI LÀM</div>' + bar +
    '<div style="font-size:12px;line-height:19px;color:#657b90;padding-top:5px;">Đúng: ' + esc(score) + " &nbsp;·&nbsp; Sai: " + esc(m.wrong) + " &nbsp;·&nbsp; Bỏ trống: " + esc(m.blank) + "</div>" +
    "</td></tr></table></td></tr>";

  // ---- Dải chỉ số: điểm tuân thủ (không có thì hiện số câu đúng) · thời gian làm bài · thời điểm nộp
  const whenT = m.when.split(" ")[0] || "", whenD = m.when.split(" ")[1] || "";
  const cells = [compliance != null
    ? { k: t.practice ? "TUÂN THỦ (NẾU THI THẬT)" : "ĐIỂM TUÂN THỦ", v: compliance + "/20", s: "" }
    : { k: "SỐ CÂU ĐÚNG", v: score + "/" + total, s: "" }];
  if (m.dur != null) cells.push({ k: "THỜI GIAN", v: clock(m.dur), s: "" });
  cells.push({ k: "THỜI ĐIỂM NỘP", v: whenT, s: whenD, small: true });
  const mw = Math.floor(10000 / cells.length) / 100;
  const metrics =
    '<tr><td ' + pad(0, 20) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8fb" style="background:#f5f8fb;border:1px solid #e5edf4;border-radius:10px;"><tr>' +
    cells.map((c, i) => '<td class="metric" width="' + mw + '%" align="center" style="padding:12px 5px;' + (i < cells.length - 1 ? "border-right:1px solid #e1e9f0;" : "") + 'font-family:' + TF + ';">' +
      '<div style="font-size:10px;line-height:15px;color:#75899d;">' + esc(c.k) + '</div><strong style="display:block;font-size:' + (c.small ? 15 : 20) + 'px;line-height:26px;color:#173b60;">' + esc(c.v) + "</strong>" +
      (c.s ? '<span style="font-size:11px;line-height:16px;color:#75899d;">' + esc(c.s) + "</span>" : "") + "</td>").join("") +
    "</tr></table></td></tr>";

  // ---- Phân tích theo mảng + chỉ số phụ
  let cats = "", grid = "";
  if (an) {
    cats = "";
    if (an.random != null) {
      cats = '<div style="font-family:' + TF + ';font-size:13px;line-height:1.7;color:#6B4A00;background:' + C.amberBg + ';border:1px solid #F0DDB0;border-radius:12px;padding:11px 14px">Kết quả gần bằng mức chọn bừa (khoảng ' + esc(an.random) + '%) nên chưa phản ánh kiến thức theo từng mảng. Hãy làm lại nghiêm túc để có phân tích chính xác.</div>';
    } else if ((an.categories || []).length) {
      cats = '<div style="font-family:' + TF + ';font-size:13px;font-weight:700;color:' + C.ink + ';margin:0 0 12px">Kết quả theo mảng kiến thức <span style="font-weight:500;color:' + C.muted + '">· mảng yếu nhất ở trên</span></div>' +
        an.categories.map((c) =>
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 13px"><tr><td style="font-family:' + TF + ';font-size:13.5px;font-weight:600;color:' + C.ink + '">' + esc(oneLine(c.name, 60)) + "</td>" +
          '<td align="right" width="96" style="width:96px;font-family:' + TF + ';font-size:12.5px;color:' + C.muted + ';white-space:nowrap"><b style="color:' + C.ink + '">' + esc(c.ok) + "/" + esc(c.n) + "</b> · " + esc(c.pct) + "%</td></tr>" +
          '<tr><td colspan="2" style="padding-top:6px">' + oneBar(c.pct, band(c.pct), 8) + "</td></tr></table>").join("") +
        '<div style="font-family:' + TF + ';font-size:11.5px;color:' + C.muted + '"><span style="color:' + C.ok + '">&#9679;</span> từ 80% &nbsp; <span style="color:' + C.warn + '">&#9679;</span> 60 đến 79% &nbsp; <span style="color:' + C.bad + '">&#9679;</span> dưới 60%</div>';
    }
    const facts = [];
    if (an.avgSec != null && an.limitSec) facts.push({ k: "Tốc độ làm bài trung bình", v: an.avgSec + " giây/câu", s: "Giới hạn " + an.limitSec + " giây mỗi câu" });
    if (an.timeouts > 0) facts.push({ k: "Câu hết giờ", v: an.timeouts + " câu", s: "chưa kịp trả lời" });
    if (an.prev && an.prev.pct != null) { const d = (an.pct || 0) - an.prev.pct; facts.push({ k: "So với kỳ trước", v: (d > 0 ? "▲ +" : d < 0 ? "▼ " : "≈ ") + d + " điểm %", c: d >= 5 ? C.ok : d <= -5 ? C.bad : C.ink, s: (an.prev.period ? "Kỳ " + an.prev.period + ": " : "Trước đó: ") + an.prev.pct + "%" }); }
    if (an.nextBand && an.total) facts.push({ k: "Mốc tuân thủ kế tiếp", v: an.nextBand.points + " điểm", s: "Cần đúng " + an.nextBand.needCorrect + "/" + an.total + " câu (thiếu " + an.nextBand.gap + ")" });
    // chỉ số phụ: các dòng có đường kẻ mảnh (nhãn + chú thích bên trái, số bên phải), không lồng thêm hộp
    grid = facts.map((f, i) =>
      '<tr><td valign="middle" style="padding:11px 0;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + TF + '"><div style="font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(f.k) + '</div><div style="font-size:12px;color:' + C.muted + ';margin-top:2px">' + esc(f.s) + "</div></td>" +
      '<td align="right" valign="middle" style="padding:11px 0 11px 12px;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + TF + ';font-size:16px;font-weight:800;color:' + (f.c || C.ink) + ';white-space:nowrap">' + esc(f.v) + "</td></tr>").join("");
  }

  const analysis = (cats || grid)
    ? '<tr><td ' + pad(0, 14) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8fb" style="background:#f5f8fb;border:1px solid #e5edf4;border-radius:10px;"><tr><td style="padding:14px 16px 6px;font-family:' + TF + ';"><div style="font-size:14px;line-height:21px;font-weight:bold;color:#173b60;margin:0 0 10px;">Phân tích kết quả</div>' + cats +
      (grid ? (cats ? '<div style="height:10px;line-height:10px;font-size:0;border-bottom:1px solid #e1e9f0;">&nbsp;</div>' : "") + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + grid + "</table>" : "") + "</td></tr></table></td></tr>"
    : "";

  // ---- Nhận xét AI + điểm mạnh / nội dung cần củng cố + gợi ý hành động
  const portrait = a.portrait || a.summary || "";
  const overviewTxt = [a.headline ? "<b>" + esc(a.headline) + "</b>" : "", portrait ? esc(portrait) : ""].filter(Boolean).join("<br>");
  const overview = overviewTxt
    ? '<tr><td ' + pad(0, 14) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f6fc" style="background:#f1f6fc;border-left:4px solid #3685bd;border-radius:9px;"><tr><td style="padding:16px 17px;font-family:' + TF + ';">' +
      '<div class="ai-heading" style="font-size:18px;line-height:24px;font-weight:bold;color:#174c78;">' + (a.source === "ai" ? "Nhận xét từ AI" : "Nhận xét dành cho bạn") + '</div><div style="font-size:13px;line-height:21px;color:#405a72;padding-top:7px;">' + overviewTxt + "</div></td></tr></table></td></tr>"
    : "";
  const items = (arr, mark) => arr.map((x) => '<div style="padding:0 0 4px 14px;text-indent:-14px;">' + mark + "&nbsp; " + esc(x) + "</div>").join("");
  const box = (bg, hc, tc, title, body) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + bg + '" style="background:' + bg + ';border-radius:9px;"><tr><td style="padding:13px 14px;font-family:' + TF + ';">' +
    '<div style="font-size:13px;line-height:19px;font-weight:bold;color:' + hc + ';">' + title + '</div><div style="font-size:12px;line-height:20px;color:' + tc + ';padding-top:6px;">' + body + "</div></td></tr></table>";
  const bS = (a.strengths || []).length ? box("#eff8f2", "#237447", "#3e5e4a", "ĐIỂM MẠNH", items(a.strengths, "&#8226;")) : "";
  const bT = (a.topics || []).length ? box("#fff7eb", "#95600e", "#695638", "NỘI DUNG CẦN CỦNG CỐ", items(a.topics, "&#8226;")) : "";
  const two = bS && bT
    ? '<tr><td ' + pad(0, 14) + '><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="ai-two" width="50%" valign="top" style="padding-right:6px;">' + bS + '</td><td class="ai-two" width="50%" valign="top" style="padding-left:6px;">' + bT + "</td></tr></table></td></tr>"
    : (bS || bT ? "<tr><td " + pad(0, 14) + ">" + (bS || bT) + "</td></tr>" : "");
  const acts = (a.actions || []).map((x, i) => '<div style="padding:0 0 4px 18px;text-indent:-18px;"><b style="color:#173b60;">' + (i + 1) + ".</b>&nbsp; " + esc(x) + "</div>").join("");
  const goal = a.goal ? '<div style="padding-top:4px;"><b style="color:#8a5500;">Mục tiêu lần tới.</b> ' + esc(String(a.goal).replace(/^Lần tới:\s*/i, "")) + "</div>" : "";
  const next = (acts || goal)
    ? '<tr><td ' + pad(0, 19) + '><div style="font-family:' + TF + ';font-size:14px;line-height:21px;font-weight:bold;color:#173b60;">Gợi ý hành động tiếp theo</div><div style="font-family:' + TF + ';font-size:13px;line-height:21px;color:#526a80;padding-top:5px;">' + acts + goal + "</div></td></tr>"
    : "";

  // ---- Xác thực + QR + liên hệ hỗ trợ
  const verify =
    '<tr><td class="pad" style="padding:15px 28px 20px;background:#f8fafc;border-top:1px solid #e5edf4;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="middle" style="padding-right:12px;font-family:' + TF + ';"><div style="font-size:12px;line-height:19px;font-weight:bold;color:#26734f;">&#10003; Đã xác thực bởi hệ thống lúc ' + esc(vn(Date.now())) + "</div>" +
    '<div style="font-size:11px;line-height:17px;color:#718397;padding-top:4px;">Mã minh chứng: <b>' + esc(m.proof) + "</b>" + (a.source === "ai" ? " · Nhận xét AI được tổng hợp từ dữ liệu bài kiểm tra." : "") + (cardNote ? " Thẻ kết quả (ảnh PNG) được đính kèm theo email này." : "") + "</div>" +
    '<div style="padding-top:8px;"><a href="' + esc(m.url) + '" target="_blank" style="font-size:13px;line-height:19px;font-weight:bold;color:#086db5;text-decoration:none;">Xem kết quả chi tiết &#8594;</a></div></td>' +
    (qrCid ? '<td width="86" align="center" valign="middle" style="font-family:' + TF + ';"><a href="' + esc(m.url) + '" target="_blank"><img class="footer-qr" src="cid:' + qrCid + '" width="76" height="76" alt="QR xem kết quả" style="display:block;margin:0 auto;width:76px;height:76px;border:1px solid #dbe5ed;"></a>' +
      '<div style="font-size:10px;line-height:15px;color:#718397;padding-top:4px;">Quét QR xem bản gốc</div></td>' : "") +
    "</tr></table>" +
    '<div style="font-family:' + TF + ';font-size:12px;line-height:19px;color:#526b85;border-top:1px solid #e5edf4;margin-top:12px;padding-top:10px;">' + esc(supportLine(attempt.manager)) + "</div></td></tr>" +
    '<tr><td align="center" bgcolor="#123b65" style="padding:12px 18px;background:#123b65;font-family:' + TF + ';color:#c7dcec;font-size:10px;line-height:16px;">Email tự động từ hệ thống kiểm tra · Vui lòng không trả lời email này.<br>Email chứa thông tin cá nhân của bạn, vui lòng không chuyển tiếp cho người khác.</td></tr>';

  const css =
    "body{margin:0!important;padding:0!important;background:#f1f5f9;-webkit-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0}a{color:#086db5}" +
    ".shell{width:100%;max-width:640px}.pad{padding-left:28px;padding-right:28px}.score-layout{width:100%}.score-number{font-size:48px;line-height:52px}.metric{width:" + mw + "%}.ai-two{width:50%}" +
    "@media screen and (max-width:600px){.outer{padding:0!important}.shell{width:100%!important;max-width:100%!important;border-radius:0!important}.pad{padding-left:18px!important;padding-right:18px!important}" +
    ".top-title{font-size:21px!important;line-height:27px!important}.score-layout,.score-layout>tbody,.score-layout>tbody>tr,.score-layout>tbody>tr>td{display:block!important;width:100%!important}" +
    ".score-col{text-align:center!important;padding:7px 0!important;border-right:0!important}.score-number{font-size:42px!important;line-height:46px!important}.person-name{font-size:21px!important;line-height:27px!important}" +
    ".metric{width:" + mw + "%!important}.metric strong{font-size:18px!important}.metric span{font-size:11px!important}" +
    ".ai-two{display:block!important;width:100%!important;padding:0 0 9px!important}.ai-heading{font-size:17px!important}.footer-qr{width:78px!important}}";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title><style>" + css + "</style></head>" +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:' + TF + ';color:#17324f;-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f1f5f9">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="width:100%;background:#f1f5f9;"><tr><td align="center" class="outer" style="padding:22px 10px;">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="shell" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;border-collapse:separate;overflow:hidden;text-align:left;">' +
    header + practiceNote + summary + metrics + analysis + overview + two + next + verify +
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
  L.push("", "XÁC THỰC KẾT QUẢ", m.url, "Mã minh chứng: " + m.proof, ...(cardNote ? ["Thẻ kết quả (ảnh PNG) được đính kèm theo email này."] : []), "", "BIÊN NHẬN NỘP BÀI", "Họ và tên: " + oneLine(attempt.name, 80), "Mã nhân viên: " + oneLine(attempt.code, 40), "Quản lí: " + (oneLine(attempt.manager, 80) || "(chưa rõ)"),
    "Nộp bài lúc: " + vn(attempt.submittedAt), "", supportLine(attempt.manager), "", "Chúc bạn học tập và làm việc hiệu quả.", "", "Trân trọng,", "Hệ thống kiểm tra trực tuyến", "", "--",
    "Email tự động từ hệ thống kiểm tra, vui lòng không trả lời trực tiếp. Có thắc mắc về kết quả, hãy liên hệ quản lí trực tiếp hoặc quản trị viên phụ trách. Email chứa thông tin cá nhân, vui lòng không chuyển tiếp.");
  return L.join("\n");
}

module.exports = { build, model, esc };
