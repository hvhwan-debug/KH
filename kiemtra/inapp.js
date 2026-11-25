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

  var css = '#iaOv{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(160deg,#0B1F5C,#13317F);color:#fff;font-family:"Times New Roman",Arial,sans-serif;text-align:center}' +
    '#iaOv .b{max-width:380px;width:100%}#iaOv h1{margin:0 0 10px;font-size:24px;line-height:1.25;color:#F5C451}' +
    '#iaOv p{margin:0 0 20px;font-size:17px;line-height:1.5}' +
    '#iaOv button{display:block;width:100%;border:0;border-radius:14px;padding:16px;font-size:18px;font-weight:700;cursor:pointer;font-family:inherit}' +
    '#iaOv .go{background:#F5C451;color:#0B1F5C;margin-bottom:12px}#iaOv .cp{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.35)}' +
    '#iaOv .h{margin-top:18px;font-size:15px;text-align:left;display:none;background:rgba(255,255,255,.1);border-radius:12px;padding:12px 16px}' +
    '#iaOv .m{margin-top:12px;font-size:15px;min-height:20px}';

  function build(){
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'iaOv'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="b"><h1>Mở bằng trình duyệt</h1>' +
      '<p>Bạn đang mở trang này trong <b></b>. Để dùng camera và làm bài, bắt buộc phải mở bằng Chrome hoặc Safari.</p>' +
      '<button type="button" class="go">Bấm để mở bằng trình duyệt</button>' +
      '<button type="button" class="cp">Sao chép link</button>' +
      '<div class="h">Nếu chưa tự mở được: bấm <b>⋯</b> ở góc trên bên phải, chọn <b>Mở bằng trình duyệt</b>, hoặc sao chép link rồi dán vào Chrome / Safari.</div>' +
      '<div class="m" role="status"></div></div>';
    ov.querySelector('b').textContent = name;
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
