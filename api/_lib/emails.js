// Soạn nội dung email và quyết định email nào đến hạn gửi (chỉ dựa trên bản tóm tắt "digest" do ứng dụng gửi lên).
const { cfg } = require("./config");
const { unsubToken } = require("./session");

// Chuỗi từ dữ liệu do ứng dụng gửi lên: bỏ xuống dòng và cắt độ dài (tránh chèn tiêu đề thư, tiêu đề quá dài)
const clean = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").slice(0, 200);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (x, d) => Number(x || 0).toLocaleString("vi-VN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const mins = (s) => { const p = String(s || "").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); };
const dm = (d) => d.slice(8) + "/" + d.slice(5, 7);

// Giờ Việt Nam (UTC+7, không đổi giờ mùa hè)
function vnParts(now) {
  const v = new Date(now.getTime() + 7 * 3600000);
  return { date: v.toISOString().slice(0, 10), hm: v.getUTCHours() * 60 + v.getUTCMinutes(), dow: v.getUTCDay() };
}
function shift(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
}

const TAGS = {
  info: { label: "THAM KHẢO", bg: "#DDF4F1", fg: "#007A73", accent: "#02A79E" },
  warn: { label: "CẢNH BÁO", bg: "#FBE3DF", fg: "#C0352B", accent: "#D64535" },
  remind: { label: "NHẮC VIỆC", bg: "#FFF0CF", fg: "#9A6200", accent: "#E3A63B" }
};
const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function layout(o) {
  const t = TAGS[o.tone] || TAGS.info;
  const app = cfg().appUrl || "";
  const n = (o.tiles || []).length;
  const tiles = n
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin:6px 0 4px"><tr>' +
      o.tiles.map((x) =>
        '<td class="tile" valign="top" style="width:' + Math.floor(100 / n) + '%;padding:0 ' + (n > 1 ? "4px" : "0") + '">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#F4FAF9;border:1px solid #D5EAE7;border-radius:12px"><tr><td style="padding:14px 14px 12px">' +
        '<div style="font-size:24px;line-height:1.15;font-weight:700;color:#06302D;letter-spacing:-.01em">' + esc(x.n) + "</div>" +
        '<div style="margin-top:4px;font-size:12px;line-height:1.4;color:#5B7471">' + esc(x.l) + "</div></td></tr></table></td>").join("") +
      "</tr></table>"
    : "";
  const secs = (o.sections || []).map((s) => {
    const c = s.warn ? "#C0352B" : o.tone === "remind" ? "#E3A63B" : "#02A79E";
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr>' +
      '<td width="4" style="width:4px;background:' + c + ';border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' +
      '<td style="padding:2px 0 2px 14px">' +
      '<div style="font-size:15px;font-weight:700;line-height:1.35;color:' + (s.warn ? "#C0352B" : "#06302D") + '">' + esc(s.h) + "</div>" +
      '<ul style="margin:8px 0 0;padding-left:18px;color:#2B4543;font-size:14px;line-height:1.6">' +
      s.lines.map((l) => '<li style="margin:0 0 4px">' + esc(l) + "</li>").join("") + "</ul></td></tr></table>";
  }).join("");
  const code = o.code
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td align="center" style="background:#F4FAF9;border:1.5px dashed #9ED6CF;border-radius:14px;padding:20px 12px">' +
      '<div style="font-size:12px;color:#5B7471;letter-spacing:.08em;font-weight:600;margin-bottom:6px">MÃ XÁC MINH</div>' +
      '<div style="font-family:Consolas,\'SF Mono\',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#067A8C;padding-left:10px">' + esc(o.code) + "</div></td></tr></table>"
    : "";
  const cta = o.cta
    ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td align="center" bgcolor="#067A8C" style="border-radius:12px;background:linear-gradient(135deg,#02A79E,#067A8C)">' +
      '<a href="' + esc(o.ctaUrl) + '" target="_blank" style="display:inline-block;padding:13px 28px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">' + esc(o.cta) + "</a></td></tr></table>" +
      '<div style="margin-top:10px;font-size:11.5px;line-height:1.5;color:#7A8E8B;word-break:break-all">Nếu nút không bấm được, sao chép liên kết này vào trình duyệt:<br><a href="' + esc(o.ctaUrl) + '" style="color:#067A8C;text-decoration:underline">' + esc(o.ctaUrl) + "</a></div>"
    : "";
  const foot = o.footer ? esc(o.footer) : o.unsub
    ? "Email tự động, số liệu chỉ mang tính tham khảo, tính từ các số bạn tự nhập; không phải cam kết hay chỉ tiêu chính thức.<br>" +
      '<a href="' + esc(o.unsub) + '" style="color:#067A8C;text-decoration:underline">Tắt email tự động</a> &nbsp;·&nbsp; hoặc vào Thiết lập › Tài khoản &amp; email trong ứng dụng.'
    : "Email bảo mật: không chia sẻ nội dung này cho người khác. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.";
  const html =
    '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    "<style>@media only screen and (max-width:520px){.wrap{padding:12px 8px!important}.pad{padding:22px 18px!important}.fpad{padding-left:18px!important;padding-right:18px!important}.hpad{padding:18px!important}.tile{display:block!important;width:100%!important;padding:0 0 8px!important}.h1{font-size:20px!important}}</style></head>" +
    '<body style="margin:0;padding:0;background:#EEF3F5">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#EEF3F5">' + esc(o.title) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F5"><tr><td class="wrap" align="center" style="padding:28px 16px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #DCE5E9;border-radius:18px;border-collapse:separate;overflow:hidden;font-family:' + FONT + '">' +
    '<tr><td class="hpad" bgcolor="#067A8C" style="background:#067A8C;background:linear-gradient(135deg,#02A79E 0%,#067A8C 100%);padding:22px 28px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td valign="middle" style="padding-right:12px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="#ffffff" style="width:40px;height:40px;background:#ffffff;border-radius:11px;font-family:' + FONT + ';font-size:22px;font-weight:800;color:#067A8C;line-height:40px">L</td></tr></table></td>' +
    '<td valign="middle"><div style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.01em;line-height:1.2">Livotec</div>' +
    '<div style="font-size:12.5px;color:#D3F1EE;line-height:1.35;margin-top:2px">Trợ lí thiết lập kế hoạch bán hàng · Kênh GT</div></td></tr></table></td></tr>' +
    '<tr><td class="pad" style="padding:28px 30px 26px;color:#06302D">' +
    '<span style="display:inline-block;background:' + t.bg + ";color:" + t.fg + ';font-size:11px;font-weight:700;padding:4px 11px;border-radius:999px;letter-spacing:.07em">' + t.label + "</span>" +
    '<h1 class="h1" style="font-size:23px;line-height:1.3;margin:12px 0 16px;color:#06302D;font-weight:700;letter-spacing:-.01em">' + esc(o.title) + "</h1>" +
    tiles + code + secs + cta +
    "</td></tr>" +
    '<tr><td class="fpad" style="background:#F6F9FA;border-top:1px solid #E3EBEE;padding:16px 30px 20px;font-size:12px;line-height:1.6;color:#6A7C80">' + foot +
    '<div style="margin-top:10px;font-size:11.5px;color:#9AABAF">© Livotec · Trợ lí thiết lập kế hoạch bán hàng kênh GT</div></td></tr>' +
    "</table></td></tr></table></body></html>";
  const text = [
    "[" + t.label + "] " + o.title, "",
    o.code ? "Mã: " + o.code : "",
    (o.tiles || []).map((x) => x.n + " — " + x.l).join("\n"),
    (o.sections || []).map((s) => "\n" + s.h + "\n" + s.lines.map((l) => "- " + l).join("\n")).join("\n"),
    o.cta ? "\n" + o.cta + ": " + o.ctaUrl : "",
    o.footer ? "\n—\n" + o.footer : o.unsub ? "\n—\nEmail tự động, chỉ mang tính tham khảo. Tắt email: " + o.unsub : "\n—\nEmail bảo mật, không chia sẻ liên kết này cho người khác."
  ].filter((x) => x !== "").join("\n");
  return { html, text };
}

