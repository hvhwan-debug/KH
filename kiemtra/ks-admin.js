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
  openEditor({code:'',title:t.title,description:t.description||'',thanks:'',identity:t.identity,open:true,openAt:0,closeAt:0,maxResponses:0,showProgress:true,questions:clone(t.questions)},true,0);
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
  E={S:clone(sv),isNew:isNew,count:count||0,saved:!isNew};
  if(!E.S.identity)E.S.identity=E.S.askIdentity?'emp':'none';
  if(E.S.showProgress===undefined)E.S.showProgress=true;
  $('results').hidden=true;$('editor').hidden=false;drawEditor();
  $('editor').scrollIntoView({behavior:'smooth'});
}
function drawEditor(){
  var S=E.S,box=clear($('editor'));
  box.appendChild(h('h2',null,E.isNew?'Tạo khảo sát':'Sửa khảo sát'));
  if(!E.isNew&&E.count>0)box.appendChild(h('div',{class:'warn'},'Khảo sát này đã có '+E.count+' phiếu. Đổi thứ tự, loại câu hỏi hoặc số lượng đáp án có thể làm kết quả cũ hiển thị lệch. Chỉ sửa chữ, thêm câu mới hoặc đổi cài đặt thì an toàn.'));
  var code=h('input',{type:'text',value:S.code,disabled:!E.isNew,maxlength:40,placeholder:'vd: hai-long-q4',oninput:function(){S.code=this.value.trim().toLowerCase()}});
  box.appendChild(h('div',{class:'grid2'},
    fld('Mã khảo sát (chữ thường, số, gạch ngang; dùng trong link)',code),
    fld('Tên khảo sát',tin(S,'title','Tên người trả lời sẽ thấy',200))));
  box.appendChild(fld('Mô tả ngắn (tuỳ chọn)',tarea(S,'description','Giới thiệu mục đích, thời gian làm',3)));
  box.appendChild(fld('Lời cảm ơn sau khi gửi (tuỳ chọn)',tin(S,'thanks','Cảm ơn bạn đã hoàn thành khảo sát.',500)));
  var ident=sel(S,'identity',[['none','Ẩn danh, không hỏi tên'],['name','Hỏi họ tên'],['emp','Hỏi mã nhân viên + họ tên (mỗi mã chỉ gửi 1 lần)']]);
  box.appendChild(fld('Thông tin người trả lời',ident));
  var oa=h('input',{type:'datetime-local',value:toLocal(S.openAt),onchange:function(){S.openAt=this.value?Date.parse(this.value):0}});
  var ca=h('input',{type:'datetime-local',value:toLocal(S.closeAt),onchange:function(){S.closeAt=this.value?Date.parse(this.value):0}});
  var mr=h('input',{type:'number',min:0,value:S.maxResponses||'',placeholder:'0 = không giới hạn',onchange:function(){S.maxResponses=Math.max(0,Math.floor(Number(this.value)||0))}});
  box.appendChild(h('div',{class:'row'},fld('Mở lúc (trống = mở ngay)',oa),fld('Đóng lúc (trống = không tự đóng)',ca),fld('Số phiếu tối đa',mr)));
  box.appendChild(h('div',{class:'row'},cb(S,'open','Đang mở nhận trả lời'),cb(S,'showProgress','Hiện thanh tiến độ khi có nhiều trang')));

  box.appendChild(h('h3',null,'Câu hỏi'));
  box.appendChild(h('p',{class:'note'},'Mỗi "Tiêu đề trang" bắt đầu một trang mới. Mở mục "Logic" của từng câu để đặt điều kiện hiện câu hoặc kết thúc khảo sát sớm.'));
  box.appendChild(h('div',{id:'qs'}));
  var addSel=h('select',{id:'addType',style:'width:auto'});TYPES.forEach(function(t){addSel.appendChild(h('option',{value:t[0]},t[1]))});
  box.appendChild(h('div',{class:'row',style:'margin-top:10px;justify-content:flex-start'},addSel,
    h('button',{class:'nf',onclick:function(){var t=addSel.value;E.S.questions.push(Object.assign({id:newId(),type:t,text:'',help:'',required:false},defaults(t)));drawQs();var c=$('qs').lastChild;if(c)c.scrollIntoView({behavior:'smooth',block:'center'})}},'＋ Thêm')));
  var msg=h('span',{id:'savemsg',role:'status'});
  box.appendChild(h('div',{class:'row',style:'margin-top:18px;justify-content:flex-start;align-items:center'},
    h('button',{class:'p nf',onclick:save},'Lưu khảo sát'),
    h('button',{class:'nf',onclick:function(){if(!E.saved){alert('Hãy lưu khảo sát trước khi xem thử.');return}openLink(E.S.code,true)}},'Xem thử'),
    h('button',{class:'nf',onclick:function(){$('editor').hidden=true}},'Đóng'),msg));
  drawQs();
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
  var S=clone(E.S);
  S.questions.forEach(function(q){
    ['options','rows','cols'].forEach(function(k){if(q[k])q[k]=q[k].map(function(x){return String(x).trim()}).filter(Boolean)});
    if(q.type==='text')q.multiline=!!q.multiline;
  });
  return S;
}
function save(){
  var m=$('savemsg');m.className='note';m.textContent='Đang lưu…';
  var S=payload();
  api('save',null,S).then(function(j){
    E.isNew=false;E.saved=true;var cd=document.querySelector('#editor input[type=text]');
    m.className='ok';m.textContent='Đã lưu. Link: '+origin()+j.link;
    var inp=document.querySelector('#editor .grid2 input');if(inp)inp.disabled=true;
    $('editor').querySelector('h2').textContent='Sửa khảo sát';
    refresh();
  }).catch(function(e){m.className='bad';m.textContent=e.message});
}

