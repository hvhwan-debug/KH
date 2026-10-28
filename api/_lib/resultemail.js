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

function build(attempt, settings, advice) {
  const m = model(attempt, settings, advice), t = m.t, a = m.a, an = m.an;
  const compliance = attempt.compliancePoints;
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "") + ". " + (a.headline || "Xem phân tích và lời khuyên của bạn.");

  // ---- Đầu thư: dòng thương hiệu nhỏ → tên đề lớn → nhãn kênh + thời điểm nộp (không lặp chữ)
  const chip = (txt, strong) => '<td style="padding:0 8px 8px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1C6F7C" style="background:#1C6F7C;background:rgba(255,255,255,' + (strong ? ".2" : ".12") + ');border:1px solid rgba(255,255,255,' + (strong ? ".4" : ".22") + ');border-radius:99px;padding:5px 12px;font-family:' + FONT + ';font-size:12.5px;line-height:1.4;font-weight:' + (strong ? 800 : 500) + ';color:#ffffff;white-space:nowrap;letter-spacing:' + (strong ? ".04em" : "0") + '">' + txt + "</td></tr></table></td>";
  const head =
    '<tr><td class="hd" align="left" bgcolor="' + C.deep + '" style="background:' + C.deep + ';background:linear-gradient(140deg,' + C.dark + ' 0%,' + C.deep + ' 45%,' + C.brand + ' 100%);padding:22px 32px 26px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="26" height="26" align="center" valign="middle" bgcolor="#2C8794" style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.18);font-family:' + FONT + ';font-size:10.5px;font-weight:800;color:#ffffff">KT</td>' +
    '<td valign="middle" style="padding-left:9px;font-family:' + FONT + ';font-size:12.5px;font-weight:600;color:#BFE3E8;letter-spacing:.01em">Hệ thống kiểm tra trực tuyến</td></tr></table>' +
    '<div class="ttl" style="font-family:' + FONT + ';font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;letter-spacing:-.015em;margin:20px 0 14px">' + esc(t.main) + "</div>" +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    (t.chan ? chip("Kênh " + esc(t.chan), true) : "") +
    (t.practice ? chip('<span style="color:#FFD98A">&#9679;</span>&nbsp; Thi thử', true) : "") +
    chip("Nộp lúc " + esc(m.whenShort)) +
    "</tr></table></td></tr>";

  // ---- Lời chào + giới thiệu
  const hello =
    '<div style="font-family:' + FONT + ';font-size:17px;font-weight:700;color:' + C.ink + ';margin:0 0 6px">Chào ' + esc(m.name) + ",</div>" +
    '<div style="font-family:' + FONT + ';font-size:14.5px;line-height:1.7;color:' + C.body + '">' + esc(m.intro) + "</div>";

  // ---- Khối điểm chính: điểm lớn + nhãn trạng thái + thanh đúng/sai/bỏ trống + dải chỉ số + (thi thử) dòng lưu ý, gộp trong MỘT thẻ
  const passLine = m.ps === null ? "" : (m.ps ? "Đạt yêu cầu" : "Chưa đạt yêu cầu") + (settings.passScore ? " · ngưỡng " + settings.passScore + "%" : "") + (t.practice ? " (nếu thi thật)" : "");
  const pill = m.ps === true ? { bg: "#DDF1E6", c: C.ok, t: "ĐẠT" } : m.ps === false ? { bg: "#FBE3E0", c: C.bad, t: "CHƯA ĐẠT" } : t.practice ? { bg: C.amberBg, c: C.amber, t: "THI THỬ" } : { bg: "#E3F3F5", c: C.deep, t: "ĐÃ HOÀN THÀNH" };
  const numColor = m.ps === true ? C.ok : m.ps === false ? C.bad : C.deep;
  const tiles = [{ n: (attempt.score || 0) + "/" + m.total, l: "Số câu đúng" }];
  if (compliance != null) tiles.push({ n: compliance + " điểm", l: t.practice ? "Tuân thủ nếu thi thật" : "Điểm tuân thủ học tập", ref: t.practice });
  if (m.dur != null) tiles.push({ n: clock(m.dur), l: "Thời gian làm bài" });
  const stats =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    tiles.map((x, i) => '<td align="center" valign="top" width="' + Math.floor(100 / tiles.length) + '%" style="padding:14px 6px 2px;' + (i ? "border-left:1px solid " + C.line + ";" : "") + 'font-family:' + FONT + '">' +
      '<div style="font-size:19px;font-weight:800;line-height:1.2;color:' + (x.ref ? C.amber : C.ink) + '">' + esc(x.n) + (x.ref ? '<sup style="font-size:11px;color:' + C.amber + '">*</sup>' : "") + "</div>" +
      '<div style="font-size:11.5px;color:' + C.muted + ';line-height:1.4;margin-top:3px">' + esc(x.l) + "</div></td>").join("") + "</tr></table>";
  const hero =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid ' + C.line + ';border-radius:18px;overflow:hidden"><tr><td style="padding:22px 22px 16px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td class="hs" valign="bottom" style="font-family:' + FONT + '"><div class="big" style="font-size:54px;line-height:1;font-weight:800;letter-spacing:-.03em;color:' + numColor + '">' + esc(attempt.pct) + '<span style="font-size:26px;font-weight:700">%</span></div>' +
    '<div style="font-size:13px;color:' + C.muted + ';margin-top:7px">Tỉ lệ trả lời đúng</div></td>' +
    '<td class="hb" valign="bottom" align="right" style="font-family:' + FONT + ';padding-bottom:2px"><span class="pill" style="display:inline-block;padding:6px 13px;border-radius:99px;background:' + pill.bg + ';color:' + pill.c + ';font-size:12px;font-weight:800;letter-spacing:.06em;white-space:nowrap">' + pill.t + "</span>" +
    (passLine ? '<div style="font-size:12px;color:' + C.muted + ';margin-top:7px;white-space:nowrap">' + esc(passLine) + "</div>" : "") + "</td></tr></table>" +
    '<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>' +
    segBar([{ v: attempt.score || 0, c: C.ok }, { v: m.wrong, c: C.bad }, { v: m.blank, c: "#AEBDC1" }], 8) +
    '<div style="font-family:' + FONT + ';font-size:12.5px;color:' + C.muted + ';margin-top:9px"><span style="color:' + C.ok + '">&#9679;</span> Đúng <b style="color:' + C.ink + '">' + (attempt.score || 0) + '</b> &nbsp;&nbsp; <span style="color:' + C.bad + '">&#9679;</span> Sai <b style="color:' + C.ink + '">' + m.wrong + '</b> &nbsp;&nbsp; <span style="color:#AEBDC1">&#9679;</span> Bỏ trống <b style="color:' + C.ink + '">' + m.blank + "</b></div>" +
    '<div style="height:16px;line-height:16px;font-size:0;border-bottom:1px solid ' + C.line + '">&nbsp;</div>' + stats +
    "</td></tr>" +
    (t.practice
      ? '<tr><td bgcolor="' + C.amberBg + '" style="background:' + C.amberBg + ';border-top:1px solid #F3E2BC;padding:12px 22px;font-family:' + FONT + ';font-size:12.5px;line-height:1.6;color:#6B4A00">' +
        (compliance != null ? '<b>*</b> ' : "") + "<b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> " + (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + "</td></tr>"
      : "") +
    "</table>";

  // ---- Phân tích theo mảng + chỉ số phụ
  let analysis = "";
  if (an) {
    let cats = "";
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
    let grid = facts.map((f, i) =>
      '<tr><td valign="middle" style="padding:11px 0;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + FONT + '"><div style="font-size:13px;font-weight:600;color:' + C.ink + '">' + esc(f.k) + '</div><div style="font-size:12px;color:' + C.muted + ';margin-top:2px">' + esc(f.s) + "</div></td>" +
      '<td align="right" valign="middle" style="padding:11px 0 11px 12px;' + (i ? "border-top:1px solid #EAF1F3;" : "") + 'font-family:' + FONT + ';font-size:16px;font-weight:800;color:' + (f.c || C.ink) + ';white-space:nowrap">' + esc(f.v) + "</td></tr>").join("");
    if (cats || grid) {
      analysis = sectionGap + "<tr><td>" + eyebrow("Phân tích kết quả") +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid ' + C.line + ';border-radius:16px"><tr><td style="padding:18px 20px 8px">' + cats +
        (grid ? (cats ? '<div style="height:16px;line-height:16px;font-size:0;border-bottom:1px solid ' + C.line + '">&nbsp;</div><div style="height:4px;line-height:4px;font-size:0">&nbsp;</div>' : "") + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + grid + "</table>" : "") + "</td></tr></table></td></tr>";
    }
  }

  // ---- Lời khuyên
  const acts = (a.actions || []).map((x, i) =>
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>' +
    '<td width="28" valign="top"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" bgcolor="#ffffff" style="width:26px;height:26px;border-radius:13px;background:#ffffff;border:1px solid #CFE5E9;font-family:' + FONT + ';font-size:12px;font-weight:800;color:' + C.deep + '">' + (i + 1) + "</td></tr></table></td>" +
    '<td valign="top" style="padding-left:10px;font-family:' + FONT + ';font-size:14px;line-height:1.7;color:' + C.body + '">' + esc(x) + "</td></tr></table>").join("");
  const portrait = a.portrait || a.summary || "";
  const strengths = (a.strengths || []).map((x) =>
    '<tr><td width="22" valign="top" style="padding:2px 0 8px;font-family:' + FONT + ';font-size:14px;color:' + C.ok + '">&#9733;</td><td valign="top" style="padding:0 0 8px 6px;font-family:' + FONT + ';font-size:14px;line-height:1.65;color:' + C.body + '">' + esc(x) + "</td></tr>").join("");
  const sub = (t) => '<div style="font-family:' + FONT + ';font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + ';margin:16px 0 8px">' + esc(t) + "</div>";
  const adv = (a.headline || acts)
    ? sectionGap + "<tr><td>" + eyebrow("Nhận xét dành riêng cho bạn") +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F3FAFB" style="border-collapse:separate;background:#F3FAFB;border:1px solid #D3E9ED;border-radius:16px"><tr>' +
      '<td style="padding:20px 20px 12px;font-family:' + FONT + '">' +
      (a.source === "ai" ? '<div style="margin:0 0 8px"><span style="display:inline-block;background:#DDF0F3;color:' + C.deep + ';font-size:10.5px;font-weight:800;letter-spacing:.08em;padding:3px 10px;border-radius:99px">GỢI Ý BỞI AI</span></div>' : "") +
      (a.headline ? '<div style="font-size:17px;font-weight:800;line-height:1.4;color:' + C.ink + ';margin:0 0 10px">' + esc(a.headline) + "</div>" : "") +
      (portrait ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:separate;background:#ffffff;border:1px solid #D3E9ED;border-radius:12px"><tr><td style="padding:12px 14px;font-family:' + FONT + '">' +
        '<div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:' + C.deep + ';margin:0 0 4px">Cách bạn đã làm bài</div>' +
        '<div style="font-size:14.5px;line-height:1.7;color:' + C.ink + '">' + esc(portrait) + "</div></td></tr></table>" : "") +
      (strengths ? sub("Điểm mạnh") + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + strengths + "</table>" : "") +
      ((a.topics || []).length ? sub("Chủ đề nên ôn lại") + '<ul style="margin:0 0 6px;padding-left:20px;font-family:' + FONT + ';font-size:14px;line-height:1.7;color:' + C.body + '">' + a.topics.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
      (acts ? sub("Việc nên làm") + acts : "") +
      (a.goal ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFF8E8" style="border-collapse:separate;background:#FFF8E8;border:1px solid #F1DFB6;border-radius:12px;margin:6px 0 8px"><tr><td style="padding:12px 14px;font-family:' + FONT + ';font-size:14px;line-height:1.6;color:#5E3D00">' +
        '<b style="color:#8A5500">&#127919; Mục tiêu lần tới.</b> ' + esc(String(a.goal).replace(/^Lần tới:\s*/i, "")) + "</td></tr></table>" : "") +
      "</td></tr></table></td></tr>"
    : "";

  // ---- Nút xác thực + biên nhận
  const cta =
    sectionGap + "<tr><td align=\"center\">" +
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td align="center" bgcolor="' + C.brand + '" style="border-radius:12px;background:' + C.brand + ';background:linear-gradient(135deg,#0AA3A0,' + C.brand + ')">' +
    '<a href="' + esc(m.url) + '" target="_blank" style="display:inline-block;padding:14px 30px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">Xem xác thực kết quả</a></td></tr></table>' +
    '<div style="font-family:' + FONT + ';font-size:12px;line-height:1.6;color:' + C.muted + ';margin-top:10px">Dùng để người có thẩm quyền đối chiếu kết quả với dữ liệu trên hệ thống.</div></td></tr>';
  const row = (k, v, mono) => '<tr><td style="padding:10px 0;border-top:1px solid #E8F0F2;font-family:' + FONT + ';font-size:13px;color:' + C.muted + '">' + esc(k) + '</td><td align="right" style="padding:10px 0;border-top:1px solid #E8F0F2;font-family:' + (mono ? "Consolas,'SF Mono',Menlo,monospace" : FONT) + ';font-size:' + (mono ? "14px" : "13px") + ';font-weight:700;color:' + C.ink + ';' + (mono ? "letter-spacing:.08em" : "") + '">' + esc(v) + "</td></tr>";
  const receipt =
    sectionGap + "<tr><td>" + eyebrow("Biên nhận nộp bài") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#FAFCFC;border:1px solid ' + C.line + ';border-radius:14px"><tr><td style="padding:4px 18px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    row("Họ và tên", oneLine(attempt.name, 80)).replace("border-top:1px solid #E8F0F2;", "").replace("border-top:1px solid #E8F0F2;", "") +
    row("Mã nhân viên", oneLine(attempt.code, 40)) + row("Quản lí", oneLine(attempt.manager, 80) || "(chưa rõ)") +
    (attempt.startedAt ? row("Bắt đầu lúc", vn(attempt.startedAt)) : "") + row("Nộp bài lúc", vn(attempt.submittedAt)) + row("Mã minh chứng", m.proof, true) +
    "</table></td></tr></table></td></tr>";

  const sign =
    sectionGap + '<tr><td style="font-family:' + FONT + ';font-size:14.5px;line-height:1.75;color:' + C.body + '">Chúc bạn học tập và làm việc hiệu quả.<br><br>Trân trọng,<br><b style="color:' + C.ink + '">Hệ thống kiểm tra trực tuyến</b></td></tr>';

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title>" +
    "<style>@media only screen and (max-width:540px){.wrap{padding:12px 8px!important}.hd{padding:22px 20px 24px!important}.bd{padding:26px 18px 24px!important}.ft{padding:18px!important}.ttl{font-size:20px!important}.big{font-size:44px!important}.pill{font-size:11px!important;padding:5px 10px!important}}</style></head>" +
    '<body style="margin:0;padding:0;background:' + C.page + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + C.page + '">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + '"><tr><td class="wrap" align="center" style="padding:28px 16px">' +
    '<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;text-align:left;background:#ffffff;border:1px solid #DCE5E9;border-radius:22px;border-collapse:separate;overflow:hidden;box-shadow:0 18px 40px -22px rgba(13,42,49,.35)">' +
    head +
    '<tr><td class="bd" align="left" width="556" style="padding:30px 32px 28px"><table role="presentation" width="556" cellpadding="0" cellspacing="0" style="width:100%">' +
    "<tr><td>" + hello + "</td></tr>" +
    '<tr><td style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>' +
    "<tr><td>" + hero + "</td></tr>" +
    analysis + adv + cta + receipt + sign +
    "</table></td></tr>" +
    '<tr><td class="ft" align="left" style="background:#F6F9FA;border-top:1px solid #E3EBEE;padding:20px 32px 24px;font-family:' + FONT + ';font-size:12px;line-height:1.7;color:#6A7C80">' +
    "Đây là email tự động từ hệ thống kiểm tra, vui lòng không trả lời trực tiếp. Nếu có thắc mắc về kết quả, bạn hãy liên hệ quản lí trực tiếp hoặc quản trị viên phụ trách.<br>" +
    '<span style="color:#8A9DA1">Email chứa thông tin cá nhân của bạn, vui lòng không chuyển tiếp cho người khác.</span></td></tr>' +
    "</table></td></tr></table></body></html>";

  return { subject: m.subject, html: harden(html), text: textOf(attempt, settings, m) };
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
function textOf(attempt, settings, m) {
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
  L.push("", "XÁC THỰC KẾT QUẢ", m.url, "Mã minh chứng: " + m.proof, "", "BIÊN NHẬN NỘP BÀI", "Họ và tên: " + oneLine(attempt.name, 80), "Mã nhân viên: " + oneLine(attempt.code, 40), "Quản lí: " + (oneLine(attempt.manager, 80) || "(chưa rõ)"),
    "Nộp bài lúc: " + vn(attempt.submittedAt), "", "Chúc bạn học tập và làm việc hiệu quả.", "", "Trân trọng,", "Hệ thống kiểm tra trực tuyến", "", "--",
    "Email tự động từ hệ thống kiểm tra, vui lòng không trả lời trực tiếp. Có thắc mắc về kết quả, hãy liên hệ quản lí trực tiếp hoặc quản trị viên phụ trách. Email chứa thông tin cá nhân, vui lòng không chuyển tiếp.");
  return L.join("\n");
}

module.exports = { build, model, esc };
