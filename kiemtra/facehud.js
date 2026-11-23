/* FaceHUD: màn xác thực khuôn mặt dùng chung (xem lại bài, tra cứu bài kiểm tra), cùng kiểu giao diện màn đăng nhập khuôn mặt.
   - Khung camera dọc 3:4, oval định vị, tia quét, góc khung, chỉ số FACES / CONF.
   - Bảng tiến trình HUD: bước hiện tại/tổng, tên bước, %, thanh phân đoạn phát sáng.
   - Tự chụp khi khuôn mặt đúng vị trí và giữ yên (vòng oval đầy dần); lúc chụp: chớp sáng + tiếng màn trập + rung nhẹ,
     ảnh ĐỨNG YÊN kèm nhãn "ĐÃ CHỤP ẢNH" để người dùng biết đã chụp xong và hệ thống đang đối chiếu.
   - Âm thanh Web Audio (mở khoá đúng cách trên điện thoại), bật/tắt chung khoá kt_snd với màn đăng nhập.
   - Thử thách sống (máy chủ /api/kt-live cấp thứ tự ngẫu nhiên): nhìn thẳng / quay trái / quay phải, tự chụp khi người dùng quay thật,
     gửi kèm { token, frames } để máy chủ đo lại góc quay -> chặn giơ ảnh / màn hình người khác.
   Dùng: FaceHUD.open({ title, kicker, target, verify(photo, live) -> Promise<json>, done(json), fail(json) -> false | {note} })
         verify nhận ảnh JPEG (data URL, vuông 480px, vùng giữa khung). fail trả false = trang tự xử lý (đã đóng), {note} = thêm dòng gợi ý. */
