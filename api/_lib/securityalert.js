// Cảnh báo an ninh khi có người CỐ XEM LẠI BÀI LÀM của người khác (khuôn mặt không khớp / ảnh chụp lại từ màn hình, ảnh in).
//  1) Email cho quản trị viên (ADMIN_EMAILS) kèm ảnh người vừa quét và ảnh gốc của chủ bài để đối chiếu bằng mắt.
//     Ảnh vừa quét CHỈ nằm trong email gửi quản trị viên, KHÔNG được lưu lại trên máy chủ.
//  2) Sổ cảnh báo (kt/security-alerts.json) để quản trị viên xem lại trong trang quản trị.
//  3) Khoá xem lại của đúng bài làm đó sau LOCK_AFTER lần đáng ngờ trong 24 giờ: chặn thử đi thử lại bằng nhiều mạng / nhiều ảnh.
//     Quản trị viên mở khoá được; không mở thì tự hết khoá sau LOCK_MS.
// Mọi lỗi ở đây KHÔNG được làm hỏng luồng chính (luôn từ chối truy cập, dù gửi cảnh báo thất bại).
const store = require("./store");
const mail = require("./mail");
const { cfg } = require("./config");
const device = require("./device");

const ALERT_KEY = "kt/security-alerts.json", LOCK_KEY = "kt/paper-locks.json";
const ALERT_MAX = 300, LOCK_AFTER = 3, LOCK_MS = 24 * 3600 * 1000, WINDOW_MS = 24 * 3600 * 1000, MAIL_GAP_MS = 10 * 60 * 1000;
const KINDS = {
  mismatch: { label: "Khuôn mặt KHÔNG khớp với chủ bài làm", sev: "Cao" },
  spoof: { label: "Ảnh có dấu hiệu chụp lại từ màn hình / ảnh in", sev: "Cao" },
  locked: { label: "Đã bị khoá xem lại do thử nhiều lần", sev: "Cao" }
};
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const vn = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
const one = (s, n) => String(s == null ? "" : s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n || 120);

// Trạng thái khoá của một bài làm: { locked, until, count }
async function lockState(attemptId) {
  try {
    const d = (await store.get(LOCK_KEY)) || {}, r = d[attemptId], now = Date.now();
    if (!r) return { locked: false, until: 0, count: 0 };
    const count = (r.ev || []).filter((t) => now - t < WINDOW_MS).length;
    return { locked: !!r.until && now < r.until, until: r.until || 0, count };
  } catch (e) { return { locked: false, until: 0, count: 0 }; }
}

// Ghi nhận 1 lần đáng ngờ, trả về trạng thái khoá mới (và có cần gửi email lần này không)
async function noteEvent(attemptId) {
  const now = Date.now(); let out = { locked: false, until: 0, count: 0, mail: true };
  await store.update(LOCK_KEY, (cur) => {
    const d = cur && typeof cur === "object" ? cur : {};
    Object.keys(d).forEach((k) => { const r = d[k]; if (!r || (!(r.until > now) && !(r.ev || []).some((t) => now - t < 2 * WINDOW_MS))) delete d[k]; }); // dọn mục cũ
    const r = d[attemptId] || { ev: [], until: 0, mailAt: 0 };
    r.ev = (r.ev || []).filter((t) => now - t < WINDOW_MS).concat(now).slice(-20);
    if (r.ev.length >= LOCK_AFTER && !(r.until > now)) r.until = now + LOCK_MS;
    out = { locked: r.until > now, until: r.until || 0, count: r.ev.length, mail: now - (r.mailAt || 0) >= MAIL_GAP_MS || (r.until > now && !r.lockMailed) };
    if (out.mail) { r.mailAt = now; if (r.until > now) r.lockMailed = true; }
    d[attemptId] = r; return d;
  });
  return out;
}

async function unlock(attemptId) {
  let had = false;
  await store.update(LOCK_KEY, (cur) => { const d = cur && typeof cur === "object" ? cur : {}; had = !!d[attemptId]; delete d[attemptId]; return d; });
  return had;
}

const dataBuf = (u) => { const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(u || "")); return m ? { type: m[1].toLowerCase(), buf: Buffer.from(m[2], "base64") } : null; };

