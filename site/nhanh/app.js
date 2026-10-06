const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(Number(n)||0))+'đ';
const compact=n=>{n=Number(n)||0;return n>=1e9?(n/1e9).toFixed(2).replace('.',',')+' tỷ':n>=1e6?(n/1e6).toFixed(1).replace('.',',')+'tr':money(n)};
const pct=n=>n==null||!Number.isFinite(Number(n))?'—':(Number(n)*100).toFixed(1).replace('.',',')+'%';
const numFmt=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(Number(n)||0));
const pad=n=>String(n).padStart(2,'0');
const vnDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const b64bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const TARGET_KEY='sevenam_nhanh_targets_v1';
let depots=[],bills=[],meta={source:'DEMO',lastUpdated:new Date().toISOString()},targets=JSON.parse(localStorage.getItem(TARGET_KEY)||'{}');

function seed32(str){let h=2166136261;for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function randFactory(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mockPayload(){
  const names=['Showroom 01','Showroom 02','Showroom 03','Showroom 04','Showroom 05','Showroom 06','Showroom 07','Showroom 08','Showroom 09','Showroom 10'];
  const ds=names.map((name,i)=>({id:String(1001+i),name,code:'SR'+pad(i+1)}));
  const out=[],now=new Date(),month=vnDate(now).slice(0,7),dayNow=Number(vnDate(now).slice(8,10));
  for(let d=1;d<=dayNow;d++){
    const date=month+'-'+pad(d);
    ds.forEach((dep,i)=>{
      const r=randFactory(seed32(date+'-'+dep.id));
      const count=Math.floor(6+r()*14);
      for(let j=0;j<count;j++){
        const amount=Math.round((650000+r()*2200000)/1000)*1000;
        const discount=Math.round(amount*(r()*.18)/1000)*1000;
        out.push({id:`${dep.id}-${date}-${j}`,depotId:dep.id,date,createdAt:Date.now(),saleName:'NV '+((j%4)+1),amount:Math.max(0,amount-discount),discount,grossAmount:amount,productQty:1+Math.floor(r()*3)});
      }
    })
  }
  return {meta:{source:'DEMO',lastUpdated:new Date().toISOString()},depots:ds,bills:out}
}
async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt'])
}
async function decryptEnvelope(env,password){
  const salt=b64bytes(env.salt),iv=b64bytes(env.iv),data=b64bytes(env.data),key=await deriveKey(password,salt);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},key,data);
  return JSON.parse(new TextDecoder().decode(plain))
}
async function fetchLive(password){
  const r=await fetch('./data/live.enc?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('Chưa có bản dữ liệu Nhanh.vn LIVE');
  return decryptEnvelope(await r.json(),password)
}
function applyPayload(p){
  depots=Array.isArray(p.depots)?p.depots:[];
  bills=Array.isArray(p.bills)?p.bills:[];
  meta=p.meta||meta;
  setMode(meta.source==='NHANH'?'LIVE':'DEMO');
  renderAll()
}
function setMode(mode){
  const live=mode==='LIVE';
  $('modePill').textContent=live?'LIVE':'DEMO';
  $('modePill').classList.toggle('demo',!live);
  $('sourceText').textContent=live?'NHANH.VN API':'NHANH.VN';
  $('sourceSub').textContent=live?'Dữ liệu đã giải mã':'DEMO DATA';
  $('notice').style.display=live?'none':'block';
  $('notice').innerHTML=live?'':'Đang hiển thị <b>DEMO DATA</b>. Dashboard đã sẵn sàng; chỉ cần thêm thông tin API Nhanh.vn vào GitHub Secrets để chuyển sang LIVE.'
}
function saveTargets(){localStorage.setItem(TARGET_KEY,JSON.stringify(targets))}
function monthDays(month){const [y,m]=month.split('-').map(Number);return new Date(y,m,0).getDate()}
function targetKey(depotId,month){return month+'|'+depotId}
function targetOf(depotId,month){return Number(targets[targetKey(depotId,month)])||0}
function setTarget(depotId,month,value){targets[targetKey(depotId,month)]=Math.max(0,Number(value)||0)}
function reportMonth(){return $('reportMonth').value||vnDate().slice(0,7)}
function reportDate(){return $('reportDate').value||vnDate()}
function billDate(b){return String(b.date||'').slice(0,10)}
function billsMonth(month){return bills.filter(b=>billDate(b).startsWith(month))}
function billsDate(date){return bills.filter(b=>billDate(b)===date)}
function sum(arr,fn){return arr.reduce((a,x)=>a+(Number(fn(x))||0),0)}
function byDepot(arr){const m={};arr.forEach(x=>(m[String(x.depotId)]??=[]).push(x));return m}
function gapClass(v){return v<-10?'red':v<=10?'orange':v<=20?'blue':'green'}
function searchMatch(name){const q=$('searchShowroom').value.trim().toLowerCase();return !q||String(name).toLowerCase().includes(q)}
function elapsedInfo(month){
  const today=vnDate(),current=today.slice(0,7)===month,total=monthDays(month);
  const elapsed=current?Number(today.slice(8,10)):month<today.slice(0,7)?total:0;
  return {total,elapsed,time:total?elapsed/total:0}
}
function showroomStats(){
  const month=reportMonth(),date=reportDate(),monthMap=byDepot(billsMonth(month)),dayMap=byDepot(billsDate(date)),time=elapsedInfo(month);
  return depots.filter(d=>searchMatch(d.name)).map(d=>{
    const m=monthMap[String(d.id)]||[],day=dayMap[String(d.id)]||[],target=targetOf(d.id,month),monthly=sum(m,x=>x.amount),daily=sum(day,x=>x.amount),invoiceMonth=m.length,invoiceDay=day.length;
    const qtyDay=sum(day,x=>x.productQty),aov=invoiceMonth?monthly/invoiceMonth:0,completion=target?monthly/target:0,gapPoints=(completion-time.time)*100,dailyTarget=target/time.total;
    return {...d,target,monthly,daily,invoiceMonth,invoiceDay,qtyDay,aov,completion,gapPoints,dailyTarget}
  }).sort((a,b)=>{
    const at=a.target>0,bt=b.target>0;if(at!==bt)return bt-at;
    if(at&&bt&&b.completion!==a.completion)return b.completion-a.completion;
    return b.monthly-a.monthly
  })
}
function kpi(label,value,sub,primary=false){return `<div class="kpi${primary?' primary':''}"><span>${label}</span><b>${value}</b><small>${sub||''}</small></div>`}
function renderSummary(stats){
  const month=reportMonth(),time=elapsedInfo(month),today=reportDate(),daily=sum(stats,x=>x.daily),monthly=sum(stats,x=>x.monthly),target=sum(stats,x=>x.target),completion=target?monthly/target:0,gap=(completion-time.time)*100,remaining=Math.max(0,target-monthly),forecast=time.elapsed?monthly/time.elapsed*time.total:0;
  $('summary').innerHTML=[
    kpi('Doanh thu '+(today===vnDate()?'hôm nay':'ngày chọn'),compact(daily),today,true),
    kpi('Doanh thu tháng',compact(monthly),month),
    kpi('Target tháng',target?compact(target):'Chưa nhập',`${stats.filter(x=>x.target>0).length}/${stats.length} showroom có target`),
    kpi('% hoàn thành',pct(completion),target?`${gap>=0?'Vượt':'Chậm'} ${Math.abs(gap).toFixed(2).replace('.',',')} điểm %`:'Nhập target để tính'),
    kpi('Tiến độ thời gian',pct(time.time),`${time.elapsed}/${time.total} ngày`),
    kpi('Còn thiếu',target?compact(remaining):'—','So với target tháng'),
    kpi('Forecast cuối tháng',time.elapsed?compact(forecast):'—','Theo tốc độ hiện tại'),
    kpi('Số hóa đơn ngày',numFmt(sum(stats,x=>x.invoiceDay)),`${numFmt(sum(stats,x=>x.qtyDay))} sản phẩm`)
  ].join('')
}
function renderRanking(stats){
  $('rankingChip').textContent=`${stats.length} showroom`;
  $('rankingRows').innerHTML=stats.map((s,i)=>{
    const gap=s.target?`<span class="pill ${gapClass(s.gapPoints)}">${s.gapPoints>=0?'+':''}${s.gapPoints.toFixed(2).replace('.',',')}đ%</span>`:'—';
    return `<tr><td class="rankNum">${i+1}</td><td>${escapeHtml(s.name)}</td><td>${s.target?compact(s.target):'—'}</td><td>${compact(s.monthly)}</td><td>${s.target?pct(s.completion):'—'}</td><td>${gap}</td><td>${compact(s.daily)}</td><td>${numFmt(s.invoiceMonth)}</td><td>${compact(s.aov)}</td></tr>`
  }).join('')||'<tr><td colspan="9">Không có showroom phù hợp</td></tr>';
  $('rankBars').innerHTML=stats.map(s=>{
    const val=s.target?s.completion*100:0,width=Math.min(120,val);
    return `<div class="rankBarRow"><label title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</label><div class="rankTrack"><div class="rankFill" style="width:${width/1.2}%"></div></div><b>${s.target?val.toFixed(1).replace('.',',')+'%':'—'}</b></div>`
  }).join('')
}
function renderDaily(stats){
  $('dailySub').textContent=`Ngày ${reportDate()} · Actual vs Target ngày`;
  $('dailyRows').innerHTML=stats.map(s=>{
    const gap=s.daily-s.dailyTarget;
    return `<tr><td>${escapeHtml(s.name)}</td><td>${compact(s.daily)}</td><td>${s.target?compact(s.dailyTarget):'—'}</td><td class="${s.target?(gap>=0?'good':'bad'):''}">${s.target?(gap>=0?'+':'')+compact(gap):'—'}</td><td>${numFmt(s.invoiceDay)}</td><td>${numFmt(s.qtyDay)}</td><td>${s.invoiceDay?compact(s.daily/s.invoiceDay):'—'}</td></tr>`
  }).join('');
  drawGroupedBars($('dailyChart'),stats.map(s=>({label:s.name,a:s.daily,b:s.dailyTarget})))
}
function renderTrend(stats){
  const month=reportMonth(),days=elapsedInfo(month).total,map={};billsMonth(month).forEach(b=>(map[billDate(b)]??=[]).push(b));
  const targetTotal=sum(stats,x=>x.target),dailyTarget=targetTotal/days,data=[];
  for(let d=1;d<=days;d++){const date=month+'-'+pad(d),arr=map[date]||[];data.push({label:pad(d),actual:sum(arr,x=>x.amount),target:dailyTarget})}
  drawLines($('trendChart'),data)
}
function renderPacing(stats){
  const month=reportMonth(),time=elapsedInfo(month),monthly=sum(stats,x=>x.monthly),target=sum(stats,x=>x.target),completion=target?monthly/target:0,gap=(completion-time.time)*100,forecast=time.elapsed?monthly/time.elapsed*time.total:0;
  $('pacing').innerHTML=`<div class="pacingHero"><div><span>DOANH THU THÁNG</span><b>${compact(monthly)}</b></div><div class="gapBadge ${gapClass(gap)}">${target?(gap>=0?'Vượt ':'Chậm ')+Math.abs(gap).toFixed(2).replace('.',',')+' điểm %':'Chưa có target'}</div></div>
  <div class="progress"><div class="progressTop"><span>Hoàn thành target</span><b>${pct(completion)}</b></div><div class="track"><i style="width:${Math.min(100,completion*100)}%"></i></div></div>
  <div class="progress"><div class="progressTop"><span>Tiến độ thời gian</span><b>${pct(time.time)}</b></div><div class="track gray"><i style="width:${Math.min(100,time.time*100)}%"></i></div></div>
  <div class="pacingStats"><div><span>Target hệ thống</span><b>${target?compact(target):'—'}</b></div><div><span>Dự báo</span><b>${time.elapsed?compact(forecast):'—'}</b></div><div><span>Còn thiếu</span><b>${target?compact(Math.max(0,target-monthly)):'—'}</b></div><div><span>Showroom đạt ≥100%</span><b>${stats.filter(x=>x.target&&x.completion>=1).length}/${stats.filter(x=>x.target).length}</b></div></div>`
}
function renderAll(){
  const stats=showroomStats();
  renderSummary(stats);renderRanking(stats);renderDaily(stats);renderTrend(stats);renderPacing(stats);
  $('subtitle').textContent=`${meta.source==='NHANH'?'Nhanh.vn API':'Demo'} · ${depots.length} showroom/kho · Báo cáo ngày ${reportDate()}`;
  $('updatedAt').textContent='Cập nhật: '+new Date(meta.lastUpdated||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
}
function drawGroupedBars(el,data){
  const W=920,H=300,P={l:50,r:12,t:15,b:48};el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`;const svg=el.firstElementChild,pw=W-P.l-P.r,ph=H-P.t-P.b,max=Math.max(1,...data.flatMap(x=>[x.a,x.b]))*1.12,slot=pw/Math.max(1,data.length),bw=Math.max(5,Math.min(28,slot*.28)),y=v=>P.t+ph-(v/max)*ph;
  for(let i=0;i<=4;i++){const yy=P.t+ph*i/4;addSvg(svg,'line',{x1:P.l,y1:yy,x2:W-P.r,y2:yy,class:'gridLine'});addSvg(svg,'text',{x:P.l-6,y:yy+3,'text-anchor':'end',class:'axisText'},compact(max*(1-i/4)).replace('đ',''))}
  data.forEach((d,i)=>{const cx=P.l+slot*i+slot/2;[['a','barActual',-bw*.55],['b','barTarget',bw*.55]].forEach(([k,cl,off])=>{const yy=y(d[k]),r=addSvg(svg,'rect',{x:cx+off-bw/2,y:yy,width:bw,height:P.t+ph-yy,rx:3,class:cl});addSvg(r,'title',{},d.label+': '+money(d[k]))});addSvg(svg,'text',{x:cx,y:H-10,'text-anchor':'middle',class:'axisText',transform:`rotate(-28 ${cx} ${H-10})`},String(d.label).slice(0,14))})
}
function drawLines(el,data){
  const W=920,H=300,P={l:50,r:12,t:15,b:30};el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`;const svg=el.firstElementChild,pw=W-P.l-P.r,ph=H-P.t-P.b,max=Math.max(1,...data.flatMap(x=>[x.actual,x.target]))*1.12,x=i=>P.l+(data.length===1?pw/2:i*pw/(data.length-1)),y=v=>P.t+ph-(v/max)*ph;
  for(let i=0;i<=4;i++){const yy=P.t+ph*i/4;addSvg(svg,'line',{x1:P.l,y1:yy,x2:W-P.r,y2:yy,class:'gridLine'});addSvg(svg,'text',{x:P.l-6,y:yy+3,'text-anchor':'end',class:'axisText'},compact(max*(1-i/4)).replace('đ',''))}
  const path=k=>data.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(d[k]).toFixed(1)).join(' ');
  addSvg(svg,'path',{d:path('actual'),class:'lineActual'});addSvg(svg,'path',{d:path('target'),class:'lineTarget'});
  data.forEach((d,i)=>{if(i%Math.max(1,Math.ceil(data.length/8))===0||i===data.length-1)addSvg(svg,'text',{x:x(i),y:H-8,'text-anchor':'middle',class:'axisText'},d.label)})
}
function addSvg(svg,tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.appendChild(n);return n}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function openSettings(){
  const month=reportMonth(),stats=showroomStats();$('systemTargetInput').value=Math.round(sum(stats,x=>x.target));
  $('targetList').innerHTML=depots.filter(d=>searchMatch(d.name)).map(d=>`<div class="targetRow"><div><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.code||'ID '+d.id)}</small></div><input class="targetInput" data-depot="${escapeHtml(d.id)}" type="number" min="0" step="1000000" value="${Math.round(targetOf(d.id,month))||''}" placeholder="Target tháng"></div>`).join('');
  $('settingsDialog').showModal()
}
function datePreset(kind){
  const now=new Date(),d=kind==='yesterday'?new Date(now.getTime()-86400000):now;$('reportDate').value=vnDate(d);
  document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range===kind));renderAll()
}
function showError(msg){$('error').textContent=msg;$('error').style.display='block';setTimeout(()=>$('error').style.display='none',7000)}
async function tryAutoLive(){const p=sessionStorage.getItem('sevenam_dashboard_password');if(!p)return false;try{applyPayload(await fetchLive(p));return true}catch{return false}}
async function init(){
  const p=mockPayload();depots=p.depots;bills=p.bills;meta=p.meta;setMode('DEMO');
  $('reportDate').value=vnDate();$('reportMonth').value=vnDate().slice(0,7);renderAll();await tryAutoLive()
}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>datePreset(b.dataset.range));
$('reportDate').onchange=()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));renderAll()};
$('reportMonth').onchange=renderAll;$('searchShowroom').oninput=renderAll;
document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.scroll).scrollIntoView({behavior:'smooth'}));
$('settingsBtn').onclick=openSettings;$('targetBtn').onclick=openSettings;
$('spreadTargetBtn').onclick=()=>{const total=Math.max(0,Number($('systemTargetInput').value)||0),inputs=[...document.querySelectorAll('.targetInput')],each=inputs.length?Math.round(total/inputs.length):0;inputs.forEach(i=>i.value=each)};
$('settingsForm').onsubmit=e=>{e.preventDefault();const month=reportMonth();document.querySelectorAll('.targetInput').forEach(i=>setTarget(i.dataset.depot,month,i.value));saveTargets();$('settingsDialog').close();renderAll()};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('unlockBtn').onclick=()=>{$('unlockError').style.display='none';$('password').value='';$('unlockDialog').showModal();setTimeout(()=>$('password').focus(),60)};
$('unlockForm').onsubmit=async e=>{e.preventDefault();const pwd=$('password').value,box=$('unlockError');box.style.display='none';try{$('app').classList.add('loading');const p=await fetchLive(pwd);sessionStorage.setItem('sevenam_dashboard_password',pwd);applyPayload(p);$('unlockDialog').close()}catch(err){box.textContent='Không mở được dữ liệu: sai mật khẩu hoặc Nhanh.vn LIVE chưa được cấu hình.';box.style.display='block'}finally{$('app').classList.remove('loading')}};
$('reloadBtn').onclick=async()=>{const pwd=sessionStorage.getItem('sevenam_dashboard_password');if(meta.source==='NHANH'&&pwd)try{applyPayload(await fetchLive(pwd))}catch(e){showError(e.message)}else renderAll()};
init();