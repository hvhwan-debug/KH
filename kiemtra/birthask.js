/* Hộp thoại xin ngày sinh (nhắc nhẹ, bỏ qua được) dùng chung cho Học liệu, Tra cứu, trang làm bài.
   Gọi: BirthAsk.ask({ tok, md })  — tok: vé ngắn hạn do máy chủ phát sau khi nhận diện; md: "MM-DD" nếu đã có ngày/tháng cũ.
   "Để sau" -> hôm nay không hỏi lại trên thiết bị này; hôm sau hỏi lại cho tới khi khai xong. */
(function(){
  if (window.BirthAsk) return;
  var KEY = 'kt_birthask_skip', open = false;
  function today(){ try { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); } catch(e){ return ''; } }
  function skipped(){ try { return localStorage.getItem(KEY) === today(); } catch(e){ return false; } }
  function setSkip(){ try { localStorage.setItem(KEY, today()); } catch(e){} }
  function clearSkip(){ try { localStorage.removeItem(KEY); } catch(e){} }
  function css(){
    if (document.getElementById('kbaCss')) return;
    var st = document.createElement('style'); st.id = 'kbaCss';
    st.textContent =
      '.kba-ov{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(8,28,70,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font-family:inherit}' +
      '.kba-card{width:100%;max-width:400px;background:#fff;border-radius:22px;padding:22px 20px 18px;box-shadow:0 24px 60px -16px rgba(5,25,70,.55);color:#14357A;text-align:center}' +
      '.kba-ic{width:64px;height:64px;margin:0 auto 8px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#E8F1FF,#D5E6FF);font-size:32px}' +
      '.kba-card h2{margin:0 0 6px;font-size:19px;line-height:1.3;font-weight:800;color:#14357A}' +
      '.kba-card p{margin:0 0 14px;font-size:14px;line-height:1.5;color:#4A5B7D}' +
      '.kba-row{display:flex;gap:8px;margin:0 0 6px}.kba-row label{flex:1;text-align:left;font-size:12px;font-weight:700;color:#5D6F8E}' +
      '.kba-row select{display:block;width:100%;margin-top:4px;height:46px;border:1.5px solid #CFDDF3;border-radius:12px;background:#F7FAFF;font:600 16px inherit;color:#14357A;padding:0 8px}' +
      '.kba-row select:focus{outline:none;border-color:#1F66E0;box-shadow:0 0 0 3px rgba(31,102,224,.18)}' +
      '.kba-row select.bad{border-color:#E53935}' +
      '.kba-msg{min-height:20px;margin:4px 0 8px;font-size:13px;font-weight:600;color:#D32F2F}' +
      '.kba-btn{display:block;width:100%;min-height:48px;border:0;border-radius:14px;font:800 16px inherit;cursor:pointer}' +
      '.kba-ok{background:linear-gradient(90deg,#2F8CF8,#1B57C9);color:#fff}.kba-ok:disabled{opacity:.6;cursor:default}' +
      '.kba-later{margin-top:8px;background:transparent;color:#5D6F8E;font-weight:700;font-size:14px}' +
      '.kba-note{margin-top:10px;font-size:11.5px;line-height:1.4;color:#7A8AA6}';
    document.head.appendChild(st);
  }
  function opts(from, to, label){ var h = '<option value="">' + label + '</option>'; if (from <= to) for (var i = from; i <= to; i++) h += '<option value="' + i + '">' + i + '</option>'; else for (var j = from; j >= to; j--) h += '<option value="' + j + '">' + j + '</option>'; return h; }
  function ask(b){
    if (!b || !b.tok || open || skipped()) return;
    css(); open = true;
    var ov = document.createElement('div'); ov.className = 'kba-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Cập nhật ngày sinh');
    var y0 = new Date().getFullYear() - 16;
    ov.innerHTML = '<div class="kba-card"><div class="kba-ic" aria-hidden="true">🎂</div><h2>Chúng tôi muốn hiểu bạn hơn!</h2>' +
      '<p>Chia sẻ ngày sinh để chúng tôi cá nhân hoá trải nghiệm và dành tặng bạn những điều thú vị, bắt đầu từ lời chúc mừng đúng ngày sinh nhật của bạn.</p>' +
      '<div class="kba-row"><label>Ngày<select id="kbaD">' + opts(1, 31, '—') + '</select></label><label>Tháng<select id="kbaM">' + opts(1, 12, '—') + '</select></label><label>Năm<select id="kbaY">' + opts(y0, 1950, '—') + '</select></label></div>' +
      '<div class="kba-msg" id="kbaMsg" role="alert"></div>' +
      '<button type="button" class="kba-btn kba-ok" id="kbaSave">Lưu ngày sinh</button>' +
      '<button type="button" class="kba-btn kba-later" id="kbaLater">Để sau</button>' +
      '<div class="kba-note">Ngày sinh chỉ dùng để gửi lời chúc mừng sinh nhật. Bạn có thể bỏ qua, hôm sau hệ thống sẽ hỏi lại.</div></div>';
    document.body.appendChild(ov);
    var $ = function(id){ return document.getElementById(id); };
    if (b.md && /^\d{2}-\d{2}$/.test(b.md)){ $('kbaM').value = String(parseInt(b.md.slice(0, 2), 10)); $('kbaD').value = String(parseInt(b.md.slice(3), 10)); } // đã có ngày/tháng: chỉ xin thêm năm
    function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); open = false; document.removeEventListener('keydown', onKey); }
    function later(){ setSkip(); close(); }
    function onKey(e){ if (e.key === 'Escape') later(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function(e){ if (e.target === ov) later(); });
    $('kbaLater').addEventListener('click', later);
    $('kbaSave').addEventListener('click', function(){
      var d = $('kbaD'), m = $('kbaM'), y = $('kbaY'), msg = $('kbaMsg');
      [d, m, y].forEach(function(s){ s.classList.toggle('bad', !s.value); });
      if (!d.value || !m.value || !y.value){ msg.textContent = 'Vui lòng chọn đủ ngày, tháng và năm sinh.'; return; }
      var t = new Date(Date.UTC(+y.value, +m.value - 1, +d.value));
      if (t.getUTCMonth() !== +m.value - 1 || t.getUTCDate() !== +d.value){ d.classList.add('bad'); msg.textContent = 'Ngày sinh không tồn tại, vui lòng kiểm tra lại.'; return; }
      var iso = y.value + '-' + (m.value.length < 2 ? '0' + m.value : m.value) + '-' + (d.value.length < 2 ? '0' + d.value : d.value);
      var btn = $('kbaSave'); btn.disabled = true; msg.textContent = '';
      fetch('/api/kt-birth', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Requested-With':'livotec' }, credentials:'same-origin', body: JSON.stringify({ tok: b.tok, birth: iso }) })
        .then(function(r){ return r.json().catch(function(){ return {}; }); })
        .then(function(j){
          if (j && j.ok){ clearSkip(); ov.querySelector('.kba-card').innerHTML = '<div class="kba-ic" aria-hidden="true">🎉</div><h2>Cảm ơn bạn đã chia sẻ!</h2><p style="margin:0">Hẹn gặp bạn vào ngày sinh nhật với một lời chúc thật đặc biệt nhé 🎁</p>'; setTimeout(close, 2200); return; }
          btn.disabled = false; msg.textContent = (j && j.error) || 'Không lưu được, vui lòng thử lại.';
          if (j && j.expired){ btn.style.display = 'none'; }
        })
        .catch(function(){ btn.disabled = false; msg.textContent = 'Không kết nối được máy chủ, vui lòng thử lại.'; });
    });
    setTimeout(function(){ try { $('kbaD').focus(); } catch(e){} }, 60);
  }
  window.BirthAsk = { ask: function(b){ setTimeout(function(){ ask(b); }, 900); } };
})();