/* ---------- kết quả ---------- */
var R=null;
function showResults(code){
  $('editor').hidden=true;var box=clear($('results'));$('results').hidden=false;box.appendChild(h('p',{class:'note'},'Đang tải kết quả…'));
  Promise.all([api('get','code='+encodeURIComponent(code)),api('results','code='+encodeURIComponent(code))]).then(function(r){
    R={S:r[0].survey,rows:r[1].rows,tab:'sum',open:{},filter:''};drawResults();$('results').scrollIntoView({behavior:'smooth'});
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
    kpi(fmtDur(avg),'Thời gian làm trung bình'),
    kpi(rows.length?fmtTime(rows[rows.length-1].submittedAt):'—','Phiếu gần nhất')));
  var tabs=h('div',{class:'tabs'});
  [['sum','Tổng hợp theo câu hỏi'],['rows','Từng phiếu ('+rows.length+')']].forEach(function(t){
    tabs.appendChild(h('button',{class:R.tab===t[0]?'on':'',onclick:function(){R.tab=t[0];drawResults()}},t[1]))});
  box.appendChild(tabs);
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

function responses(){
  var S=R.S,wrap=h('div');
  var inp=h('input',{type:'text',placeholder:'Tìm theo họ tên hoặc mã nhân viên…','aria-label':'Tìm phiếu',value:R.filter,oninput:function(){R.filter=this.value;fillRows()}});
  var tb=h('tbody'),ident=S.identity&&S.identity!=='none';
  function fillRows(){
    clear(tb);var f=R.filter.trim().toLowerCase();
    R.rows.slice().reverse().forEach(function(r){
      if(f&&(String(r.name||'').toLowerCase().indexOf(f)<0&&String(r.empId||'').toLowerCase().indexOf(f)<0))return;
      var open=!!R.open[r.id];
      tb.appendChild(h('tr',null,h('td',null,fmtTime(r.submittedAt)),ident?h('td',null,r.empId||''):null,ident?h('td',null,r.name||''):null,h('td',null,fmtDur(r.ms)),
        h('td',null,h('button',{class:'sm',onclick:function(){R.open[r.id]=!open;fillRows()}},open?'Ẩn':'Xem'),' ',
          h('button',{class:'sm d',onclick:function(){if(confirm('Xoá phiếu này? Không thể khôi phục.'))api('delresp',null,{code:S.code,id:r.id}).then(function(){R.rows=R.rows.filter(function(x){return x.id!==r.id});drawResults()}).catch(function(e){alert(e.message)})}},'Xoá'))));
      if(open){
        var d=h('div');
        S.questions.forEach(function(q,i){if(q.type==='section')return;var a=r.answers&&r.answers[q.id];
          d.appendChild(h('p',{style:'margin:4px 0'},h('strong',null,(i+1)+'. '+q.text+': '),a===undefined||a===null?h('span',{class:'note'},'(bỏ trống / không hiển thị)'):ansText(q,a,r.others&&r.others[q.id])))});
        tb.appendChild(h('tr',null,h('td',{colspan:ident?5:3,style:'background:var(--soft)'},d)));
      }
    });
    if(!tb.firstChild)tb.appendChild(h('tr',null,h('td',{colspan:5,class:'note'},'Không có phiếu nào khớp.')));
  }
  wrap.appendChild(inp);
  wrap.appendChild(h('div',{class:'scroll',style:'margin-top:8px'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Thời gian'),ident?h('th',null,'Mã NV'):null,ident?h('th',null,'Họ tên'):null,h('th',null,'Thời gian làm'),h('th'))),tb)));
  fillRows();return wrap;
}

/* ---------- CSV ---------- */
function exportCsv(){
  var S=R.S;
  function cell(v){v=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
  var head=['Thời gian','Mã NV','Họ tên','Thời gian làm (giây)'],cols=[];
  S.questions.forEach(function(q,i){
    if(q.type==='section')return;
    if(q.type==='matrix')q.rows.forEach(function(r,ri){head.push('C'+(i+1)+'. '+q.text+' — '+r);cols.push({q:q,ri:ri})});
    else{head.push('C'+(i+1)+'. '+q.text);cols.push({q:q})}
  });
  var out=[head.map(cell).join(',')];
  R.rows.forEach(function(r){
    var line=[new Date(r.submittedAt).toLocaleString('vi-VN'),r.empId||'',r.name||'',r.ms?Math.round(r.ms/1000):''];
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