function unsubUrl(uid) {
  return cfg().appUrl + "/api/mail/unsub?t=" + encodeURIComponent(unsubToken(uid));
}

// Trả về { emails:[{key,subject,html,text,patch}] }
function dueEmails(doc, now) {
  const P = doc.prefs || {}, M = P.mail || {};
  if (!M.on) return { emails: [] };
  const T = Object.assign({ m: "08:00", e: "20:00", a: "21:30" }, P.times || {});
  const D = doc.digest || {}, days = D.days || {}, daily = D.daily || {}, sent = doc.sent || {};
  const { date: today, hm, dow } = vnParts(now);
  const isWork = (d) => days[d] && !days[d].o;
  const si = (e) => (e ? (e.bn || 0) + (e.gd || 0) : 0);
  const inWin = (t) => hm >= mins(t) && hm < mins(t) + 180;
  const app = cfg().appUrl, unsub = unsubUrl(doc.uid);
  const out = [];

  // ---- Buổi sáng: kết quả hôm qua + cảnh báo + tổng kết tuần (gộp thành một email)
  if (inWin(T.m) && sent.m !== today) {
    const sections = [];
    let tiles = null, subject = "", tone = "info", patch = { m: today };
    const y = shift(today, -1);

    if (M.warn) {
      const bad = [];
      (D.alerts || []).filter((a) => a.lv === "bad").forEach((a) => bad.push({ t: clean(a.t), x: clean(a.x) }));
      ((D.fx && D.fx.rows) || []).filter((r) => r.lv === "bad").forEach((r) => bad.push({ t: clean(r.n), x: clean(r.m) + (r.a ? " → " + clean(r.a) : "") }));
      if (bad.length) {
        const sig = bad.map((b) => b.t).sort().join("|");
        const since = sent.sigAt ? daysBetween(sent.sigAt, today) : 99;
        if (sent.sig !== sig || since >= 3) {
          tone = "warn";
          sections.push({ h: "Cần chú ý", warn: true, lines: bad.slice(0, 4).map((b) => b.t + ": " + b.x) });
          patch.sig = sig; patch.sigAt = today;
          subject = "[Cảnh báo] " + bad[0].t + (bad.length > 1 ? " và " + (bad.length - 1) + " mục khác" : "");
        }
      } else if (sent.sig) { patch.sig = ""; }
    }

    if (M.morning && isWork(y)) {
      const e = daily[y], plan = days[y];
      let cumPlan = 0, cumAct = 0;
      Object.keys(days).forEach((d) => { if (d <= y && !days[d].o) cumPlan += days[d].si || 0; });
      Object.keys(daily).forEach((d) => { if (d <= y && d.slice(0, 7) === D.month) cumAct += si(daily[d]); });
      if (e) {
        const pct = plan.si ? Math.round(si(e) / plan.si * 100) : null;
        tiles = [
          { n: fmt(si(e)) + " tr", l: "S.I hôm qua" + (plan.si ? " · kế hoạch " + fmt(plan.si, 1) : "") },
          { n: String(e.v || 0), l: "khách đã liên hệ" + (plan.vt ? " · kế hoạch " + fmt(plan.vt, 1) : "") },
          { n: cumPlan > 0 ? Math.round(cumAct / cumPlan * 100) + "%" : "—", l: "cả tháng so với mốc kế hoạch" }
        ];
        const lines = [];
        if (pct !== null) lines.push("Hôm qua đạt " + pct + "% S.I theo kế hoạch ngày.");
        lines.push("Cả tháng: đã chốt " + fmt(cumAct) + (D.total ? " / " + fmt(D.total) : "") + " tr.");
        sections.push({ h: "Kết quả hôm qua (" + dm(y) + ")", lines });
        if (!subject) subject = "[Tham khảo] Kết quả hôm qua " + dm(y) + ": " + fmt(si(e)) + " tr" + (pct !== null ? " (" + pct + "% kế hoạch ngày)" : "");
      } else {
        sections.push({ h: "Hôm qua (" + dm(y) + ")", lines: ["Chưa có số liệu. Hãy nhập bù để theo dõi chính xác."] });
        if (!subject) subject = "[Tham khảo] Hôm qua (" + dm(y) + ") chưa có số liệu";
      }
    }

    if (M.weekly && dow === 1) {
      const range = [];
      for (let i = 7; i >= 1; i--) range.push(shift(today, -i));
      if (range.every((d) => days[d])) {
        const work = range.filter(isWork);
        const plan = work.reduce((a, d) => a + (days[d].si || 0), 0);
        const act = work.reduce((a, d) => a + si(daily[d]), 0);
        const logged = work.filter((d) => daily[d]).length;
        if (work.length) {
          const wp = plan ? Math.round(act / plan * 100) : null;
          if (!tiles) tiles = [{ n: fmt(act) + " tr", l: "S.I tuần trước" + (plan ? " · kế hoạch " + fmt(plan) : "") }, { n: wp !== null ? wp + "%" : "—", l: "so với kế hoạch tuần" }, { n: logged + "/" + work.length, l: "ngày có số liệu" }];
          sections.push({ h: "Tổng kết tuần " + dm(range[0]) + "–" + dm(range[6]), lines: ["Đã chốt " + fmt(act) + " tr" + (plan ? " trên kế hoạch " + fmt(plan) + " tr (" + wp + "%)" : "") + ".", logged + "/" + work.length + " ngày làm việc có số liệu."] });
          if (!subject) subject = "[Tham khảo] Tổng kết tuần " + dm(range[0]) + "–" + dm(range[6]);
        }
      }
    }

    if (sections.length) {
      const L = layout({ tone, title: subject.replace(/^\[[^\]]+\]\s*/, ""), tiles, sections, cta: "Mở kế hoạch", ctaUrl: app + "/#sang", unsub });
      out.push({ key: "m", subject, html: L.html, text: L.text, patch });
    }
  }

  // ---- Buổi tối: nhắc nhập số liệu nếu hôm nay chưa nhập
  if (M.evening && isWork(today) && !daily[today] && inWin(T.e) && sent.e !== today) {
    const plan = days[today];
    const lines = ["Mất khoảng 20 giây: số khách đã liên hệ và S.I đã chốt."];
    if (plan && plan.si) lines.push("Kế hoạch hôm nay: " + fmt(plan.si, 1) + " tr S.I, " + fmt(plan.vt || 0, 1) + " khách.");
    const subject = "[Nhắc] Nhập số liệu bán hàng hôm nay (" + dm(today) + ")";
    const L = layout({ tone: "remind", title: "Hôm nay bạn chưa nhập số liệu", sections: [{ h: "Việc cần làm", lines }], cta: "Nhập số liệu", ctaUrl: app + "/#nhap", unsub });
    out.push({ key: "e", subject, html: L.html, text: L.text, patch: { e: today } });
  }
  return { emails: out };
}

module.exports = { dueEmails, layout, unsubUrl, vnParts };
