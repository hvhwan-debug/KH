/* Khung email HTML dùng chung: trình duyệt (xem trước) và máy chủ (gửi thật).
   NGUỒN DUY NHẤT là file này; api/_lib/mailtpl.js là bản sao y hệt — sửa ở đây rồi chép sang đó.
   Chỉ dùng style nội tuyến + bảng để hiển thị đúng trên Gmail / Outlook / điện thoại. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTMail = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var BRAND = '#0869df', BRAND2 = '#08b9d4', INK = '#102e5b', DEEP = '#0b3f94', MUTED = '#7186a5';
  var GRAD = 'background:' + BRAND + ';background-image:linear-gradient(100deg,' + BRAND + ',' + BRAND2 + ');';
  var FONT = "font-family:'Segoe UI',Roboto,Arial,sans-serif;";
  var CAPS = /^[\p{Lu}\d][\p{Lu}\d \t,.\-–:\/|()]*$/u;

  // tone: kiểu thư. Mỗi kiểu có nhãn nhỏ, tiêu đề, biểu tượng, màu nhấn, chữ trên nút tự sinh.
  var TONES = {
    remind: { eye: 'NHẮC NHỞ',   title: 'Nhắc làm bài kiểm tra', icon: '⏰', color: '#C77700', soft: '#FFF4DE', btn: 'Làm bài ngay',      when: 'Hạn làm bài' },
    open:   { eye: 'SẮP MỞ ĐỀ',  title: 'Bài kiểm tra sắp mở',   icon: '🗓', color: BRAND,     soft: '#E8F2FF', btn: 'Vào trang làm bài', when: 'Mở đề lúc' },
    close:  { eye: 'SẮP ĐÓNG ĐỀ', title: 'Bài kiểm tra sắp đóng', icon: '⏳', color: '#C0392B', soft: '#FDECEA', btn: 'Làm bài ngay',      when: 'Đóng đề lúc' },
    result: { eye: 'KẾT QUẢ',    title: 'Kết quả bài kiểm tra',  icon: '🏆', color: '#1E8A52', soft: '#E6F5EC', btn: 'Xem kết quả',       when: '' },
    custom: { eye: 'THÔNG BÁO',  title: 'Thông báo',             icon: '📢', color: BRAND,     soft: '#E8F2FF', btn: 'Mở liên kết',       when: '' },
    invite: { eye: 'THƯ MỜI',    title: 'THƯ MỜI',               icon: '✉️', color: BRAND,     soft: '#E8F2FF', btn: 'Mở liên kết',       when: '' }
  };
  function toneOf(t) { return TONES[t] ? t : 'custom'; }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function link(t) { return t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + BRAND + ';word-break:break-all">$1</a>'); }
  function firstUrl(t) { var m = /https?:\/\/[^\s<>"“”]+/.exec(t); return m ? m[0].replace(/[.,;)]+$/, '') : ''; }

  // Lấy hạn / giờ mở từ câu chữ của mẫu để làm nổi bật thành khung riêng (không khớp thì bỏ qua, nội dung vẫn đầy đủ).
  function when(text, tone) {
    var m;
    if (tone === 'remind' && (m = /Hạn (?:làm bài|hoàn thành)\s*:\s*([^\n]*?\d{4})/i.exec(text))) return m[1].trim();
    if (tone === 'open' && (m = /mở lúc\s+([^\n]*?\d{4})/i.exec(text))) return m[1].trim();
    if (tone === 'close' && (m = /đóng lúc\s+([^\n]*?\d{4})/i.exec(text))) return m[1].trim();
    return '';
  }
  function score(text) {
    var m = /(\d+)\s*\/\s*(\d+)\s*câu đúng\s*\(\s*([\d.,]+\s*%)\s*\)/i.exec(text);
    return m ? { n: m[1], t: m[2], p: m[3].replace(/\s+/g, '') } : null;
  }

  function lines(raw, invite) {
    return raw.map(function (l) {
      var t = l.trim();
      if (!t) return '<div style="height:8px;line-height:8px">&nbsp;</div>';
      if (/^\d+\.\s+[\p{Lu}\d \t,.\-–:\/|()]+$/u.test(t)) return '<div style="margin:16px 0 4px;padding-left:10px;border-left:4px solid ' + BRAND2 + ';font-weight:800;color:' + DEEP + ';font-size:15px">' + esc(t) + '</div>';
      if (/^[*\-•]\s+/.test(t)) {
        var body = t.replace(/^[*\-•]\s+/, ''), i = body.indexOf(': '), label = i > 0 ? body.slice(0, i) : '';
        var inner = label && label.length <= 50 && !/[.,;]/.test(label) ? '<b>' + esc(label) + ':</b> ' + link(esc(body.slice(i + 2))) : link(esc(body));
        return '<div style="padding-left:18px;text-indent:-12px;margin:3px 0">&bull;&nbsp;' + inner + '</div>';
      }
      if (invite && CAPS.test(t) && t.length <= 60) return '<div style="font-weight:800;color:' + DEEP + ';margin-top:2px">' + esc(t) + '</div>';
      return '<div style="margin:2px 0">' + link(esc(t)) + '</div>';
    }).join('');
  }

  // opts: { text, tone, cta:{label,url}, name }  → HTML của cả bức thư
  function build(opts) {
    opts = opts || {};
    var tone = toneOf(opts.tone), T = TONES[tone], invite = tone === 'invite';
    var raw = String(opts.text == null ? '' : opts.text).split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    var title = T.title;
    if (invite && raw.length && CAPS.test(raw[0].trim()) && raw[0].trim().length <= 80) { title = raw.shift().trim(); while (raw.length && !raw[0].trim()) raw.shift(); }
    var plain = raw.join('\n');

    var cta = opts.cta && /^https?:\/\//i.test(opts.cta.url || '') ? opts.cta : null;
    if (!cta && !invite) { var u = firstUrl(plain); if (u) cta = { label: T.btn, url: u }; }

    var head =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + BRAND + '" style="' + GRAD + '"><tr>' +
      '<td style="padding:22px 24px 20px 24px;' + FONT + '">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
          (invite ? '' : '<td style="width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;text-align:center;font-size:24px;line-height:48px" width="48">' + T.icon + '</td><td style="width:14px">&nbsp;</td>') +
          '<td style="color:#fff;vertical-align:middle">' +
            '<div style="font-size:11px;letter-spacing:1.6px;font-weight:700;opacity:.85">' + esc(T.eye) + '</div>' +
            '<div style="font-size:' + (invite ? 18 : 21) + 'px;line-height:1.3;font-weight:800;margin-top:3px">' + esc(title) + '</div>' +
          '</td></tr></table>' +
      '</td></tr></table>';

    var callout = '', w = when(plain, tone);
    if (w) callout = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px"><tr><td style="background:' + T.soft + ';border-left:5px solid ' + T.color + ';border-radius:10px;padding:12px 16px;' + FONT + '">' +
      '<div style="font-size:11px;letter-spacing:1px;font-weight:700;color:' + T.color + '">' + esc(T.when.toUpperCase()) + '</div>' +
      '<div style="font-size:19px;font-weight:800;color:' + INK + ';margin-top:2px">' + esc(w) + '</div></td></tr></table>';

    var card = '', sc = tone === 'result' ? score(plain) : null;
    if (sc) card = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px"><tr><td align="center" style="background:' + T.soft + ';border-radius:14px;padding:18px 12px;' + FONT + '">' +
      '<div style="font-size:40px;line-height:1.1;font-weight:800;color:' + T.color + '">' + esc(sc.n) + '<span style="font-size:22px;color:' + MUTED + '"> / ' + esc(sc.t) + '</span></div>' +
      '<div style="font-size:13px;color:' + MUTED + ';margin-top:4px">câu đúng · <b style="color:' + INK + '">' + esc(sc.p) + '</b></div></td></tr></table>';

    var button = cta ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px"><tr><td bgcolor="' + BRAND + '" style="' + GRAD + 'border-radius:12px"><a href="' + esc(cta.url) + '" style="display:inline-block;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:12px;' + FONT + '">' + esc(cta.label || T.btn) + '</a></td></tr></table>' : '';

    var body = '<div style="padding:22px 24px 8px 24px;font-size:15px;line-height:1.7;color:' + INK + ';' + FONT + '">' + lines(raw, invite) + callout + card + button + '</div>';
    var foot = '<div style="padding:14px 24px 20px 24px;' + FONT + '"><div style="border-top:1px solid #e1ecf8;padding-top:12px;font-size:12px;line-height:1.6;color:' + MUTED + '">Hệ thống kiểm tra đánh giá trực tuyến<br>Đây là email tự động, vui lòng không trả lời thư này.</div></div>';

    return '<div style="background:#f1f5fb;padding:20px 10px;' + FONT + '"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #d6e6f9;border-radius:16px;overflow:hidden">' + head + body + foot + '</div></div>';
  }

  return { build: build, toneOf: toneOf, TONES: TONES };
});