(function(){
'use strict';
if (window.FaceHUD) return;

var CSS = [
'.fh{position:fixed;inset:0;z-index:320;display:flex;justify-content:center;overflow-y:auto;color:#E8F6FF;font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
'  background:radial-gradient(120% 70% at 50% -10%,#123E8C 0%,#0A2156 45%,#050E2B 100%);-webkit-font-smoothing:antialiased}',
'.fh.hide{display:none}',
'.fh::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(92,225,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(92,225,255,.05) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%);mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%)}',
/* tia sáng chéo trang trí (giống nền xanh có sóng/tia sáng dùng chung trên các trang) */
'.fh::after{content:"";position:fixed;inset:0;pointer-events:none;opacity:.8;mix-blend-mode:screen;',
'  background:linear-gradient(118deg,transparent 36%,rgba(160,225,255,.05) 42%,rgba(200,240,255,.16) 46%,rgba(160,225,255,.05) 50%,transparent 56%),',
'  linear-gradient(118deg,transparent 58%,rgba(120,205,255,.09) 64%,transparent 72%),',
'  linear-gradient(62deg,transparent 72%,rgba(140,215,255,.12) 80%,transparent 90%),',
'  radial-gradient(60% 40% at 100% 0%,rgba(90,190,255,.22),transparent 65%),',
'  radial-gradient(55% 38% at 0% 100%,rgba(60,170,255,.18),transparent 65%)}',
'.fh-in{position:relative;width:100%;max-width:470px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:calc(18px + env(safe-area-inset-top,0px)) 18px calc(18px + env(safe-area-inset-bottom,0px));margin:auto 0}',
'.fh-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
'.fh-k{display:block;font:700 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.28em;color:#5CE1FF;margin-bottom:7px}',
'.fh h2{margin:0;font-size:21px;line-height:1.25;font-weight:800;color:#fff;letter-spacing:-.01em}',
'.fh-hr{display:flex;gap:8px;flex:0 0 auto}',
'.fh-ib{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;padding:0;cursor:pointer;color:#BFE9FF;background:rgba(255,255,255,.06);border:1px solid rgba(92,225,255,.35);font:inherit}',
'.fh-ib svg{width:18px;height:18px}.fh-ib:hover{background:rgba(92,225,255,.16)}',
'.fh-snd .mt{display:none}.fh-snd.off{color:rgba(190,225,245,.5)}.fh-snd.off .on{display:none}.fh-snd.off .mt{display:block}',
'.fh-snd.wait{color:#FFD27A;border-color:rgba(255,200,87,.7);animation:fhWait 1.4s ease-in-out infinite}',
'@keyframes fhWait{0%,100%{box-shadow:0 0 0 0 rgba(255,200,87,.55)}60%{box-shadow:0 0 0 9px rgba(255,200,87,0)}}',
'.fh-chip{--c:#5CE1FF;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:5px 12px;border-radius:999px;color:var(--c);border:1px solid rgba(92,225,255,.35);background:rgba(92,225,255,.1);',
'  border-color:color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent);font-size:10.5px;font-weight:800;letter-spacing:.13em;line-height:1.6;white-space:nowrap}',
'.fh-chip span{overflow:hidden;text-overflow:ellipsis}',
'.fh-chip i{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);animation:fhBlink 1.2s ease-in-out infinite}',
'.fh-chip.seek{--c:#FFC857}.fh-chip.ok{--c:#3DF0A0}.fh-chip.bad{--c:#FF5C7A}.fh-chip.scan{--c:#A99BFF}',
'@keyframes fhBlink{50%{opacity:.3}}',
/* khung camera */
'.fh-box{position:relative;align-self:center;width:min(100%,calc((100dvh - 360px) * .75),420px);min-width:min(100%,230px);aspect-ratio:3/4;border-radius:24px;overflow:hidden;background:#020814;',
'  border:1px solid rgba(92,225,255,.3);box-shadow:0 0 0 1px rgba(255,255,255,.03),0 18px 50px -12px rgba(0,0,0,.7),0 0 40px -14px rgba(92,225,255,.55)}',
'.fh-box video,.fh-box .fh-shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}',
'.fh-box .fh-shot{display:none}.fh[data-st="check"] .fh-shot,.fh[data-st="ok"] .fh-shot,.fh[data-st="bad"] .fh-shot{display:block}',
'.fh-box::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 62% 54% at 50% 50%,transparent 60%,rgba(2,8,20,.55) 100%)}',
'.fh-ov{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;overflow:visible}',
'.fh-ov .g{fill:none;stroke:rgba(92,225,255,.55);stroke-width:1.6;stroke-dasharray:5 7}',
'.fh-ov .p{fill:none;stroke:#5CE1FF;stroke-width:4.5;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;filter:drop-shadow(0 0 6px rgba(92,225,255,.9));transition:stroke-dashoffset .18s linear,stroke .3s}',
'.fh-ov .x{stroke:rgba(92,225,255,.5);stroke-width:1.5}',
'.fh[data-st="hold"] .fh-ov .p{stroke:#7CF5C4;filter:drop-shadow(0 0 8px rgba(61,240,160,.9))}',
'.fh[data-st="ok"] .fh-ov .p{stroke:#3DF0A0;stroke-dashoffset:0}.fh[data-st="bad"] .fh-ov .p{stroke:#FF5C7A;stroke-dashoffset:0;filter:drop-shadow(0 0 8px rgba(255,92,122,.9))}',
'.fh[data-st="check"] .fh-ov .p{stroke:#A99BFF;stroke-dashoffset:0;filter:drop-shadow(0 0 8px rgba(169,155,255,.9))}',
'.fh-cn{position:absolute;z-index:3;width:30px;height:30px;border:3px solid #5CE1FF;pointer-events:none;filter:drop-shadow(0 0 6px rgba(92,225,255,.7))}',
'.fh-cn.a{top:14px;left:14px;border-right:0;border-bottom:0;border-top-left-radius:12px}.fh-cn.b{top:14px;right:14px;border-left:0;border-bottom:0;border-top-right-radius:12px}',
'.fh-cn.c{bottom:14px;left:14px;border-right:0;border-top:0;border-bottom-left-radius:12px}.fh-cn.d{bottom:14px;right:14px;border-left:0;border-top:0;border-bottom-right-radius:12px}',
'.fh-sweep{position:absolute;left:6%;right:6%;height:70px;top:-70px;z-index:2;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(92,225,255,.22) 80%,rgba(160,240,255,.9) 99%,transparent);animation:fhSweep 2.4s ease-in-out infinite}',
'.fh[data-st="check"] .fh-sweep{background:linear-gradient(180deg,transparent,rgba(169,155,255,.25) 80%,rgba(210,200,255,.95) 99%,transparent);animation-duration:1.3s}',
'.fh[data-st="ok"] .fh-sweep,.fh[data-st="bad"] .fh-sweep,.fh[data-st="off"] .fh-sweep{display:none}',
'@keyframes fhSweep{0%{top:-70px}100%{top:100%}}',
'.fh-rd{position:absolute;left:18px;right:18px;bottom:20px;z-index:3;display:flex;justify-content:space-between;font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.18em;color:rgba(190,240,255,.85);text-shadow:0 1px 4px #000;pointer-events:none}',
'.fh-hint{position:absolute;left:0;right:0;margin:0 auto;width:max-content;bottom:46px;z-index:4;max-width:88%;box-sizing:border-box;padding:8px 15px;border-radius:999px;font-size:13.5px;font-weight:700;line-height:1.35;text-align:center;color:#fff;',
'  background:rgba(4,14,36,.72);border:1px solid rgba(92,225,255,.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:border-color .2s,color .2s}',
'.fh-hint.ok{border-color:rgba(61,240,160,.7);color:#C9FFE6}.fh-hint.bad{border-color:rgba(255,92,122,.75);color:#FFD3DB}.fh-hint.chk{border-color:rgba(169,155,255,.75);color:#E6E1FF}',
'.fh-hint:empty{display:none}',
'.fh-badge{position:absolute;top:22px;left:50%;z-index:4;transform:translate(-50%,-6px);opacity:0;display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:rgba(61,240,160,.92);color:#032;font-size:11.5px;font-weight:800;letter-spacing:.1em;white-space:nowrap;transition:opacity .25s,transform .25s;pointer-events:none}',
'.fh-badge svg{width:15px;height:15px}',
'.fh[data-st="check"] .fh-badge,.fh[data-st="ok"] .fh-badge,.fh[data-st="bad"] .fh-badge{opacity:1;transform:translate(-50%,0)}',
/* mũi tên chỉ hướng quay mặt (khung đã lật gương nên quay TRÁI của người dùng = mũi tên trái trên màn hình) */
'.fh-arrow{position:absolute;top:50%;z-index:4;display:none;gap:0;transform:translateY(-50%);color:#7CF5C4;filter:drop-shadow(0 0 10px rgba(61,240,160,.8));pointer-events:none}',
'.fh-arrow{padding:10px 8px;border-radius:999px;background:rgba(4,14,36,.55);border:1px solid rgba(124,245,196,.45)}','.fh-arrow svg{width:46px;height:46px;margin:0 -15px;stroke-width:3.2}',
'.fh-arrow.l{display:flex;left:12px;animation:fhNudgeL 1s ease-in-out infinite}.fh-arrow.r{display:flex;right:12px;transform:translateY(-50%) scaleX(-1);animation:fhNudgeR 1s ease-in-out infinite}',
'@keyframes fhNudgeL{50%{margin-left:-10px;opacity:.55}}@keyframes fhNudgeR{50%{margin-right:-10px;opacity:.55}}',
'.fh-arrow svg:last-child{opacity:.6}',
'.fh-flash{position:absolute;inset:0;z-index:5;background:#fff;opacity:0;pointer-events:none}',
'.fh-flash.go{animation:fhFlash .55s ease-out}@keyframes fhFlash{0%{opacity:.95}100%{opacity:0}}',
'.fh-res{position:absolute;inset:0;z-index:4;display:grid;place-items:center;pointer-events:none;opacity:0;transition:opacity .3s}',
'.fh-res svg{width:92px;height:92px;filter:drop-shadow(0 6px 24px rgba(0,0,0,.5));transform:scale(.6);transition:transform .35s cubic-bezier(.2,1.4,.4,1)}',
'.fh[data-st="ok"] .fh-res,.fh[data-st="bad"] .fh-res{opacity:1}.fh[data-st="ok"] .fh-res svg,.fh[data-st="bad"] .fh-res svg{transform:scale(1)}',
'.fh[data-st="bad"] .fh-box{animation:fhShake .45s}@keyframes fhShake{20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}',
/* bảng tiến trình HUD */
'.fh-pipe{position:relative;box-sizing:border-box;padding:13px 15px 11px;border-radius:17px;overflow:hidden;background:linear-gradient(160deg,rgba(18,44,86,.55),rgba(6,14,34,.75));border:1px solid rgba(92,225,255,.22);',
'  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 0 30px -12px rgba(92,225,255,.5)}',
'.fh-now{display:flex;align-items:baseline;gap:11px;min-width:0}',
'.fh-n{flex:0 0 auto;font:700 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;color:#5CE1FF}',
'.fh-n i,.fh-p i{font-style:normal;opacity:.55}',
'.fh-t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14.5px;font-weight:700;color:#fff}',
'.fh-p{flex:0 0 auto;font:700 21px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#E8FAFF;font-variant-numeric:tabular-nums}',
'.fh-p i{font-size:12px}',
/* các bước xác thực: vòng tròn đánh số nối tiếp nhau (giống mẫu màn AI) */
'.fh-seg{display:flex;align-items:flex-start;justify-content:space-between;gap:2px;margin:14px 0 0;padding:0;list-style:none;counter-reset:fhstep}',
'.fh-seg li{position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:2px;font-size:9.5px;font-weight:700;line-height:1.25;color:rgba(190,220,245,.55);text-align:center}',
'.fh-seg li::before{counter-increment:fhstep;content:counter(fhstep);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:800 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(190,225,245,.12);color:rgba(210,232,255,.65);border:1.5px solid rgba(92,225,255,.25);z-index:1;transition:background .25s,border-color .25s,color .25s,box-shadow .25s}',
'.fh-seg li:not(:last-child)::after{content:"";position:absolute;top:14px;left:50%;width:100%;height:2px;background:rgba(92,225,255,.18);z-index:0}',
'.fh-seg li.ok{color:#7CF5C4}',
'.fh-seg li.ok::before{content:"✓";background:linear-gradient(135deg,#2BD7A0,#3DF0A0);border-color:transparent;color:#03241a;box-shadow:0 0 12px rgba(61,240,160,.6)}',
'.fh-seg li.ok:not(:last-child)::after{background:linear-gradient(90deg,#2BD7A0,#5CE1FF)}',
'.fh-seg li.run{color:#fff}',
'.fh-seg li.run::before{background:#0C1E3F;border-color:#5CE1FF;color:#5CE1FF;box-shadow:0 0 0 4px rgba(92,225,255,.22),0 0 14px rgba(92,225,255,.65);animation:fhSegPulse 1.4s ease-in-out infinite}',
'@keyframes fhSegPulse{0%,100%{box-shadow:0 0 0 4px rgba(92,225,255,.22),0 0 14px rgba(92,225,255,.65)}50%{box-shadow:0 0 0 7px rgba(92,225,255,.1),0 0 18px rgba(92,225,255,.8)}}',
'.fh-seg li.bad{color:#FFB3C2}',
'.fh-seg li.bad::before{content:"✕";background:linear-gradient(135deg,#FF5C7A,#FF8BA0);border-color:transparent;color:#2a0007;box-shadow:0 0 12px rgba(255,92,122,.6)}',
/* thanh phần trăm lớn dưới các bước */
'.fh-bar{margin-top:13px}',
'.fh-bar-row{display:flex;align-items:baseline;justify-content:space-between;font-size:12px;font-weight:700;color:rgba(222,238,255,.72);margin-bottom:7px}',
'.fh-bar-row em{font-style:normal;font-weight:800;font-size:15px;color:#fff}',
'.fh-bar-track{height:9px;border-radius:999px;background:rgba(190,225,245,.14);overflow:hidden}',
'.fh-bar-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#0ea5e9,#22d3ee 55%,#3DF0A0);transition:width .25s ease;box-shadow:0 0 10px rgba(92,225,255,.6)}',
'.fh-pipe[data-st="bad"] .fh-bar-fill{background:linear-gradient(90deg,#FF5C7A,#FF8BA0)}',
'.fh-s{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:10.5px;font-weight:800;letter-spacing:.14em;line-height:1.5;color:#9FE8FF}',
'.fh-s i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor;animation:fhBlink 1.2s ease-in-out infinite}',
'.fh-s em{margin-left:auto;font:700 9.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-style:normal;opacity:.4;letter-spacing:.24em}',
'.fh-pipe[data-st="ok"]{border-color:rgba(61,240,160,.45)}.fh-pipe[data-st="ok"] .fh-n,.fh-pipe[data-st="ok"] .fh-s{color:#7CF5C4}.fh-pipe[data-st="ok"] .fh-s i{animation:none}',
'.fh-pipe[data-st="bad"]{border-color:rgba(255,92,122,.5)}.fh-pipe[data-st="bad"] .fh-n,.fh-pipe[data-st="bad"] .fh-s{color:#FF9CB0}.fh-pipe[data-st="bad"] .fh-s i{animation:none}.fh-pipe[data-st="bad"] .fh-t{color:#FFD3DB}',
/* thông báo + nút */
/* huy hiệu AI + phụ đề + nút hướng dẫn trên đầu trang */
'.fh-htop{display:flex;align-items:flex-start;gap:12px;flex:1 1 auto;min-width:0}',
'.fh-ic{flex:0 0 auto;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#0ea5e9,#22d3ee);color:#03182e;box-shadow:0 8px 20px -8px rgba(34,211,238,.7)}',
'.fh-ic svg{width:22px;height:22px}',
'.fh-sub{margin:3px 0 0;font-size:12.5px;line-height:1.4;color:rgba(210,232,255,.68);max-width:48ch}',
'.fh-guide{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(92,225,255,.35);background:rgba(92,225,255,.08);color:#BFE9FF;font:700 12.5px/1 inherit;cursor:pointer;white-space:nowrap}',
'.fh-guide svg{width:15px;height:15px}',
'.fh-guide:hover{background:rgba(92,225,255,.18)}',
'@media(max-width:480px){.fh-guide span{display:none}.fh-guide{width:36px;height:36px;padding:0;border-radius:50%;justify-content:center}}',
/* nhãn "camera đang hoạt động" + cụm nút góc khung camera */
'.fh-live{position:absolute;top:14px;left:14px;z-index:4;display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;background:rgba(4,14,36,.6);border:1px solid rgba(61,240,160,.4);font-size:11px;font-weight:800;letter-spacing:.05em;color:#CFFFE9;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
'.fh-live i{width:7px;height:7px;border-radius:50%;background:#3DF0A0;box-shadow:0 0 8px #3DF0A0;animation:fhBlink 1.2s ease-in-out infinite}',
'.fh[data-st="off"] .fh-live{display:none}',
'.fh-ctools{position:absolute;top:14px;right:14px;z-index:4;display:flex;gap:8px}',
'.fh-ctools .fh-ib{width:34px;height:34px;background:rgba(4,14,36,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
/* thẻ nhỏ "đang xác thực khuôn mặt" phía trên các bước, bên panel phải */
'.fh-mini{display:flex;align-items:center;gap:12px;margin-bottom:2px}',
'.fh-mini .fh-ic{width:38px;height:38px;border-radius:11px}',
'.fh-mini .fh-ic svg{width:20px;height:20px}',
'.fh-mini h3{margin:0;font-size:15px;font-weight:800;color:#fff}',
'.fh-mini p{margin:2px 0 0;font-size:11px;line-height:1.3;color:rgba(210,232,255,.58)}',
/* bảng lưu ý thay cho dòng mẹo cũ */
'.fh-tips{display:flex;flex-direction:column;gap:11px;padding:15px 16px;border-radius:17px;border:1px solid rgba(255,200,87,.28);background:linear-gradient(160deg,rgba(60,44,6,.35),rgba(10,16,34,.5))}',
'.fh-tips.pulse{animation:fhPulseTip 1.6s ease}',
'@keyframes fhPulseTip{0%,100%{box-shadow:none}30%{box-shadow:0 0 0 3px rgba(255,200,87,.55)}}',
'.fh-tips-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:#FFD27A}',
'.fh-tips-h svg{width:16px;height:16px;flex:0 0 auto}',
'.fh-tips-g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
'.fh-tips-g div{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:10.5px;line-height:1.3;color:rgba(214,234,255,.75)}',
'.fh-tips-g svg{width:19px;height:19px;color:#5CE1FF}',
'.fh-msg:empty{display:none}',
'.fh-msg .pmsg{margin:0;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.55;background:rgba(255,107,107,.16);color:#FFD6D6;border:1px solid rgba(255,107,107,.45)}',
'.fh-msg .pmsg.idw{padding:12px 14px;border-color:rgba(255,107,107,.7);background:rgba(255,92,122,.16)}',
'.fh-msg .pmsg.idw b{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;letter-spacing:.06em;color:#FF8FA3;margin-bottom:5px}',
'.fh-msg .pmsg.idw b::before{content:"\\26A0";font-size:15px;letter-spacing:0}',
'.fh-msg .pmsg.idw span{display:block}',
'.fh-msg .note{margin:8px 2px 0;font-size:12.5px;line-height:1.55;color:rgba(220,236,255,.75)}',
'.fh-btns{display:flex;flex-direction:column;gap:9px}.fh-btns:empty{display:none}',
'.fh-b{width:100%;min-height:50px;border-radius:14px;border:1.5px solid rgba(92,225,255,.45);background:rgba(92,225,255,.08);color:#E8FAFF;font:inherit;font-size:15px;font-weight:800;cursor:pointer}',
'.fh-b.go{border:0;color:#fff;background:linear-gradient(100deg,#0869df,#08b9d4);box-shadow:0 12px 26px -8px rgba(8,140,232,.7)}',
'.fh-b.hide{display:none}',
'.fh-side{display:contents}',
'.fh-head{order:1}.fh-chip{order:2}.fh-box{order:3}.fh-pipe,.fh-msg,.fh-btns,.fh-tips{order:4}',

/* máy tính: camera ngang bên trái, bảng tiến trình bên phải — giống màn đăng nhập bằng khuôn mặt */
'@media(min-width:900px) and (min-height:540px){',
'  .fh-in{max-width:1560px;display:grid;grid-template-columns:minmax(0,1fr) 452px;column-gap:32px;align-items:center;padding:24px 28px}',
'  .fh-box{order:0;width:min(100%,calc((100dvh - 60px) * 1.3333));max-width:none;aspect-ratio:4/3;justify-self:center}',
'  .fh-side{display:flex;flex-direction:column;gap:12px;padding:22px 22px 18px;border-radius:22px;border:1px solid rgba(92,225,255,.25);background:rgba(8,26,64,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
'  .fh-head,.fh-chip,.fh-pipe,.fh-msg,.fh-btns,.fh-tips{order:0}',
'  .fh h2{font-size:18px}',
'}',
'@media(max-width:420px){.fh-in{padding-left:14px;padding-right:14px;gap:10px}.fh h2{font-size:19px}.fh-hint{font-size:12.5px;bottom:42px}}',
'@media(prefers-reduced-motion:reduce){.fh-arrow,.fh-sweep,.fh-seg li.run::before,.fh-chip i,.fh-s i,.fh-snd.wait{animation:none!important}}',
'/* ===== GIAO DIỆN SÁNG đồng bộ với màn xác thực khuôn mặt của trang làm bài (kiemtra/index.html) =====',
'   Điện thoại: tiêu đề giữa, camera dọc có 4 góc ngắm, câu nhắc ở đáy camera, thẻ trắng: tên bước + % + các bước.',
'   Máy tính: biểu tượng cạnh tiêu đề, camera ngang có khung oval phát sáng, thẻ ngang: bước | các bước | % hoàn thành. */',
'.fh.fh{--ink:#0B1F5C;--mut:#5F6F8C;--blue:#1F6BF5;--okc:#2DBE6C;--line:#DDE4EF;color:var(--ink);',
'  background:radial-gradient(70% 30% at 100% 0%,rgba(150,195,255,.35),transparent 70%),radial-gradient(80% 30% at 0% 100%,rgba(170,205,255,.3),transparent 70%),linear-gradient(180deg,#F6F9FE,#EEF4FC)}',
'.fh.fh::before,.fh.fh::after{display:none}',
'.fh.fh .fh-in{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:none;margin:0;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(18px + env(safe-area-inset-bottom,0px))}',
'.fh.fh .fh-side{display:contents}',
'.fh.fh .fh-in>*,.fh.fh .fh-side>*{flex-shrink:0}.fh.fh .fh-in{height:auto;min-height:min-content}',
'.fh.fh .fh-head{order:1}.fh.fh .fh-chip{order:2;display:none}.fh.fh .fh-box{order:3}.fh.fh .fh-pipe{order:4}.fh.fh .fh-msg{order:5}.fh.fh .fh-btns{order:6}.fh.fh .fh-tips{order:7}',
'/* tiêu đề */',
'.fh.fh .fh-head{display:block;position:static;width:100%;max-width:1100px;margin:0;text-align:center}',
'.fh.fh .fh-htop{display:flex;flex-direction:column;align-items:center;gap:0;text-align:center}',
'.fh.fh .fh-htop .fh-ic{width:52px;height:52px;margin:0 0 12px;border-radius:14px;color:#fff;background:linear-gradient(160deg,#3B8BFF,#1F6BF5);box-shadow:0 10px 20px -10px rgba(31,107,245,.8)}',
'.fh.fh .fh-htop .fh-ic svg{width:28px;height:28px}',
'.fh.fh .fh-k{display:block;margin:0 0 8px;padding-left:.3em;font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.3em;color:#5B6B86}',
'.fh.fh h2{margin:0;font-size:clamp(23px,7vw,28px);line-height:1.2;font-weight:800;letter-spacing:-.02em;color:var(--ink)}',
'.fh.fh .fh-sub{margin:8px auto 0;max-width:none;font-size:14px;line-height:1.45;color:var(--mut)}',
'.fh.fh .fh-hr{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:12px;z-index:6;display:flex;gap:8px}',
'.fh.fh .fh-hr .fh-ib,.fh.fh .fh-guide{width:38px;height:38px;padding:0;border-radius:50%;justify-content:center;color:#3D5A8A;background:#fff;border:1px solid #DCE5F2;box-shadow:0 6px 14px -10px rgba(20,60,140,.5)}',
'.fh.fh .fh-guide span{display:none}',
'.fh.fh .fh-snd.off{color:#9AA8BF}',
'/* camera */',
'.fh.fh .fh-box{align-self:center;flex:0 0 auto;width:min(84%,max(255px,calc((100dvh - 430px) * .86)));min-width:0;max-width:none;aspect-ratio:.86;border:0;border-radius:26px;background:#D9DEE6;box-shadow:0 18px 40px -24px rgba(20,50,110,.55)}',
'.fh.fh .fh-box::after{background:none}',
'.fh.fh[data-st="ok"] .fh-box{box-shadow:0 0 0 3px var(--okc),0 18px 40px -24px rgba(20,50,110,.55)}',
'.fh.fh[data-st="bad"] .fh-box{box-shadow:0 0 0 3px #E5484D,0 18px 40px -24px rgba(20,50,110,.55)}',
'.fh.fh .fh-ov .g,.fh.fh .fh-ov .x{display:none}',
'.fh.fh .fh-ov .p{stroke:#fff;stroke-width:4;filter:drop-shadow(0 0 4px rgba(31,107,245,.6))}',
'.fh.fh[data-st="hold"] .fh-ov .p{stroke:#7BE3A6;filter:drop-shadow(0 0 6px rgba(45,190,108,.7))}',
'.fh.fh[data-st="ok"] .fh-ov .p{stroke:#6BEA9E}.fh.fh[data-st="bad"] .fh-ov .p{stroke:#FF8A8F}.fh.fh[data-st="check"] .fh-ov .p{stroke:#9DBBFF}',
'.fh.fh .fh-cn{width:34px;height:34px;border-color:rgba(255,255,255,.95);filter:drop-shadow(0 1px 3px rgba(0,0,0,.25))}',
'.fh.fh .fh-cn.a,.fh.fh .fh-cn.b{top:22%}.fh.fh .fh-cn.a,.fh.fh .fh-cn.c{left:16px}.fh.fh .fh-cn.b,.fh.fh .fh-cn.d{right:16px}.fh.fh .fh-cn.c,.fh.fh .fh-cn.d{bottom:16px}',
'.fh.fh .fh-cn.a{border-top-left-radius:16px}.fh.fh .fh-cn.b{border-top-right-radius:16px}.fh.fh .fh-cn.c{border-bottom-left-radius:16px}.fh.fh .fh-cn.d{border-bottom-right-radius:16px}',
'.fh.fh .fh-rd,.fh.fh .fh-arrow{display:none!important}',
'.fh.fh:not([data-st="check"]) .fh-sweep{display:none}',
'.fh.fh .fh-live{top:17px;left:calc(50% - 20px);transform:translateX(-50%);max-width:calc(100% - 80px);box-sizing:border-box;gap:8px;padding:7px 13px;border:0;border-radius:999px;background:rgba(255,255,255,.88);font-size:12.5px;font-weight:500;letter-spacing:0;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.fh.fh .fh-live i{width:9px;height:9px;background:#2FC25B;box-shadow:none;animation:none}',
'.fh.fh .fh-ctools{top:12px;right:12px}',
'.fh.fh .fh-ctools .fh-ib{width:42px;height:42px;border:0;background:rgba(255,255,255,.88);color:var(--ink)}',
'.fh.fh .fh-ctools .fh-ib svg{width:21px;height:21px}',
'.fh.fh .fh-badge{top:62px;background:rgba(45,190,108,.95);color:#fff}',
'.fh.fh .fh-hint{bottom:34px;max-width:calc(100% - 40px);padding:9px 20px;border:0;border-radius:999px;background:rgba(40,38,48,.72);font-size:14.5px;font-weight:600;color:#fff}',
'.fh.fh .fh-hint.ok{background:rgba(29,122,71,.85);color:#fff}.fh.fh .fh-hint.bad{background:rgba(194,38,43,.85);color:#fff}.fh.fh .fh-hint.chk{background:rgba(31,80,190,.85);color:#fff}',
'/* thẻ tiến trình */',
'.fh.fh .fh-pipe{width:100%;max-width:470px;box-sizing:border-box;padding:18px 16px 16px;border-radius:24px;background:#fff;border:1px solid #E6ECF5;box-shadow:0 16px 36px -26px rgba(20,60,140,.5)}',
'.fh.fh .fh-mini,.fh.fh .fh-bar,.fh.fh .fh-s{display:none}',
'.fh.fh .fh-now{align-items:baseline;gap:10px;padding:0 6px}',
'.fh.fh .fh-n{display:none}',
'.fh.fh .fh-t{font-size:17px;font-weight:800;color:var(--ink)}',
'.fh.fh .fh-p{font:800 20px/1 "Be Vietnam Pro",system-ui,sans-serif;color:var(--blue)}',
'.fh.fh .fh-p i{opacity:1;font-size:1em}',
'.fh.fh .fh-seg{margin:14px 0 0;gap:0}',
'.fh.fh .fh-seg li{gap:8px;padding:0 2px;font-size:11.5px;font-weight:500;line-height:1.3;color:#7D8AA2}',
'.fh.fh .fh-seg li::before{width:32px;height:32px;box-sizing:border-box;border:0;font:700 13px/1 "Be Vietnam Pro",system-ui,sans-serif;background:#E4E9F1;color:#7D8AA2;box-shadow:none;animation:none}',
'.fh.fh .fh-seg li:not(:last-child)::after{top:15px;height:3px;border-radius:3px;background:var(--line)}',
'.fh.fh .fh-seg li.ok{color:#7D8AA2}',
'.fh.fh .fh-seg li.ok::before{background:var(--okc);color:#fff;box-shadow:none}',
'.fh.fh .fh-seg li.ok:not(:last-child)::after{background:var(--okc)}',
'.fh.fh .fh-seg li.run{color:var(--ink);font-weight:700}',
'.fh.fh .fh-seg li.run::before{background:var(--blue);color:#fff;box-shadow:0 0 0 5px rgba(31,107,245,.18)}',
'.fh.fh .fh-seg li.bad{color:#C2262B;font-weight:700}',
'.fh.fh .fh-seg li.bad::before{background:#E5484D;color:#fff;box-shadow:none}',
'.fh.fh .fh-pipe[data-st="ok"]{border-color:#BFE8CF}.fh.fh .fh-pipe[data-st="bad"]{border-color:#F3C2C4}.fh.fh .fh-pipe[data-st="bad"] .fh-t{color:#C2262B}',
'/* thông báo, nút, lưu ý */',
'.fh.fh .fh-msg,.fh.fh .fh-btns,.fh.fh .fh-tips{width:100%;max-width:470px;box-sizing:border-box}',
'.fh.fh .fh-msg .pmsg{background:#FFF1F1;color:#9B1C1C;border-color:#F5C2C2}',
'.fh.fh .fh-msg .pmsg.idw{background:#FFF1F1}.fh.fh .fh-msg .pmsg.idw b{color:#C2262B}',
'.fh.fh .fh-msg .note{color:var(--mut)}',
'.fh.fh .fh-b{border:1.5px solid #D6E0EE;background:#fff;color:var(--ink)}',
'.fh.fh .fh-b.go{border:0;color:#fff;background:linear-gradient(100deg,#1660E8,#1F7BF7);box-shadow:0 14px 26px -14px rgba(31,107,245,.8)}',
'.fh.fh .fh-tips{background:#fff;border:1px solid #E6ECF5;box-shadow:0 12px 26px -22px rgba(20,60,140,.5)}',
'.fh.fh .fh-tips-h{color:var(--ink)}.fh.fh .fh-tips-h svg{color:#F5A524}',
'.fh.fh .fh-tips-g div{color:var(--mut)}.fh.fh .fh-tips-g svg{color:var(--blue)}',
'@media(max-height:700px){.fh.fh .fh-htop .fh-ic{width:44px;height:44px;margin-bottom:8px}.fh.fh .fh-sub{font-size:13px;margin-top:4px}.fh.fh .fh-box{width:min(84%,max(245px,calc((100dvh - 380px) * .86)))}}',
'/* máy tính / máy tính bảng */',
'@media(min-width:561px){',
'  .fh.fh .fh-in{display:flex;max-width:none;gap:clamp(12px,2.2vh,22px);padding:clamp(16px,3vh,30px) clamp(16px,4vw,56px)}',
'  .fh.fh .fh-htop{display:grid;grid-template-columns:auto auto;justify-content:center;align-items:center;column-gap:22px;text-align:left}',
'  .fh.fh .fh-htop .fh-ic{grid-row:1 / span 2;width:clamp(56px,7vh,78px);height:clamp(56px,7vh,78px);margin:0;border-radius:20px}',
'  .fh.fh .fh-htop .fh-ic svg{width:52%;height:52%}',
'  .fh.fh .fh-htop>div:last-child{display:contents}',
'  .fh.fh .fh-k{grid-column:2;margin:0 0 4px;font-size:clamp(12px,1.5vh,15px)}',
'  .fh.fh h2{grid-column:2;font-size:clamp(26px,4.4vh,42px)}',
'  .fh.fh .fh-sub{grid-column:1 / -1;margin-top:clamp(6px,1.2vh,12px);font-size:clamp(14px,2vh,19px);font-weight:500}',
'  .fh.fh .fh-hr{top:18px;right:22px}',
'  .fh.fh .fh-hr .fh-ib,.fh.fh .fh-guide{width:44px;height:44px}',
'  .fh.fh .fh-box{order:3;height:clamp(260px,calc(100vh - 420px),640px);width:auto;min-width:0;max-width:calc(100vw - 40px);aspect-ratio:1.23;border-radius:30px;background:#5C6472;justify-self:auto}',
'  .fh.fh .fh-ov .g{display:block;stroke:#8FF5F0;stroke-width:3;stroke-dasharray:none;filter:drop-shadow(0 0 6px rgba(110,240,235,.8))}',
'  .fh.fh[data-st="ok"] .fh-ov .g{stroke:#6BEA9E}.fh.fh[data-st="bad"] .fh-ov .g{stroke:#FF8A8F}',
'  .fh.fh .fh-cn{display:none}',
'  .fh.fh .fh-live{left:50%;font-size:15px;font-weight:600;padding:9px 20px;max-width:calc(100% - 150px)}',
'  .fh.fh .fh-live i{width:11px;height:11px}',
'  .fh.fh .fh-ctools .fh-ib{width:54px;height:54px}.fh.fh .fh-ctools .fh-ib svg{width:25px;height:25px}',
'  .fh.fh .fh-hint{bottom:12px;padding:10px 40px;font-size:16px}',
'  .fh.fh .fh-pipe{order:4;width:min(1270px,100%);max-width:none;display:grid;grid-template-columns:minmax(170px,1fr) minmax(0,2.6fr) minmax(150px,1fr);align-items:center;padding:clamp(12px,2vh,20px) 0;border-radius:28px}',
'  .fh.fh .fh-now{display:contents}',
'  .fh.fh .fh-n{display:block;grid-column:1;grid-row:1;align-self:end;text-align:center;font:700 14px/1 "Be Vietnam Pro",system-ui,sans-serif;letter-spacing:.04em;color:var(--blue)}',
'  .fh.fh .fh-n i{opacity:.55}',
'  .fh.fh .fh-t{grid-column:1;grid-row:2;align-self:start;padding:6px 18px 0;text-align:center;white-space:normal;font-size:clamp(17px,2.6vh,24px)}',
'  .fh.fh .fh-p{grid-column:3;grid-row:1 / span 2;display:block;text-align:center;white-space:nowrap;font-size:clamp(28px,4.6vh,42px);border-left:1px solid #E3E9F2;padding:6px 16px}',
'  .fh.fh .fh-p::after{content:"Hoàn thành";display:block;margin-top:4px;font-size:15px;font-weight:600;color:var(--mut)}',
'  .fh.fh .fh-seg{grid-column:2;grid-row:1 / span 2;margin:0;padding:6px 18px;border-left:1px solid #E3E9F2}',
'  .fh.fh .fh-seg li{font-size:clamp(12.5px,1.8vh,15px);font-weight:600;gap:10px}',
'  .fh.fh .fh-seg li::before{width:40px;height:40px;font-size:15px}',
'  .fh.fh .fh-seg li:not(:last-child)::after{top:19px}',
'  .fh.fh .fh-msg,.fh.fh .fh-btns{max-width:760px}',
'  .fh.fh .fh-btns{flex-direction:row;justify-content:center}.fh.fh .fh-b{width:min(420px,100%)}',
'  .fh.fh .fh-tips{max-width:760px}',
'}',
'@media(min-width:561px) and (max-height:760px){',
'  .fh.fh .fh-box{height:clamp(250px,calc(100vh - 330px),640px)}',
'  .fh.fh .fh-tips{display:none}',
'  .fh.fh .fh-seg li::before{width:34px;height:34px}.fh.fh .fh-seg li:not(:last-child)::after{top:16px}',
'}',
].join('\n');

var I_SND = '<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>' +
  '<svg class="mt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
var I_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
var I_OK = '<svg viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="38" fill="#2BD7A0"/><path d="M27 45l12 12 22-26" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var I_BAD = '<svg viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="38" fill="#FF5C7A"/><path d="M30 30l28 28M58 30L30 58" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>';
var I_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
var I_FACE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="11" r="3"/><path d="M8 16.5c1-1.2 2.4-1.8 4-1.8s3 .6 4 1.8"/></svg>';
var I_HELP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 1 1 3.9 3c-.8.5-1.1 1-1.1 2"/><path d="M12 17.2h.01"/></svg>';
var I_SNAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-1.5h7l1 1.5h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/></svg>';
var I_BULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45.9 1.15.9 1.9V16h5.4v-.3c0-.75.3-1.45.9-1.9A6 6 0 0 0 12 3Z"/></svg>';
var I_FRAME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3"/><circle cx="12" cy="12" r="3.3"/></svg>';
var I_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>';
var I_GLASSES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.5" cy="14" r="3.2"/><circle cx="17.5" cy="14" r="3.2"/><path d="M9.7 13h4.6M2 12l1.8-5.6A2 2 0 0 1 5.7 5H7M22 12l-1.8-5.6A2 2 0 0 0 18.3 5H17"/></svg>';

var HTML =
'<div class="fh-in">' +
'  <div class="fh-box">' +
'    <video id="fhVideo" autoplay playsinline muted></video><img class="fh-shot" id="fhShot" alt="Ảnh vừa chụp">' +
'    <svg class="fh-ov" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">' +
'      <ellipse class="g" cx="150" cy="200" rx="106" ry="138"/>' +
'      <path class="p" id="fhProg" d="M150 74A96 126 0 1 1 150 326A96 126 0 1 1 150 74" pathLength="100"/>' +
'      <path class="x" d="M150 66v14M150 320v14M38 200h14M248 200h14"/>' +
'    </svg>' +
'    <div class="fh-live"><i></i><span>Camera đang hoạt động</span></div>' +
'    <div class="fh-ctools"><button type="button" class="fh-ib" id="fhCamBtn" aria-label="Chụp ảnh ngay" title="Chụp ảnh ngay">' + I_SNAP + '</button></div>' +
'    <div class="fh-sweep"></div><i class="fh-cn a"></i><i class="fh-cn b"></i><i class="fh-cn c"></i><i class="fh-cn d"></i>' +
'    <div class="fh-arrow" id="fhArrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></div>' +
'    <div class="fh-badge">' + I_CAM + 'ĐÃ CHỤP ẢNH</div>' +
'    <div class="fh-hint" id="fhHint" aria-live="polite"></div>' +
'    <div class="fh-rd"><span id="fhRdL">FACES 0</span><span id="fhRdR">CONF --</span></div>' +
'    <div class="fh-res" id="fhRes"></div><div class="fh-flash" id="fhFlash"></div>' +
'  </div>' +
'  <div class="fh-side">' +
'  <div class="fh-head"><div class="fh-htop"><div class="fh-ic">' + I_FACE + '</div><div><span class="fh-k" id="fhK">AI FACE VERIFY</span><h2 id="fhTitle">Xác thực khuôn mặt</h2><p class="fh-sub" id="fhSub">Xác minh danh tính để tiếp tục sử dụng hệ thống</p></div></div>' +
'    <div class="fh-hr"><button type="button" class="fh-guide" id="fhGuide" aria-label="Xem hướng dẫn" title="Xem hướng dẫn">' + I_HELP + '<span>Hướng dẫn</span></button>' +
'    <button type="button" class="fh-ib fh-snd" id="fhSnd" aria-label="Bật hoặc tắt âm thanh" title="Bật/tắt âm thanh">' + I_SND + '</button>' +
'    <button type="button" class="fh-ib" id="fhClose" aria-label="Đóng" title="Đóng">' + I_X + '</button></div></div>' +
'  <div class="fh-chip" id="fhChip" role="status" aria-live="polite"><i></i><span id="fhChipT">CAMERA ĐANG MỞ</span></div>' +
'  <div class="fh-pipe" id="fhPipe" data-st="run">' +
'    <div class="fh-mini"><div class="fh-ic">' + I_FACE + '</div><div><h3>Đang xác thực khuôn mặt</h3><p>Hệ thống đang nhận diện và đối chiếu thông tin</p></div></div>' +
'    <div class="fh-now"><span class="fh-n" id="fhN">01<i>/05</i></span><span class="fh-t" id="fhT">Phát hiện khuôn mặt</span><span class="fh-p" id="fhP">0<i>%</i></span></div>' +
'    <ol class="fh-seg" id="fhSeg" aria-label="Các bước xác thực"></ol>' +
'    <div class="fh-bar"><div class="fh-bar-row"><span>Đang xử lý…</span><em id="fhBarPct">0%</em></div><div class="fh-bar-track"><div class="fh-bar-fill" id="fhBarFill"></div></div></div>' +
'    <div class="fh-s"><i></i><span id="fhS">ĐANG XỬ LÝ</span><em>NEURAL ID PIPELINE</em></div>' +
'  </div>' +
'  <div class="fh-msg" id="fhMsg" role="alert"></div>' +
'  <div class="fh-btns"><button type="button" class="fh-b go hide" id="fhManual">Chụp ngay</button><button type="button" class="fh-b go hide" id="fhRetry">Thử lại</button></div>' +
'  <div class="fh-tips" id="fhTips"><div class="fh-tips-h">' + I_BULB + '<span>Lưu ý để xác thực nhanh và chính xác</span></div>' +
'    <div class="fh-tips-g"><div>' + I_FRAME + '<span>Giữ khuôn mặt trong khung</span></div><div>' + I_SUN + '<span>Đảm bảo đủ ánh sáng</span></div><div>' + I_GLASSES + '<span>Không đeo khẩu trang hoặc kính râm</span></div></div></div>' +
'  </div>' +
'</div>';

var $ = function(id){ return document.getElementById(id); };
// Oval đặt cao, sát phía trên khung (gần camera máy) để người dùng nhìn về phía camera; dùng chung với màn đăng nhập bằng khuôn mặt
var FACE_CY = .42;
function fit(){
  var b = document.querySelector('#faceHud .fh-box'), o = b && b.querySelector('.fh-ov'); if (!o || !b.clientWidth) return;
  var W = b.clientWidth, H = b.clientHeight, cx = W / 2, cy = H * FACE_CY, ry = Math.min(H * .36, W * .30 / .717), rx = ry * .717;
  o.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  var g = o.querySelector('.g'); g.setAttribute('cx', cx); g.setAttribute('cy', cy); g.setAttribute('rx', rx); g.setAttribute('ry', ry);
  o.querySelector('.p').setAttribute('d', 'M' + cx + ' ' + (cy - ry + 12) + 'A' + (rx - 10) + ' ' + (ry - 12) + ' 0 1 1 ' + cx + ' ' + (cy + ry - 12) + 'A' + (rx - 10) + ' ' + (ry - 12) + ' 0 1 1 ' + cx + ' ' + (cy - ry + 12));
  o.querySelector('.x').setAttribute('d', 'M' + cx + ' ' + (cy - ry + 4) + 'v14M' + cx + ' ' + (cy + ry - 18) + 'v14M' + (cx - rx - 6) + ' ' + cy + 'h14M' + (cx + rx - 8) + ' ' + cy + 'h14');
}
window.addEventListener('resize', function(){ if (window.FaceHUD && document.getElementById('faceHud') && !document.getElementById('faceHud').classList.contains('hide')) fit(); });
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

/* ---------- Âm thanh (Web Audio, không cần tệp) ---------- */
var SND = { ctx:null, on:true, primed:false, scanT:null, lastLock:0 };
try { SND.on = localStorage.getItem('kt_snd') !== '0'; } catch (e) {}
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} // iPhone: vẫn nghe khi bật gạt im lặng (iOS 17+)
function sctx(){ if (SND.ctx) return SND.ctx; var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; try { SND.ctx = new AC(); SND.ctx.addEventListener && SND.ctx.addEventListener('statechange', paintSnd); } catch (e) { return null; } return SND.ctx; }
function unlock(){ // chỉ touchend/click/pointerup mới được tính là thao tác (touchstart/pointerdown KHÔNG); iOS có thêm trạng thái "interrupted"
  var c = sctx(); if (!c) return;
  if (c.state !== 'running'){ try { var p = c.resume(); if (p && p.then) p.then(paintSnd, function(){}); } catch (e) {} }
  if (!SND.primed){ try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); SND.primed = true; } catch (e) {} }
  if (!VOX.primed && 'speechSynthesis' in window){ try { var u0 = new SpeechSynthesisUtterance(' '); u0.volume = 0; window.speechSynthesis.speak(u0); VOX.primed = true; } catch (e) {} }
}

