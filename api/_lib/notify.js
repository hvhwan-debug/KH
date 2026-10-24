// Gửi thông báo cho thí sinh qua email (Zalo và SMS được mở sẵn ở trình duyệt, người gửi bấm gửi).
// Email chỉ gửi tới ĐỊA CHỈ ĐÃ LƯU trong hồ sơ thí sinh (tra theo mã nhân viên), không nhận địa chỉ tuỳ ý từ trình duyệt.
const mail = require("./mail");
const quiz = require("./quiz");

const MAX_ITEMS = 300, MAX_TEXT = 1500;
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n);

const CAPS = /^[\p{Lu}\d][\p{Lu}\d \t,.\-–:\/|()]*$/u; // dòng toàn chữ in hoa (tiêu đề, chữ ký)
const link = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0869df">$1</a>');
function html(text, kind, cta) {
  const invite = kind === "invite";
  const raw = String(text).split("\n").map((l) => l.replace(/\s+$/, ""));
  let title = "THƯ MỜI";
  if (invite && raw.length && CAPS.test(raw[0].trim()) && raw[0].trim().length <= 80) { title = raw.shift().trim(); while (raw.length && !raw[0].trim()) raw.shift(); }
  const out = raw.map((l) => {
    const t = l.trim();
    if (!t) return '<div style="height:8px"></div>';
    if (/^\d+\.\s+[\p{Lu}\d \t,.\-–:\/|()]+$/u.test(t)) return '<div style="margin:16px 0 4px;padding-left:10px;border-left:4px solid #08b9d4;font-weight:800;color:#0b3f94;font-size:15px">' + esc(t) + "</div>";
    if (/^[*\-•]\s+/.test(t)) {
      const body = t.replace(/^[*\-•]\s+/, ""), i = body.indexOf(": "), label = i > 0 ? body.slice(0, i) : "";
      const inner = label && label.length <= 50 && !/[.,;]/.test(label) ? "<b>" + esc(label) + ":</b> " + link(esc(body.slice(i + 2))) : link(esc(body));
      return '<div style="padding-left:18px;text-indent:-12px;margin:2px 0">&bull;&nbsp;' + inner + "</div>";
    }
    if (CAPS.test(t) && t.length <= 60) return '<div style="font-weight:800;color:#0b3f94;margin-top:2px">' + esc(t) + "</div>";
    return "<div>" + link(esc(t)) + "</div>";
  }).join("");
  const head = invite ? '<div style="background:#0869df;background-image:linear-gradient(100deg,#0869df,#08b9d4);color:#fff;border-radius:16px 16px 0 0;padding:18px 24px;font-weight:800;font-size:17px;letter-spacing:.5px">' + esc(title) + "</div>" : "";
  const button = cta && /^https?:\/\//i.test(cta.url || "") ? '<p style="margin:24px 0 4px"><a href="' + esc(cta.url) + '" style="display:inline-block;background:#0869df;background-image:linear-gradient(100deg,#0869df,#08b9d4);color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:12px">' + esc(cta.label) + "</a></p>" : "";
  const box = invite ? "border:1px solid #d6e6f9;border-top:0;border-radius:0 0 16px 16px;padding:22px 24px" : "padding:22px";
  return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.7;color:#102e5b;max-width:600px;margin:0 auto">' + head + '<div style="' + box + '">' + out + button +
    '<hr style="border:0;border-top:1px solid #e1ecf8;margin:22px 0 12px"><div style="font-size:12px;color:#7186a5">Hệ thống kiểm tra đánh giá trực tuyến</div></div></div>';
}

// candidates: toàn bộ hồ sơ; allowed: hàm (candidate) => có được gửi cho người này không (quản lí chỉ gửi cho nhân viên của mình)
async function sendEmails({ items, subject, kind, allowed }) {
  const subj = clean(subject, 150).trim();
  if (!subj) return { status: 400, body: { ok: false, error: "Nhập tiêu đề email." } };
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  if (!list.length) return { status: 400, body: { ok: false, error: "Chưa chọn người nhận." } };
  const cands = await quiz.getCandidates();
  const byCode = {}; cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
  const res = { ok: true, sent: 0, failed: [], skipped: [] }, k = kind === "invite" ? "invite" : "";
  for (const it of list) {
    const code = String((it && it.code) || ""), c = byCode[quiz.normCode(code)];
    const text = clean(it && it.text, MAX_TEXT).trim();
    if (!c || !text || (allowed && !allowed(c))) { res.skipped.push({ code, reason: "không hợp lệ" }); continue; }
    if (!c.email) { res.skipped.push({ code, reason: "chưa có email" }); continue; }
    try {
      const cta = it && it.cta && /^https?:\/\//i.test(String(it.cta.url || "")) ? { label: clean(it.cta.label, 40) || "Mở liên kết", url: String(it.cta.url).slice(0, 500) } : null;
      const sent = await mail.send({ to: c.email, subject: subj, html: html(text, k, cta), text: cta ? text + "\n" + cta.url : text });
      if (sent === false) { res.ok = false; res.error = "Chưa cấu hình SMTP trên máy chủ, email chưa được gửi."; res.failed.push({ code, error: "chưa cấu hình SMTP" }); break; }
      res.sent++;
    } catch (e) { res.failed.push({ code, error: String((e && e.message) || "lỗi gửi").slice(0, 120) }); }
  }
  return { status: 200, body: res };
}
module.exports = { sendEmails };
