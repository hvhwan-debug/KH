// Kiểm thử giao diện kiemtra/trainplan.js bằng jsdom nối thẳng API kt-admin (kho tạm trong bộ nhớ): thiếu dữ liệu và gắn danh mục câu hỏi vào mảng năng lực.
// Chạy:  npm i --no-save jsdom  (ở thư mục tạm)  rồi  NODE_PATH=<thư mục>/node_modules node dev/ui-trainmap.js
process.env.STORAGE_MODE="memory"; process.env.MAIL_MODE="memory"; process.env.ADMIN_EMAILS="admin@x.vn";
process.env.SESSION_SECRET="dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS="x.vn";
const R=require("path").resolve(__dirname,"..")+"/", fs=require("fs"), {JSDOM}=require("jsdom");
const quiz=require(R+"api/_lib/quiz"), session=require(R+"api/_lib/session"), admin=require(R+"api/kt-admin");
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+m)};
const q=(cat,good,n)=>Array.from({length:n},(_,i)=>({category:cat,ok:i<good?1:0}));
(async()=>{
  const now=Date.now(),cands=[]; await quiz.saveSettings({examTitle:"K",passEnabled:true,passScore:60});
  for(let i=1;i<=6;i++){cands.push({code:"G"+i,name:"Người "+i,email:"g"+i+"@x.vn",phone:"0912345678",manager:"QL",segment:"may_loc",title:"SR 1",province:"Hà Nội",region:"bac",profile:{namSinh:1990}});
    await quiz.putAttempt({id:"a"+i,code:"G"+i,status:"submitted",period:"k",paper:[].concat(q("Kỹ năng bán hàng",5,5),q("Chính sách bán hàng",5,5),q("Phần A Ngành 1",2,5))});
    await quiz.upsertIndex({id:"a"+i,code:"G"+i,status:"submitted",pct:80,score:8,total:10,submittedAt:now,period:"k",flags:{blur:0}});}
  await quiz.saveCandidates(cands);
  const dom=new JSDOM('<!doctype html><body><div id="tab-trainplan"><div class="card" id="tpRoot"></div></div></body>',{runScripts:"outside-only",pretendToBeVisual:true});
  const w=dom.window; w.$=id=>w.document.getElementById(id); w.esc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); w.confirm=()=>true;
  w.api=async(method,path,body)=>{const u=new URL(path,"http://x"),ctx={log:Object.assign(()=>{},{error:console.error,warn:()=>{}}),res:null};
    await admin(ctx,{method,headers:{"x-requested-with":"livotec","x-sr-token":session.sessionValue("admin@x.vn")},query:Object.fromEntries(u.searchParams),body}); return {s:ctx.res.status,j:ctx.res.body};};
  await w.api("POST","/api/kt-admin",{op:"trainFrameworkSave",min:require(R+"api/_lib/trainplan").SUGGESTED});
  w.eval(fs.readFileSync(R+"kiemtra/trainplan.js","utf8"));
  const D=w.document,wait=(ms=60)=>new Promise(r=>setTimeout(r,ms)),click=s=>D.querySelector(s).click();
  const idle=async()=>{for(let i=0;i<80;i++){await wait(25);if(![...D.querySelectorAll("[data-tp-act]")].some(b=>b.disabled)){await wait(25);return}}};
  await w.tpOpen(); await wait();
  ok(D.querySelector(".tp-hero h1").textContent==="Kế hoạch đào tạo"&&D.querySelector(".tp-hero-art svg")&&D.querySelectorAll(".tp-bar .btn .ic svg").length>=6,"giao diện theo ảnh mẫu: tiêu đề, hình minh hoạ bên phải, nút có biểu tượng");
  ok(D.querySelector(".tp-empty-art svg")&&/Chưa có kế hoạch cho tháng này/.test(D.getElementById("tpPlan").textContent)&&/Lập theo luật/.test(D.querySelector('[data-tp-act="rules"]').textContent)&&/AI lập kế hoạch/.test(D.querySelector('[data-tp-act="ai"]').textContent),"trạng thái trống có hình minh hoạ; nút 'AI lập kế hoạch', 'Lập theo luật' đúng chữ");
  const mi=D.getElementById("tpMonth"); mi.value="2026-12"; mi.dispatchEvent(new w.Event("change")); await wait(100);
  click('[data-tp-act="analyze"]'); await idle();
  const card=()=>[...D.querySelectorAll(".tp-aud")].find(c=>/SR GT1/.test(c.textContent));
  ok(card()&&/Chưa đủ dữ liệu \(2 mảng\)/.test(card().textContent)&&!/Đạt yêu cầu/.test(card().querySelector("h3").textContent),"SR GT1 còn 2 mảng thiếu dữ liệu: KHÔNG hiện 'Đạt yêu cầu', hiện 'Chưa đủ dữ liệu (2 mảng)'");
  ok(/chưa thể kết luận các mảng đó là đạt/.test(D.getElementById("tpAnalysis").textContent)&&/không kết luận/.test(D.getElementById("tpAnalysis").textContent),"có cảnh báo tổng và quy tắc nói rõ mảng chưa đủ dữ liệu thì không kết luận");
  const det=card().querySelector("details.tp-diag"), row=[...det.querySelectorAll("tr.tp-unm")].find(r=>/Phần A Ngành 1/.test(r.textContent));
  ok(det&&det.open&&row&&row.querySelector("select").value==="gn"&&/30/.test(row.textContent),"khung 'Vì sao thiếu dữ liệu?' mở sẵn, liệt kê danh mục 'Phần A Ngành 1' (30 câu) đang ở Kiến thức chung (không dùng)");
  const sel=row.querySelector("select"); sel.value="n1"; sel.dispatchEvent(new w.Event("change",{bubbles:true})); await idle(); await wait(150);
  ok(/cần đào tạo/.test(card().querySelector("h3").textContent)&&/gắn thủ công/.test(card().textContent)&&[...card().querySelectorAll("select.tp-catsel")].find(s=>s.getAttribute("data-cat")==="Phần A Ngành 1").value==="n1","chọn lại mảng: hệ thống tính lại ngay, SR GT1 chuyển sang 'cần đào tạo' (TB 40% < 75%), danh mục hiện 'gắn thủ công'");
  console.log("\n"+pass+" pass, "+fail+" fail"); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