/* ---------- Giọng nói hướng dẫn (Web Speech API), đi theo cùng nút Bật/tắt âm thanh ---------- */
var VOX = { last:'', lastAt:0, primed:false, voice:null };
function voxPick(){
  if (!('speechSynthesis' in window)) return null;
  if (VOX.voice) return VOX.voice;
  var vs = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  var v = vs.filter(function(x){ return /^vi([-_]|$)/i.test(x.lang); })[0];
  if (v) VOX.voice = v;
  return v || null;
}
if ('speechSynthesis' in window && window.speechSynthesis.addEventListener){ try { window.speechSynthesis.addEventListener('voiceschanged', voxPick); } catch (e) {} }
function speak(t){
  if (!t || !FM.open || !SND.on || !('speechSynthesis' in window)) return;
  var v = voxPick();
  if (!v) return; // không có giọng tiếng Việt trên máy/trình duyệt này: thà im lặng còn hơn đọc sai bằng giọng ngôn ngữ khác
  var n = Date.now();
  if (n - VOX.lastAt < 900) return; // tránh nói chồng chéo liên tục khi gợi ý đổi nhanh
  if (t === VOX.last && n - VOX.lastAt < 4000) return; // tránh lặp lại y nguyên câu vừa nói
  try {
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t);
    u.lang = 'vi-VN'; u.rate = 1.05; u.pitch = 1; u.volume = 1; u.voice = v;
    window.speechSynthesis.speak(u);
  } catch (e) {}
  VOX.last = t; VOX.lastAt = n;
}
['touchend', 'click', 'pointerup', 'keydown', 'mousedown'].forEach(function(ev){ document.addEventListener(ev, unlock, { passive:true, capture:true }); });
document.addEventListener('visibilitychange', function(){ if (!document.hidden && SND.ctx && SND.ctx.state !== 'running'){ try { SND.ctx.resume().catch(function(){}); } catch (e) {} } });
function live(c){ return !!c && SND.on && c.state === 'running'; }
function out(c){
  if (c.__o) return c.__o;
  var m = c.createGain(); m.gain.value = 2; var comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
  var d = c.createDelay(.5); d.delayTime.value = .16; var fb = c.createGain(); fb.gain.value = .26; var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; var wet = c.createGain(); wet.gain.value = .24;
  m.connect(comp); m.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(comp); comp.connect(c.destination);
  c.__o = m; return m;
}
function bell(f, at, dur, gain, soft){
  var c = sctx(); if (!live(c)) return; var t = c.currentTime + at, o0 = out(c);
  (soft ? [[1, 1, 1], [2, .12, .5]] : [[1, 1, 1], [2.76, .3, .55], [5.4, .12, .32]]).forEach(function(p){
    var o = c.createOscillator(), g = c.createGain(), d = dur * p[2]; o.type = 'sine'; o.frequency.value = f * p[0];
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime((gain || .06) * p[1], t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(o0); o.start(t); o.stop(t + d + .03);
  });
}
function click(gain){
  var c = sctx(); if (!live(c)) return; var n = Math.floor(c.sampleRate * .03), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 3200; g.gain.value = gain || .09;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(out(c)); s.start();
}
var sLock = function(){ var n = Date.now(); if (n - SND.lastLock < 1800) return; SND.lastLock = n; bell(1568, 0, .5, .05); bell(2093, .09, .7, .05); };
var sShutter = function(){ click(.1); bell(2093, .03, .55, .05); };
var sOk = function(){ [1047, 1319, 1568, 2093].forEach(function(f, k){ bell(f, k * .08, .95, .06); }); bell(3136, .3, 1.1, .022); };
var sBad = function(){ bell(392, 0, .55, .075, true); bell(294, .17, .8, .075, true); };
var sReady = function(){ bell(1319, 0, .55, .05); };
function sScan(on){
  clearInterval(SND.scanT); SND.scanT = null; if (!on) return;
  var one = function(){ var c = sctx(); if (!live(c)) return; var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(2600, t + .4);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.018, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .42);
    o.connect(g); g.connect(out(c)); o.start(t); o.stop(t + .45); bell(3136, .38, .45, .02, true); };
  one(); SND.scanT = setInterval(one, 1150);
}
function blocked(){ return SND.on && (!SND.ctx || SND.ctx.state !== 'running'); }
function paintSnd(){ var b = $('fhSnd'); if (!b) return; b.classList.toggle('off', !SND.on); b.classList.toggle('wait', blocked() && FM.open); b.setAttribute('aria-pressed', SND.on ? 'true' : 'false'); b.title = blocked() ? 'Chạm để bật âm thanh' : 'Bật/tắt âm thanh'; }