function mailHtml(a, k, n, lockInfo, cids) {
  const row = (x, y) => `<tr><td style="padding:7px 0;color:#6B7F94;font-size:13px;width:150px;vertical-align:top">${x}</td><td style="padding:7px 0;color:#0F2F55;font-size:14px;font-weight:bold">${y}</td></tr>`;
  const img = (cid, cap, border) => cid ? `<td align="center" style="padding:0 6px"><img src="cid:${cid}" width="200" style="display:block;width:200px;max-width:100%;border-radius:12px;border:3px solid ${border}"><div style="font-size:12px;color:#6B7F94;padding-top:6px">${cap}</div></td>` : "";
  return `<!DOCTYPE html><html lang="vi"><body style="margin:0;background:#EAF0F6;font-family:'Be Vietnam Pro','Segoe UI',Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 10px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:18px;border:1px solid #DCE6F0;border-collapse:separate;overflow:hidden">` +
    `<tr><td style="padding:22px 26px;background:#B3261E;background-image:linear-gradient(135deg,#8E1B15,#D9483E);color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:bold;opacity:.9">CẢNH BÁO AN NINH · XEM LẠI BÀI LÀM</div><div style="font-size:22px;line-height:30px;font-weight:bold;padding-top:6px">&#9888; ${esc(k.label)}</div></td></tr>` +
    `<tr><td style="padding:20px 26px 6px"><div style="font-size:14px;line-height:22px;color:#34506E">Có người vừa cố xem lại bài làm bên dưới nhưng <b>không vượt qua bước xác thực khuôn mặt</b>. Hệ thống đã <b>chặn truy cập</b>, không có thông tin nào được hiển thị.</div></td></tr>` +
    `<tr><td style="padding:8px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E3EBF3">` +
    row("Chủ bài làm", esc(one(a.name, 80)) + " · " + esc(one(a.code, 40))) + row("Quản lý", esc(one(a.manager, 80)) || "(chưa rõ)") + row("Bài kiểm tra", esc(one(a.examTitle || a.period || "", 120))) +
    row("Thời điểm", esc(vn(Date.now()))) + row("Địa chỉ IP", esc(n.ip || "?")) + row("Thiết bị", esc(one(n.ua, 140) || "?")) +
    (n.distance != null ? row("Độ lệch khuôn mặt", esc(Number(n.distance).toFixed(3)) + " <span style=\"font-weight:normal;color:#6B7F94\">(ngưỡng cho phép " + esc(n.threshold) + "; càng lớn càng khác người)</span>") : "") +
    row("Số lần đáng ngờ (24h)", esc(lockInfo.count) + " lần") + row("Trạng thái", lockInfo.locked ? "<span style=\"color:#B3261E\">ĐÃ KHOÁ xem lại đến " + esc(vn(lockInfo.until)) + "</span>" : "Chưa khoá (khoá sau " + LOCK_AFTER + " lần)") +
    `</table></td></tr>` +
    (cids.shot || cids.ref ? `<tr><td style="padding:10px 26px 4px"><div style="font-size:12px;letter-spacing:1.2px;font-weight:bold;color:#6B7F94;padding-bottom:8px">ĐỐI CHIẾU BẰNG MẮT</div><table role="presentation" cellpadding="0" cellspacing="0"><tr>${img(cids.ref, "Ảnh gốc của chủ bài làm", "#14A36B")}${img(cids.shot, "Người vừa quét khuôn mặt", "#D9483E")}</tr></table></td></tr>` : "") +
    `<tr><td style="padding:14px 26px 22px;font-size:13px;line-height:21px;color:#4F6882">Nếu là chính chủ bị nhận nhầm (ánh sáng yếu, đổi kiểu tóc/kính…), bạn có thể mở khoá trong trang quản trị. Ảnh vừa quét chỉ có trong email này, hệ thống không lưu lại.</td></tr>` +
    `<tr><td align="center" style="padding:12px;background:#0B2B55;color:#B9D3E8;font-size:11px">Email tự động từ hệ thống kiểm tra · Chỉ gửi cho quản trị viên</td></tr>` +
    `</table></td></tr></table></body></html>`;
}

// kind: "mismatch" | "spoof". info: { selfie, refPhoto, distance, threshold, reason }. Trả về trạng thái khoá { locked, until, count }.
async function alertPaperAccess(req, attempt, kindKey, info) {
  info = info || {};
  const k = KINDS[kindKey] || KINDS.mismatch, now = Date.now();
  let lk = { locked: false, until: 0, count: 0, mail: true };
  try { lk = await noteEvent(attempt.id); } catch (e) { console.error("securityalert lock:", e && e.message); }
  const ip = device.ipOf(req), ua = String((req && req.headers && req.headers["user-agent"]) || "");
  const rec = { at: now, kind: kindKey, label: k.label, attempt: attempt.id, code: one(attempt.code, 40), name: one(attempt.name, 80), manager: one(attempt.manager, 80), exam: one(attempt.examTitle || attempt.period || "", 120),
    ip, ua: one(ua, 140), distance: info.distance != null ? Math.round(info.distance * 1000) / 1000 : null, count: lk.count, locked: lk.locked, until: lk.until || 0, mailed: false };
  try { // test account: không báo (cùng quy ước với nhật ký từ chối khuôn mặt)
    if (!attempt.test) {
      if (lk.mail) {
        const to = cfg().adminEmails || [];
        if (to.length) {
          const atts = []; const cids = {};
          const shot = dataBuf(info.selfie), ref = dataBuf(info.refPhoto);
          if (ref) { cids.ref = "anh-goc@kiemtra"; atts.push({ filename: "anh-goc.jpg", content: ref.buf, contentType: ref.type, cid: cids.ref, contentDisposition: "inline" }); }
          if (shot) { cids.shot = "anh-quet@kiemtra"; atts.push({ filename: "nguoi-vua-quet.jpg", content: shot.buf, contentType: shot.type, cid: cids.shot, contentDisposition: "inline" }); }
          const subject = "[CẢNH BÁO] " + k.label + " · " + one(attempt.name, 60) + " (" + one(attempt.code, 30) + ")" + (lk.locked ? " · ĐÃ KHOÁ" : "");
          const sent = await mail.send({ fromName: mail.KT_NAME, to: to.join(", "), subject, html: mailHtml(attempt, k, { ip, ua, distance: info.distance, threshold: info.threshold }, lk, cids),
            text: subject + "\nThời điểm: " + vn(now) + "\nIP: " + ip + "\nSố lần đáng ngờ (24h): " + lk.count + (lk.locked ? "\nĐã khoá xem lại đến " + vn(lk.until) : "") + "\nHệ thống đã chặn truy cập.", attachments: atts.length ? atts : undefined });
          rec.mailed = sent !== false;
        }
      }
      await store.update(ALERT_KEY, (cur) => (Array.isArray(cur) ? cur : []).concat(rec).slice(-ALERT_MAX));
    }
  } catch (e) { console.error("securityalert send:", e && e.message); }
  return { locked: lk.locked, until: lk.until, count: lk.count };
}

async function list() { try { const d = await store.get(ALERT_KEY); return Array.isArray(d) ? d : []; } catch (e) { return []; } }

module.exports = { alertPaperAccess, lockState, unlock, list, LOCK_AFTER, LOCK_MS };
