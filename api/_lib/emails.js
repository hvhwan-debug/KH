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
  info: { label: "THAM KHẢO", bg: "#DDF4F1", fg: "#007A73" },
  warn: { label: "CẢNH BÁO", bg: "#FBDEDA", fg: "#C0352B" },
  remind: { label: "NHẮC VIỆC", bg: "#FFEFC9", fg: "#9A6200" }
};

function layout(o) {
  const t = TAGS[o.tone] || TAGS.info;
  const tiles = (o.tiles || []).map((x) =>
    '<td style="background:#DDF4F1;border-radius:10px;padding:10px 12px;vertical-align:top;width:' + Math.floor(100 / o.tiles.length) + '%">' +
    '<div style="font-size:22px;font-weight:800;color:#007A73;line-height:1.2">' + esc(x.n) + "</div>" +
    '<div style="font-size:12px;color:#4F6F6C;line-height:1.35">' + esc(x.l) + "</div></td>").join('<td style="width:8px"></td>');
  const secs = (o.sections || []).map((s) =>
    '<div style="margin:14px 0 4px;font-weight:700;color:' + (s.warn ? "#C0352B" : "#06302D") + '">' + esc(s.h) + "</div>" +
    '<ul style="margin:0;padding-left:18px;color:#06302D;line-height:1.5">' + s.lines.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul>").join("");
  const html =
    '<div style="background:#E9F6F4;padding:16px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;width:100%;border-collapse:collapse">' +
    '<tr><td style="background:#02A79E;color:#fff;padding:14px 18px;font-weight:700">Livotec · Trợ lí thiết lập kế hoạch bán hàng</td></tr>' +
    '<tr><td style="padding:18px">' +
    '<span style="display:inline-block;background:' + t.bg + ";color:" + t.fg + ';font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;letter-spacing:.04em">' + t.label + "</span>" +
    '<h1 style="font-size:19px;margin:10px 0 10px;color:#06302D">' + esc(o.title) + "</h1>" +
    (tiles ? '<table role="presentation" style="width:100%;border-collapse:separate"><tr>' + tiles + "</tr></table>" : "") +
    secs +
    (o.cta ? '<div style="margin:18px 0 6px"><a href="' + esc(o.ctaUrl) + '" style="background:#007A73;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;display:inline-block">' + esc(o.cta) + "</a></div>" : "") +
    "</td></tr>" +
    '<tr><td style="padding:12px 18px 16px;font-size:11.5px;color:#4F6F6C;border-top:1px solid #C6E4E0;line-height:1.5">' +
    "Email tự động, số liệu chỉ mang tính tham khảo, tính từ các số bạn tự nhập; không phải cam kết hay chỉ tiêu chính thức.<br>" +
    '<a href="' + esc(o.unsub) + '" style="color:#007A73">Tắt email tự động</a> · Hoặc vào Thiết lập › Tài khoản &amp; email trong ứng dụng.' +
    "</td></tr></table></div>";
  const text = [
    "[" + t.label + "] " + o.title, "",
    (o.tiles || []).map((x) => x.n + " — " + x.l).join("\n"),
    (o.sections || []).map((s) => "\n" + s.h + "\n" + s.lines.map((l) => "- " + l).join("\n")).join("\n"),
    o.cta ? "\n" + o.cta + ": " + o.ctaUrl : "",
    "\n—\nEmail tự động, chỉ mang tính tham khảo. Tắt email: " + o.unsub
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