/* ---------- Nhận diện khuôn mặt trên máy (face-api, chỉ để căn khung và tự chụp) ---------- */
var FA = { p:null };
function loadFA(){
  if (FA.p) return FA.p;
  FA.p = new Promise(function(res, rej){
    if (window.faceapi && window.faceapi.nets && window.faceapi.nets.tinyFaceDetector.isLoaded) return res(window.faceapi);
    var go = async function(){
      try { var tf = window.faceapi.tf, ok = false; try { ok = await tf.setBackend('webgl'); } catch (e) {} if (!ok) await tf.setBackend('cpu'); await tf.ready();
        await window.faceapi.nets.tinyFaceDetector.loadFromUri('/kiemtra/vendor/face-api/model'); res(window.faceapi); } catch (e) { rej(e); }
    };
    if (window.faceapi) return go();
    var sc = document.createElement('script'); sc.src = '/kiemtra/vendor/face-api/face-api.js'; sc.onload = go; sc.onerror = function(){ rej(new Error('load')); }; document.head.appendChild(sc);
  });
  FA.p.catch(function(){ FA.p = null; });
  return FA.p;
}

/* ---------- Trạng thái + giao diện ---------- */
var FM = { open:false, stream:null, timer:null, prog:0, last:0, busy:false, fa:null, startAt:0, opts:null, el:null,
           live:null, i:0, hold:0, lockUntil:0, poseT0:0, photo:'', shot:'', frames:[] };
