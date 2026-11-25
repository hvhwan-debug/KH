/* Chặn trình duyệt trong app (Zalo, Facebook/Messenger, Instagram, Line, TikTok): camera / vị trí thường bị chặn ở đó.
   Khi mở từ các app này, hiện lớp phủ toàn màn hình, BẮT BUỘC bấm nút để chuyển sang trình duyệt mặc định (Chrome / Safari).
   Lớp phủ không có nút đóng. Dùng cho các trang cần camera: hoclieu, ketqua, tracuu (trang index có màn chặn riêng). */
(function(){
  // Chế độ lười (<script data-lazy>): KHÔNG tự chặn khi mở trang; chỉ hiện lớp phủ khi trang gọi window.inAppBlock() (vd. lúc bấm nút cần camera).
  var lazy = !!(document.currentScript && document.currentScript.hasAttribute('data-lazy'));
  var ua = navigator.userAgent || '', name = '';
  if (/Zalo/i.test(ua)) name = 'Zalo';
  else if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) name = 'Facebook/Messenger';
  else if (/Instagram/i.test(ua)) name = 'Instagram';
  else if (/Line\//i.test(ua)) name = 'Line';
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) name = 'TikTok';
  if (!name){ if (lazy) window.inAppBlock = function(){ return false; }; return; }

  // Giao diện giống màn mở đề kiểm tra: nền xanh nhạt gradient, thẻ trắng, biểu tượng + nút xanh gradient, phông Be Vietnam Pro
  var css = '#iaOv{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow:auto;' +
      'font-family:\"Be Vietnam Pro\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;color:#0A2552;text-align:center;-webkit-font-smoothing:antialiased;' +
      'background:radial-gradient(circle at 0% 14%,rgba(167,232,255,.65),transparent 55%),radial-gradient(circle at 100% 100%,rgba(75,155,255,.28),transparent 55%),linear-gradient(155deg,#eaf7ff 0%,#f8fcff 54%,#e1f6ff 100%)}' +
    '#iaOv .b{box-sizing:border-box;width:100%;max-width:420px;padding:30px 22px 22px;border-radius:26px;background:rgba(255,255,255,.96);border:1px solid #e0ecfa;box-shadow:0 22px 65px rgba(22,75,133,.18);display:flex;flex-direction:column;align-items:center}' +
    '#iaOv .ic{width:72px;height:72px;border-radius:22px;background:linear-gradient(135deg,#0A63C4 0%,#10A6D0 100%);display:grid;place-items:center;box-shadow:0 16px 30px -14px rgba(10,99,196,.7);margin:0 0 18px}' +
    '#iaOv h1{margin:0 0 8px;font-size:24px;line-height:1.25;font-weight:800;color:#0A2552}' +
    '#iaOv p{margin:0 0 24px;font-size:15px;line-height:1.6;color:#4F6486;max-width:32ch}#iaOv p b{color:#0A2552}' +
    '#iaOv button{display:flex;align-items:center;justify-content:center;width:100%;border:0;cursor:pointer;font-family:inherit}' +
    '#iaOv .go{height:58px;border-radius:14px;font-size:16px;font-weight:800;color:#fff;background:linear-gradient(100deg,#0869df,#08b9d4);box-shadow:0 12px 25px rgba(8,120,232,.28);margin-bottom:6px}' +
    '#iaOv .go:active{filter:brightness(.96)}' +
    '#iaOv .cp{background:none;color:#0B3F94;font-weight:700;font-size:14.5px;padding:12px 16px}' +
    '#iaOv .h{width:100%;box-sizing:border-box;margin-top:10px;font-size:13.5px;line-height:1.55;text-align:left;display:none;background:#E6F0FC;color:#33496E;border-radius:14px;padding:12px 16px}#iaOv .h b{color:#0A2552}' +
    '#iaOv .m{margin-top:10px;font-size:13.5px;min-height:18px;color:#0B3F94;font-weight:600}';

  function build(){
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'iaOv'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="b"><div class="ic" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9S14.6 18.4 12 21c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg></div>' +
      '<h1>Mở bằng trình duyệt</h1>' +
      '<p>Để dùng camera và làm bài, hãy mở trang này bằng Chrome hoặc Safari thay vì <b></b>.</p>' +
      '<button type="button" class="go">Mở trình duyệt</button>' +
      '<button type="button" class="cp">Sao chép link</button>' +
      '<div class="h">Nếu chưa tự mở được: bấm <b>⋯</b> ở góc trên bên phải, chọn <b>Mở bằng trình duyệt</b>, hoặc sao chép link rồi dán vào Chrome / Safari.</div>' +
      '<div class="m" role="status"></div></div>';
    ov.querySelector('p b').textContent = name;
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    var h = ov.querySelector('.h'), m = ov.querySelector('.m');
    ov.querySelector('.go').addEventListener('click', function(){
      var u = null, went = false;
      try { u = new URL(location.href); } catch(e){}
      var onVis = function(){ if (document.hidden) went = true; };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', function(){ went = true; }, { once:true });
      m.textContent = '';
      try {
        if (u && /Android/i.test(ua)) location.href = 'intent://' + u.host + u.pathname + u.search + u.hash + '#Intent;scheme=' + u.protocol.replace(':','') + ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';
        else if (u && /iPhone|iPad|iPod/i.test(ua)) location.href = 'x-safari-' + location.href;
      } catch(e){}
      setTimeout(function(){
        document.removeEventListener('visibilitychange', onVis);
        if (!went && !document.hidden) { h.style.display = 'block'; m.textContent = 'Chưa tự mở được. Làm theo hướng dẫn bên trên.'; }
      }, 1800);
    });
    ov.querySelector('.cp').addEventListener('click', async function(){
      try { await navigator.clipboard.writeText(location.href); m.textContent = 'Đã sao chép link. Dán vào Chrome hoặc Safari.'; }
      catch(e){ var t = document.createElement('input'); t.value = location.href; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); m.textContent = 'Đã sao chép link. Dán vào Chrome hoặc Safari.'; } catch(x){ h.style.display = 'block'; } t.remove(); }
    });
  }
  if (lazy){ window.inAppBlock = function(){ if (!document.getElementById('iaOv')) build(); return true; }; return; }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
