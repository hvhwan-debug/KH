/* Thanh menu dùng chung cho mọi trang của hệ thống kiểm tra (Trang chủ, Học liệu, Tra cứu kết quả, Lịch sử làm bài, Hướng dẫn, Hỗ trợ).
   Cùng một giao diện, thứ tự, nhãn và biểu tượng ở mọi trang; giống thanh menu của trang chủ /kiemtra/.
   Dùng:  <script src="/kiemtra/topnav.js" data-hide="(selector các thanh menu cũ cần ẩn)"
                  data-guide="(selector nút Hướng dẫn cũ)" data-support="(selector nút Hỗ trợ cũ)"></script>
   Nút Hướng dẫn / Hỗ trợ bấm vào nút cũ (đã ẩn) của trang, nên hộp thoại riêng của từng trang vẫn hoạt động như trước. */
(function(){
  var me = document.currentScript; if (!me || document.getElementById('ktBar')) return;
  var cfg = { hide: me.getAttribute('data-hide') || '', guide: me.getAttribute('data-guide') || '', support: me.getAttribute('data-support') || '' };
  var IC = {"Trang chủ": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 11.5 12 4l9 7.5\"/><path d=\"M5.5 10v10h13V10M10 20v-5h4v5\"/></svg>", "Học liệu": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 5.5C6 4 9 4.2 12 6c3-1.8 6-2 9-.5V19c-3-1.5-6-1.3-9 .5-3-1.8-6-2-9-.5z\"/><path d=\"M12 6v13.5\"/></svg>", "Tra cứu kết quả": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/></svg>", "Lịch sử làm bài": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 12a9 9 0 1 0 3-6.7\"/><path d=\"M3 4v5h5\"/><path d=\"M12 7.5V12l3 2\"/></svg>", "Hướng dẫn": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17v.1\"/></svg>", "Hỗ trợ": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 14v-2a8 8 0 0 1 16 0v2\"/><rect x=\"3\" y=\"14\" width=\"4\" height=\"6\" rx=\"1.5\"/><rect x=\"17\" y=\"14\" width=\"4\" height=\"6\" rx=\"1.5\"/><path d=\"M19 20c0 1.5-2 2-5 2\"/></svg>"};
  var BURGER = "<svg class=\"m\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16M4 12h16M4 17h16\"/></svg> <svg class=\"x\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg>";
  var p = location.pathname, h = location.hash;
  var cur = /hoclieu/.test(p) ? 'hoclieu' : /tracuu/.test(p) ? (h === '#lichsu' ? 'lichsu' : 'tracuu') : /ketqua/.test(p) ? 'tracuu' : 'home';
  var ITEMS = [
    ['home', 'a', '/kiemtra/', 'Trang chủ'], ['hoclieu', 'a', '/kiemtra/hoclieu.html', 'Học liệu'],
    ['tracuu', 'a', '/kiemtra/tracuu.html', 'Tra cứu kết quả'], ['lichsu', 'a', '/kiemtra/tracuu.html#lichsu', 'Lịch sử làm bài'],
    ['guide', 'button', '', 'Hướng dẫn'], ['support', 'button', '', 'Hỗ trợ']
  ];
  var css = ''
  + (cfg.hide ? cfg.hide + '{display:none!important}' : '')
  + '.kt-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:14px;height:76px;box-sizing:border-box;padding:0 clamp(24px,4.5vw,78px);'
  +   'font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:rgba(255,255,255,.86);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(190,210,235,.6)}'
  + '.kt-brand{display:flex;align-items:center;gap:12px;min-width:0;font-weight:800;font-size:18px;color:#0B1F4B;text-decoration:none}'
  + '.kt-mark{flex:0 0 auto;width:44px;height:44px;box-sizing:border-box;border-radius:14px;background:#fff;display:grid;place-items:center;padding:5px;box-shadow:0 5px 18px rgba(22,76,140,.1)}'
  + '.kt-mark img{width:100%;height:100%;object-fit:contain;display:block}'
  + '.kt-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.kt-nav{display:flex;align-items:center;gap:4px;margin-left:auto}'
  + '.kt-nav a,.kt-nav button{position:relative;display:inline-flex;align-items:center;gap:8px;margin:0;border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:700;letter-spacing:-.1px;line-height:1.2;color:#29466e;padding:9px 14px;border-radius:99px;text-decoration:none;white-space:nowrap;cursor:pointer;box-shadow:none;transition:background .15s,color .15s}'
  + '.kt-nav a:hover,.kt-nav button:hover{background:rgba(27,120,232,.1)}'
  + '.kt-nav a:focus-visible,.kt-nav button:focus-visible,.kt-burger:focus-visible{outline:3px solid #9CC8FF;outline-offset:2px}'
  + '.kt-nav a.cur,.kt-nav a.cur:hover{color:#fff;font-weight:800;background:linear-gradient(100deg,#1B78E8,#0B5BD6);box-shadow:0 8px 18px -10px rgba(10,90,215,.85)}'
  + '.kt-nav>*+*::before{content:"";position:absolute;left:-2px;top:50%;width:1px;height:16px;background:rgba(41,70,110,.22);transform:translateY(-50%);pointer-events:none}'
  + '.kt-nav a.cur::before,.kt-nav a.cur+*::before{display:none}'
  + '.kt-nav svg{width:17px;height:17px;flex:0 0 auto}'
  + '.kt-burger{display:none;place-items:center;flex:0 0 auto;width:44px;height:44px;margin-left:auto;padding:0;border:0;border-radius:12px;background:transparent;color:#29466e;cursor:pointer}'
  + '.kt-burger:hover,.kt-bar.open .kt-burger{background:rgba(27,120,232,.1)}'
  + '.kt-burger svg{width:24px;height:24px}.kt-burger .x{display:none}.kt-bar.open .kt-burger .x{display:block}.kt-bar.open .kt-burger .m{display:none}'
  + '@media(min-width:861px) and (max-width:1180px){.kt-nav svg{display:none}.kt-nav a,.kt-nav button{padding:8px 10px;font-size:12.5px}.kt-nav a.cur{padding:8px 16px}}'
  + '@media(max-width:860px){.kt-bar{height:66px;padding:0 4vw;gap:10px}.kt-brand{font-size:14px;gap:10px;line-height:1.2}.kt-name{white-space:normal}.kt-mark{width:38px;height:38px;border-radius:12px}.kt-nav a,.kt-nav button{padding:8px 9px;font-size:12px}.kt-nav svg{display:none}}'
  + '@media(max-width:560px){.kt-bar{height:60px;padding:0 14px}.kt-mark{width:36px;height:36px}'
  +   '.kt-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13.5px;line-height:1.25}'
  +   '.kt-burger{display:grid}'
  +   '.kt-nav{display:none;position:absolute;top:calc(100% + 6px);right:12px;z-index:50;flex-direction:column;align-items:stretch;gap:2px;min-width:230px;padding:6px;margin:0;background:#fff;border:1px solid rgba(41,70,110,.14);border-radius:16px;box-shadow:0 18px 40px -14px rgba(10,37,82,.4)}'
  +   '.kt-bar.open .kt-nav{display:flex}.kt-nav>*+*::before{display:none}'
  +   '.kt-nav a,.kt-nav button{width:100%;justify-content:flex-start;gap:12px;padding:12px 14px;font-size:15px;font-weight:600;border-radius:11px;text-align:left}'
  +   '.kt-nav a:hover,.kt-nav button:hover{background:#EEF4FB}.kt-nav svg{display:block;width:20px;height:20px;color:#0A63C4}.kt-nav a.cur svg{color:#fff}}'
  + 'html{scroll-padding-top:84px}@media(max-width:860px){html{scroll-padding-top:72px}}@media print{.kt-bar{display:none}}';
  var st = document.createElement('style'); st.id = 'ktBarCss'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  var bar = document.createElement('header'); bar.className = 'kt-bar'; bar.id = 'ktBar';
  bar.innerHTML = '<a class="kt-brand" href="/kiemtra/"><span class="kt-mark"><img src="/kiemtra/logo-mark.png" alt=""></span><span class="kt-name">Hệ thống kiểm tra đánh giá trực tuyến</span></a>'
    + '<button type="button" class="kt-burger" id="ktBurger" aria-label="Mở menu" aria-expanded="false" aria-controls="ktNav">' + BURGER + '</button>'
    + '<nav class="kt-nav" id="ktNav" aria-label="Điều hướng">' + ITEMS.map(function(it){
        var c = it[0] === cur ? ' class="cur" aria-current="page"' : '';
        return it[1] === 'a' ? '<a href="' + it[2] + '"' + c + ' title="' + it[3] + '">' + IC[it[3]] + '<span>' + it[3] + '</span></a>'
                             : '<button type="button" data-kt="' + it[0] + '" title="' + it[3] + '">' + IC[it[3]] + '<span>' + it[3] + '</span></button>';
      }).join('') + '</nav>';
  function mount(){ if (!bar.parentNode) document.body.insertBefore(bar, document.body.firstChild); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  var bt = bar.querySelector('#ktBurger');
  function set(on){ bar.classList.toggle('open', on); bt.setAttribute('aria-expanded', on ? 'true' : 'false'); bt.setAttribute('aria-label', on ? 'Đóng menu' : 'Mở menu'); }
  bt.addEventListener('click', function(e){ e.stopPropagation(); set(!bar.classList.contains('open')); });
  document.addEventListener('click', function(e){ if (!bar.contains(e.target)) set(false); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') set(false); });
  bar.querySelector('#ktNav').addEventListener('click', function(e){
    var b = e.target.closest('[data-kt]'), a = e.target.closest('a'); if (!b && !a) return; set(false);
    if (a){ // cùng trang, chỉ đổi #lichsu: báo trang tự chuyển mục
      if (a.pathname === location.pathname && a.hash !== location.hash){ setTimeout(function(){ try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (x) {} }, 0); }
      return;
    }
    var sel = cfg[b.getAttribute('data-kt')], t = sel && document.querySelector(sel);
    if (t) t.click(); else location.href = '/kiemtra/#' + b.getAttribute('data-kt');
  });
  window.addEventListener('hashchange', function(){ // cập nhật mục đang chọn khi đổi giữa Tra cứu / Lịch sử
    if (!/tracuu/.test(location.pathname)) return; var k = location.hash === '#lichsu' ? 'lichsu' : 'tracuu';
    bar.querySelectorAll('#ktNav a').forEach(function(x, i){ var on = ITEMS[i][0] === k; x.classList.toggle('cur', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  });
})();
