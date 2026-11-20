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

const TF = "'Be Vietnam Pro','Segoe UI',Arial,Helvetica,sans-serif";
// Mức xếp loại theo tỉ lệ đúng (cùng mốc màu với thẻ kết quả): >= 90 xuất sắc, 70-89 tốt, 60-69 khá, < 60 cần cố gắng
function tierOf(p) {
  return p >= 90 ? { k: "XUẤT SẮC", ic: "&#9733;", c: "#14A36B", soft: "#E4F7EE", ink: "#0E6B45", glow: "#3EE6A0" }
    : p >= 70 ? { k: "TỐT", ic: "&#9650;", c: "#2F7DE1", soft: "#E6F0FD", ink: "#1B4F94", glow: "#5CC8FF" }
    : p >= 60 ? { k: "KHÁ", ic: "&#9679;", c: "#E39A1B", soft: "#FFF3DD", ink: "#7A4B00", glow: "#FFD36B" }
    : { k: "CẦN CỐ GẮNG", ic: "&#9660;", c: "#D9483E", soft: "#FDE8E6", ink: "#8E2019", glow: "#FF9A8B" };
}
const firstName = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length ? p[p.length - 1] : "bạn"; };

// opts.card = true: email có đính kèm ảnh thẻ kết quả; opts.qrCid / opts.ringCid = mã cid của ảnh QR / vòng điểm đính kèm nội tuyến (không có thì tự bỏ / thay bằng chữ).
// Chỉ dùng bảng + kiểu nội tuyến. Nền chuyển màu và bo góc là "nâng cấp mềm": Outlook máy tính không hiểu thì tự rơi về màu phẳng, bố cục không vỡ.
function build(attempt, settings, advice, opts) {
  opts = opts || {};
  const cardNote = !!opts.card, qrCid = opts.qrCid ? String(opts.qrCid).replace(/[^\w.@-]/g, "") : "", ringCid = opts.ringCid ? String(opts.ringCid).replace(/[^\w.@-]/g, "") : "";
  const m = model(attempt, settings, advice), t = m.t, a = m.a, an = m.an;
  const compliance = attempt.compliancePoints;
  const pctN = Math.max(0, Math.min(100, Number(attempt.pct) || 0)), total = m.total || 0, score = attempt.score || 0;
  const tr = tierOf(pctN);
  const pre = attempt.pct + "% · " + attempt.score + "/" + m.total + " câu đúng" + (t.practice ? " · Bài thi thử, không phải thi chính thức" : "") + ". " + (a.headline || "Xem phân tích và lời khuyên của bạn.");
  const who = oneLine(attempt.name, 80) ? m.name : oneLine(attempt.code, 40);
  const stColor = t.practice ? "#E39A1B" : m.ps === false ? "#D9483E" : m.ps === true ? "#14A36B" : "#2F7DE1";
  const pad = (top, bottom, extra) => `class="pad" style="padding:${top}px 28px ${bottom}px;background:#ffffff;${extra || ""}"`;
  const GRAD = "background-color:#0B2B55;background-image:linear-gradient(135deg,#0B2B55 0%,#124A86 52%,#0E7C94 100%);";
  const sp = (h) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;background:#ffffff">&nbsp;</td></tr>`;
  const h2 = (txt, sub) => `<div style="font-family:${TF};font-size:17px;line-height:24px;font-weight:bold;color:#0F2F55;">${txt}${sub ? ` <span style="font-size:12px;font-weight:normal;color:#7A8CA0;">${sub}</span>` : ""}</div>`;

  // ---- HERO: nền chuyển màu + tiêu đề + vòng điểm + xếp loại
  const ringBlock = ringCid
    ? `<img src="cid:${ringCid}" width="260" height="260" alt="${esc(attempt.pct)}% · ${esc(score)}/${esc(total)} câu đúng" style="display:block;margin:0 auto;width:260px;height:260px;max-width:100%;border:0;">`
    : `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" style="padding:14px 38px;border:6px solid ${tr.glow};border-radius:140px;font-family:${TF};color:#ffffff;"><div style="font-size:11px;line-height:16px;letter-spacing:3px;font-weight:bold;color:#cfe3f5;">TỈ LỆ ĐÚNG</div><div style="font-size:64px;line-height:70px;font-weight:bold;color:#ffffff;">${esc(attempt.pct)}<span style="font-size:28px;color:${tr.glow};">%</span></div><div style="font-size:13px;line-height:19px;color:#dbe9f6;">${esc(score)} / ${esc(total)} câu đúng</div></td></tr></table>`;
  const chips = [oneLine(attempt.code, 40) ? "Mã NV " + oneLine(attempt.code, 40) : "", oneLine(attempt.manager, 80) ? "Quản lý: " + oneLine(attempt.manager, 80) : ""].filter(Boolean)
    .map((x) => `<span style="display:inline-block;margin:3px 3px 0;padding:5px 12px;background:#1A4C80;background:rgba(255,255,255,0.14);border-radius:99px;font-family:${TF};font-size:12px;line-height:17px;color:#e6f1fb;">${esc(x)}</span>`).join("");
  const hero =
    `<tr><td class="pad" bgcolor="#0B2B55" style="padding:26px 28px 30px;${GRAD}text-align:center;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="left" valign="middle" style="font-family:${TF};font-size:11px;line-height:16px;letter-spacing:2px;font-weight:bold;color:#9CCBEA;">KẾT QUẢ BÀI KIỂM TRA${t.chan ? " · KÊNH " + esc(String(t.chan).toUpperCase()) : ""}</td>` +
    `<td align="right" valign="middle" width="1" style="white-space:nowrap;"><span style="display:inline-block;padding:6px 12px;background:${stColor};border-radius:99px;font-family:${TF};font-size:11px;line-height:15px;font-weight:bold;letter-spacing:.5px;color:#ffffff;white-space:nowrap;">${esc(m.status)}</span></td></tr></table>` +
    `<div class="top-title" style="font-family:${TF};font-size:26px;line-height:34px;font-weight:bold;color:#ffffff;padding-top:16px;">${esc(t.main)}</div>` +
    `<div style="font-family:${TF};font-size:14px;line-height:22px;color:#cfe3f5;padding-top:6px;">Chào <b style="color:#ffffff;">${esc(firstName(who))}</b>, đây là kết quả bài làm của bạn</div>` +
    `<div style="padding-top:20px;">${ringBlock}</div>` +
    `<div style="padding-top:14px;"><span style="display:inline-block;padding:8px 20px;background:${tr.c};border-radius:99px;font-family:${TF};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1.5px;color:#ffffff;">${tr.ic}&nbsp; ${tr.k}</span></div>` +
    (a.headline ? `<div style="font-family:${TF};font-size:14px;line-height:22px;color:#e3effa;padding:14px 8px 0;">${esc(a.headline)}</div>` : "") +
    `<div style="padding-top:12px;">${chips}</div></td></tr>`;

  const practiceNote = t.practice
    ? `<tr><td ${pad(18, 0)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff6e2" style="background:#fff6e2;border:1px solid #ebcb84;border-radius:10px;"><tr><td style="padding:11px 15px;font-family:${TF};font-size:12.5px;line-height:19px;color:#6b4a00;"><b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> ` +
      (compliance != null ? "Điểm tuân thủ chỉ để bạn hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + `</td></tr></table></td></tr>`
    : "";

  // ---- Ba ô Đúng / Sai / Bỏ trống + thanh phân bổ
  const tile = (n, label, c, bg) => `<td class="tile3" width="33%" align="center" valign="top" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background:${bg};border-radius:12px;border-top:4px solid ${c};"><tr><td align="center" style="padding:13px 4px 12px;font-family:${TF};"><div style="font-size:30px;line-height:34px;font-weight:bold;color:${c};">${esc(n)}</div><div style="font-size:11px;line-height:16px;letter-spacing:1px;font-weight:bold;color:#5E7289;padding-top:2px;">${label}</div></td></tr></table></td>`;
  const segs = [[score, "#22B573"], [m.wrong, "#EE6B5E"], [m.blank, "#B7C4D1"]].filter((x) => x[0] > 0 && total > 0);
  const bar = segs.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:#E8EEF3;border-radius:99px;overflow:hidden;"><tr>` +
    segs.map((x) => `<td width="${Math.max(1, Math.round(x[0] / total * 100))}%" bgcolor="${x[1]}" height="10" style="height:10px;background:${x[1]};font-size:1px;line-height:1px;">&nbsp;</td>`).join("") + `</tr></table>` : "";
  const counts = `<tr><td ${pad(24, 6)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px;width:calc(100% + 8px);"><tr>${tile(score, "ĐÚNG", "#14A36B", "#EAF8F1")}${tile(m.wrong, "SAI", "#D9483E", "#FDEEEC")}${tile(m.blank, "BỎ TRỐNG", "#7F93A6", "#F0F4F8")}</tr></table>${bar}</td></tr>`;

  // ---- Điểm tuân thủ: thang 4 nấc (0 / 10 / 15 / 20) + thời gian + thời điểm nộp
  const steps = [0, 10, 15, 20], lowM = settings.complianceLowMin, hiPts = steps[steps.length - 1];
  let compBlock = "";
  if (compliance != null) {
    const reached = steps.map((s) => s <= compliance);
    compBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>` + steps.map((s, i) => {
      const on = s === compliance, done = s < compliance, col = on ? tr.c : done ? "#9FD9BE" : "#DCE5EC";
      return `<td width="25%" style="padding:0 2px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="8" bgcolor="${col}" style="height:8px;background:${col};border-radius:99px;font-size:1px;line-height:1px;">&nbsp;</td></tr><tr><td align="center" style="padding-top:5px;font-family:${TF};font-size:11px;line-height:15px;color:${on ? "#0F2F55" : "#8A9BAD"};font-weight:${on ? "bold" : "normal"};">${s}</td></tr></table></td>`;
    }).join("") + `</tr></table>`;
  }
  const whenD = m.when.split(" ")[1] || "", whenT = (m.when.split(" ")[0] || "").replace(/:\d{2}$/, "");
  const stat = (k, v, s, w) => `<td class="stat2" width="${w}%" valign="top" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F8FC" style="background:#F5F8FC;border:1px solid #E3EBF3;border-radius:12px;"><tr><td style="padding:13px 14px;font-family:${TF};"><div style="font-size:10.5px;line-height:15px;letter-spacing:1px;font-weight:bold;color:#7A8CA0;">${k}</div><div style="font-size:24px;line-height:30px;font-weight:bold;color:#0F2F55;padding-top:3px;">${v}</div>${s}</td></tr></table></td>`;
  const subTxt = (x) => `<div style="font-size:12px;line-height:18px;color:#6B7F94;padding-top:2px;">${x}</div>`;
  const cellsA = [];
  if (compliance != null) cellsA.push(stat(t.practice ? "TUÂN THỦ (NẾU THI THẬT)" : "ĐIỂM TUÂN THỦ", `${esc(compliance)}<span style="font-size:14px;color:#7A8CA0;font-weight:normal;"> / ${hiPts}</span>`, compBlock, 50));
  if (m.dur != null) cellsA.push(stat("THỜI GIAN LÀM BÀI", esc(clock(m.dur)), subTxt("phút : giây") + `<div style="font-size:12px;line-height:18px;color:#6B7F94;">Nộp lúc ${esc(whenT)} · ${esc(whenD)}</div>`, compliance != null ? 50 : 100));
  const stats = cellsA.length ? `<tr><td ${pad(10, 8)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px;width:calc(100% + 8px);"><tr>${cellsA.join("")}</tr></table></td></tr>` : "";

  // ---- Phân tích theo mảng kiến thức
  let cats = "", facts = "";
  if (an) {
    if (an.random != null) cats = `<div style="font-family:${TF};font-size:13px;line-height:1.7;color:#6B4A00;background:${C.amberBg};border:1px solid #F0DDB0;border-radius:12px;padding:11px 14px">Kết quả gần bằng mức chọn bừa (khoảng ${esc(an.random)}%) nên chưa phản ánh kiến thức theo từng mảng. Hãy làm lại nghiêm túc để có phân tích chính xác.</div>`;
    else if ((an.categories || []).length) cats = an.categories.map((c) => {
      const col = band(c.pct), bgc = c.pct >= 80 ? "#E4F7EE" : c.pct >= 60 ? "#FFF3DD" : "#FDE8E6";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="font-family:${TF};font-size:14px;line-height:20px;font-weight:bold;color:#0F2F55;">${esc(oneLine(c.name, 60))}</td>` +
        `<td align="right" width="120" style="width:120px;white-space:nowrap;font-family:${TF};font-size:12.5px;color:#6B7F94;"><span style="color:#0F2F55;font-weight:bold;">${esc(c.ok)}/${esc(c.n)}</span>&nbsp; <span style="display:inline-block;padding:2px 9px;background:${bgc};border-radius:99px;font-weight:bold;color:${col};">${esc(c.pct)}%</span></td></tr>` +
        `<tr><td colspan="2" style="padding-top:7px;">${oneBar(c.pct, col, 10)}</td></tr></table>`;
    }).join("") + `<div style="font-family:${TF};font-size:11.5px;color:#7A8CA0;"><span style="color:${C.ok}">&#9679;</span> từ 80% &nbsp; <span style="color:${C.warn}">&#9679;</span> 60 đến 79% &nbsp; <span style="color:${C.bad}">&#9679;</span> dưới 60% &nbsp;·&nbsp; mảng yếu nhất ở trên</div>`;
    const f = [];
    if (an.avgSec != null && an.limitSec) f.push({ ic: "&#9201;", k: "Tốc độ trung bình", v: an.avgSec + "s/câu", s: "Giới hạn " + an.limitSec + "s mỗi câu" });
    if (an.timeouts > 0) f.push({ ic: "&#9888;", k: "Câu hết giờ", v: an.timeouts + " câu", s: "chưa kịp trả lời", c: C.bad });
    if (an.prev && an.prev.pct != null) { const d = (an.pct || 0) - an.prev.pct; f.push({ ic: d > 0 ? "&#8599;" : d < 0 ? "&#8600;" : "&#8594;", k: "So với kỳ trước", v: (d > 0 ? "+" : "") + d + " điểm %", c: d >= 5 ? C.ok : d <= -5 ? C.bad : "#0F2F55", s: (an.prev.period ? "Kỳ " + an.prev.period + ": " : "Trước đó: ") + an.prev.pct + "%" }); }
    if (an.nextBand && an.total) f.push({ ic: "&#127919;", k: "Mốc tuân thủ kế tiếp", v: an.nextBand.points + " điểm", s: "Cần đúng " + an.nextBand.needCorrect + "/" + an.total + " câu (thiếu " + an.nextBand.gap + ")" });
    const cell = (x) => `<td class="fact" width="50%" valign="top" style="padding:4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #E3EBF3;border-radius:12px;"><tr><td style="padding:11px 13px;font-family:${TF};"><div style="font-size:11.5px;line-height:16px;color:#7A8CA0;">${x.ic}&nbsp; ${esc(x.k)}</div><div style="font-size:19px;line-height:26px;font-weight:bold;color:${x.c || "#0F2F55"};padding-top:2px;">${esc(x.v)}</div><div style="font-size:11.5px;line-height:16px;color:#7A8CA0;">${esc(x.s)}</div></td></tr></table></td>`;
    const rows = []; for (let i = 0; i < f.length; i += 2) rows.push(`<tr>${cell(f[i])}${f[i + 1] ? cell(f[i + 1]) : '<td class="fact" width="50%" style="padding:4px;">&nbsp;</td>'}</tr>`);
    facts = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${cats ? "12px" : "0"} -4px 0;width:calc(100% + 8px);">${rows.join("")}</table>` : "";
  }
  const analysis = (cats || facts)
    ? `<tr><td ${pad(14, 8)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F8FC" style="background:#F5F8FC;border:1px solid #E3EBF3;border-radius:14px;"><tr><td style="padding:18px 18px 16px;font-family:${TF};">${h2("Phân tích kết quả")}<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>${cats}${facts}</td></tr></table></td></tr>`
    : "";

  // ---- Nhận xét AI + điểm mạnh / cần củng cố
  const portrait = a.portrait || a.summary || "";
  const overview = portrait
    ? `<tr><td ${pad(10, 8)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F6FD" style="background:#F1F6FD;border-radius:14px;border-left:5px solid #3B82F6;"><tr><td style="padding:17px 18px;font-family:${TF};">` +
      `<div style="font-size:12px;line-height:17px;letter-spacing:1.5px;font-weight:bold;color:#2F6FD0;">&#10024;&nbsp; ${a.source === "ai" ? "NHẬN XÉT TỪ AI" : "NHẬN XÉT DÀNH CHO BẠN"}</div>` +
      `<div style="font-size:14px;line-height:23px;color:#34506E;padding-top:7px;">${esc(portrait)}</div></td></tr></table></td></tr>`
    : "";
  const items = (arr, mark, mc) => arr.map((x) => `<div style="padding:0 0 5px 18px;text-indent:-18px;"><b style="color:${mc};">${mark}</b>&nbsp; ${esc(x)}</div>`).join("");
  const box = (bg, ln, hc, tc, title, body) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background:${bg};border:1px solid ${ln};border-radius:14px;"><tr><td style="padding:15px 16px;font-family:${TF};"><div style="font-size:12px;line-height:17px;letter-spacing:1.2px;font-weight:bold;color:${hc};">${title}</div><div style="font-size:13px;line-height:21px;color:${tc};padding-top:8px;">${body}</div></td></tr></table>`;
  const bS = (a.strengths || []).length ? box("#EEF9F3", "#CDEBDC", "#14804F", "#31574A", "&#128170;&nbsp; ĐIỂM MẠNH", items(a.strengths, "&#10003;", "#14A36B")) : "";
  const bT = (a.topics || []).length ? box("#FFF8EC", "#F4DDB0", "#A0640A", "#6A5434", "&#128218;&nbsp; CẦN CỦNG CỐ", items(a.topics, "&#9656;", "#E39A1B")) : "";
  const two = bS && bT
    ? `<tr><td ${pad(10, 8)}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="ai-two" width="50%" valign="top" style="padding-right:6px;">${bS}</td><td class="ai-two" width="50%" valign="top" style="padding-left:6px;">${bT}</td></tr></table></td></tr>`
    : (bS || bT ? `<tr><td ${pad(10, 8)}>${bS || bT}</td></tr>` : "");

  // ---- Gợi ý hành động: các bước có số + mục tiêu lần tới
  const stepsHtml = (a.actions || []).map((x, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 9px;"><tr><td width="34" valign="top" style="width:34px;padding-top:1px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" bgcolor="#0F4C81" style="width:26px;height:26px;background:#0F4C81;border-radius:99px;font-family:${TF};font-size:13px;line-height:26px;font-weight:bold;color:#ffffff;">${i + 1}</td></tr></table></td><td valign="top" style="font-family:${TF};font-size:13.5px;line-height:22px;color:#3F5873;">${esc(x)}</td></tr></table>`).join("");
  const goalHtml = a.goal ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF6E2" style="background:#FFF6E2;border:1px solid #F0DDB0;border-radius:12px;margin-top:6px;"><tr><td style="padding:12px 15px;font-family:${TF};font-size:13.5px;line-height:21px;color:#6B4A00;"><b>&#127919;&nbsp; Mục tiêu lần tới.</b> ${esc(String(a.goal).replace(/^Lần tới:\s*/i, ""))}</td></tr></table>` : "";
  const next = (stepsHtml || goalHtml)
    ? `<tr><td ${pad(14, 22)}>${h2("Gợi ý hành động tiếp theo")}<div style="padding-top:12px;">${stepsHtml}${goalHtml}</div></td></tr>`
    : "";

  // ---- CTA + xác thực + QR + hỗ trợ
  const cta = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr><td bgcolor="#0F4C81" style="background:#0F4C81;background-image:linear-gradient(135deg,#0F4C81,#0E7C94);border-radius:99px;"><a href="${esc(m.url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${TF};font-size:14px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">Xem kết quả chi tiết &nbsp;&#8594;</a></td></tr></table>`;
  const verify =
    `<tr><td class="pad" style="padding:20px 28px 20px;background:#F6F9FC;border-top:1px solid #E3EBF3;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:12px;font-family:${TF};"><div style="font-size:12.5px;line-height:19px;font-weight:bold;color:#14804F;">&#10003; Đã xác thực bởi hệ thống lúc ${esc(vn(Date.now()))}</div>` +
    `<div style="font-size:11.5px;line-height:17px;color:#6B7F94;padding-top:4px;">Mã minh chứng: <b style="color:#0F2F55;">${esc(m.proof)}</b>${a.source === "ai" ? " · Nhận xét AI được tổng hợp từ dữ liệu bài kiểm tra." : ""}${cardNote ? " Thẻ kết quả (ảnh PNG) được đính kèm theo email này." : ""}</div>${cta}</td>` +
    (qrCid ? `<td width="96" align="center" valign="middle" style="font-family:${TF};"><a href="${esc(m.url)}" target="_blank"><img class="footer-qr" src="cid:${qrCid}" width="84" height="84" alt="QR xem kết quả" style="display:block;margin:0 auto;width:84px;height:84px;border:1px solid #D5E0EA;border-radius:10px;"></a><div style="font-size:10.5px;line-height:15px;color:#6B7F94;padding-top:5px;">Quét QR xem bản gốc</div></td>` : "") +
    `</tr></table><div style="font-family:${TF};font-size:12.5px;line-height:19px;color:#4F6882;border-top:1px solid #E3EBF3;margin-top:16px;padding-top:12px;">${esc(supportLine(attempt.manager))}</div></td></tr>` +
    `<tr><td align="center" bgcolor="#0B2B55" style="padding:14px 18px;${GRAD}font-family:${TF};color:#B9D3E8;font-size:10.5px;line-height:16px;">Email tự động từ hệ thống kiểm tra · Vui lòng không trả lời email này.<br>Email chứa thông tin cá nhân của bạn, vui lòng không chuyển tiếp cho người khác.</td></tr>`;

  const css =
    "body{margin:0!important;padding:0!important;background:#EAF0F6;-webkit-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;-ms-interpolation-mode:bicubic}a{color:#0F4C81}" +
    ".shell{width:100%;max-width:640px}.pad{padding-left:28px;padding-right:28px}" +
    "@media screen and (max-width:600px){.outer{padding:0!important}.shell{width:100%!important;max-width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important}.pad{padding-left:16px!important;padding-right:16px!important}" +
    ".top-title{font-size:22px!important;line-height:29px!important}.stat2,.fact{display:block!important;width:100%!important;padding:0 0 8px!important}.tile3 .num{font-size:26px!important}" +
    ".ai-two{display:block!important;width:100%!important;padding:0 0 9px!important}.footer-qr{width:78px!important}}";

  const html =
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.subject)}</title><style>${css}</style></head>` +
    `<body style="margin:0;padding:0;background:#EAF0F6;font-family:${TF};color:#17324f;-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#EAF0F6">${esc(pre)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAF0F6" style="width:100%;background:#EAF0F6;"><tr><td align="center" class="outer" style="padding:24px 10px;">` +
    `<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="shell" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #DCE6F0;border-radius:22px;border-collapse:separate;overflow:hidden;text-align:left;">` +
    hero + practiceNote + counts + stats + analysis + overview + two + next + verify +
    `</table></td></tr></table></body></html>`;

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
    // Bảng có bo góc + viền: phải để border-collapse:separate thì góc bo mới hiện (CSS chung đang đặt collapse)
    if (tag === "table" && /border-radius\s*:/.test(attrs) && !/border-collapse\s*:/.test(attrs)) add += "border-collapse:separate;";
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
