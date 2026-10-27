/* Quản trị khảo sát. Dùng phiên đăng nhập admin của /kiemtra/admin (cookie), API: /api/ks-admin */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
/* ---------- tiện ích dựng DOM (không dùng innerHTML với dữ liệu người dùng) ---------- */
function h(tag,props){
  var e=document.createElement(tag);props=props||{};
  Object.keys(props).forEach(function(k){var v=props[k];
    if(v===false||v===null||v===undefined)return;
    if(k==='class')e.className=v;
    else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);
    else if(k==='value')e.value=v;
    else if(k==='checked')e.checked=!!v;
    else e.setAttribute(k,v===true?'':v);
  });
  for(var i=2;i<arguments.length;i++)add(e,arguments[i]);
  return e;
}
function add(e,c){if(c==null||c===false)return;if(Array.isArray(c)){c.forEach(function(x){add(e,x)});return}e.appendChild(c.nodeType?c:document.createTextNode(String(c)))}
function clear(e){while(e.firstChild)e.removeChild(e.firstChild);return e}
function origin(){return location.origin}
function trunc(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s}
function pct(n,d){return d?Math.round(n*100/d):0}
function fmtDur(ms){if(!ms)return '—';var s=Math.round(ms/1000);return s<60?s+' giây':Math.floor(s/60)+' phút '+(s%60)+' giây'}
function fmtTime(ms){return ms?new Date(ms).toLocaleString('vi-VN'):''}
function toLocal(ms){if(!ms)return '';var d=new Date(ms);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function clone(o){return JSON.parse(JSON.stringify(o))}
/* bỏ dấu tiếng Việt + chữ thường để lọc "cuong" ra "Cường" */
function fold(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase()}

function api(op,params,body){
  var url='/api/ks-admin?op='+op+(params?'&'+params:'');
  var o={credentials:'same-origin',headers:{'X-Requested-With':'livotec'}};
  if(body){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(Object.assign({op:op},body));url='/api/ks-admin'}
  return fetch(url,o).then(function(r){return r.json().then(function(j){
    if(r.status===401||r.status===403){var e=new Error(j.error||'Chưa được phép.');e.auth=true;throw e}
    if(!r.ok||j.ok===false)throw new Error(j.error||'Lỗi');return j})});
}

/* ---------- loại câu hỏi ---------- */
var TYPES=[['single','Chọn một đáp án'],['multi','Chọn nhiều đáp án'],['yesno','Có / Không'],['rating','Thang điểm (1–5, 1–7…)'],['nps','NPS 0–10'],
  ['matrix','Bảng ma trận (nhiều dòng)'],['ranking','Sắp xếp thứ tự ưu tiên'],['text','Văn bản'],['number','Số'],['date','Ngày'],['section','── Tiêu đề trang (chia trang mới)']];
var TNAME={};TYPES.forEach(function(t){TNAME[t[0]]=t[1]});
function defaults(type){
  switch(type){
  case 'single':return {options:['',''],allowOther:false,randomize:false,display:'radio'};
  case 'multi':return {options:['',''],allowOther:false,randomize:false,min:0,max:0};
  case 'rating':return {max:5,low:'Rất không hài lòng',high:'Rất hài lòng'};
  case 'nps':return {low:'0 = Hoàn toàn không',high:'10 = Chắc chắn'};
  case 'matrix':return {rows:['',''],cols:['Kém','Trung bình','Tốt']};
  case 'ranking':return {options:['','',''],randomize:false};
  case 'text':return {multiline:false,validate:'',maxLen:200,placeholder:''};
  case 'number':return {min:null,max:null,integer:false,unit:''};
  case 'date':return {min:'',max:''};
  }
  return {};
}
var KEEP=['id','type','text','help','required','showIf','endIf'];
function retype(q,type){
  var o={};KEEP.forEach(function(k){if(q[k]!==undefined)o[k]=q[k]});o.type=type;
  if(type==='section'){delete o.required;delete o.endIf}
  return Object.assign(o,defaults(type));
}

/* ---------- mẫu có sẵn ---------- */
var TEMPLATES=[
{name:'Nhu cầu đào tạo (gán nhân sự theo hồ sơ)',title:'Khảo sát nhu cầu đào tạo',description:'Giúp bộ phận đào tạo xây dựng kế hoạch phù hợp với bạn. Mất khoảng 5 phút.',identity:'roster',audience:{},questions:[
 {id:'q1',type:'section',text:'Nội dung bạn cần đào tạo',help:'Chọn những nội dung giúp ích nhiều nhất cho công việc hiện tại.'},
 {id:'q2',type:'multi',text:'Bạn muốn được đào tạo về nội dung nào? (tối đa 3)',options:['Kiến thức sản phẩm mới','Kỹ năng bán hàng và thuyết phục','Trưng bày, tiếp cận điểm bán','Chính sách, chương trình bán hàng','Sử dụng công cụ, ứng dụng làm việc','Giao tiếp và xử lý từ chối'],allowOther:true,min:1,max:3,required:true},
 {id:'q3',type:'ranking',text:'Sắp xếp theo mức cần thiết (trên cùng là cần nhất)',options:['Kiến thức sản phẩm','Kỹ năng bán hàng','Quản lý điểm bán','Chính sách và quy trình'],required:true},
 {id:'q4',type:'matrix',text:'Bạn tự đánh giá mức thành thạo hiện tại',required:true,rows:['Kiến thức sản phẩm','Kỹ năng bán hàng','Chăm sóc và xử lý khiếu nại','Sử dụng công cụ, ứng dụng'],cols:['Cần cải thiện nhiều','Cơ bản','Tốt','Rất tốt']},
 {id:'q5',type:'section',text:'Hình thức và thời gian'},
 {id:'q6',type:'single',text:'Hình thức đào tạo bạn mong muốn',required:true,options:['Trực tiếp tại khu vực','Tập trung tại văn phòng','Trực tuyến (video call)','Video, tài liệu tự học'],display:'radio'},
 {id:'q7',type:'multi',text:'Thời điểm bạn thuận tiện tham gia',options:['Sáng các ngày trong tuần','Chiều các ngày trong tuần','Tối','Cuối tuần'],min:1,max:0,required:true},
 {id:'q8',type:'number',text:'Số giờ mỗi tháng bạn có thể dành cho đào tạo',min:0,max:100,integer:true,unit:'giờ'},
 {id:'q9',type:'yesno',text:'Trong 6 tháng qua bạn có tham gia khoá đào tạo nào không?',required:true},
 {id:'q10',type:'text',text:'Khoá nào hữu ích nhất với bạn? Vì sao?',multiline:true,maxLen:1000,showIf:{mode:'all',rules:[{q:'q9',op:'eq',v:0}]}},
 {id:'q11',type:'text',text:'Đề xuất khác cho chương trình đào tạo',multiline:true,maxLen:1000}]},
{name:'Hài lòng khách hàng (CSAT + NPS)',title:'Khảo sát mức độ hài lòng',description:'Cảm ơn bạn đã dành 2 phút góp ý để chúng tôi phục vụ tốt hơn.',identity:'none',questions:[
 {id:'q1',type:'rating',text:'Nhìn chung bạn hài lòng đến mức nào?',required:true,max:5,low:'Rất không hài lòng',high:'Rất hài lòng'},
 {id:'q2',type:'matrix',text:'Bạn đánh giá thế nào về từng khía cạnh sau?',required:true,rows:['Chất lượng sản phẩm','Giá cả','Giao hàng','Hỗ trợ sau bán'],cols:['Kém','Trung bình','Tốt','Rất tốt']},
 {id:'q3',type:'nps',text:'Khả năng bạn giới thiệu chúng tôi cho bạn bè, đồng nghiệp?',required:true},
 {id:'q4',type:'text',text:'Điều gì khiến bạn chưa hài lòng? Chúng tôi nên cải thiện gì?',multiline:true,maxLen:1000,required:true,showIf:{mode:'all',rules:[{q:'q3',op:'lte',v:6}]}},
 {id:'q5',type:'text',text:'Điều bạn thích nhất ở chúng tôi là gì?',multiline:true,maxLen:1000,showIf:{mode:'all',rules:[{q:'q3',op:'gte',v:9}]}},
 {id:'q6',type:'multi',text:'Bạn biết đến chúng tôi qua đâu?',options:['Người quen giới thiệu','Mạng xã hội','Tìm kiếm trên mạng','Cửa hàng / đại lý'],allowOther:true,min:0,max:0}]},
{name:'Đánh giá khoá đào tạo',title:'Đánh giá khoá đào tạo',description:'Ý kiến của bạn giúp chúng tôi cải tiến các khoá sau.',identity:'emp',questions:[
 {id:'q1',type:'section',text:'Nội dung khoá học',help:'Chọn mức đồng ý với từng nhận định.'},
 {id:'q2',type:'matrix',text:'Mức độ đồng ý của bạn',required:true,rows:['Nội dung dễ hiểu','Nội dung hữu ích cho công việc','Thời lượng phù hợp','Tài liệu đầy đủ'],cols:['Hoàn toàn không đồng ý','Không đồng ý','Bình thường','Đồng ý','Hoàn toàn đồng ý']},
 {id:'q3',type:'ranking',text:'Sắp xếp các chủ đề theo mức hữu ích (trên cùng là hữu ích nhất)',options:['Kiến thức sản phẩm','Kỹ năng bán hàng','Chính sách, quy trình','Thực hành tình huống'],required:true},
 {id:'q4',type:'section',text:'Giảng viên và tổ chức'},
 {id:'q5',type:'rating',text:'Đánh giá chung về giảng viên',required:true,max:5,low:'Kém',high:'Xuất sắc'},
 {id:'q6',type:'yesno',text:'Khoá học có đạt mục tiêu bạn mong đợi không?',required:true},
 {id:'q7',type:'text',text:'Bạn mong đợi điều gì mà khoá học chưa đáp ứng?',multiline:true,maxLen:1000,showIf:{mode:'all',rules:[{q:'q6',op:'eq',v:1}]}},
 {id:'q8',type:'text',text:'Góp ý khác',multiline:true,maxLen:1000}]},
{name:'Gắn bó nhân viên (eNPS, ẩn danh)',title:'Khảo sát gắn bó nhân viên',description:'Khảo sát ẩn danh. Câu trả lời không gắn với tên của bạn.',identity:'none',questions:[
 {id:'q1',type:'nps',text:'Bạn có sẵn lòng giới thiệu công ty là nơi làm việc tốt cho bạn bè không?',required:true,low:'0 = Không bao giờ',high:'10 = Chắc chắn'},
 {id:'q2',type:'matrix',text:'Mức độ đồng ý với các nhận định',required:true,rows:['Tôi hiểu rõ mục tiêu công việc','Quản lý trực tiếp hỗ trợ tôi tốt','Tôi được ghi nhận khi làm tốt','Tôi có cơ hội phát triển'],cols:['Không đồng ý','Phân vân','Đồng ý']},
 {id:'q3',type:'single',text:'Bạn dự định làm việc tại đây trong bao lâu nữa?',options:['Dưới 6 tháng','6–12 tháng','1–3 năm','Trên 3 năm'],required:true},
 {id:'q4',type:'multi',text:'Điều gì quan trọng nhất để bạn gắn bó? (tối đa 2)',options:['Thu nhập','Môi trường làm việc','Cơ hội thăng tiến','Quản lý trực tiếp','Cân bằng công việc – cuộc sống'],min:1,max:2,required:true},
 {id:'q5',type:'text',text:'Điều công ty nên thay đổi đầu tiên?',multiline:true,maxLen:1000}]},
{name:'Phản hồi sự kiện',title:'Phản hồi sau sự kiện',description:'',identity:'name',questions:[
 {id:'q1',type:'rating',text:'Bạn chấm sự kiện này mấy điểm?',required:true,max:5,low:'Chưa tốt',high:'Rất tốt'},
 {id:'q2',type:'single',text:'Bạn tham dự theo hình thức nào?',options:['Trực tiếp','Trực tuyến'],required:true,display:'radio'},
 {id:'q3',type:'multi',text:'Phần nào bạn thấy bổ ích?',options:['Phần mở đầu','Thảo luận','Phần thực hành','Giao lưu'],allowOther:true,min:0,max:0},
 {id:'q4',type:'yesno',text:'Bạn có muốn tham gia sự kiện tiếp theo không?',required:true},
 {id:'q5',type:'text',text:'Email để chúng tôi gửi thông báo sự kiện sau',validate:'email',maxLen:120,showIf:{mode:'all',rules:[{q:'q4',op:'eq',v:0}]}},
 {id:'q6',type:'text',text:'Góp ý để lần sau tốt hơn',multiline:true,maxLen:1000}]}
];
TEMPLATES.forEach(function(t,i){$('tpl').appendChild(h('option',{value:i},t.name))});
$('tpl').addEventListener('change',function(){
  var v=this.value;this.value='';if(v==='')return;var t=TEMPLATES[+v];
  openEditor({code:'',title:t.title,description:t.description||'',thanks:'',identity:t.identity,flow:'auto',audience:t.audience?clone(t.audience):null,open:true,openAt:0,closeAt:0,maxResponses:0,showProgress:true,questions:clone(t.questions)},true,0);
});

/* ---------- danh sách ---------- */
function enter(){
  api('list').then(function(j){$('auth').hidden=true;$('panel').hidden=false;renderList(j.items)})
  .catch(function(e){$('panel').hidden=true;$('auth').hidden=false;$('autherr').textContent=e.auth?e.message:'Lỗi: '+e.message});
}
var ITEMS=[];
function refresh(){return api('list').then(function(j){renderList(j.items)})}
function stateBadge(s){return s==='open'?h('span',{class:'badge'},'đang mở'):s==='notyet'?h('span',{class:'badge wait'},'chưa tới giờ mở'):h('span',{class:'badge off'},'đã đóng')}
function renderList(items){
  ITEMS=items;var box=clear($('list'));
  if(!items.length){box.appendChild(h('p',{class:'note'},'Chưa có khảo sát nào. Bấm "Tạo khảo sát trống" hoặc chọn một mẫu có sẵn để bắt đầu.'));return}
  items.forEach(function(s){
    var link=origin()+'/kiemtra/ks='+s.code;
    var cp=h('button',{class:'sm',onclick:function(){navigator.clipboard.writeText(link).then(function(){cp.textContent='Đã sao chép';setTimeout(function(){cp.textContent='Sao chép link'},1500)})}},'Sao chép link');
    box.appendChild(h('div',{class:'li'},
      h('div',{class:'meta'},h('strong',null,s.title),stateBadge(s.state),
        h('div',{class:'note'},s.count+' phiếu'+(s.max?' / tối đa '+s.max:'')),
        h('div',{class:'link'},link)),
      h('div',{class:'row nf',style:'flex:0 0 auto'},cp,
        h('button',{class:'sm',onclick:function(){openLink(s.code,true)}},'Xem thử'),
        h('button',{class:'sm',onclick:function(){showResults(s.code)}},'Kết quả'),
        h('button',{class:'sm',onclick:function(){loadSurvey(s.code,function(sv){openEditor(sv,false,s.count)})}},'Sửa'),
        h('button',{class:'sm',onclick:function(){loadSurvey(s.code,function(sv){sv.code=trunc(s.code,33)+'-copy';sv.title=sv.title+' (bản sao)';openEditor(sv,true,0)})}},'Nhân bản'),
        h('button',{class:'sm d',onclick:function(){if(confirm('Xoá khảo sát "'+s.title+'"?\nLink sẽ ngừng hoạt động. Kết quả đã thu vẫn nằm trong kho dữ liệu.'))api('delete',null,{code:s.code}).then(refresh).catch(function(e){alert(e.message)})}},'Xoá'))));
  });
}
function openLink(code,preview){window.open('/kiemtra/ks='+code+(preview?'?preview=1':''),'_blank','noopener')}
function loadSurvey(code,cb){api('get','code='+encodeURIComponent(code)).then(function(j){cb(j.survey)}).catch(function(e){alert(e.message)})}
$('new').onclick=function(){
  openEditor({code:'',title:'',description:'',thanks:'',identity:'none',open:true,openAt:0,closeAt:0,maxResponses:0,showProgress:true,
    questions:[Object.assign({id:'q1',type:'single',text:'',help:'',required:true},defaults('single'))]},true,0);
};

/* ---------- trình soạn ---------- */
var E=null;
function nonSection(q){return q.type!=='section'}
function qById(id){var r=null;E.S.questions.forEach(function(q){if(q.id===id)r=q});return r}
function newId(){var m=0;E.S.questions.forEach(function(q){var n=parseInt(String(q.id).replace(/\D/g,''),10);if(n>m)m=n});return 'q'+(m+1)}
function lines(a){return (a||[]).join('\n')}

/* ô nhập gắn với model */
function tin(o,k,ph,max){return h('input',{type:'text',value:o[k]||'',placeholder:ph||'',maxlength:max||500,oninput:function(){o[k]=this.value}})}
function tarea(o,k,ph,rows){var t=h('textarea',{placeholder:ph||'',rows:rows||3,oninput:function(){o[k]=this.value}});t.value=o[k]||'';return t}
function larea(o,k,ph){var t=h('textarea',{placeholder:ph||'Mỗi dòng một mục',rows:4,oninput:function(){o[k]=this.value.split('\n')}});t.value=lines(o[k]);return t}
function cb(o,k,label,after){return h('label',{class:'chk'},h('input',{type:'checkbox',checked:!!o[k],onchange:function(){o[k]=this.checked;if(after)after()}}),label)}
function sel(o,k,opts,after){var s=h('select',{onchange:function(){o[k]=this.value;if(after)after()}});opts.forEach(function(p){s.appendChild(h('option',{value:p[0]},p[1]))});s.value=o[k];return s}
function nin(o,k,ph,extra){return h('input',Object.assign({type:'number',value:(o[k]===null||o[k]===undefined)?'':o[k],placeholder:ph||'',onchange:function(){o[k]=this.value===''?null:Number(this.value)}},extra||{}))}
function fld(label,node){return h('div',null,h('label',{class:'f'},label),node)}

function openEditor(sv,isNew,count){
  E={S:clone(sv),isNew:isNew,count:count||0,saved:!isNew,tab:'q'};
  if(!E.S.identity)E.S.identity=E.S.askIdentity?'emp':'none';
  if(E.S.showProgress===undefined)E.S.showProgress=true;
  $('results').hidden=true;$('editor').hidden=false;drawEditor();
  E.base=JSON.stringify(payload());updateDirty();
  $('editor').scrollIntoView({behavior:'smooth'});
}
function drawEditor(){
  var S=E.S,box=clear($('editor'));
  box.appendChild(h('h2',null,E.isNew?'Tạo khảo sát':'Sửa khảo sát',h('span',{class:'dirty',id:'dirty',hidden:true},'Có thay đổi chưa lưu')));
  if(!E.isNew&&E.count>0)box.appendChild(h('div',{class:'warn'},'Khảo sát này đã có '+E.count+' phiếu. Đổi thứ tự, loại câu hỏi hoặc số lượng đáp án có thể làm kết quả cũ hiển thị lệch. Chỉ sửa chữ, thêm câu mới hoặc đổi cài đặt thì an toàn.'));
  var code=h('input',{type:'text',value:S.code,disabled:!E.isNew,maxlength:40,placeholder:'vd: hai-long-q4',oninput:function(){S.code=this.value.trim().toLowerCase()}});
  box.appendChild(h('div',{class:'grid2'},
    fld('Mã khảo sát (chữ thường, số, gạch ngang; dùng trong link)',code),
    fld('Tên khảo sát',tin(S,'title','Tên người trả lời sẽ thấy',200))));
  // Tab: Câu hỏi (mở sẵn) · Cài đặt · Nhân sự tham gia (chỉ khi chọn "Nhân sự được gán")
  box.appendChild(h('div',{class:'tabs',id:'etabs',role:'tablist'}));
  var paneS=h('div',{id:'paneS',hidden:true}),paneA=h('div',{id:'paneA',hidden:true}),paneQ=h('div',{id:'paneQ'});
  paneS.appendChild(fld('Mô tả ngắn (tuỳ chọn)',tarea(S,'description','Giới thiệu mục đích, thời gian làm',3)));
  paneS.appendChild(fld('Lời cảm ơn sau khi gửi (tuỳ chọn)',tin(S,'thanks','Cảm ơn bạn đã hoàn thành khảo sát.',500)));
  var ident=sel(S,'identity',[['none','Ẩn danh, không hỏi tên'],['name','Hỏi họ tên'],['emp','Hỏi mã nhân viên + họ tên (mỗi mã chỉ gửi 1 lần)'],['roster','Nhân sự được gán: xác thực mã NV + email trong Hồ sơ học tập']],function(){
    if(S.identity==='roster'){E.tab='a'}else if(E.tab==='a'){E.tab='s'}
    drawAud();drawTabs()});
  paneS.appendChild(fld('Thông tin người trả lời',ident));
  paneS.appendChild(h('p',{class:'note',id:'rosterNote'},''));
  var oa=h('input',{type:'datetime-local',value:toLocal(S.openAt),onchange:function(){S.openAt=this.value?Date.parse(this.value):0}});
  var ca=h('input',{type:'datetime-local',value:toLocal(S.closeAt),onchange:function(){S.closeAt=this.value?Date.parse(this.value):0}});
  var mr=h('input',{type:'number',min:0,value:S.maxResponses||'',placeholder:'0 = không giới hạn',onchange:function(){S.maxResponses=Math.max(0,Math.floor(Number(this.value)||0))}});
  paneS.appendChild(h('div',{class:'row'},fld('Mở lúc (trống = mở ngay)',oa),fld('Đóng lúc (trống = không tự đóng)',ca),fld('Số phiếu tối đa',mr)));
  if(!S.flow)S.flow='auto';
  paneS.appendChild(fld('Cách hiển thị câu hỏi cho người trả lời',sel(S,'flow',[['auto','Tự động: từng câu một trên điện thoại, theo trang trên máy tính (khuyên dùng)'],['step','Luôn từng câu một'],['page','Luôn theo trang (nhiều câu cùng lúc)']])));
  paneS.appendChild(h('div',{class:'row'},cb(S,'open','Đang mở nhận trả lời'),cb(S,'showProgress','Hiện thanh tiến độ')));
  paneA.appendChild(h('div',{id:'aud'}));
  paneQ.appendChild(h('div',{class:'warn',style:'background:var(--soft)'},h('strong',null,'Bấm vào chữ của từng câu để sửa. '),'Dùng ↑ ↓ để đổi thứ tự, ⧉ để nhân đôi, ✕ để xoá, chọn "Bắt buộc" nếu cần. Mở mục "Logic" để đặt điều kiện hiện câu. Mỗi "Tiêu đề trang" bắt đầu một trang mới.'));
  paneQ.appendChild(h('div',{id:'qs'}));
  var addSel=h('select',{id:'addType',style:'width:auto'});TYPES.forEach(function(t){addSel.appendChild(h('option',{value:t[0]},t[1]))});
  paneQ.appendChild(h('div',{class:'row',style:'margin-top:10px;justify-content:flex-start'},addSel,
    h('button',{class:'nf',onclick:function(){var t=addSel.value;E.S.questions.push(Object.assign({id:newId(),type:t,text:'',help:'',required:false},defaults(t)));drawQs();var c=$('qs').lastChild;if(c)c.scrollIntoView({behavior:'smooth',block:'center'})}},'＋ Thêm câu hỏi')));
  box.appendChild(paneS);box.appendChild(paneA);box.appendChild(paneQ);
  var msg=h('span',{id:'savemsg',role:'status'});
  box.appendChild(h('div',{class:'savebar'},h('div',{class:'row',style:'justify-content:flex-start;align-items:center'},
    h('button',{class:'p nf',onclick:save},'Lưu khảo sát'),
    h('button',{class:'nf',onclick:previewDraft},'Xem thử bản đang soạn'),
    h('button',{class:'nf',id:'pvSaved',hidden:!E.saved,onclick:function(){openLink(E.S.code,true)}},'Xem bản đã lưu'),
    h('button',{class:'nf',onclick:function(){if(isDirty()&&!confirm('Có thay đổi chưa lưu. Đóng và bỏ các thay đổi này?'))return;$('editor').hidden=true}},'Đóng'),msg)));
  drawQs();drawAud();drawTabs();
}


/* ---------- gán nhân sự tham gia (theo Hồ sơ học tập) ---------- */
var ROSTER=null,SEG={both:'Cả hai ngành',gia_dung:'Gia dụng',may_loc:'Máy lọc nước'},RG={bac:'Miền Bắc',nam:'Miền Nam'};
var DIMS=[['managers','mk','Theo quản lí'],['titles','tk','Theo chức danh'],['segments','seg','Theo nhóm ngành'],['regions','rg','Theo miền'],['provinces','pk','Theo tỉnh/thành']];
function audOf(){var a=E.S.audience;if(!a||typeof a!=='object')a=E.S.audience={};
  ['managers','titles','segments','regions','provinces','codes','exclude'].forEach(function(k){if(!Array.isArray(a[k]))a[k]=[]});return a}
function activeDims(a){return DIMS.filter(function(d){return a[d[0]].length})}
function ruleMatch(c){var a=audOf(),dims=activeDims(a);if(!dims.length)return !a.codes.length;
  return dims.every(function(d){return a[d[0]].indexOf(c[d[1]])>=0})}
function isMember(c){if(c.left)return false;var a=audOf();if(a.exclude.indexOf(c.nc)>=0)return false;
  if(a.codes.indexOf(c.nc)>=0)return true;return ruleMatch(c)}
function dropFrom(arr,v){var i=arr.indexOf(v);if(i>=0)arr.splice(i,1)}
function setMember(c,want){var a=audOf();if(c.left)return;
  if(want){dropFrom(a.exclude,c.nc);if(!ruleMatch(c)&&a.codes.indexOf(c.nc)<0)a.codes.push(c.nc)}
  else{dropFrom(a.codes,c.nc);if(ruleMatch(c)&&a.exclude.indexOf(c.nc)<0)a.exclude.push(c.nc)}}
function facetLabel(dim,key,row){return dim==='seg'?(SEG[key]||key):dim==='rg'?(RG[key]||key):dim==='mk'?(row.manager||'(chưa có quản lí)'):dim==='pk'?(row.province||'(chưa có tỉnh)'):key}
var audFilter='';
function drawAud(){
  var box=$('aud');if(!box)return;clear(box);
  if(!E||E.S.identity!=='roster')return;
  var a=audOf();
  box.appendChild(h('div',{class:'qc',style:'background:var(--soft)'},h('strong',null,'Nhân sự tham gia'),
    h('p',{class:'note',style:'margin:4px 0 0'},'Chỉ nhân sự trong Hồ sơ học tập đúng đối tượng mới mở được phiếu (xác thực bằng mã nhân viên + email). Nhân viên đã nghỉ việc tự bị loại. Không chọn nhóm nào = mọi nhân viên đang làm việc. Nhóm được lưu theo điều kiện nên người mới vào đúng nhóm sẽ tự được gán.')));
  var inner=box.firstChild;
  if(!ROSTER){inner.appendChild(h('p',{class:'note'},'Đang tải danh sách nhân sự…'));
    api('roster').then(function(j){ROSTER=j.rows;drawAud()}).catch(function(e){clear(inner).appendChild(h('p',{class:'bad'},'Không tải được danh sách nhân sự: '+e.message))});return}
  var active=ROSTER.filter(function(c){return !c.left});
  inner.appendChild(h('div',{id:'audSum',style:'margin:10px 0;font-size:1.05rem'}));
  inner.appendChild(h('div',{class:'note'},'Chọn nhanh theo nhóm (trong một nhóm chỉ cần khớp một mục; giữa các nhóm phải khớp tất cả):'));
  DIMS.forEach(function(d){
    var map={},order=[];active.forEach(function(c){var k=c[d[1]];if(k===''||k===undefined)return;if(!map[k]){map[k]={n:0,row:c};order.push(k)}map[k].n++});
    if(!order.length)return;
    order.sort(function(x,y){return map[y].n-map[x].n||String(facetLabel(d[1],x,map[x].row)).localeCompare(facetLabel(d[1],y,map[y].row))});
    var det=h('details',{open:a[d[0]].length>0},h('summary',{class:'note',style:'cursor:pointer;margin:6px 0'},d[2]+(a[d[0]].length?'  ('+a[d[0]].length+' đã chọn)':'')));
    var wrap=h('div',{style:'display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 8px'});
    order.forEach(function(k){
      wrap.appendChild(h('label',{class:'chk',style:'margin:2px 0'},h('input',{type:'checkbox',checked:a[d[0]].indexOf(k)>=0,onchange:function(){
        if(this.checked){if(a[d[0]].indexOf(k)<0)a[d[0]].push(k)}else dropFrom(a[d[0]],k);
        det.firstChild.textContent=d[2]+(a[d[0]].length?'  ('+a[d[0]].length+' đã chọn)':'');refreshAud()}}),facetLabel(d[1],k,map[k].row)+' ('+map[k].n+')'));
    });
    det.appendChild(wrap);inner.appendChild(det);
  });
  // theo từng người
  inner.appendChild(h('h3',{style:'margin:12px 0 4px'},'Chọn / bỏ từng người'));
  var fi=h('input',{type:'text',placeholder:'Lọc theo mã, họ tên, quản lí, chức danh…','aria-label':'Lọc nhân sự',value:audFilter,oninput:function(){audFilter=this.value;refreshAud()}});
  inner.appendChild(h('div',{class:'row'},fi,
    h('button',{class:'nf',onclick:function(){shown().forEach(function(c){setMember(c,true)});refreshAud()}},'Chọn tất cả đang hiện'),
    h('button',{class:'nf',onclick:function(){shown().forEach(function(c){setMember(c,false)});refreshAud()}},'Bỏ chọn đang hiện')));
  inner.appendChild(h('div',{id:'audList',class:'scroll',style:'margin-top:8px;max-height:320px;overflow:auto'}));
  // dán danh sách mã
  var ta=h('textarea',{placeholder:'Mỗi dòng một mã nhân viên (hoặc cách nhau dấu phẩy)',rows:3,'aria-label':'Dán mã nhân viên'});
  var pm=h('div',{class:'note'});
  inner.appendChild(h('div',{style:'margin-top:10px'},h('label',{class:'f'},'Thêm nhanh bằng danh sách mã nhân viên'),ta,
    h('div',{class:'row',style:'margin-top:6px;align-items:center'},h('button',{class:'nf',onclick:function(){
      var by={};ROSTER.forEach(function(c){by[c.nc]=c});var miss=[],added=0;
      ta.value.split(/[\n,;\t]+/).map(function(x){return x.trim().toLowerCase()}).filter(Boolean).forEach(function(c){
        var r=by[c];if(!r||r.left){miss.push(c);return}if(!isMember(r)){setMember(r,true);added++}});
      pm.className=miss.length?'note bad':'note ok';pm.textContent='Đã thêm '+added+' người.'+(miss.length?' Không tìm thấy hoặc đã nghỉ việc: '+miss.slice(0,20).join(', ')+(miss.length>20?'…':''):'');
      if(!miss.length)ta.value='';refreshAud()}},'Thêm vào danh sách'),pm)));
  refreshAud();
}
function shown(){
  var f=fold(audFilter.trim());
  return ROSTER.filter(function(c){return !c.left&&(!f||fold(c.code+' '+c.name+' '+c.manager+' '+c.title).indexOf(f)>=0)});
}
function drawSum(){
  var el=$('audSum');if(!el)return;
  var active=ROSTER.filter(function(c){return !c.left}),n=active.filter(isMember).length,a=audOf(),sum=clear(el);
  sum.appendChild(h('span',null,'Đang gán '));sum.appendChild(h('strong',{class:n?'ok':'bad'},String(n)));
  sum.appendChild(h('span',null,' / '+active.length+' nhân viên đang làm việc'));
  if(!n)sum.appendChild(h('div',{class:'warn'},'Chưa có ai được gán: không ai mở được khảo sát. Hãy chọn nhóm hoặc thêm người.'));
  sum.appendChild(h('div',{class:'note'},(activeDims(a).length||a.codes.length||a.exclude.length)?'Đã thêm riêng '+a.codes.length+' người, loại riêng '+a.exclude.length+' người.':'Chưa giới hạn: mọi nhân viên đang làm việc đều được mời.'));
}
function refreshAud(){
  if(!$('audSum'))return;drawSum();
  var list=clear($('audList')),rows=shown(),max=100,tb=h('tbody');
  rows.slice(0,max).forEach(function(c){
    tb.appendChild(h('tr',null,h('td',null,h('input',{type:'checkbox','aria-label':'Gán '+c.name,checked:isMember(c),onchange:function(){setMember(c,this.checked);drawSum()}})),
      h('td',null,c.code),h('td',null,c.name),h('td',null,c.manager),h('td',null,c.title)));
  });
  if(!rows.length)tb.appendChild(h('tr',null,h('td',{colspan:5,class:'note'},'Không có nhân viên nào khớp.')));
  list.appendChild(h('table',null,h('thead',null,h('tr',null,h('th'),h('th',null,'Mã NV'),h('th',null,'Họ tên'),h('th',null,'Quản lí'),h('th',null,'Chức danh'))),tb));
  if(rows.length>max)list.appendChild(h('p',{class:'note'},'Hiện '+max+'/'+rows.length+' người. Hãy lọc để xem thêm.'));
}


function drawTabs(){
  var bar=$('etabs');if(!bar||!E)return;clear(bar);
  var roster=E.S.identity==='roster',nq=E.S.questions.filter(function(q){return q.type!=='section'}).length;
  if(!E.tab||(E.tab==='a'&&!roster))E.tab='q';
  var defs=[['q','Câu hỏi ('+nq+')'],['s','Cài đặt']].concat(roster?[['a','Nhân sự tham gia']]:[]);
  defs.forEach(function(d){bar.appendChild(h('button',{class:E.tab===d[0]?'on':'',role:'tab','aria-selected':E.tab===d[0]?'true':'false',onclick:function(){E.tab=d[0];drawTabs();var e=$('etabs');if(e&&e.scrollIntoView)e.scrollIntoView({block:'nearest'})}},d[1]))});
  var m={q:$('paneQ'),s:$('paneS'),a:$('paneA')};
  Object.keys(m).forEach(function(k){if(m[k])m[k].hidden=(k!==E.tab)});
  var rn=$('rosterNote');if(rn)rn.textContent=roster?'Đã bật gán nhân sự. Mở tab "Nhân sự tham gia" để chọn người được mời.':'';
}

/* gỡ điều kiện trỏ tới câu không còn đứng trước */
function prune(){
  var pruned=0,ids=[];
  E.S.questions.forEach(function(q){
    ['showIf','endIf'].forEach(function(k){
      if(!q[k])return;var allowed=ids.slice();if(k==='endIf'&&nonSection(q))allowed.push(q.id);
      var before=q[k].rules.length;q[k].rules=q[k].rules.filter(function(r){return allowed.indexOf(r.q)>=0});
      pruned+=before-q[k].rules.length;if(!q[k].rules.length)delete q[k];
    });
    if(nonSection(q))ids.push(q.id);
  });
  return pruned;
}
function drawQs(){
  var n=prune(),c=clear($('qs'));
  if(n)c.appendChild(h('div',{class:'warn'},'Đã gỡ '+n+' điều kiện logic vì câu được tham chiếu không còn đứng trước câu đó.'));
  E.S.questions.forEach(function(q,i){c.appendChild(qCard(q,i))});
  drawTabs();
}
function qCard(q,i){
  var Q=E.S.questions,sec=q.type==='section';
  var card=h('div',{class:'qc'+(sec?' sec':'')});
  var ts=h('select',{'aria-label':'Loại câu hỏi',onchange:function(){Q[i]=retype(q,this.value);drawQs()}});
  TYPES.forEach(function(t){ts.appendChild(h('option',{value:t[0]},t[1]))});ts.value=q.type;
  card.appendChild(h('div',{class:'qh'},h('span',{class:'no'},(i+1)+'.'),ts,h('span',{class:'sp'}),
    sec?null:cb(q,'required','Bắt buộc'),
    h('button',{class:'sm',title:'Chuyển lên','aria-label':'Chuyển lên',disabled:i===0,onclick:function(){var t=Q[i];Q[i]=Q[i-1];Q[i-1]=t;drawQs()}},'↑'),
    h('button',{class:'sm',title:'Chuyển xuống','aria-label':'Chuyển xuống',disabled:i===Q.length-1,onclick:function(){var t=Q[i];Q[i]=Q[i+1];Q[i+1]=t;drawQs()}},'↓'),
    h('button',{class:'sm',title:'Nhân đôi','aria-label':'Nhân đôi câu hỏi',onclick:function(){var c2=clone(q);c2.id=newId();Q.splice(i+1,0,c2);drawQs()}},'⧉'),
    h('button',{class:'sm d',title:'Xoá','aria-label':'Xoá câu hỏi',onclick:function(){
      var used=Q.some(function(o){return ['showIf','endIf'].some(function(k){return o[k]&&o[k].rules.some(function(r){return r.q===q.id})})});
      if(used&&!confirm('Có câu khác dùng câu này làm điều kiện logic. Xoá thì các điều kiện đó cũng bị gỡ. Tiếp tục?'))return;
      if(Q.length===1){alert('Cần ít nhất một câu hỏi.');return}Q.splice(i,1);drawQs()}},'✕')));
  card.appendChild(tin(q,'text',sec?'Tiêu đề trang':'Nội dung câu hỏi',500));
  card.appendChild(h('div',{style:'height:6px'}));
  card.appendChild(tin(q,'help',sec?'Mô tả trang (tuỳ chọn)':'Gợi ý dưới câu hỏi (tuỳ chọn)',500));
  var body=typeBody(q);if(body)card.appendChild(body);
  card.appendChild(logicBlock(q,i,'showIf','Logic: chỉ hiện '+(sec?'trang':'câu')+' này khi…'));
  if(!sec)card.appendChild(logicBlock(q,i,'endIf','Logic: kết thúc khảo sát ngay sau câu này khi…'));
  return card;
}
function typeBody(q){
  var d=h('div',{style:'margin-top:8px'});
  switch(q.type){
  case 'single':
    d.appendChild(fld('Các lựa chọn (mỗi dòng một lựa chọn)',larea(q,'options')));
    d.appendChild(h('div',{class:'row'},cb(q,'allowOther','Thêm lựa chọn "Khác" (có ô ghi chữ)'),cb(q,'randomize','Xáo trộn thứ tự lựa chọn'),sel(q,'display',[['radio','Hiện dạng nút chọn'],['dropdown','Hiện dạng danh sách thả xuống']])));break;
  case 'multi':
    d.appendChild(fld('Các lựa chọn (mỗi dòng một lựa chọn)',larea(q,'options')));
    d.appendChild(h('div',{class:'row'},cb(q,'allowOther','Thêm lựa chọn "Khác"'),cb(q,'randomize','Xáo trộn thứ tự lựa chọn')));
    d.appendChild(h('div',{class:'grid2'},fld('Chọn ít nhất (0 = không yêu cầu)',nin(q,'min','0',{min:0})),fld('Chọn nhiều nhất (0 = không giới hạn)',nin(q,'max','0',{min:0}))));break;
  case 'yesno':d.appendChild(h('p',{class:'note'},'Người trả lời chọn "Có" hoặc "Không".'));break;
  case 'rating':
    d.appendChild(h('div',{class:'grid2'},fld('Số mức (3–10)',nin(q,'max','5',{min:3,max:10})),h('div')));
    d.appendChild(h('div',{class:'grid2'},fld('Nhãn mức thấp nhất',tin(q,'low','',60)),fld('Nhãn mức cao nhất',tin(q,'high','',60))));break;
  case 'nps':
    d.appendChild(h('p',{class:'note'},'Thang 0–10. Báo cáo tự tính NPS = % người ủng hộ (9–10) − % người chê (0–6).'));
    d.appendChild(h('div',{class:'grid2'},fld('Nhãn đầu thang (0)',tin(q,'low','',60)),fld('Nhãn cuối thang (10)',tin(q,'high','',60))));break;
  case 'matrix':
    d.appendChild(h('div',{class:'grid2'},fld('Các dòng (mỗi dòng một mục cần đánh giá)',larea(q,'rows')),fld('Các cột (mức lựa chọn)',larea(q,'cols'))));
    d.appendChild(h('p',{class:'note'},'Mỗi dòng người trả lời chọn đúng một cột. Câu "Bắt buộc" yêu cầu chọn đủ mọi dòng.'));break;
  case 'ranking':
    d.appendChild(fld('Các mục cần sắp xếp (mỗi dòng một mục)',larea(q,'options')));
    d.appendChild(cb(q,'randomize','Xáo trộn thứ tự ban đầu'));break;
  case 'text':
    d.appendChild(h('div',{class:'grid2'},
      fld('Kiểu ô nhập',sel(q,'multiline',[['false','Một dòng (ngắn)'],['true','Nhiều dòng (dài)']].map(function(x){return x}),null)),
      fld('Kiểm tra định dạng',sel(q,'validate',[['','Không kiểm tra'],['email','Email'],['phone','Số điện thoại']]))));
    d.appendChild(h('div',{class:'grid2'},fld('Số ký tự tối đa (10–2000)',nin(q,'maxLen','200',{min:10,max:2000})),fld('Chữ gợi ý trong ô',tin(q,'placeholder','',100))));
    var ms=d.querySelector('select');ms.value=q.multiline?'true':'false';
    ms.onchange=function(){q.multiline=this.value==='true';if(q.multiline&&q.maxLen<=200)q.maxLen=1000;if(!q.multiline&&q.maxLen>200)q.maxLen=200;drawQs()};
    break;
  case 'number':
    d.appendChild(h('div',{class:'grid2'},fld('Giá trị nhỏ nhất (tuỳ chọn)',nin(q,'min','')),fld('Giá trị lớn nhất (tuỳ chọn)',nin(q,'max',''))));
    d.appendChild(h('div',{class:'row'},cb(q,'integer','Chỉ cho nhập số nguyên'),fld('Đơn vị hiện cạnh ô (vd: tuổi, triệu đồng)',tin(q,'unit','',20))));break;
  case 'date':
    d.appendChild(h('div',{class:'grid2'},
      fld('Ngày sớm nhất (tuỳ chọn)',h('input',{type:'date',value:q.min||'',onchange:function(){q.min=this.value}})),
      fld('Ngày muộn nhất (tuỳ chọn)',h('input',{type:'date',value:q.max||'',onchange:function(){q.max=this.value}}))));break;
  default:return null;
  }
  return d;
}

/* ---------- logic ẩn/hiện ---------- */
var OPNAME={eq:'bằng',neq:'khác',has:'có chọn',nothas:'không chọn',gt:'lớn hơn',gte:'từ … trở lên',lt:'nhỏ hơn',lte:'từ … trở xuống',empty:'chưa trả lời',notempty:'đã trả lời'};
function opsFor(t){
  if(t==='single'||t==='yesno')return ['eq','neq','empty','notempty'];
  if(t==='multi')return ['has','nothas','empty','notempty'];
  if(t==='rating'||t==='nps'||t==='number')return ['eq','neq','gt','gte','lt','lte','empty','notempty'];
  return ['notempty','empty'];
}
function needsVal(op){return op!=='empty'&&op!=='notempty'}
function defVal(tq){return tq.type==='rating'?1:0}
function valueControl(r,tq){
  var s;
  function mk(opts){s=h('select',{'aria-label':'Giá trị',onchange:function(){r.v=Number(this.value)}});opts.forEach(function(p){s.appendChild(h('option',{value:p[0]},p[1]))});s.value=String(r.v);if(s.value!==String(r.v)){s.value=opts[0][0];r.v=Number(opts[0][0])}return s}
  if(tq.type==='single'||tq.type==='multi'){var o=(tq.options||[]).map(function(x,k){return [k,x||'(trống)']});if(tq.allowOther)o.push([(tq.options||[]).length,'Khác']);return mk(o)}
  if(tq.type==='yesno')return mk([[0,'Có'],[1,'Không']]);
  if(tq.type==='rating'){var a=[];for(var k=1;k<=(tq.max||5);k++)a.push([k,k]);return mk(a)}
  if(tq.type==='nps'){var b=[];for(var j=0;j<=10;j++)b.push([j,j]);return mk(b)}
  return h('input',{type:'number','aria-label':'Giá trị',value:r.v,onchange:function(){r.v=Number(this.value)}});
}
function logicBlock(q,i,key,title){
  var cond=q[key],n=cond&&cond.rules?cond.rules.length:0;
  var prior=E.S.questions.slice(0,i).filter(nonSection);
  if(key==='endIf'&&nonSection(q))prior.push(q);
  var det=h('details',{class:'lg',open:n>0},h('summary',null,title+(n?'  ('+n+' điều kiện)':'')));
  if(!prior.length){det.appendChild(h('p',{class:'note'},'Chưa có câu hỏi nào phía trước để làm điều kiện.'));return det}
  function addRule(){
    var tq=prior[0],r={q:tq.id,op:opsFor(tq.type)[0]};if(needsVal(r.op))r.v=defVal(tq);
    if(!q[key])q[key]={mode:'all',rules:[]};q[key].rules.push(r);drawQs();
  }
  if(n){
    det.appendChild(h('div',{class:'row',style:'align-items:center'},
      sel(q[key],'mode',[['all','Thoả TẤT CẢ điều kiện'],['any','Thoả BẤT KỲ điều kiện nào']])));
    q[key].rules.forEach(function(r,ri){
      var tq=qById(r.q)||prior[0];
      var qs=h('select',{'aria-label':'Câu hỏi làm điều kiện',onchange:function(){var t=qById(this.value);r.q=t.id;r.op=opsFor(t.type)[0];if(needsVal(r.op))r.v=defVal(t);else delete r.v;drawQs()}});
      prior.forEach(function(p){qs.appendChild(h('option',{value:p.id},'Câu '+(E.S.questions.indexOf(p)+1)+': '+trunc(p.text||'(chưa có nội dung)',40)))});qs.value=tq.id;
      var os=h('select',{'aria-label':'Phép so sánh',onchange:function(){r.op=this.value;if(needsVal(r.op)){if(r.v===undefined)r.v=defVal(tq)}else delete r.v;drawQs()}});
      opsFor(tq.type).forEach(function(o){os.appendChild(h('option',{value:o},OPNAME[o]))});os.value=r.op;
      if(opsFor(tq.type).indexOf(r.op)<0){r.op=opsFor(tq.type)[0];os.value=r.op}
      det.appendChild(h('div',{class:'rule'},qs,os,needsVal(r.op)?valueControl(r,tq):null,
        h('button',{class:'sm d','aria-label':'Gỡ điều kiện',onclick:function(){q[key].rules.splice(ri,1);if(!q[key].rules.length)delete q[key];drawQs()}},'✕')));
    });
  }
  det.appendChild(h('button',{class:'sm',onclick:addRule},'＋ Thêm điều kiện'));
  return det;
}

/* ---------- lưu ---------- */
function payload(){
  var S=clone(E.S);if(S.identity!=='roster')S.audience=null;
  S.questions.forEach(function(q){
    ['options','rows','cols'].forEach(function(k){if(q[k])q[k]=q[k].map(function(x){return String(x).trim()}).filter(Boolean)});
    if(q.type==='text')q.multiline=!!q.multiline;
  });
  return S;
}
function isDirty(){return !!E&&!$('editor').hidden&&E.base!==JSON.stringify(payload())}
function updateDirty(){var d=$('dirty');if(d)d.hidden=!isDirty()}
['input','change','click'].forEach(function(ev){$('editor').addEventListener(ev,function(){setTimeout(updateDirty,0)})});
window.addEventListener('beforeunload',function(e){if(isDirty()){e.preventDefault();e.returnValue=''}});
function say(cls,txt){var m=$('savemsg');if(!m)return;m.className=cls;m.textContent=txt}
function save(){
  say('note','Đang lưu…');
  var S=payload();S.create=E.isNew;
  api('save',null,S).then(function(j){
    E.isNew=false;E.saved=true;E.base=JSON.stringify(payload());E.S.code=S.code;
    say('ok','Đã lưu. Link: '+origin()+j.link);updateDirty();
    var inp=document.querySelector('#editor .grid2 input');if(inp)inp.disabled=true;
    var pv=$('pvSaved');if(pv)pv.hidden=false;
    var h2=$('editor').querySelector('h2');if(h2&&h2.firstChild)h2.firstChild.textContent='Sửa khảo sát';
    refresh();
  }).catch(function(e){say('bad','Chưa lưu được: '+e.message);var m=$('savemsg');if(m&&m.scrollIntoView)m.scrollIntoView({block:'nearest'})});
}
/* Xem thử đúng bản ĐANG SOẠN (kể cả phần chưa lưu): máy chủ làm sạch + kiểm tra như khi lưu rồi trả về bản sẽ được lưu */
function previewDraft(){
  say('note','Đang chuẩn bị bản xem thử…');
  api('preview',null,payload()).then(function(j){
    var key='ksprev:'+Date.now();
    try{
      localStorage.setItem(key,JSON.stringify({S:j.survey}));
      Object.keys(localStorage).forEach(function(k){if(k.indexOf('ksprev:')===0&&Date.now()-Number(k.slice(7))>3600000)localStorage.removeItem(k)});
    }catch(e){if(!localStorage.getItem(key)){say('bad','Trình duyệt đang chặn lưu trữ nên không mở được bản xem thử.');return}}
    say('note',isDirty()?'Đang xem bản chưa lưu. Bấm "Lưu khảo sát" để áp dụng.':'');
    window.open('/kiemtra/ks='+encodeURIComponent(j.survey.code)+'?preview=draft&k='+encodeURIComponent(key),'_blank','noopener');
  }).catch(function(e){say('bad','Chưa xem thử được: '+e.message);var m=$('savemsg');if(m&&m.scrollIntoView)m.scrollIntoView({block:'nearest'})});
}

/* ---------- kết quả ---------- */
var R=null;
function showResults(code){
  $('editor').hidden=true;var box=clear($('results'));$('results').hidden=false;box.appendChild(h('p',{class:'note'},'Đang tải kết quả…'));
  Promise.all([api('get','code='+encodeURIComponent(code)),api('results','code='+encodeURIComponent(code))]).then(function(r){
    R={S:r[0].survey,rows:r[1].rows,staff:r[1].staff||null,tab:'sum',open:{},filter:'',pf:''};drawResults();$('results').scrollIntoView({behavior:'smooth'});
  }).catch(function(e){clear(box).appendChild(h('p',{class:'bad'},e.message))});
}
function ansText(q,a,other){
  if(a===null||a===undefined)return '';
  switch(q.type){
  case 'single':return a===q.options.length?'Khác: '+(other||''):q.options[a];
  case 'multi':return a.map(function(k){return k===q.options.length?'Khác: '+(other||''):q.options[k]}).join('; ');
  case 'yesno':return a===0?'Có':'Không';
  case 'matrix':return q.rows.map(function(r,i){return r+': '+(a[i]===null||a[i]===undefined?'—':q.cols[a[i]])}).join('; ');
  case 'ranking':return a.map(function(k,i){return (i+1)+'. '+q.options[k]}).join(' > ');
  }
  return String(a);
}
function vals(id){return R.rows.map(function(r){return r.answers?r.answers[id]:undefined}).filter(function(v){return v!==undefined&&v!==null})}
function bar(label,n,base,extra){
  return h('div',{class:'bar'},h('span',{class:'l'},label),h('div',{class:'t'},h('i',{style:'width:'+pct(n,base)+'%'})),h('span',{class:'v'},n+' ('+pct(n,base)+'%)'+(extra||'')));
}
function drawResults(){
  var S=R.S,rows=R.rows,box=clear($('results'));
  var withMs=rows.filter(function(r){return r.ms>0});
  var avg=withMs.length?withMs.reduce(function(a,r){return a+r.ms},0)/withMs.length:0;
  box.appendChild(h('div',{class:'row'},h('h2',{class:'nf',style:'flex:1 1 auto;margin:0'},'Kết quả: '+S.title),
    h('button',{class:'nf',onclick:function(){showResults(S.code)}},'Làm mới'),
    h('button',{class:'nf',onclick:exportCsv},'Tải CSV'),
    h('button',{class:'nf',onclick:function(){$('results').hidden=true}},'Đóng')));
  box.appendChild(h('div',{class:'kpis'},
    kpi(rows.length+(S.maxResponses?' / '+S.maxResponses:''),'Số phiếu'),
    R.staff?kpi(R.staff.filter(function(x){return x.done}).length+'/'+R.staff.length+' ('+pct(R.staff.filter(function(x){return x.done}).length,R.staff.length)+'%)','Đã trả lời / được gán'):null,
    kpi(fmtDur(avg),'Thời gian làm trung bình'),
    kpi(rows.length?fmtTime(rows[rows.length-1].submittedAt):'—','Phiếu gần nhất')));
  var tabs=h('div',{class:'tabs'});
  [['sum','Tổng hợp theo câu hỏi'],['rows','Từng phiếu ('+rows.length+')']].concat(R.staff?[['prog','Tiến độ theo nhân sự ('+R.staff.filter(function(x){return !x.done}).length+' chưa trả lời)']]:[]).forEach(function(t){
    tabs.appendChild(h('button',{class:R.tab===t[0]?'on':'',onclick:function(){R.tab=t[0];drawResults()}},t[1]))});
  box.appendChild(tabs);
  if(R.tab==='prog'&&R.staff){box.appendChild(progress());return}
  if(!rows.length){box.appendChild(h('p',{class:'note'},'Chưa có ai trả lời.'));return}
  box.appendChild(R.tab==='sum'?summary():responses());
}
function kpi(v,l){return h('div',{class:'kpi'},h('b',null,v),h('span',null,l))}

function summary(){
  var S=R.S,wrap=h('div'),total=R.rows.length;
  S.questions.forEach(function(q,i){
    if(q.type==='section'){wrap.appendChild(h('h3',null,q.text));return}
    var v=vals(q.id),blk=h('div',{class:'rq'});
    blk.appendChild(h('h4',null,(i+1)+'. '+q.text));
    blk.appendChild(h('div',{class:'note'},v.length+'/'+total+' người trả lời · '+TNAME[q.type]));
    if(!v.length){blk.appendChild(h('p',{class:'note'},'Chưa có câu trả lời.'));wrap.appendChild(blk);return}
    var k;
    if(q.type==='single'||q.type==='multi'){
      var n=q.options.length,cnt=[];for(k=0;k<=n;k++)cnt.push(0);
      v.forEach(function(a){(Array.isArray(a)?a:[a]).forEach(function(x){if(cnt[x]!==undefined)cnt[x]++})});
      q.options.forEach(function(o,j){blk.appendChild(bar(o,cnt[j],v.length))});
      if(q.allowOther||cnt[n]){blk.appendChild(bar('Khác',cnt[n],v.length));
        var ot=R.rows.map(function(r){return r.others&&r.others[q.id]}).filter(Boolean);
        if(ot.length)blk.appendChild(h('details',null,h('summary',{class:'note'},'Xem '+ot.length+' câu trả lời "Khác"'),h('div',{class:'txts'},ot.map(function(t){return h('p',null,t)}))))}
    }else if(q.type==='yesno'){
      blk.appendChild(bar('Có',v.filter(function(a){return a===0}).length,v.length));blk.appendChild(bar('Không',v.filter(function(a){return a===1}).length,v.length));
    }else if(q.type==='rating'){
      var sum=v.reduce(function(a,b){return a+b},0);
      blk.appendChild(h('div',null,'Điểm trung bình: ',h('strong',null,(sum/v.length).toFixed(2)+' / '+q.max)));
      for(k=q.max;k>=1;k--)(function(kk){blk.appendChild(bar(kk+' điểm',v.filter(function(a){return a===kk}).length,v.length))})(k);
    }else if(q.type==='nps'){
      var pro=v.filter(function(a){return a>=9}).length,pas=v.filter(function(a){return a===7||a===8}).length,det=v.length-pro-pas;
      var score=Math.round(pro*100/v.length-det*100/v.length);
      blk.appendChild(h('div',null,'Điểm NPS: ',h('strong',{style:'font-size:1.3rem'},(score>0?'+':'')+score),h('span',{class:'note'},'  (từ −100 đến +100)')));
      blk.appendChild(h('div',{class:'stack',role:'img','aria-label':'Ủng hộ '+pct(pro,v.length)+'%, trung lập '+pct(pas,v.length)+'%, chê '+pct(det,v.length)+'%'},
        h('i',{class:'pro',style:'width:'+pct(pro,v.length)+'%'}),h('i',{class:'pas',style:'width:'+pct(pas,v.length)+'%'}),h('i',{class:'det',style:'width:'+pct(det,v.length)+'%'})));
      blk.appendChild(h('div',{class:'note'},'Ủng hộ (9–10): '+pro+' ('+pct(pro,v.length)+'%) · Trung lập (7–8): '+pas+' ('+pct(pas,v.length)+'%) · Chê (0–6): '+det+' ('+pct(det,v.length)+'%)'));
      for(k=10;k>=0;k--)(function(kk){blk.appendChild(bar(String(kk),v.filter(function(a){return a===kk}).length,v.length))})(k);
    }else if(q.type==='matrix'){
      var tb=h('tbody');
      q.rows.forEach(function(r,ri){
        var ans=v.map(function(a){return a[ri]}).filter(function(x){return x!==null&&x!==undefined});
        var tr=h('tr',null,h('td',null,r));
        q.cols.forEach(function(c,ci){var c1=ans.filter(function(x){return x===ci}).length;tr.appendChild(h('td',{class:'c'},c1+' ('+pct(c1,ans.length)+'%)'))});
        tr.appendChild(h('td',{class:'c'},ans.length));tb.appendChild(tr)});
      blk.appendChild(h('div',{class:'scroll'},h('table',null,h('thead',null,h('tr',null,h('th'),q.cols.map(function(c){return h('th',{class:'c'},c)}),h('th',{class:'c'},'Số trả lời'))),tb)));
    }else if(q.type==='ranking'){
      var avgs=q.options.map(function(o,ki){var s=0;v.forEach(function(a){s+=a.indexOf(ki)+1});return {o:o,avg:s/v.length}}).sort(function(a,b){return a.avg-b.avg});
      blk.appendChild(h('div',{class:'note'},'Vị trí trung bình (1 = ưu tiên nhất), càng nhỏ càng được ưu tiên:'));
      avgs.forEach(function(x,idx){blk.appendChild(h('div',{class:'bar'},h('span',{class:'l'},(idx+1)+'. '+x.o),
        h('div',{class:'t'},h('i',{style:'width:'+Math.round((q.options.length-x.avg+1)*100/q.options.length)+'%'})),h('span',{class:'v'},x.avg.toFixed(2))))});
    }else if(q.type==='number'){
      var s2=v.slice().sort(function(a,b){return a-b}),sm=s2.reduce(function(a,b){return a+b},0),med=s2.length%2?s2[(s2.length-1)/2]:(s2[s2.length/2-1]+s2[s2.length/2])/2;
      blk.appendChild(h('div',{class:'kpis'},kpi(String(s2[0]),'Nhỏ nhất'),kpi(String(s2[s2.length-1]),'Lớn nhất'),kpi((sm/s2.length).toFixed(2).replace(/\.00$/,''),'Trung bình'),kpi(String(med),'Trung vị')));
      if(q.unit)blk.appendChild(h('div',{class:'note'},'Đơn vị: '+q.unit));
    }else if(q.type==='date'){
      var dc={};v.forEach(function(d){dc[d]=(dc[d]||0)+1});
      Object.keys(dc).sort().slice(-30).forEach(function(d){blk.appendChild(bar(d,dc[d],v.length))});
    }else if(q.type==='text'){
      var inp=h('input',{type:'text',placeholder:'Lọc câu trả lời…','aria-label':'Lọc câu trả lời',style:'margin-top:6px'});
      var list=h('div',{class:'txts'});
      function fill(){clear(list);var f=inp.value.trim().toLowerCase(),shown=0;
        v.forEach(function(t){if(shown<200&&(!f||String(t).toLowerCase().indexOf(f)>=0)){list.appendChild(h('p',null,t));shown++}});
        if(!shown)list.appendChild(h('p',{class:'note'},'Không có câu trả lời khớp.'))}
      inp.addEventListener('input',fill);fill();blk.appendChild(inp);blk.appendChild(list);
    }
    wrap.appendChild(blk);
  });
  return wrap;
}


function groupBars(title,keyFn,labelEmpty){
  var g={},order=[];R.staff.forEach(function(x){var k=keyFn(x)||labelEmpty;if(!g[k]){g[k]={n:0,d:0};order.push(k)}g[k].n++;if(x.done)g[k].d++});
  order.sort(function(a,b){return pct(g[a].d,g[a].n)-pct(g[b].d,g[b].n)||g[b].n-g[a].n});
  var wrap=h('div',null,h('h3',{style:'margin:14px 0 4px'},title));
  order.forEach(function(k){wrap.appendChild(h('div',{class:'bar'},h('span',{class:'l'},k),h('div',{class:'t'},h('i',{style:'width:'+pct(g[k].d,g[k].n)+'%'})),h('span',{class:'v'},g[k].d+'/'+g[k].n+' ('+pct(g[k].d,g[k].n)+'%)')))});
  return wrap;
}
function progress(){
  var wrap=h('div');
  wrap.appendChild(groupBars('Tỷ lệ trả lời theo quản lí (thấp nhất lên đầu)',function(x){return x.manager},'(chưa có quản lí)'));
  wrap.appendChild(groupBars('Tỷ lệ trả lời theo chức danh',function(x){return x.title},'(chưa có chức danh)'));
  var pend=R.staff.filter(function(x){return !x.done});
  wrap.appendChild(h('h3',{style:'margin:16px 0 4px'},'Chưa trả lời ('+pend.length+')'));
  if(!pend.length){wrap.appendChild(h('p',{class:'ok'},'Tất cả nhân sự được gán đã trả lời.'));return wrap}
  var fi=h('input',{type:'text',placeholder:'Lọc theo mã, họ tên, quản lí…','aria-label':'Lọc người chưa trả lời',value:R.pf,oninput:function(){R.pf=this.value;fill()}});
  var tb=h('tbody');
  function match(x){var f=fold(R.pf.trim());return !f||fold(x.code+' '+x.name+' '+x.manager+' '+x.title).indexOf(f)>=0}
  function fill(){clear(tb);var list=pend.filter(match);
    list.slice(0,300).forEach(function(x){tb.appendChild(h('tr',null,h('td',null,x.code),h('td',null,x.name),h('td',null,x.manager),h('td',null,x.title),h('td',null,x.phone)))});
    if(!list.length)tb.appendChild(h('tr',null,h('td',{colspan:5,class:'note'},'Không có ai khớp.')));
    if(list.length>300)tb.appendChild(h('tr',null,h('td',{colspan:5,class:'note'},'Hiện 300/'+list.length+'. Hãy lọc hoặc tải CSV để xem đủ.')))}
  wrap.appendChild(h('div',{class:'row'},fi,h('button',{class:'nf',onclick:function(){exportPending(pend.filter(match))}},'Tải danh sách chưa trả lời (CSV)')));
  wrap.appendChild(h('div',{class:'scroll',style:'margin-top:8px'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Mã NV'),h('th',null,'Họ tên'),h('th',null,'Quản lí'),h('th',null,'Chức danh'),h('th',null,'SĐT / Zalo'))),tb)));
  fill();return wrap;
}
function csvCell(v){v=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
function download(name,lines){
  var blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);
}
function exportPending(list){
  var out=[['Mã NV','Họ tên','Quản lí','Chức danh','SĐT / Zalo'].map(csvCell).join(',')];
  list.forEach(function(x){out.push([x.code,x.name,x.manager,x.title,x.phone].map(csvCell).join(','))});
  download('chua-tra-loi-'+R.S.code+'.csv',out);
}

function responses(){
  var S=R.S,wrap=h('div');
  var inp=h('input',{type:'text',placeholder:'Tìm theo họ tên hoặc mã nhân viên…','aria-label':'Tìm phiếu',value:R.filter,oninput:function(){R.filter=this.value;fillRows()}});
  var tb=h('tbody'),ident=S.identity&&S.identity!=='none',ro=S.identity==='roster',nc=(ident?5:3)+(ro?2:0);
  function fillRows(){
    clear(tb);var f=fold(R.filter.trim());
    R.rows.slice().reverse().forEach(function(r){
      if(f&&(fold(r.name).indexOf(f)<0&&fold(r.empId).indexOf(f)<0&&fold(r.nc).indexOf(f)<0))return;
      var open=!!R.open[r.id];
      tb.appendChild(h('tr',null,h('td',null,fmtTime(r.submittedAt)),ident?h('td',null,r.nc||r.empId||''):null,ident?h('td',null,r.name||''):null,ro?h('td',null,(r.meta&&r.meta.manager)||''):null,ro?h('td',null,(r.meta&&r.meta.title)||''):null,h('td',null,fmtDur(r.ms)),
        h('td',null,h('button',{class:'sm',onclick:function(){R.open[r.id]=!open;fillRows()}},open?'Ẩn':'Xem'),' ',
          h('button',{class:'sm d',onclick:function(){if(confirm('Xoá phiếu này? Không thể khôi phục.'))api('delresp',null,{code:S.code,id:r.id}).then(function(){R.rows=R.rows.filter(function(x){return x.id!==r.id});drawResults()}).catch(function(e){alert(e.message)})}},'Xoá'))));
      if(open){
        var d=h('div');
        S.questions.forEach(function(q,i){if(q.type==='section')return;var a=r.answers&&r.answers[q.id];
          d.appendChild(h('p',{style:'margin:4px 0'},h('strong',null,(i+1)+'. '+q.text+': '),a===undefined||a===null?h('span',{class:'note'},'(bỏ trống / không hiển thị)'):ansText(q,a,r.others&&r.others[q.id])))});
        tb.appendChild(h('tr',null,h('td',{colspan:nc,style:'background:var(--soft)'},d)));
      }
    });
    if(!tb.firstChild)tb.appendChild(h('tr',null,h('td',{colspan:nc,class:'note'},'Không có phiếu nào khớp.')));
  }
  wrap.appendChild(inp);
  wrap.appendChild(h('div',{class:'scroll',style:'margin-top:8px'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Thời gian'),ident?h('th',null,'Mã NV'):null,ident?h('th',null,'Họ tên'):null,ro?h('th',null,'Quản lí'):null,ro?h('th',null,'Chức danh'):null,h('th',null,'Thời gian làm'),h('th'))),tb)));
  fillRows();return wrap;
}

/* ---------- CSV ---------- */
function exportCsv(){
  var S=R.S;
  function cell(v){v=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
  var ro=S.identity==='roster',head=['Thời gian','Mã NV','Họ tên','Thời gian làm (giây)'].concat(ro?['Quản lí','Chức danh','Nhóm ngành','Miền','Tỉnh/thành']:[]),cols=[];
  S.questions.forEach(function(q,i){
    if(q.type==='section')return;
    if(q.type==='matrix')q.rows.forEach(function(r,ri){head.push('C'+(i+1)+'. '+q.text+' — '+r);cols.push({q:q,ri:ri})});
    else{head.push('C'+(i+1)+'. '+q.text);cols.push({q:q})}
  });
  var out=[head.map(cell).join(',')];
  R.rows.forEach(function(r){
    var mt=r.meta||{},line=[new Date(r.submittedAt).toLocaleString('vi-VN'),r.nc||r.empId||'',r.name||'',r.ms?Math.round(r.ms/1000):''].concat(ro?[mt.manager||'',mt.title||'',SEG[mt.segment]||'',RG[mt.region]||'',mt.province||'']:[]);
    cols.forEach(function(c){
      var a=r.answers&&r.answers[c.q.id];
      if(a===undefined||a===null){line.push('');return}
      if(c.ri!==undefined)line.push(a[c.ri]===null||a[c.ri]===undefined?'':c.q.cols[a[c.ri]]);
      else line.push(ansText(c.q,a,r.others&&r.others[c.q.id]));
    });
    out.push(line.map(cell).join(','));
  });
  var blob=new Blob(['\ufeff'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='khao-sat-'+S.code+'.csv';a.click();URL.revokeObjectURL(u);
}

enter();
})();