var HOLD_MS = 1500, POSE_HOLD = 650; // giữ đúng tư thế bao lâu thì chụp
var POSE = { front:'Nhìn thẳng vào camera', left:'Quay mặt sang trái', right:'Quay mặt sang phải' };
var POSE_HINT = { front:'Nhìn thẳng vào camera', left:'Từ từ quay mặt sang TRÁI', right:'Từ từ quay mặt sang PHẢI' };
var POSE_CHIP = { front:'NHÌN THẲNG', left:'QUAY TRÁI', right:'QUAY PHẢI' };
function build(){
  if (FM.el) return;
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var d = document.createElement('div'); d.className = 'fh hide'; d.id = 'faceHud'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'fhTitle');
  d.innerHTML = HTML; document.body.appendChild(d); FM.el = d;
  $('fhClose').addEventListener('click', close);
  $('fhRetry').addEventListener('click', retry);
  $('fhManual').addEventListener('click', function(){ if (!FM.busy && FM.stream && !FM.live) shoot(); });
  $('fhCamBtn').addEventListener('click', function(){ if (!FM.busy && FM.stream && !FM.live) shoot(); });
  $('fhGuide').addEventListener('click', function(){ var t = $('fhTips'); if (!t) return; t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); t.scrollIntoView({ block:'nearest', behavior:'smooth' }); });
  $('fhSnd').addEventListener('click', function(){
    if (blocked()){ unlock(); setTimeout(function(){ paintSnd(); sReady(); }, 120); return; }
    SND.on = !SND.on; try { localStorage.setItem('kt_snd', SND.on ? '1' : '0'); } catch (e) {} paintSnd();
    if (!SND.on && 'speechSynthesis' in window){ try { window.speechSynthesis.cancel(); } catch (e) {} }
    else if (SND.on) speak($('fhHint') ? $('fhHint').textContent : '');
    if (SND.on){ unlock(); setTimeout(sReady, 80); if (FM.busy) sScan(true); } else sScan(false);
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && FM.open) close(); });
}
function scr(st){ FM.el.setAttribute('data-st', st); }
function chip(cls, t){ $('fhChip').className = 'fh-chip' + (cls ? ' ' + cls : ''); $('fhChipT').textContent = t; }
function hint(t, tone){ var h = $('fhHint'); h.textContent = t || ''; h.className = 'fh-hint' + (tone ? ' ' + tone : ''); speak(t); }
function prog(p){ FM.prog = Math.max(0, Math.min(1, p)); $('fhProg').style.strokeDashoffset = String(100 * (1 - FM.prog)); }
function rd(n, conf){ $('fhRdL').textContent = 'FACES ' + n; $('fhRdR').textContent = 'CONF ' + (conf == null ? '--' : Math.round(conf * 100) + '%'); }
function arrow(p){ var a = $('fhArrow'); a.className = 'fh-arrow' + (p === 'left' ? ' l' : p === 'right' ? ' r' : ''); }
function step(i, st){ var li = $('fhSeg').children[i]; if (li && li.className !== (st || '')) li.className = st || ''; }
function steps(a){ for (var i = 0; i < a.length; i++) step(i, a[i]); now(); }
function now(){
  var all = [].slice.call($('fhSeg').children), n = all.length, p2 = function(x){ return (x < 10 ? '0' : '') + x; };
  var bad = all.filter(function(li){ return li.className === 'bad'; })[0], run = all.filter(function(li){ return li.className === 'run'; })[0];
  var ok = all.filter(function(li){ return li.className === 'ok'; }).length, done = ok === n;
  var cur = bad || run || (done ? all[n - 1] : all.filter(function(li){ return li.className !== 'ok'; })[0] || all[0]), idx = all.indexOf(cur);
  $('fhN').innerHTML = p2(idx + 1) + '<i>/' + p2(n) + '</i>'; $('fhT').textContent = FM.labels[idx];
  var pct = Math.round((ok + (run && !bad ? .5 : 0)) / n * 100);
  $('fhP').innerHTML = pct + '<i>%</i>';
  var st = bad ? 'bad' : done ? 'ok' : run ? 'run' : 'wait';
  $('fhPipe').setAttribute('data-st', st); $('fhS').textContent = { bad:'CHƯA ĐẠT', ok:'HOÀN TẤT', run:'ĐANG XỬ LÝ', wait:'CHỜ XỬ LÝ' }[st];
  var bf = $('fhBarFill'), bp = $('fhBarPct'); if (bf){ bf.style.width = pct + '%'; bp.textContent = pct + '%'; }
}
function msgHtml(h){ $('fhMsg').innerHTML = h || ''; }
function btn(id, on){ $(id).classList.toggle('hide', !on); }
function stopCam(){ if (FM.timer){ clearTimeout(FM.timer); FM.timer = null; } if (FM.stream){ FM.stream.getTracks().forEach(function(t){ t.stop(); }); FM.stream = null; } }
function close(){
  FM.gen = (FM.gen || 0) + 1; FM.open = false; FM.busy = false; sScan(false); stopCam(); arrow('');
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
  try { var v = $('fhVideo'); if (v) v.srcObject = null; } catch (e) {}
  if (FM.el){ FM.el.classList.add('hide'); } document.documentElement.style.overflow = '';
  if (history.state && history.state.fhOpen && !FM.popping){ FM.popping = true; try { history.back(); } catch (e) { FM.popping = false; } }
  if (FM.opts && FM.opts.closed) FM.opts.closed();
}
// Nút/vuốt Back của trình duyệt khi đang quét: đóng màn quét (không rời trang); rời trang/ẩn trang: tắt camera ngay
window.addEventListener('popstate', function(){ if (FM.popping){ FM.popping = false; return; } if (FM.open) close(); });
window.addEventListener('pagehide', function(){ if (FM.open) close(); });

