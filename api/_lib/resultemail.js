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
// Giao diện theo mẫu email_ket_qua_M25_theo_mau_mobile.html: hero xanh có vòng điểm, dải chỉ số, nhận xét AI, điểm mạnh / cần củng cố,
// gợi ý hành động, nút xem kết quả + QR; có CSS riêng cho điện thoại (<= 600px).
const TF = "Arial,Helvetica,sans-serif";
function build(attempt, settings, advice, opts) {
  opts = opts || {};
  const cardNote = !!opts.card, qrCid = opts.qrCid ? String(opts.qrCid).replace(/[^\w.@-]/g, "") : "";
  const m = model(attempt, settings, advice), t = m.t, a = m.a, an = m.an;
  const compliance = attempt.compliancePoints;
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "") + ". " + (a.headline || "Xem phân tích và lời khuyên của bạn.");
  const who = oneLine(attempt.name, 80) ? m.name : oneLine(attempt.code, 40);
  const pctN = Math.max(0, Math.min(100, Number(attempt.pct) || 0));

  // ---- Nhãn trạng thái (góc phải đầu thư) + màu vòng điểm theo mốc điểm (đỏ < 60, vàng 60-70, xanh dương 70-90, xanh lá >= 90)
  const st = t.practice ? { bd: "#ffd98a", bg: "#8a5a00", ic: "!" } : m.ps === false ? { bd: "#ff9e8a", bg: "#a8392b", ic: "!" } : { bd: "#49e6b3", bg: "#087d70", ic: "&#10003;" };
  const ring = pctN >= 90 ? ["#3de77d", "#45f59b66"] : pctN >= 70 ? ["#5db2ff", "#5db2ff66"] : pctN >= 60 ? ["#f5b84a", "#f5b84a66"] : ["#ff7a5c", "#ff7a5c66"];
  const grad = "background:#063b70;background-image:linear-gradient(135deg,#062e59,#006ca5 72%,#0798c5);";

  // ---- HERO
  const hero =
    '<tr><td style="padding:0;' + grad + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td class="hero-top mobile-pad" style="padding:29px 30px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td valign="top"><div style="font-family:' + TF + ';font-size:11px;line-height:17px;letter-spacing:2px;font-weight:bold;color:#bdeeff;">KẾT QUẢ BÀI KIỂM TRA' + (t.chan ? " · KÊNH " + esc(String(t.chan).toUpperCase()) : "") + '</div>' +
    '<div class="hero-title" style="font-family:' + TF + ';font-size:25px;line-height:32px;font-weight:bold;color:#fff;padding-top:5px;">' + esc(t.main) + "</div></td>" +
    '<td align="right" valign="top" style="padding-left:10px;"><div style="display:inline-block;border:1px solid ' + st.bd + ';border-radius:20px;background:' + st.bg + ';padding:8px 10px;font-family:' + TF + ';color:#fff;font-size:11px;line-height:15px;font-weight:bold;white-space:nowrap;">' + st.ic + " " + esc(m.status) + "</div></td>" +
    "</tr></table></td></tr>" +
    '<tr><td class="hero-main mobile-pad" style="padding:8px 30px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="hero-grid"><tr>' +
    '<td width="38%" align="center" valign="middle" style="padding:12px 10px 10px 0;">' +
    '<div class="score-ring" style="width:168px;height:168px;margin:0 auto;border:11px solid ' + ring[0] + ';border-radius:100%;box-shadow:0 0 22px ' + ring[1] + ';">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;height:100%;"><tr><td align="center" valign="middle" style="height:168px;font-family:' + TF + ';color:#fff;"><div class="score-number" style="font-size:54px;line-height:60px;font-weight:bold;">' + esc(attempt.pct) + '%</div>' +
    '<div style="font-size:16px;line-height:23px;color:#e1f8ff;">Tỉ lệ đúng</div></td></tr></table></div></td>' +
    '<td class="identity" width="62%" valign="middle" style="padding:10px 0 10px 15px;font-family:' + TF + ';color:#fff;">' +
    '<div class="identity-name" style="font-size:28px;line-height:35px;font-weight:bold;">' + esc(who) + "</div>" +
    '<div style="font-size:14px;line-height:25px;color:#d8efff;padding-top:7px;">&#9823; &nbsp;Mã NV: ' + esc(oneLine(attempt.code, 40)) + "</div>" +
    (oneLine(attempt.manager, 80) ? '<div style="font-size:14px;line-height:25px;color:#d8efff;">&#9823; &nbsp;Quản lí: ' + esc(oneLine(attempt.manager, 80)) + "</div>" : "") +
    '<div style="padding-top:13px;"><span style="font-size:43px;line-height:50px;font-weight:bold;">' + esc(attempt.score || 0) + "/" + esc(m.total) + '</span> <span style="font-size:15px;font-weight:bold;color:#e2f5ff;">câu đúng</span></div>' +
    '<div style="margin-top:8px;">' + segBar([{ v: attempt.score || 0, c: "#31df75" }, { v: m.wrong, c: "#ff6b5e" }, { v: m.blank, c: "#9db8d3" }], 10) + "</div>" +
    '<div style="font-size:13px;line-height:22px;color:#d8efff;padding-top:7px;">Sai: ' + esc(m.wrong) + " &nbsp;·&nbsp; Bỏ trống: " + esc(m.blank) + "</div>" +
    "</td></tr></table></td></tr></table></td></tr>" +
    (t.practice ? '<tr><td class="mobile-pad" style="padding:12px 22px 0;background:#fff;"><div style="font-family:' + TF + ';font-size:12.5px;line-height:19px;color:#6B4A00;background:#FFF6E2;border:1px solid #EBCB84;border-radius:12px;padding:10px 14px;"><b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> ' + (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + "</div></td></tr>" : "");

  // ---- Dải chỉ số
  const wp = m.whenShort.split(" · "), whenT = (m.when.split(" ")[0] || ""), whenD = (m.when.split(" ")[1] || "");
  const cells = [];
  if (compliance != null) cells.push({ ic: "&#127941;", icc: "#f0b000", v: compliance + " điểm", vc: "#9a5b08", l: t.practice ? "Tuân thủ nếu thi thật" : "(tối đa 20)" });
  cells.push({ ic: "&#9678;", icc: "#0878d1", v: (attempt.score || 0) + "/" + m.total, l: "câu đúng" });
  if (m.dur != null) cells.push({ ic: "&#9719;", icc: "#0878d1", v: clock(m.dur), l: "Thời gian làm bài" });
  cells.push({ ic: "&#9638;", icc: "#0878d1", v: whenT, l: "Nộp ngày " + whenD });
  const metrics =
    '<tr><td class="mobile-pad" style="padding:17px 22px 0;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fcff;border-radius:17px;border:1px solid #e5eff7;border-collapse:separate;"><tr class="metric-wrap">' +
    cells.map((c, i) => '<td class="metric-cell" width="' + Math.floor(100 / cells.length) + '%" align="center" style="padding:15px 5px;' + (i < cells.length - 1 ? "border-right:1px solid #dce8f2;" : "") + 'font-family:' + TF + ';">' +
      '<div style="font-size:24px;line-height:29px;color:' + c.icc + ';">' + c.ic + '</div><div style="font-size:22px;line-height:28px;font-weight:bold;color:' + (c.vc || "#123b68") + ';">' + esc(c.v) + '</div><div style="font-size:12px;line-height:18px;color:#526b85;">' + esc(c.l) + "</div></td>").join("") +
    "</tr></table></td></tr>";

  // ---- Phân tích theo mảng + chỉ số phụ
  let cats = "", grid = "";
  if (an) {
    cats = "";
    if (an.random != null) {
      cats = '<div style="font-family:' + FONT + ';font-size:13px;line-height:1.7;color:#6B4A00;background:' + C.amberBg + ';border:1px solid #F0DDB0;border-radius:12px;padding:11px 14px">Kết quả gần bằng mức chọn bừa (khoảng ' + esc(an.random) + '%) nên chưa phản ánh kiến thức theo từng mảng. Hãy làm lại nghiêm túc để có phân tích chính xác.</div>';
    } else if ((an.categories || []).length) {
      cats = '<div style="font-family:' + FONT + ';font-size:13px;font-weight:700;color:' + C.ink + ';margin:0 0 12px">Kết quả theo mảng kiến thức <span style="font-weight:500;color:' + C.muted + '">· mảng yếu nhất ở trên</span></div>' +
        an.categories.map((c) =>
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 13px"><tr><td style="font-family:' + FONT + ';font-size:13.5px;font-weight:600;color:' + C.ink + '">' + esc(oneLine(c.name, 60)) + "</td>" +
          '<td align="right" width="96" style="width:96px;font-family:' + FONT + ';font-size:12.5px;color:' + C.muted + ';white-space:nowrap"><b style="color:' + C.ink + '">' + esc(c.ok) + "/" + esc(c.n) + "</b> · " + esc(c.pct) + "%</td></tr>" +
          '<tr><td colspan="2" style="padding-top:6px">' + oneBar(c.pct, band(c.pct), 8) + "</td></tr></table>").join("") +
        '<div style="font-family:' + FONT + ';font-size:11.5px;color:' + C.muted + '"><span style="color:' + C.ok + '">&#9679;</span> từ 80% &nbsp; <span style="color:' + C.warn + '">&#9679;</span> 60 đến 79% &nbsp; <span style="color:' + C.bad + '">&#9679;</span> dưới 60%</div>';
    }
    const facts = [];
    if (an.avgSec != null && an.limitSec) facts.push({ k: "Tốc độ làm bài trung bình", v: an.avgSec + " giây/câu", s: "Giới hạn " + an.limitSec + " giây mỗi câu" });
    if (an.timeouts > 0) facts.push({ k: "Câu hết giờ", v: an.timeouts + " câu", s: "chưa kịp trả lời" });
    if (an.prev && an.prev.pct != null) { const d = (an.pct || 0) - an.prev.pct; facts.push({ k: "So với kỳ trước", v: (d > 0 ? "▲ +" : d < 0 ? "▼ " : "≈ ") + d + " điểm %", c: d >= 5 ? C.ok : d <= -5 ? C.bad : C.ink, s: (an.prev.period ? "Kỳ " + an.prev.period + ": " : "Trước đó: ") + an.prev.pct + "%" }); }
    if (an.nextBand && an.total) facts.push({ k: "Mốc tuân thủ kế tiếp", v: an.nextBand.points + " điểm", s: "Cần đúng " + an.nextBand.needCorrect + "/" + an.total + " câu (thiếu " + an.nextBand.gap + ")" });
    // chỉ số phụ: các dòng có đường kẻ mảnh (nhãn + chú thích bên trái, số bên phải), không lồng thêm hộp
    grid = facts.map((f, i) =>
      '<tr><td valign="middle" style="padding:11px 0;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + FONT + '"><div style="font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(f.k) + '</div><div style="font-size:12px;color:' + C.muted + ';margin-top:2px">' + esc(f.s) + "</div></td>" +
      '<td align="right" valign="middle" style="padding:11px 0 11px 12px;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + FONT + ';font-size:16px;font-weight:800;color:' + (f.c || C.ink) + ';white-space:nowrap">' + esc(f.v) + "</td></tr>").join("");
  }

  const analysis = (cats || grid)
    ? '<tr><td class="mobile-pad" style="padding:14px 22px 0;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fcff;border-radius:17px;border:1px solid #e5eff7;border-collapse:separate;"><tr><td style="padding:16px 18px 8px;font-family:' + FONT + ';"><div style="font-size:16px;line-height:23px;font-weight:bold;color:#104b91;margin:0 0 12px;">&#9648; &nbsp;Phân tích kết quả</div>' + cats +
      (grid ? (cats ? '<div style="height:12px;line-height:12px;font-size:0;border-bottom:1px solid #e5eff7;">&nbsp;</div><div style="height:4px;line-height:4px;font-size:0;">&nbsp;</div>' : "") + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + grid + "</table>" : "") + "</td></tr></table></td></tr>"
    : "";

  // ---- Nhận xét AI + điểm mạnh / nội dung nên củng cố + gợi ý hành động
  const portrait = a.portrait || a.summary || "";
  const overviewTxt = [a.headline ? "<b>" + esc(a.headline) + "</b>" : "", portrait ? esc(portrait) : ""].filter(Boolean).join("<br>");
  const overview = overviewTxt
    ? '<tr><td class="mobile-pad" style="padding:14px 22px 0;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efff;border-radius:17px;border-collapse:separate;"><tr>' +
      '<td width="105" align="center" valign="middle" style="padding:15px 8px;"><div style="width:78px;height:78px;border-radius:50%;background:#e0d9ff;color:#5a43d6;font-family:' + TF + ';font-size:39px;line-height:78px;text-align:center;">&#10022;</div></td>' +
      '<td valign="middle" style="padding:15px 15px 15px 0;font-family:' + TF + ';"><div style="font-size:19px;line-height:26px;font-weight:bold;color:#593bd1;">' + (a.source === "ai" ? "Nhận xét từ AI" : "Nhận xét dành cho bạn") + '</div>' +
      '<div class="ai-intro" style="font-size:14px;line-height:22px;color:#263b5b;padding-top:6px;">' + overviewTxt + "</div></td></tr></table></td></tr>"
    : "";
  const lines = (arr, mark, color) => arr.map((x) => '<div style="padding:0 0 5px 16px;text-indent:-16px;"><span style="color:' + color + ';">' + mark + "</span>&nbsp; " + esc(x) + "</div>").join("");
  const strengths = (a.strengths || []).length ? lines(a.strengths, "&#10003;", "#168a35") : "", topics = (a.topics || []).length ? lines(a.topics, "&#8226;", "#a85d08") : "";
  const boxS = strengths ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ai-card" style="background:#eaf9ed;border-radius:15px;border-collapse:separate;"><tr><td style="padding:15px;font-family:' + TF + ';"><div style="font-size:15px;line-height:22px;font-weight:bold;color:#168a35;">&#128077; Điểm mạnh</div><div style="font-size:13px;line-height:21px;color:#173e2a;padding-top:8px;">' + strengths + "</div></td></tr></table>" : "";
  const boxT = topics ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ai-card" style="background:#fff4df;border-radius:15px;border-collapse:separate;"><tr><td style="padding:15px;font-family:' + TF + ';"><div style="font-size:15px;line-height:22px;font-weight:bold;color:#a85d08;">&#9678; Nội dung nên củng cố</div><div style="font-size:13px;line-height:21px;color:#5d4527;padding-top:8px;">' + topics + "</div></td></tr></table>" : "";
  const cols = boxS && boxT
    ? '<tr><td class="mobile-pad" style="padding:14px 22px 0;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ai-columns"><tr><td width="50%" valign="top" style="padding-right:6px;">' + boxS + '</td><td width="50%" valign="top" style="padding-left:6px;">' + boxT + "</td></tr></table></td></tr>"
    : (boxS || boxT ? '<tr><td class="mobile-pad" style="padding:14px 22px 0;background:#fff;">' + (boxS || boxT) + "</td></tr>" : "");
  const acts = (a.actions || []).map((x, i) => '<div style="padding:0 0 6px 20px;text-indent:-20px;"><b style="color:#104b91;">' + (i + 1) + ".</b>&nbsp; " + esc(x) + "</div>").join("");
  const goal = a.goal ? '<div style="padding-top:6px;"><b style="color:#8a5500;">&#127919; Mục tiêu lần tới.</b> ' + esc(String(a.goal).replace(/^Lần tới:\s*/i, "")) + "</div>" : "";
  const steps = (acts || goal)
    ? '<tr><td class="mobile-pad" style="padding:14px 22px 0;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf5ff;border-radius:16px;border-collapse:separate;"><tr><td style="padding:16px 18px;font-family:' + TF + ';">' +
      '<div style="font-size:16px;line-height:23px;font-weight:bold;color:#104b91;">&#9648; &nbsp;Gợi ý hành động tiếp theo</div><div class="action-content" style="font-size:13px;line-height:22px;color:#173b63;padding-top:8px;">' + acts + goal + "</div></td></tr></table></td></tr>"
    : "";

  // ---- Nút xem kết quả + QR + liên hệ hỗ trợ
  const foot =
    '<tr><td class="mobile-pad" style="padding:20px 22px 26px;background:#fff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bottom-cols"><tr>' +
    '<td valign="middle" align="center" style="padding:5px;font-family:' + TF + ';"><a class="cta" href="' + esc(m.url) + '" target="_blank" style="display:inline-block;background:#075eaa;background-image:linear-gradient(90deg,#07539b,#087dc0);border-radius:28px;padding:14px 22px;color:#fff;text-decoration:none;font-size:15px;line-height:20px;font-weight:bold;">Xem kết quả chi tiết &nbsp;&#8250;</a>' +
    '<div style="font-size:11px;line-height:18px;color:#648099;padding-top:9px;">Đã xác thực lúc ' + esc(vn(Date.now())) + " · Mã minh chứng <b>" + esc(m.proof) + "</b></div>" +
    (cardNote ? '<div style="font-size:11px;line-height:18px;color:#648099;">Thẻ kết quả (ảnh PNG) được đính kèm theo email này.</div>' : "") + "</td>" +
    (qrCid ? '<td width="170" align="center" valign="middle" class="qr-cell" style="border-left:1px solid #d8e7f3;padding:5px;font-family:' + TF + ';"><a href="' + esc(m.url) + '" target="_blank"><img src="cid:' + qrCid + '" width="88" height="88" alt="Quét QR xem bản gốc" style="display:block;width:88px;height:88px;margin:0 auto;"></a>' +
      '<div style="font-size:12px;line-height:18px;color:#123b68;padding-top:5px;">Quét QR xem bản gốc<br>kết quả</div></td>' : "") +
    "</tr></table>" +
    '<div style="font-family:' + TF + ';font-size:12.5px;line-height:20px;color:#526b85;border-left:3px solid #087dc0;background:#f3f9ff;border-radius:0 10px 10px 0;padding:10px 14px;margin-top:16px;">' + esc(supportLine(attempt.manager)) + "</div></td></tr>" +
    '<tr><td align="center" style="padding:13px 18px;background:#063b70;font-family:' + TF + ';color:#c5e4f6;font-size:10px;line-height:17px;">Email tự động từ hệ thống kiểm tra · Vui lòng không trả lời email này.<br>Email chứa thông tin cá nhân của bạn, vui lòng không chuyển tiếp cho người khác.</td></tr>';

  const css =
    "body{margin:0!important;padding:0!important;background:#edf2f7}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}" +
    "@media only screen and (max-width:600px){.outer-pad{padding:0!important}.wrap{width:100%!important;max-width:100%!important;border-radius:0!important}.mobile-pad{padding-left:17px!important;padding-right:17px!important}" +
    ".hero-title{font-size:22px!important;line-height:28px!important}.hero-top{padding:24px 20px 18px!important}.hero-main{padding:8px 18px 25px!important}" +
    ".hero-grid,.hero-grid tbody,.hero-grid tr,.hero-grid td{display:block!important;width:100%!important}.hero-grid td{text-align:center!important;padding:8px 0!important}" +
    ".score-ring{width:128px!important;height:128px!important;margin:0 auto!important}.score-ring td{height:128px!important}.score-number{font-size:44px!important;line-height:50px!important}" +
    ".identity{text-align:center!important}.identity-name{font-size:25px!important;line-height:31px!important}" +
    ".metric-cell{display:inline-block!important;width:48%!important;box-sizing:border-box!important;border:0!important;padding:12px 4px!important}.metric-wrap{font-size:0!important}" +
    ".ai-intro{font-size:13px!important;line-height:21px!important}.ai-columns,.ai-columns tbody,.ai-columns tr,.ai-columns td{display:block!important;width:100%!important}.ai-columns td{padding:0 0 10px!important}" +
    ".ai-card{padding:15px!important}.action-content{font-size:13px!important;line-height:21px!important}" +
    ".bottom-cols,.bottom-cols tbody,.bottom-cols tr,.bottom-cols td{display:block!important;width:100%!important;text-align:center!important}.qr-cell{padding-top:18px!important;border-left:0!important}.cta{display:inline-block!important}}";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title><style>" + css + "</style></head>" +
    '<body style="margin:0;padding:0;background:#edf2f7;font-family:' + TF + ';color:#102f59;-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#edf2f7">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf2f7;"><tr><td align="center" class="outer-pad" style="padding:22px 10px;">' +
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" class="wrap" style="width:100%;max-width:680px;text-align:left;background:#fff;border-radius:20px;border-collapse:separate;overflow:hidden;box-shadow:0 10px 32px rgba(12,48,82,.13);">' +
    hero + metrics + analysis + overview + cols + steps + foot +
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
