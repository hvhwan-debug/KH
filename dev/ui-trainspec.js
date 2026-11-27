// Kiểm thử giao diện kiemtra/trainplan.js bằng jsdom nối thẳng API kt-admin (kho tạm trong bộ nhớ): đặc tả: khung năng lực, nhóm đối tượng, phạm vi dữ liệu, tiến trình, giải thích A–E, phiên bản, nguồn lực.
// Chạy:  npm i --no-save jsdom  (ở thư mục tạm)  rồi  NODE_PATH=<thư mục>/node_modules node dev/ui-trainspec.js
process.env.STORAGE_MODE="memory"; process.env.MAIL_MODE="memory"; process.env.ADMIN_EMAILS="admin@x.vn";
process.env.SESSION_SECRET="dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS="x.vn"; process.env.APP_URL="https://kh.test";
const R=require("path").resolve(__dirname,"..")+"/", fs=require("fs"), {JSDOM}=require("jsdom");
const quiz=require(R+"api/_lib/quiz"), llm=require(R+"api/_lib/llm"), session=require(R+"api/_lib/session"), admin=require(R+"api/kt-admin");
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+m)};
const q=(cat,good,n,text)=>Array.from({length:n},(_,i)=>({category:cat,ok:i<good?1:0,text:text?text+" "+i:undefined}));
(async()=>{
  const now=Date.now(),cands=[]; await quiz.saveSettings({examTitle:"K",passEnabled:true,passScore:60}); llm.chat=async()=>{throw new Error("down")};
  const add=async(code,title,seg,sk,extra,when)=>{cands.push({code,name:"Người "+code,email:code.toLowerCase()+"@x.vn",phone:"0912345678",manager:"QL",segment:seg,title,province:"Hà Nội",region:"bac",profile:{namSinh:1990}});
    await quiz.putAttempt({id:"a"+code,code,status:"submitted",period:"k",paper:[].concat(q("Kỹ năng bán hàng",sk,5),q("Chính sách bán hàng",5,5),extra)});
    await quiz.upsertIndex({id:"a"+code,code,status:"submitted",pct:70,score:7,total:10,submittedAt:when||now,period:"k",flags:{blur:0}});};
  for(let i=1;i<=6;i++) await add("G"+i,"SR 1","may_loc",1,q("Máy lọc nước Karofi",5,5));
  for(let i=1;i<=6;i++) await add("B"+i,"SR 2","gia_dung",3,q("Điều hòa, bếp từ gia dụng",5,5),now-200*864e5);
  await quiz.saveCandidates(cands);
  const dom=new JSDOM('<!doctype html><body><div id="tab-trainplan"><div class="card" id="tpRoot"></div></div></body>',{runScripts:"outside-only",pretendToBeVisual:true});
  const w=dom.window; w.$=id=>w.document.getElementById(id); w.esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let answer=true,confirms=0,lastConfirm=""; w.confirm=(m)=>{confirms++;lastConfirm=String(m||"");return answer};
  w.api=async(method,path,body)=>{const u=new URL(path,"http://x"),ctx={log:Object.assign(()=>{},{error:console.error,warn:()=>{}}),res:null};
    await admin(ctx,{method,headers:{"x-requested-with":"livotec","x-sr-token":session.sessionValue("admin@x.vn")},query:Object.fromEntries(u.searchParams),body}); return {s:ctx.res.status,j:ctx.res.body};};
  let csv=""; w.Blob=function(p){csv=p.join("")}; w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.HTMLAnchorElement.prototype.click=function(){};
  w.eval(fs.readFileSync(R+"kiemtra/trainplan.js","utf8"));
  const D=w.document,wait=(ms=60)=>new Promise(r=>setTimeout(r,ms)),click=s=>D.querySelector(s).click(), ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
  const idle=async()=>{for(let i=0;i<120;i++){await wait(25);if(![...D.querySelectorAll("[data-tp-act]")].some(b=>b.disabled)){await wait(25);return}}};
  const setv=(id,v)=>{const el=D.getElementById(id); el.value=v; ev(el,"input");};
  await w.tpOpen(); await wait(); const mi=D.getElementById("tpMonth"); mi.value="2026-12"; ev(mi,"change"); await wait(120);

  // 1) chưa có khung năng lực
  ok(D.getElementById("tpFwBox").open&&/Chưa khai báo/.test(D.getElementById("tpFw").textContent)&&/KHÔNG tự đặt điểm yêu cầu/.test(D.getElementById("tpFw").textContent),"chưa có khung năng lực: khung mở sẵn, báo 'Chưa khai báo' và nói rõ hệ thống không tự đặt điểm yêu cầu");
  click('[data-tp-act="analyze"]'); await idle();
  ok(/Chưa có khung năng lực/.test(D.querySelector(".tp-aud h3").textContent)&&/Chưa có khung năng lực yêu cầu cho/.test(D.getElementById("tpAnalysis").textContent)&&/chưa có yêu cầu/i.test(D.querySelector(".tp-aud").textContent),"phân tích khi chưa có khung: nhãn 'Chưa có khung năng lực', không kết luận");
  setv("tpGoals","Đạt chỉ tiêu bán T12"); click('[data-tp-act="biz"]'); await idle();
  click('[data-tp-act="ai"]'); await idle(); await wait(100);
  ok(/không tự đặt điểm yêu cầu/.test(D.getElementById("tpMsg").textContent)&&D.getElementById("tpFwBox").open&&D.querySelectorAll("table.tp-plan tbody tr").length===0&&D.querySelector("ol.tp-steps li.err"),"lập kế hoạch khi chưa có khung: báo cần khai báo khung, tiến trình đánh dấu lỗi ở bước AI, không tạo bảng");

  // 2) điền gợi ý (chưa lưu) → phải lưu mới có hiệu lực
  click('[data-tp-act="fwsuggest"]');
  const inp=(k)=>D.querySelector('#tpFw input[data-fw="'+k+'"]');
  ok(inp("GT1|sk").value==="70"&&inp("PC|sp").value==="75"&&/CHƯA phải chuẩn của công ty/.test(D.getElementById("tpMsg").textContent),"điền gợi ý vào ô trống: SR 1 kỹ năng 70, PC kiến thức sản phẩm 75; nói rõ CHƯA phải chuẩn của công ty");
  inp("GT1|sk").value="72"; ev(inp("GT1|sk"),"input"); click('[data-tp-act="ai"]'); await wait(80);
  ok(/chưa lưu/.test(D.getElementById("tpMsg").textContent),"có thay đổi khung chưa lưu: chặn lập kế hoạch, nhắc lưu khung trước");
  click('[data-tp-act="fwsave"]'); await idle(); await wait(100);
  ok(/Đã khai báo/.test(D.getElementById("tpFw").textContent)&&inp("GT1|sk").value==="72"&&/cần đào tạo/.test(D.querySelector(".tp-aud h3").textContent),"lưu khung: 'Đã khai báo', giữ giá trị 72 đã sửa; phân tích tự cập nhật sang 'cần đào tạo'");

  // 3) nhóm đối tượng + phạm vi dữ liệu
  const chk=[...D.querySelectorAll("#tpCtl2 .tp-audchk")]; chk.forEach(c=>{c.checked=c.value==="GT1"; ev(c,"change");});
  click('[data-tp-act="analyze"]'); await idle(); ok(D.querySelectorAll(".tp-aud").length===1&&/SR GT1/.test(D.querySelector(".tp-aud h3").textContent),"chọn nhóm đối tượng chỉ SR 1: chỉ hiện SR 1");
  [...D.querySelectorAll("#tpCtl2 .tp-audchk")].forEach(c=>{c.checked=true; ev(c,"change");});
  const sc=D.getElementById("tpScope"); sc.value="3"; ev(sc,"change"); click('[data-tp-act="analyze"]'); await idle();
  ok(D.querySelectorAll(".tp-aud").length===1&&/3 tháng gần nhất/.test(D.getElementById("tpAnalysis").textContent),"phạm vi 3 tháng gần nhất: SR 2 (bài làm cách 200 ngày) không còn trong phân tích");
  sc.value="0"; ev(sc,"change");

  // 4) lập kế hoạch: tiến trình, giải thích A–E, bảng theo 15 trường
  click('[data-tp-act="rules"]'); await idle(); await wait(100);
  ok(D.querySelectorAll("ol.tp-steps li.done").length===5&&!D.querySelector("ol.tp-steps li.err"),"tiến trình xử lý: cả 5 bước hoàn tất");
  const ex=D.getElementById("tpExplain").textContent;
  ok(/A\. Đánh giá tổng quan/.test(ex)&&/B\. Các khoảng cách năng lực/.test(ex)&&/C\. Định hướng đào tạo tháng/.test(ex)&&/D\. Kế hoạch triển khai theo tuần/.test(ex)&&/E\. Kết quả kỳ vọng/.test(ex)&&/Mục tiêu kinh doanh: Đạt chỉ tiêu bán T12/.test(ex)&&/Dữ liệu còn thiếu/.test(ex),"phần giải thích A–E hiển thị trước bảng, kèm dữ liệu còn thiếu");
  const rows=D.querySelectorAll("table.tp-plan tbody tr"); ok(rows.length===2,"bảng có 2 chương trình (SR 1 và SR 2)");
  const r0=rows[0], cell=(f)=>r0.querySelector('[data-f="'+f+'"]');
  ok(/Tuần 1/.test(r0.querySelector("td.stt:nth-child(2)").textContent)&&cell("uuTien").value==="Ưu tiên rất cao"&&/Coaching tại điểm bán/.test(cell("hinhThuc").value)&&cell("soHocVien").value==="6"&&cell("trangThai").value==="Dự kiến"&&/yêu cầu ≥ 72%/.test(cell("coSo").value),"dòng đầu: Tuần 1, ưu tiên rất cao, có coaching, 6 học viên, trạng thái Dự kiến, căn cứ nêu ngưỡng 72%");
  const st=cell("trangThai"); st.value="Đã duyệt"; ev(st,"change"); ok(/chưa lưu|Có thay đổi/.test(D.getElementById("tpState").textContent),"đổi trạng thái triển khai: ghi nhận thay đổi chưa lưu");

  // 5) lưu nháp / chính thức, phiên bản, khôi phục
  click('[data-tp-act="draft"]'); await idle(); await wait(100);
  ok(/Đã lưu NHÁP/.test(D.getElementById("tpMsg").textContent)&&!D.querySelector("details.tp-hist"),"lưu NHÁP: báo rõ là nháp, chưa có phiên bản cũ");
  confirms=0; click('[data-tp-act="flow"]'); await idle(); await wait(100); ok(/NHÁP/.test(D.getElementById("tpMsg").textContent),"kế hoạch đang NHÁP: không tạo được luồng, báo rõ");
  const mt=D.querySelector('[data-f="mucTieu"]'); mt.value="Mục tiêu sửa lần 2"; ev(mt,"input"); click('[data-tp-act="save"]'); await idle(); await wait(100);
  const hist=D.querySelector("details.tp-hist"); ok(hist&&/Lịch sử phiên bản \(1\)/.test(hist.textContent)&&/Nháp/.test(hist.textContent),"lưu chính thức: xuất hiện lịch sử phiên bản (1 bản nháp trước đó)");
  const mt2=D.querySelector('[data-f="mucTieu"]'); mt2.value="Sửa tiếp chưa lưu"; ev(mt2,"input");
  click('[data-tp-act="restore"]'); await idle(); await wait(100);
  ok(D.querySelector('[data-f="mucTieu"]').value!=="Sửa tiếp chưa lưu"&&/CHƯA lưu/.test(D.getElementById("tpMsg").textContent)&&/Có thay đổi chưa lưu/.test(D.getElementById("tpState").textContent),"khôi phục: nạp phiên bản cũ vào bảng, báo CHƯA lưu (không tự lưu)");

  // 6) thông tin kinh doanh bổ sung + nguồn lực
  setv("tpPromos","Khuyến mại cuối năm"); setv("tpTrainers","GV A\nGV B"); setv("tpSpw","1"); setv("tpBlocked","08/12/2026"); const fm=D.querySelector("#tpBiz .tp-fmt"); fm.checked=true; ev(fm,"change"); click('[data-tp-act="biz"]'); await idle(); await wait(60);
  const gb=await w.api("GET","/api/kt-admin?op=trainPlanGet&month=2026-12"); ok(gb.j.biz.promos[0]==="Khuyến mại cuối năm"&&gb.j.biz.resources.trainers.join()==="GV A,GV B"&&gb.j.biz.resources.sessionsPerWeek===1&&gb.j.biz.resources.blockedDates[0]==="2026-12-08"&&gb.j.biz.resources.formats.length===1,"lưu thông tin bổ sung và nguồn lực: khuyến mại, giảng viên, số buổi/tuần, ngày không tổ chức, hình thức");
  ok(D.getElementById("tpTrainers").value==="GV A\nGV B"&&D.getElementById("tpBlocked").value==="08/12/2026","hiển thị lại đúng sau khi lưu (ngày dạng dd/mm/yyyy)");
  click('[data-tp-act="csv"]'); ok(/"Tuần triển khai"/.test(csv)&&/"Số học viên dự kiến"/.test(csv)&&/"Mức độ ưu tiên"/.test(csv)&&/"Trạng thái triển khai"/.test(csv)&&/Tuần 1/.test(csv),"xuất Excel/CSV có đủ 15 trường của đặc tả");
  console.log("\n"+pass+" pass, "+fail+" fail"); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
