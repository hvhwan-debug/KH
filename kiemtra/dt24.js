/* Ô ngày giờ theo định dạng 24 giờ.
   Trình duyệt hiển thị <input type="datetime-local"> theo cài đặt máy (có thể là 12 giờ AM/PM) và không cho đổi bằng mã.
   Tệp này tự đổi mọi ô datetime-local thành hai ô: chọn ngày + gõ giờ dạng HH:mm (00:00 đến 23:59).
   Ô gốc được giữ lại (ẩn) và vẫn đọc/ghi .value dạng "YYYY-MM-DDTHH:mm" như cũ nên mã đang dùng không phải sửa. */
(function(){
'use strict';
var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function css(){
  if (document.getElementById('dt24Css')) return;
  var s = document.createElement('style'); s.id = 'dt24Css';
  s.textContent = '.dt24{display:flex;gap:8px;width:100%;align-items:center}.dt24 .dt24-d{flex:1.7;min-width:0;width:auto!important}.dt24 .dt24-t{flex:1;min-width:0;width:auto!important;text-align:center;letter-spacing:.04em}.dt24 .dt24-t.bad{border-color:#B3261E!important;box-shadow:0 0 0 3px rgba(179,38,30,.14)!important}';
  document.head.appendChild(s);
}
function normTime(v){ // "8:30", "0830", "08:30" -> "08:30"; không hợp lệ -> ""
  var m = /^(\d{1,2}):?(\d{2})$/.exec(String(v || '').trim());
  if (!m) return '';
  var h = +m[1], mi = +m[2];
  return h <= 23 && mi <= 59 ? (h < 10 ? '0' : '') + h + ':' + m[2] : '';
}
function build(el){
  css();
  el.setAttribute('data-dt24', '1');
  var init = desc.get.call(el), id = el.id;
  el.type = 'hidden';
  var wrap = document.createElement('span'); wrap.className = 'dt24';
  wrap.innerHTML = '<input type="date" class="dt24-d" aria-label="Ngày"><input type="text" class="dt24-t" inputmode="numeric" maxlength="5" placeholder="HH:mm" aria-label="Giờ, định dạng 24 giờ" autocomplete="off">';
  el.parentNode.insertBefore(wrap, el.nextSibling);
  var d = wrap.querySelector('.dt24-d'), t = wrap.querySelector('.dt24-t');
  if (id){
    d.id = id + '_d'; t.id = id + '_t';
    [].forEach.call(document.querySelectorAll('label[for="' + id + '"]'), function(l){ l.setAttribute('for', d.id); });
  }
  if (el.required){ d.required = true; t.required = true; }
  function compose(){
    var tv = normTime(t.value), ok = d.value && tv;
    t.classList.toggle('bad', !!t.value && !tv && t.value.length >= 4);
    desc.set.call(el, ok ? d.value + 'T' + tv : '');
  }
  function emit(){ el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  d.addEventListener('input', function(){ compose(); emit(); });
  d.addEventListener('change', function(){ compose(); emit(); });
  t.addEventListener('input', function(e){
    var v = t.value.replace(/[^\d:]/g, '');
    if (/^\d{2}$/.test(v) && !(e.inputType || '').startsWith('delete')) v += ':'; // gõ đủ 2 số giờ thì tự thêm dấu :
    t.value = v.slice(0, 5);
    compose(); emit();
  });
  t.addEventListener('blur', function(){ var n = normTime(t.value); if (n) t.value = n; compose(); emit(); });
  function fromValue(v){
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    d.value = m ? m[1] : ''; t.value = m ? m[2] + ':' + m[3] : ''; t.classList.remove('bad');
  }
  Object.defineProperty(el, 'value', { configurable: true, get: function(){ return desc.get.call(el); }, set: function(v){ desc.set.call(el, v); fromValue(v); } });
  fromValue(init);
}
function upgrade(root){ [].forEach.call((root || document).querySelectorAll('input[type=datetime-local]:not([data-dt24])'), build); }
window.KTDt24 = { upgrade: upgrade, normTime: normTime };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ upgrade(); }); else upgrade();
})();