// Nhãn các bước: có thử thách = [phát hiện, 3 tư thế theo thứ tự máy chủ cấp, AI đối chiếu]; không có = kiểu cũ (chụp 1 ảnh)
function setLabels(){
  FM.labels = FM.live ? ['Phát hiện khuôn mặt'].concat(FM.live.seq.map(function(p){ return POSE[p]; }), [FM.opts.target || 'AI đối chiếu khuôn mặt'])
                      : ['Phát hiện khuôn mặt', 'Kiểm tra độ sáng và vị trí', 'Xác nhận chỉ một người', 'Tự động chụp ảnh', FM.opts.target || 'AI đối chiếu khuôn mặt'];
  $('fhSeg').innerHTML = FM.labels.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('');
}
function reset(){
  FM.busy = false; FM.said = false; FM.startAt = Date.now(); FM.last = Date.now(); FM.i = 0; FM.hold = 0; FM.lockUntil = 0; FM.poseT0 = Date.now(); FM.photo = ''; FM.shot = ''; FM.frames = [];
  prog(0); rd(0, null); arrow(''); $('fhShot').removeAttribute('src'); $('fhRes').innerHTML = ''; msgHtml(''); btn('fhRetry', false); btn('fhManual', false);
}
// Xin thử thách sống từ máy chủ (thứ tự ngẫu nhiên, hạn 3 phút, dùng một lần). null = máy chủ tắt thử thách.
async function getLive(){
  var r = await fetch('/api/kt-live', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Requested-With':'livotec' }, credentials:'same-origin', body:'{}' });
  var j = await r.json();
  if (!j || !j.ok) throw new Error('live');
  return j.mode === 'off' || !j.token || !j.seq || j.seq.length !== 3 ? null : { token:j.token, seq:j.seq };
}
async function open(opts){
  build(); FM.opts = opts || {};
  $('fhK').textContent = FM.opts.kicker || 'AI FACE VERIFY'; $('fhTitle').textContent = FM.opts.title || 'Xác thực khuôn mặt';
  FM.live = null; setLabels();
  FM.el.classList.remove('hide'); document.documentElement.style.overflow = 'hidden'; FM.open = true; fit(); requestAnimationFrame(fit);
  FM.gen = (FM.gen || 0) + 1; var g = FM.gen;
  try { if (!(history.state && history.state.fhOpen)) history.pushState({ fhOpen:1 }, '', location.href); } catch (e) {}
  reset(); steps(['run', '', '', '', '']); scr('cam'); chip('', 'CAMERA ĐANG MỞ'); hint('Đang mở camera…'); paintSnd();
  if (!FM.stream){
    try { FM.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ ideal: (window.matchMedia && matchMedia('(min-width:900px) and (min-height:540px)').matches) ? 1280 : 960 }, height:{ ideal: (window.matchMedia && matchMedia('(min-width:900px) and (min-height:540px)').matches) ? 960 : 1280 } }, audio:false }); }
    catch (e){
      if (!FM.open || g !== FM.gen) return;
      scr('off'); chip('bad', 'KHÔNG MỞ ĐƯỢC CAMERA'); hint(''); steps(['bad', '', '', '', '']);
      msgHtml('<div class="pmsg">Vui lòng cho phép trình duyệt sử dụng camera (và mở bằng Chrome/Safari, không mở trong Zalo/Facebook), sau đó bấm Thử lại.</div>');
      btn('fhRetry', true); return;
    }
  }
  if (!FM.open || g !== FM.gen){ if (!FM.open) stopCam(); return; }
  var v = $('fhVideo'); v.srcObject = FM.stream; try { await v.play(); } catch (e) {}
  start();
}
// Bắt đầu một lượt quét: xin thử thách mới, tải bộ nhận diện (kèm điểm mốc khuôn mặt để đo góc quay), chạy vòng theo dõi
async function start(){
  var g = FM.gen;
  reset(); scr('scan'); chip('seek', 'ĐANG CHUẨN BỊ'); hint('Đang chuẩn bị…');
  var lv; try { lv = await getLive(); } catch (e) { lv = undefined; }
  if (!FM.open || g !== FM.gen) return;
  if (lv === undefined){ return failLocal('Không kết nối được hệ thống. Hãy kiểm tra mạng rồi bấm Thử lại.'); }
  FM.live = lv; setLabels(); steps(['run', '', '', '', '']);
  FM.fa = null; try { FM.fa = await loadFA(); if (FM.live && !FM.fa.nets.faceLandmark68Net.isLoaded) await FM.fa.nets.faceLandmark68Net.loadFromUri('/kiemtra/vendor/face-api/model'); } catch (e) { FM.fa = null; }
  if (!FM.open || g !== FM.gen) return;
  if (!FM.fa){
    if (FM.live) return failLocal('Thiết bị chưa hỗ trợ thử thách quay mặt. Hãy dùng trình duyệt Chrome hoặc Safari bản mới rồi thử lại.');
    return manualMode();
  }
  chip('seek', 'ĐANG TÌM KHUÔN MẶT'); hint('Đưa khuôn mặt vào giữa khung');
  FM.last = Date.now(); FM.startAt = Date.now(); FM.poseT0 = Date.now(); loop();
}
function failLocal(t){ scr('off'); chip('bad', 'CHƯA SẴN SÀNG'); hint(''); arrow(''); msgHtml('<div class="pmsg">' + esc(t) + '</div>'); btn('fhRetry', true); }
function manualMode(){ // không tải được bộ nhận diện trên máy và máy chủ không yêu cầu thử thách: chụp thủ công
  steps(['ok', 'ok', 'ok', 'run', '']); chip('seek', 'CHỤP THỦ CÔNG'); hint('Căn khuôn mặt vào giữa khung rồi bấm “Chụp ngay”'); btn('fhManual', true);
}
// Độ sáng trung bình vùng khuôn mặt (0-255), lấy mẫu nhỏ cho nhẹ
function lum(v, bx){
  try {
    var c = FM.lumC || (FM.lumC = document.createElement('canvas')); c.width = 24; c.height = 24; var g = c.getContext('2d', { willReadFrequently:true });
    g.drawImage(v, bx.x, bx.y, bx.width, bx.height, 0, 0, 24, 24); var d = g.getImageData(0, 0, 24, 24).data, s = 0;
    for (var i = 0; i < d.length; i += 4) s += .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    return s / (d.length / 4);
  } catch (e) { return 128; }
}
// Góc quay đầu theo ảnh GỐC của camera (cùng quy ước với máy chủ): âm = quay sang phải của người dùng, dương = sang trái
function yawOf(pts){ var L = pts[0], R = pts[16], N = pts[30], ux = R.x - L.x, uy = R.y - L.y, uu = ux * ux + uy * uy; return uu ? ((N.x - L.x) * ux + (N.y - L.y) * uy) / uu - 0.5 : null; }
// Ngưỡng ở trình duyệt chặt hơn máy chủ để máy chủ không từ chối người đã làm đúng
function poseOk(p, y, w, off){ if (w < .18 || w > .78) return false; if (p === 'front') return Math.abs(y) <= .07 && off < .22; if (p === 'left') return y >= .15; return y <= -.15; }
function snapDisplay(v){ try { var f = document.createElement('canvas'); f.width = v.videoWidth; f.height = v.videoHeight; f.getContext('2d').drawImage(v, 0, 0); return f.toDataURL('image/jpeg', 0.85); } catch (e) { return ''; } }
function snapSquare(v){ var vw = v.videoWidth || 480, vh = v.videoHeight || 480, s = Math.min(vw, vh), c = document.createElement('canvas'); c.width = 480; c.height = 480; c.getContext('2d').drawImage(v, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 480, 480); return c.toDataURL('image/jpeg', 0.8); }
function snapTurn(v){ var t = document.createElement('canvas'), k = 320 / v.videoWidth; t.width = 320; t.height = Math.round(v.videoHeight * k); t.getContext('2d').drawImage(v, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.72); }
function flash(){ var fl = $('fhFlash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
function poseSay(){ // hướng dẫn tư thế hiện tại
  var p = FM.live.seq[FM.i]; arrow(p); chip('', 'THỬ THÁCH ' + (FM.i + 1) + '/3 · ' + POSE_CHIP[p]); hint(POSE_HINT[p]); bell(1319, 0, .5, .05); bell(1760, .13, .6, .05);
}

async function loop(){
  if (!FM.open || FM.busy) return;
  var v = $('fhVideo');
  if (v.readyState >= 2 && v.videoWidth){
    var t = Date.now(), dt = t - FM.last; FM.last = t;
    try { if (FM.live) await liveTick(v, t, dt); else await plainTick(v, t, dt); } catch (e) {}
    if (!FM.open || FM.busy) return;
  }
  FM.timer = setTimeout(loop, 120);
}
// Có thử thách: bước 1 tìm khuôn mặt, rồi lần lượt 3 tư thế; mỗi tư thế giữ đúng ~0,65 giây thì tự chụp
async function liveTick(v, t, dt){
  var res = await FM.fa.detectAllFaces(v, new FM.fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks();
  if (!FM.open || FM.busy) return;
  var vw = v.videoWidth, vh = v.videoHeight, big = res.filter(function(r){ return r.detection.box.width / vw >= .08; }), n = big.length;
  var stp = ['run', '', '', '', '']; for (var k = 0; k < 3; k++) stp[k + 1] = k < FM.i ? 'ok' : '';
  rd(n, n ? big[0].detection.score : null);
  if (n !== 1){
    FM.hold = 0; arrow(n ? '' : (FM.i ? FM.live.seq[FM.i] : ''));
    if (n > 1){ stp[0] = 'bad'; chip('bad', 'PHÁT HIỆN ' + n + ' KHUÔN MẶT'); hint('Chỉ một người trong khung hình', 'bad'); }
    else { chip('seek', FM.i ? 'THỬ THÁCH ' + (FM.i + 1) + '/3 · ' + POSE_CHIP[FM.live.seq[FM.i]] : 'ĐANG TÌM KHUÔN MẶT'); hint(FM.i ? 'Giữ khuôn mặt trong khung và ' + POSE_HINT[FM.live.seq[FM.i]].toLowerCase() : 'Đưa khuôn mặt vào khung oval'); }
    steps(stp); scr('scan'); prog((FM.i) / 3); return;
  }
  stp[0] = 'ok'; stp[FM.i + 1] = 'run'; steps(stp);
  if (FM.i === 0 && !FM.said){ FM.said = true; sLock(); poseSay(); }
  var r = big[0], bx = r.detection.box, w = bx.width / vw, off = Math.hypot((bx.x + bx.width / 2) / vw - .5, (bx.y + bx.height / 2) / vh - FACE_CY), y = yawOf(r.landmarks.positions), p = FM.live.seq[FM.i];
  if (p === 'front'){ var L = lum(v, bx); if (L < 60){ FM.hold = 0; hint('Thiếu sáng, hãy tới nơi sáng hơn'); prog(FM.i / 3); return; } }
  if (w < .18){ FM.hold = 0; hint('Hãy lại gần camera hơn một chút'); prog(FM.i / 3); return; }
  if (w > .78){ FM.hold = 0; hint('Hãy lùi ra xa camera một chút'); prog(FM.i / 3); return; }
  var good = t >= FM.lockUntil && y != null && poseOk(p, y, w, off);
  if (good){ FM.hold += dt; scr('hold'); hint(p === 'front' ? 'Giữ yên…' : 'Tốt lắm, giữ yên…', 'ok'); }
  else { FM.hold = Math.max(0, FM.hold - dt * 2); scr('scan'); hint(POSE_HINT[p] + (t - FM.poseT0 > 12000 ? ' — quay chậm, giữ mặt trong khung' : '')); }
  prog((FM.i + Math.min(1, FM.hold / POSE_HOLD)) / 3);
  if (FM.hold >= POSE_HOLD){ // chụp tư thế này
    if (p === 'front'){ FM.photo = snapSquare(v); FM.shot = snapDisplay(v); } else FM.frames.push({ pose: p, img: snapTurn(v) });
    flash(); click(.07); bell(2093, .03, .4, .04); try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
    FM.i++; FM.hold = 0; FM.lockUntil = t + 700; FM.poseT0 = t;
    if (FM.i >= 3){ finish(); return; }
    poseSay();
  }
}
// Không có thử thách (máy chủ tắt): như trước — giữ yên đúng vị trí thì tự chụp một ảnh
async function plainTick(v, t, dt){
  var vw = v.videoWidth, vh = v.videoHeight, s = Math.min(vw, vh), good = false, msg = 'Đưa khuôn mặt vào giữa khung', st = ['run', '', '', '', ''], ck = ['seek', 'ĐANG TÌM KHUÔN MẶT'], conf = null, n = 0;
  var all = await FM.fa.detectAllFaces(v, new FM.fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
  if (!FM.open || FM.busy) return;
  n = all.length;
  if (n > 1){ st = ['ok', '', 'bad', '', '']; msg = 'Chỉ một người trong khung hình'; ck = ['bad', 'PHÁT HIỆN ' + n + ' KHUÔN MẶT']; conf = all[0].score; }
  else if (n === 1){
    var bx = all[0].box, cx = bx.x + bx.width / 2 - vw / 2, cy = bx.y + bx.height / 2 - vh * FACE_CY, L = lum(v, bx); conf = all[0].score;
    st = ['ok', 'run', 'ok', '', '']; ck = ['seek', 'ĐANG CĂN CHỈNH'];
    if (L < 60) msg = 'Thiếu sáng, hãy tới nơi sáng hơn';
    else if (L > 235) msg = 'Quá chói, tránh nguồn sáng chiếu thẳng';
    else if (bx.width < 0.30 * s) msg = 'Hãy lại gần camera hơn một chút';
    else if (bx.width > 0.80 * s) msg = 'Hãy lùi ra xa camera một chút';
    else if (Math.sqrt(cx * cx + cy * cy) > 0.2 * s) msg = 'Đưa khuôn mặt vào giữa khung';
    else { good = true; st = ['ok', 'ok', 'ok', 'run', '']; msg = 'Giữ yên, đang tự chụp…'; ck = ['scan', 'GIỮ YÊN · SẮP CHỤP']; }
  }
  rd(n, conf); steps(st); chip(ck[0], ck[1]); hint(msg, good ? 'ok' : (n > 1 ? 'bad' : ''));
  if (good && FM.prog === 0) sLock();
  scr(good ? 'hold' : 'scan');
  prog(good ? FM.prog + dt / HOLD_MS : FM.prog - dt / 500);
  if (FM.prog >= 1){ shoot(); return; }
  if (Date.now() - FM.startAt > 12000) btn('fhManual', true);
}
// Chụp một ảnh (không có thử thách)
function shoot(){
  if (FM.busy) return; var v = $('fhVideo');
  FM.photo = snapSquare(v); FM.shot = snapDisplay(v); finish();
}
// Đã đủ ảnh: ảnh nhìn thẳng ĐỨNG YÊN kèm nhãn "ĐÃ CHỤP ẢNH", rồi gửi đối chiếu
function finish(){
  FM.busy = true; if (FM.timer){ clearTimeout(FM.timer); FM.timer = null; }
  if (FM.shot) $('fhShot').src = FM.shot;
  flash(); sShutter(); try { if (navigator.vibrate) navigator.vibrate(35); } catch (e) {}
  prog(1); arrow(''); btn('fhManual', false); msgHtml('');
  steps(['ok', 'ok', 'ok', 'ok', 'run']); scr('check'); chip('scan', 'ĐÃ CHỤP · ĐANG ĐỐI CHIẾU'); hint('Đã chụp ảnh. AI đang đối chiếu…', 'chk');
  setTimeout(function(){ if (FM.busy && FM.open) sScan(true); }, 450);
  verify(FM.photo, FM.live ? { token: FM.live.token, frames: FM.frames.slice() } : null);
}
async function verify(photo, live){
  var g = FM.gen, j = null; try { j = await FM.opts.verify(photo, live); } catch (e) { j = null; }
  if (g !== FM.gen) return; // đã đóng màn quét trong lúc chờ: bỏ qua kết quả
  sScan(false);
  if (!FM.open) return;
  if (j && j.ok){
    steps(['ok', 'ok', 'ok', 'ok', 'ok']); scr('ok'); chip('ok', 'XÁC THỰC THÀNH CÔNG'); hint('Xác thực thành công', 'ok'); $('fhRes').innerHTML = I_OK; sOk();
    setTimeout(function(){ if (!FM.open || g !== FM.gen) return; var o = FM.opts; close(); if (o.done) o.done(j); }, 1100);
    return;
  }
  steps(['ok', 'ok', 'ok', 'ok', 'bad']); scr('bad'); $('fhRes').innerHTML = I_BAD; sBad();
  chip('bad', j && j.mismatch ? 'KHUÔN MẶT KHÔNG KHỚP' : j && j.liveFailed ? 'CHƯA ĐẠT THỬ THÁCH' : 'CHƯA XÁC THỰC ĐƯỢC'); hint('Xác thực chưa thành công', 'bad');
  msgHtml(j && j.mismatch
    ? '<div class="pmsg idw"><b>' + esc(j.title || 'CẢNH BÁO XÁC THỰC KHUÔN MẶT') + '</b><span>' + esc(j.error) + '</span></div>'
    : '<div class="pmsg">' + esc((j && j.error) || 'Không thể kết nối đến hệ thống. Vui lòng thử lại sau.') + '</div>');
  var r = FM.opts.fail ? FM.opts.fail(j) : null;
  if (r === false) return; // trang đã tự xử lý (ví dụ: chuyển sang màn khoá)
  if (r && r.note) $('fhMsg').insertAdjacentHTML('beforeend', '<p class="note">' + esc(r.note) + '</p>');
  btn('fhRetry', true);
}
function retry(){ // mỗi lần thử lại xin thử thách MỚI (thử thách cũ chỉ dùng một lần)
  if (!FM.stream){ open(FM.opts); return; }
  FM.said = false; var v = $('fhVideo'); try { v.play(); } catch (e) {}
  start();
}

window.FaceHUD = { open: open, close: close, isOpen: function(){ return FM.open; } };
})();
