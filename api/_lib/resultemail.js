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
  let intro;
  const when = vn(attempt.submittedAt), whenShort = when.replace(/^(\d{2}:\d{2}):\d{2}\s*/, "$1 · ");
  // Xưng hô trong lời chào: "Anh Cường" / "Chị Hoa" (chỉ Anh hoặc Chị); không đủ căn cứ thì gọi thẳng tên, không dùng "Anh/Chị"
  const given = oneLine(attempt.name, 80) ? name.split(/\s+/).pop() : "", hon = given ? require("./honorific").honorific(attempt.name, true) : "";
  const greet = given ? (hon ? hon + " " : "") + given : oneLine(attempt.code, 40) || "bạn";
  // Đại từ dùng xuyên suốt thư: đã gọi "Chị Oanh" thì các câu sau là "chị" (không đổi sang "bạn"); không rõ thì dùng "bạn"
  const me = given && hon ? hon.toLocaleLowerCase("vi-VN") : "bạn", Me = me.charAt(0).toLocaleUpperCase("vi-VN") + me.slice(1);
  intro = "Bài làm của " + me + " đã được ghi nhận. Dưới đây là kết quả và một vài gợi ý để lần sau làm tốt hơn.";
  return { t, ps, a, an, total, wrong, blank, dur, name, greet, me, Me, status, color, subject, intro, when, whenShort, url: verifyLink(attempt), proof: quiz.proofCode(attempt.id) };
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
// Lời khuyên (advice.js) viết sẵn với "bạn": đổi theo cách xưng hô của thư, giữ nguyên "bạn bè"
const pron = (txt, m) => String(txt == null ? "" : txt).replace(/(?<![\p{L}])([Bb])ạn(?![\p{L}])(?! bè)/gu, (x, c) => (c === "B" ? m.Me : m.me));
// Hai dòng nhận xét theo kết quả đạt / chưa đạt (dùng cho cả thư tĩnh và ảnh kết quả "sống" của resultart.js)
function leads(m, pass) {
  const lead1 = m.ps === false ? "Kết quả chưa đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + "." : m.ps === true ? "Chúc mừng " + m.me + " đã đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + "." : "";
  const lead2 = m.ps === false ? m.Me + " nên ôn lại học liệu rồi làm lại." : m.ps === true ? "Hãy tiếp tục phát huy!" : "";
  return { lead1, lead2 };
}
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
  const BL = "#1F66E0", NV = "#14357A", GR = "#4A5B7D";
  const td = (style, inner, attrs) => "<td" + (attrs ? " " + attrs : "") + ' style="font-family:' + TF + ";" + style + '">' + inner + "</td>";
  const T = (inner, attrs, style) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (attrs ? " " + attrs : "") + (style ? ' style="' + style + '"' : "") + ">" + inner + "</table>";
  const row = (inner, cls, style) => '<tr><td class="' + (cls || "pad") + '" style="padding:0 28px;' + (style || "") + '">' + inner + "</td></tr>";
  const gap = (h) => '<tr><td style="height:' + h + "px;line-height:" + h + 'px;font-size:0;">&nbsp;</td></tr>';

  // ---- 1. Đầu thư: logo + tên hệ thống (hai dòng)
  const brand = row(T("<tr>" + (art.logo ? td("padding:0 12px 0 0;", img("logo", 56, 50, "")) : "") +
    td("font-size:15px;line-height:20px;font-weight:bold;color:" + NV + ";text-align:left;", "Hệ thống kiểm tra<br>đánh giá trực tuyến") + "</tr>", 'align="center"', "margin:0 auto;"), "pad", "padding-top:24px;text-align:center;");

  // ---- 2. Lời chào + gạch nhấn
  const hello = row('<div style="font-family:' + TF + ";font-size:19px;line-height:26px;font-weight:800;color:" + NV + ';">Xin chào ' + esc(m.greet) + ",</div>" +
    '<div style="font-family:' + TF + ";font-size:15px;line-height:22px;color:" + GR + ';padding-top:4px;">Đây là kết quả bài kiểm tra của ' + m.me + '.</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td width="46" height="4" bgcolor="' + BL + '" style="width:46px;height:4px;line-height:4px;font-size:0;background:' + BL + ';border-radius:3px;">&nbsp;</td></tr></table>', "pad", "padding-top:26px;padding-bottom:20px;");

  // ---- 3. Thẻ kết quả: dải xanh có tên đề | huy hiệu + vạch | điểm + nhãn | hàng giờ giấc
  const sp = t.practice ? { bg: "#FFF1D6", fg: "#8A5200", mark: "!", mbg: "#D68F1E" } : m.ps === false ? { bg: "#FDE8E8", fg: "#D32F2F", mark: "&#10005;", mbg: "#E53935" } : m.ps === true ? { bg: "#E3F5EA", fg: "#17794A", mark: "&#10003;", mbg: "#18A957" } : { bg: "#E8F0FE", fg: BL, mark: "&#10003;", mbg: BL };
  const statusPill = T("<tr>" + td("background:" + sp.bg + ";border-radius:12px;padding:8px 16px 8px 10px;white-space:nowrap;",
    '<span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:' + sp.mbg + ';color:#ffffff;font-size:13px;font-weight:bold;text-align:center;vertical-align:middle;margin-right:9px;">' + sp.mark + "</span>" +
    '<span style="font-size:15px;line-height:22px;font-weight:800;color:' + sp.fg + ';vertical-align:middle;">' + esc(m.status) + "</span>", 'bgcolor="' + sp.bg + '"') + "</tr>");
  const band = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1F66E0" style="background:#1F66E0;background-image:linear-gradient(135deg,#1B5FD9 0%,#3B8CF6 100%);"><tr>' +
    '<td align="center" style="padding:15px 16px;font-family:' + TF + ';text-align:center;"><div class="band-title" style="font-size:17px;line-height:23px;font-weight:800;color:#ffffff;">' + esc(t.main) + "</div></td></tr></table>";
  const useBadge = !t.practice && [0, 10, 15, 20].indexOf(compliance) >= 0 && !!art.hero;
  const visual = useBadge ? img("hero", 184, 141, "Điểm tuân thủ " + compliance, "margin:0 auto;")
    : art.ring ? img("ring", 120, 120, attempt.pct + "% tỉ lệ trả lời đúng", "margin:0 auto;")
    : '<div style="font-family:' + TF + ";font-size:38px;line-height:44px;font-weight:800;color:" + BL + ';">' + esc(attempt.pct) + "%</div>";
  const body = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td class="vis" width="44%" align="center" valign="middle" style="width:44%;padding:18px 6px 18px 12px;border-right:1px solid #D7E4F8;">' + visual + "</td>" +
    '<td valign="middle" style="padding:18px 14px 18px 20px;font-family:' + TF + ';">' +
    '<div style="white-space:nowrap;"><span class="big-score" style="font-size:42px;line-height:48px;font-weight:800;color:' + BL + ';">' + esc(score) + "/" + esc(total) + '</span><span style="font-size:16px;font-weight:700;color:' + NV + ';"> câu đúng</span></div>' +
    '<div style="font-size:15px;line-height:22px;color:' + GR + ';padding-top:2px;">Tỉ lệ đúng: <b style="color:' + BL + ';">' + esc(attempt.pct) + "%</b></div>" +
    '<div style="padding-top:12px;">' + statusPill + "</div></td></tr></table>";
  const leaves = Math.max(0, Math.round(Number(attempt.flags && attempt.flags.blur) || 0));
  const tm = m.when.split(" "), tmT = (tm[0] || "").replace(/:\d{2}$/, ""), tmD = tm[1] || "";
  const ic = (k, w) => (art[k] ? '<td width="' + (w + 8) + '" valign="middle" style="width:' + (w + 8) + 'px;padding-right:8px;">' + img(k, w, w, "") + "</td>" : "");
  const cell = (k, inner, last) => '<td valign="middle" align="center" style="padding:11px 8px;' + (last ? "" : "border-right:1px solid #D7E4F8;") + 'font-family:' + TF + ';">' + T("<tr>" + ic(k, 22) + td("font-size:14px;line-height:20px;color:" + GR + ";white-space:nowrap;", inner, 'valign="middle"') + "</tr>", 'align="center"') + "</td>";
  const times = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 14px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F0F6FF" style="background:#F0F6FF;border-radius:14px;border-collapse:separate;"><tr>' +
    (m.dur != null ? cell("ic-clock", "Làm bài trong: <b style=\"color:" + BL + '">' + esc(clock(m.dur)) + "</b>", false) : "") +
    cell("ic-cal", "Nộp lúc: <b style=\"color:" + BL + '">' + esc(tmT) + "</b> <b style=\"color:" + NV + '">- ' + esc(tmD) + "</b>", true) + "</tr>" +
    '<tr><td colspan="2" align="center" style="padding:9px 10px 11px;border-top:1px solid #D7E4F8;font-family:' + TF + ';font-size:14px;line-height:20px;color:' + GR + ';">Số lần thoát khỏi màn hình khi làm bài: <b style="color:' + (leaves >= 3 ? "#B45309" : BL) + ';">' + leaves + ' lần</b></td></tr></table></td></tr></table>';
  const resultCard = row(T("<tr>" + td("padding:0;", band + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;"><tr><td>' + body + times + "</td></tr></table>") + "</tr>",
    'width="100%" bgcolor="#FFFFFF"', "background:#FFFFFF;border:1px solid #DCE8FA;border-radius:20px;border-collapse:separate;overflow:hidden;box-shadow:0 10px 28px rgba(31,102,224,.13);"));

  // Thẻ kết quả "sống" (api/result-img): ảnh vẽ lại từ dữ liệu mới nhất mỗi lần mở thư; alt là bản chụp lúc gửi. Không có opts.live thì dùng thẻ tĩnh như cũ.
  const liveRow = opts.live ? row('<img src="' + esc(opts.live) + '" width="504" alt="' + esc(t.main + ": " + score + "/" + total + " câu đúng (" + attempt.pct + "%) · " + m.status) + '" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:20px;">') : "";
  const practiceNote = t.practice
    ? gap(14) + row('<div style="font-family:' + TF + ';font-size:13px;line-height:19px;color:#6b4a00;"><b>Bài thi thử, không phải kỳ kiểm tra chính thức.</b> ' +
        (compliance != null ? "Điểm tuân thủ chỉ để " + m.me + " hình dung nếu thi thật, không được ghi nhận." : "Kết quả không được ghi nhận chính thức.") + "</div>")
    : "";

  // ---- 4. Hộp gợi ý (sách) + "Nên làm" (bóng đèn)
  const act = (a.actions || [])[0];
  const { lead1, lead2 } = leads(m, pass);
  const tipBox = lead1 ? gap(16) + row(T("<tr>" + (art["ic-book"] ? '<td class="bk" width="72" align="center" valign="middle" style="width:72px;padding:14px 0;border-right:1px solid #C9DAF5;">' + img("ic-book", 42, 42, "", "margin:0 auto;") + "</td>" : "") +
      td("padding:14px 18px;", '<div style="font-size:16px;line-height:23px;font-weight:800;color:' + NV + ';">' + esc(lead1) + '</div><div style="font-size:15px;line-height:22px;color:' + GR + ';">' + esc(lead2) + "</div>", 'valign="middle"') + "</tr>",
      'width="100%" bgcolor="#EAF2FF"', "background:#EAF2FF;border:1px solid #D6E5FA;border-radius:16px;border-collapse:separate;")) : "";
  const doBox = m.ps === false && act ? gap(12) + row(T("<tr>" + (art["ic-bulb"] ? '<td width="52" valign="top" style="width:52px;padding:0 10px 0 0;">' + img("ic-bulb", 42, 42, "") + "</td>" : "") +
      td("font-size:15px;line-height:22px;color:" + GR + ";", "<b style=\"color:" + NV + '">Nên làm:</b> ' + esc(pron(act, m)), 'valign="middle"') + "</tr>", 'width="100%"')) : "";

  // ---- 5. Một nút
  const ctaFail = m.ps !== true;
  const cta = gap(22) + '<tr><td align="center" class="pad" style="padding:0 28px;">' +
    T("<tr>" + '<td align="center" bgcolor="#1F66E0" style="background:#1F66E0;background-image:linear-gradient(90deg,#2F8CF8,#1B57C9);border-radius:32px;box-shadow:0 8px 18px rgba(31,102,224,.32);">' +
      '<a href="' + esc(ctaFail ? studyUrl : m.url) + '" target="_blank" style="display:block;padding:16px 44px;font-family:' + TF + ';font-size:17px;line-height:24px;font-weight:bold;color:#ffffff;text-decoration:none;white-space:nowrap;">' +
      (ctaFail ? "Xem học liệu ôn tập" : "Xem kết quả chi tiết") + " &nbsp;&#8594;</a></td></tr>", 'class="cta" align="center"', "margin:0 auto;") + "</td></tr>";

  // ---- 6. Chân thư rất nhỏ + hình minh hoạ
  const foot = gap(22) + '<tr><td class="pad" align="center" style="padding:0 28px;font-family:' + TF + ';font-size:13px;line-height:19px;color:#6B7C9A;text-align:center;">' +
    '<div><span style="color:#1E7A4C;font-weight:bold;">&#10003; Đã xác thực</span>' + (oneLine(attempt.code, 40) ? " &nbsp;·&nbsp; Mã NV " + esc(oneLine(attempt.code, 40)) : "") + " &nbsp;·&nbsp; Mã minh chứng " + esc(m.proof) + ' &nbsp;·&nbsp; <a href="' + esc(m.url) + '" target="_blank" style="color:' + BL + ';text-decoration:none;font-weight:600;">Xem bản gốc</a></div>' +
    (cardNote ? '<div>Thẻ kết quả (ảnh PNG) được đính kèm.</div>' : "") +
    '<div style="padding-top:4px;">' + esc(supportLine(attempt.manager)) + "</div>" +
    '<div style="padding-top:4px;">Email tự động, vui lòng không trả lời hoặc chuyển tiếp.</div></td></tr>' +
    (art.deco ? '<tr><td style="padding:0;line-height:0;font-size:0;">' + img("deco", 560, 166, "", "width:100%;height:auto;") + "</td></tr>" : gap(20));

  const css =
    "body{margin:0!important;padding:0!important;background:#EEF4FD;-webkit-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;-ms-interpolation-mode:bicubic}a{color:" + BL + "}" +
    ".shell{width:100%;max-width:560px}" +
    "@media screen and (max-width:600px){.outer{padding:0!important}.shell{border-radius:0!important}.pad{padding-left:18px!important;padding-right:18px!important}.big-score{font-size:36px!important;line-height:42px!important}.band-title{font-size:16px!important;line-height:22px!important}.vis{padding-left:4px!important}}";

  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc(m.subject) + "</title><style>" + css + "</style></head>" +
    '<body style="margin:0;padding:0;background:#EEF4FD;font-family:' + TF + ";color:" + K.ink + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#EEF4FD">' + esc(pre) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF4FD" style="width:100%;background:#EEF4FD;"><tr><td align="center" class="outer" style="padding:18px 10px;">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="shell" align="center" bgcolor="#FFFFFF" style="margin:0 auto;width:100%;max-width:560px;background:#FFFFFF;background-image:linear-gradient(180deg,#FFFFFF 0%,#F2F8FF 100%);border-radius:22px;border-collapse:separate;overflow:hidden;text-align:left;">' +
    brand + hello + (liveRow || resultCard) + practiceNote + (liveRow ? "" : tipBox) + doBox + cta + foot +
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
  L.push("Xin chào " + m.greet + ",", "", "Đây là kết quả bài kiểm tra của " + m.me + ".", "");
  L.push(t.main + (t.chan ? " · Kênh " + t.chan : "") + (t.practice ? "  [THI THỬ - KHÔNG PHẢI THI CHÍNH THỨC]" : ""));
  L.push("- Kết quả: " + (m.ps === null ? "ĐÃ HOÀN THÀNH" : m.ps ? "ĐẠT" : "CHƯA ĐẠT") + " · " + (attempt.score || 0) + "/" + m.total + " câu đúng (" + attempt.pct + "%)");
  if (compliance != null) L.push("- " + (t.practice ? "Điểm tuân thủ (nếu thi thật): " : "Điểm tuân thủ: ") + compliance + " điểm");
  L.push("- " + (m.dur != null ? "Làm bài trong " + clock(m.dur) + " · " : "") + "Nộp lúc " + m.whenShort);
  L.push("- Số lần thoát khỏi màn hình khi làm bài: " + Math.max(0, Math.round(Number(attempt.flags && attempt.flags.blur) || 0)) + " lần");
  if (m.ps === false) { L.push("", "Kết quả chưa đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". " + m.Me + " nên ôn lại học liệu rồi làm lại."); if ((a.actions || [])[0]) L.push("Nên làm: " + pron(a.actions[0], m)); }
  else if (m.ps === true) L.push("", "Chúc mừng " + m.me + " đã đạt yêu cầu" + (pass ? " (" + pass + "%)" : "") + ". Hãy tiếp tục phát huy!");
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

module.exports = { build, model, esc, artSpec, leads, clock };
