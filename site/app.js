const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(Number(n)||0))+'đ';
const compact=n=>{n=Number(n)||0;return n>=1e9?(n/1e9).toFixed(2).replace('.',',')+' tỷ':n>=1e6?(n/1e6).toFixed(1).replace('.',',')+'tr':money(n)};
const pct=n=>n==null||!Number.isFinite(Number(n))?'—':(Number(n)*100).toFixed(1).replace('.',',')+'%';
const numFmt=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Math.round(Number(n)||0));
const pad=n=>String(n).padStart(2,'0');
const vnDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const statusLabels={TREO:'Treo',DANG_GIAO:'Đang giao',THANH_CONG:'Thành công',HOAN:'Hoàn',HUY:'Huỷ / xoá'};
const statusColors={TREO:'#b57a21',DANG_GIAO:'#386ba7',THANH_CONG:'#28734c',HOAN:'#a7192e',HUY:'#77716b'};
const b64bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let sourceOrders=[],meta={source:'DEMO',lastUpdated:new Date().toISOString()},payloadMonthlyTarget=2300000000,currentView='overview';

const SETTINGS_KEY='sevenam_kpi_settings_v3';
const DATA_KEY='sevenam_channel_data_v3';
const QUICK_DATA_KEY='sevenam_quick_total_data_v1';
let settings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
let channelData=JSON.parse(localStorage.getItem(DATA_KEY)||'{}');
let quickTotalDataStore=JSON.parse(localStorage.getItem(QUICK_DATA_KEY)||'{}');

function seed32(str){let h=2166136261;for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function randFactory(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function pick(r,a){return a[Math.floor(r()*a.length)]}
function mockData(days=40){
  const out=[],now=new Date();
  for(let k=days-1;k>=0;k--){
    const day=new Date(now.getTime()-k*86400000),key=vnDate(day),r=randFactory(seed32('sevenam-'+key)),today=key===vnDate(now);
    const hourNow=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',hour:'2-digit',hour12:false}).format(now));
    const maxHour=today?Math.max(9,hourNow):22,count=Math.floor(52+r()*70)*Math.min(1,(maxHour-7)/15);
    for(let i=0;i<count;i++){
      const h=Math.floor(8+r()*Math.max(1,maxHour-7)),m=Math.floor(r()*60),base=pick(r,[699000,799000,899000,999000,1199000,1399000,1599000,1999000,2499000]),qty=r()<.16?2:1,discount=r()<.31?(r()<.55?.3:.5):0,total=Math.round(base*qty*(1-discount));
      const st=pick(r,['THANH_CONG','THANH_CONG','THANH_CONG','THANH_CONG','DANG_GIAO','TREO','HOAN','HUY']);
      const ch=pick(r,['Facebook Ads','Facebook Ads','Facebook Ads','Livestream','Livestream','Shopee','Website','Zalo/CSKH']);
      const staff=ch==='Livestream'&&r()<.7?'Linh live':pick(r,['Hương','Diễm','Thu']);
      out.push({createdAt:`${key}T${pad(h)}:${pad(m)}:00+07:00`,createdDate:key,salesStaff:staff,channel:ch,sourceName:ch,status:st,grossAmount:Math.round(total/(1-discount||1)),netAmount:total,discountAmount:0,codAmount:total,prepaidAmount:0,totalAmount:total,successfulAmount:st==='THANH_CONG'?total:0,isPartialReturn:false,statusCode:null,statusName:'demo',excludedStatus:st==='HUY',excludedExchangeSource:false,excludedFromDefaultReport:st==='HUY'});
    }
  } return out
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
  if(!r.ok)throw new Error('Chưa có bản dữ liệu LIVE');
  return decryptEnvelope(await r.json(),password)
}
function applyPayload(p){
  sourceOrders=Array.isArray(p.orders)?p.orders:[];
  meta=p.meta||meta;
  payloadMonthlyTarget=Number(p.monthlyTarget)||2300000000;
  if(settings.targetMonth==null) settings.targetMonth=payloadMonthlyTarget;
  setMode(meta.source==='PANCAKE'?'LIVE':'DEMO');
  populateFilters();
  renderAll()
}
function setMode(mode){
  const live=mode==='LIVE';
  $('modePill').textContent=live?'LIVE':'DEMO';
  $('modePill').classList.toggle('demo',!live);
  $('sourceText').textContent=live?'PANCAKE · GITHUB':'GITHUB PAGES';
  $('sourceSub').textContent=live?'Dữ liệu đã giải mã':'Dữ liệu mô phỏng';
  $('notice').style.display=live?'none':'block';
  $('notice').innerHTML=live?'':'Đang hiển thị <b>DEMO DATA</b>. Bấm biểu tượng khoá để mở dữ liệu Pancake.';
}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}
function saveChannelData(){localStorage.setItem(DATA_KEY,JSON.stringify(channelData))}
function saveQuickTotalData(){localStorage.setItem(QUICK_DATA_KEY,JSON.stringify(quickTotalDataStore))}
function currentDateRangeKey(){return `${$('from').value}|${$('to').value}`}
function quickTotalDataValue(){return Number(quickTotalDataStore[currentDateRangeKey()])||0}
function dateRange(kind){
  const now=new Date(),today=vnDate(now);let from=today,to=today;
  if(kind==='yesterday'){const d=new Date(now.getTime()-86400000);from=to=vnDate(d)}
  else if(kind==='7d')from=vnDate(new Date(now.getTime()-6*86400000));
  else if(kind==='month')from=today.slice(0,7)+'-01';
  $('from').value=from;$('to').value=to;
  document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range===kind));
  renderAll()
}
function orderDate(o){
  if(o&&o.createdDate)return String(o.createdDate).slice(0,10);
  try{return vnDate(new Date(o&&o.createdAt||o))}catch{return String(o&&o.createdAt||o||'').slice(0,10)}
}
function orderHour(o){
  try{return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',hour:'2-digit',hour12:false}).format(new Date(o.createdAt))+'h'}catch{return'—'}
}
function populateFilters(){
  const fill=(id,vals)=>{const el=$(id),old=el.value;el.innerHTML=['Tất cả',...Array.from(new Set(vals.filter(Boolean))).sort()].map(x=>`<option>${esc(x)}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old};
  fill('channel',sourceOrders.map(x=>x.channel));
  fill('staff',sourceOrders.map(x=>x.salesStaff))
}
function isDefaultExcluded(o){
  return Boolean(o.excludedFromDefaultReport||o.excludedExchangeSource||o.excludedStatus)
}
function filteredRows(opts={}){
  const from=opts.from||$('from').value,to=opts.to||$('to').value,ch=$('channel').value,staff=$('staff').value,status=$('status').value;
  return sourceOrders.filter(o=>{
    const d=orderDate(o);
    const defaultRule=status==='Tất cả'?!isDefaultExcluded(o):(!o.excludedExchangeSource&&o.status===status);
    return (!from||d>=from)&&(!to||d<=to)&&(ch==='Tất cả'||o.channel===ch)&&(staff==='Tất cả'||o.salesStaff===staff)&&defaultRule
  })
}
function filteredIgnoringDate(month){
  const ch=$('channel').value,staff=$('staff').value,status=$('status').value;
  return sourceOrders.filter(o=>{
    const defaultRule=status==='Tất cả'?!isDefaultExcluded(o):(!o.excludedExchangeSource&&o.status===status);
    return orderDate(o).startsWith(month)&&(ch==='Tất cả'||o.channel===ch)&&(staff==='Tất cả'||o.salesStaff===staff)&&defaultRule
  })
}
function sum(rows,fn){return rows.reduce((a,x)=>a+(Number(fn(x))||0),0)}
function successful(o){return Number(o.successfulAmount)||0}
function overview(rows){
  const net=sum(rows,x=>x.netAmount??x.totalAmount),gross=sum(rows,x=>x.grossAmount??x.totalAmount),success=sum(rows,successful),returns=rows.filter(x=>x.status==='HOAN');
  const cod=sum(rows,x=>x.codAmount??0),prepaid=sum(rows,x=>x.prepaidAmount??0),discount=sum(rows,x=>x.discountAmount??Math.max(0,(x.grossAmount||0)-(x.netAmount||x.totalAmount||0)));
  return {
    createdRevenue:net,grossRevenue:gross,discountRevenue:discount,codRevenue:cod,prepaidRevenue:prepaid,
    successfulRevenue:success,orders:rows.length,
    successfulOrders:rows.filter(x=>successful(x)>0||x.status==='THANH_CONG').length,
    pendingRevenue:sum(rows,x=>x.status==='TREO'?(x.netAmount??x.totalAmount):0),
    shippingRevenue:sum(rows,x=>x.status==='DANG_GIAO'?(x.netAmount??x.totalAmount):0),
    returnRevenue:sum(rows,x=>x.status==='HOAN'?(x.netAmount??x.totalAmount):0),
    cancelledRevenue:sum(rows,x=>x.status==='HUY'?(x.netAmount??x.totalAmount):0),
    returnRate:rows.length?returns.length/rows.length:0,
    aov:rows.length?net/rows.length:0
  }
}
function group(rows,key){const m={};for(const r of rows)(m[key(r)]??=[]).push(r);return m}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function daysInMonth(month){const [y,m]=month.split('-').map(Number);return new Date(y,m,0).getDate()}
function targetMonth(){return Number(settings.targetMonth)||payloadMonthlyTarget||2300000000}
function targetDay(month=$('from').value.slice(0,7)||vnDate().slice(0,7)){return Number(settings.targetDay)||Math.round(targetMonth()/daysInMonth(month))}
function gapDay(){return Number(settings.gapDay)||0}
function effectiveDailyTarget(month){return Math.max(0,targetDay(month)+gapDay())}
function rangeKey(channel){return `${$('from').value}|${$('to').value}|${channel}`}
function channelDataValue(channel){return Number(channelData[rangeKey(channel)])||0}
function totalManualData(rows){
  const channels=Array.from(new Set(rows.map(x=>x.channel)));
  return channels.reduce((a,c)=>a+channelDataValue(c),0)
}
function gapClass(v){return v<-10?'red':v<=10?'orange':v<=20?'blue':'green'}
function card(label,value,sub,primary=false){return `<div class="card${primary?' primary':''}"><span class="cardLabel">${label}</span><strong class="cardValue">${value}</strong><span class="cardSub">${sub||''}</span></div>`}
function mini(label,value,cls=''){return `<div class="miniKpi ${cls}"><span>${label}</span><b>${value}</b></div>`}

function renderAll(){
  const rows=filteredRows(),k=overview(rows),data=totalManualData(rows);
  $('kpis').innerHTML=[
    card('Tổng tiền sau CK',compact(k.createdRevenue),`${numFmt(k.orders)} đơn · khớp logic Pancake`,true),
    card('COD',compact(k.codRevenue),'Tiền thu hộ'),
    card('Trả trước',compact(k.prepaidRevenue),'Khách đã thanh toán trước'),
    card('Tổng chiết khấu',compact(k.discountRevenue),`Trước CK ${compact(k.grossRevenue)}`),
    card('Doanh thu thành công',compact(k.successfulRevenue),`${numFmt(k.successfulOrders)} đơn thành công`),
    card('Đang giao',compact(k.shippingRevenue),'Đơn đang vận chuyển'),
    card('Treo',compact(k.pendingRevenue),'Mới / chờ hàng / xác nhận...'),
    card('Hoàn',compact(k.returnRevenue),`Tỷ lệ hoàn ${pct(k.returnRate)}`),
    card('Tổng Data',data?numFmt(data):'Chưa nhập',data?`CR chốt ${pct(k.orders/data)}`:'Nhập tại màn Theo kênh'),
    card('CR chốt',data?pct(k.orders/data):'—',data?`${numFmt(k.orders)} đơn / ${numFmt(data)} data`:'Chưa có data'),
    card('AOV',compact(k.aov),'Giá trị đơn sau CK trung bình'),
    card('Đơn đã loại',numFmt(sourceOrders.filter(o=>orderDate(o)>=$('from').value&&orderDate(o)<=$('to').value&&isDefaultExcluded(o)).length),'Huỷ/Xoá + các nguồn Đơn đổi')
  ].join('');
  $('periodStat').textContent=`${$('from').value} → ${$('to').value} · ${numFmt(rows.length)} đơn · Đã loại Hủy/Xóa + Đơn đổi`;
  renderTrend(rows);
  renderStatus(rows);
  renderChannelChart(rows,'channelChart');
  renderTarget();
  renderChannels(rows);
  renderSales(rows);
  renderMonthly();
  $('updatedAt').textContent='Cập nhật dữ liệu: '+new Date(meta.lastUpdated||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
  $('pageSub').textContent=`${meta.source==='PANCAKE'?'Pancake POS':'Demo'} · ${numFmt(rows.length)} đơn · Tổng tiền dùng số sau chiết khấu`;
}
function chartBase(el){
  const W=920,H=260,P={l:48,r:16,t:15,b:30};
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`;
  return {svg:el.firstElementChild,W,H,P,pw:W-P.l-P.r,ph:H-P.t-P.b}
}
function addSvg(svg,tag,attrs,text){
  const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.appendChild(n);return n
}
function renderTrend(rows){
  const single=$('from').value===$('to').value;
  const g=group(rows,o=>single?orderHour(o):orderDate(o));
  const labels=single?Array.from({length:15},(_,i)=>String(i+8).padStart(2,'0')+'h'):Object.keys(g).sort();
  const data=labels.map(l=>{const rr=g[l]||[],o=overview(rr);return{label:l,created:o.createdRevenue,success:o.successfulRevenue}});
  drawLineChart($('trendChart'),data,[{key:'created',class:'lineRed',point:'pointRed'},{key:'success',class:'lineDark',point:'pointDark'}],single?null:effectiveDailyTarget($('from').value.slice(0,7)))
}
function drawLineChart(el,data,series,target=null){
  const {svg,W,H,P,pw,ph}=chartBase(el);if(!data.length){addSvg(svg,'text',{x:W/2,y:H/2,'text-anchor':'middle',class:'axisText'},'Không có dữ liệu');return}
  const vals=data.flatMap(d=>series.map(s=>Number(d[s.key])||0)).concat(target!=null?[target]:[0]),max=Math.max(1,...vals)*1.1;
  for(let i=0;i<=4;i++){const y=P.t+ph*i/4;addSvg(svg,'line',{x1:P.l,y1:y,x2:W-P.r,y2:y,class:'gridLine'});addSvg(svg,'text',{x:P.l-6,y:y+3,'text-anchor':'end',class:'axisText'},compact(max*(1-i/4)).replace('đ',''))}
  const x=i=>P.l+(data.length===1?pw/2:i*pw/(data.length-1)),y=v=>P.t+ph-(Number(v)||0)/max*ph;
  if(target!=null){addSvg(svg,'line',{x1:P.l,y1:y(target),x2:W-P.r,y2:y(target),class:'lineTarget'});addSvg(svg,'text',{x:W-P.r-3,y:y(target)-5,'text-anchor':'end',class:'axisText'},'Target '+compact(target))}
  for(const s of series){const d=data.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(p[s.key]).toFixed(1)).join(' ');addSvg(svg,'path',{d,class:s.class});data.forEach((p,i)=>{const c=addSvg(svg,'circle',{cx:x(i),cy:y(p[s.key]),r:2.7,class:s.point});addSvg(c,'title',{},`${p.label}: ${money(p[s.key])}`)})}
  const step=Math.max(1,Math.ceil(data.length/7));data.forEach((p,i)=>{if(i%step===0||i===data.length-1)addSvg(svg,'text',{x:x(i),y:H-8,'text-anchor':'middle',class:'axisText'},p.label.length>5?p.label.slice(5):p.label)})
}
function renderStatus(rows){
  const g=group(rows,o=>o.status||'TREO'),total=Math.max(1,sum(rows,x=>x.netAmount??x.totalAmount));
  const order=['TREO','DANG_GIAO','THANH_CONG','HOAN','HUY'];
  $('statusViz').innerHTML=order.map(s=>{
    const rr=g[s]||[],v=sum(rr,x=>x.netAmount??x.totalAmount),share=v/total*100;
    return `<div class="statusItem"><div class="statusTop"><span>${statusLabels[s]}</span><b>${compact(v)}</b></div><div class="statusTrack"><i style="width:${Math.min(100,share)}%;background:${statusColors[s]}"></i></div><div class="statusMeta">${numFmt(rr.length)} đơn · ${share.toFixed(1).replace('.',',')}%</div></div>`
  }).join('');

  const detailed=[
    {label:'Mới',codes:[0]},
    {label:'Chờ hàng',codes:[11]},
    {label:'Đã xác nhận',codes:[1]},
    {label:'Chờ chuyển hàng',codes:[9]},
    {label:'Đang giao',codes:[2]},
    {label:'Thành công',codes:[3,16]},
    {label:'Hoàn',codes:[4,5,15]}
  ];
  $('statusDetail').innerHTML=detailed.map(item=>{
    const rr=rows.filter(o=>item.codes.includes(Number(o.statusCode)));
    const amount=sum(rr,o=>o.netAmount??o.totalAmount);
    return `<div class="statusDetailRow ${rr.length?'':'zero'}"><span class="statusName">${item.label}</span><span class="statusCount">${numFmt(rr.length)} đơn</span><span class="statusMoney">${compact(amount)}</span></div>`
  }).join('');
}
function channelStats(rows){
  const grouped=group(rows,x=>x.channel||'Khác');
  const canonical=['Facebook Ads','Livestream','Shopee','Website','Zalo/CSKH','TikTok Shop','Lazada','Showroom/POS'];
  const names=Array.from(new Set([...canonical,...Object.keys(grouped)]));
  return names.map(name=>({name,...overview(grouped[name]||[]),data:channelDataValue(name)})).sort((a,b)=>b.createdRevenue-a.createdRevenue)
}
function renderChannelChart(rows,id){
  const stats=channelStats(rows);drawGroupedBars($(id),stats.map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),true)
}
function drawGroupedBars(el,data,moneyMode=false){
  const {svg,W,H,P,pw,ph}=chartBase(el);if(!data.length){addSvg(svg,'text',{x:W/2,y:H/2,'text-anchor':'middle',class:'axisText'},'Không có dữ liệu');return}
  const max=Math.max(1,...data.flatMap(x=>[Number(x.a)||0,Number(x.b)||0]))*1.12,bw=Math.max(8,Math.min(38,pw/(data.length*3))),slot=pw/data.length;
  for(let i=0;i<=4;i++){const y=P.t+ph*i/4;addSvg(svg,'line',{x1:P.l,y1:y,x2:W-P.r,y2:y,class:'gridLine'});addSvg(svg,'text',{x:P.l-6,y:y+3,'text-anchor':'end',class:'axisText'},moneyMode?compact(max*(1-i/4)).replace('đ',''):Math.round(max*(1-i/4)))}
  data.forEach((d,i)=>{const cx=P.l+slot*i+slot/2,y=v=>P.t+ph-(Number(v)||0)/max*ph;[['a','barRed',-bw*.55],['b','barDark',bw*.55]].forEach(([key,cls,off])=>{const yy=y(d[key]),rect=addSvg(svg,'rect',{x:cx+off-bw/2,y:yy,width:bw,height:P.t+ph-yy,rx:3,class:cls});addSvg(rect,'title',{},`${d.label}: ${moneyMode?money(d[key]):d[key]}`)});addSvg(svg,'text',{x:cx,y:H-8,'text-anchor':'middle',class:'axisText'},String(d.label).length>12?String(d.label).slice(0,11)+'…':d.label)})
}
function drawSingleBars(el,data,{moneyMode=false,percentMode=false,positiveNegative=false}={}){
  const {svg,W,H,P,pw,ph}=chartBase(el);if(!data.length){addSvg(svg,'text',{x:W/2,y:H/2,'text-anchor':'middle',class:'axisText'},'Không có dữ liệu');return}
  let min=positiveNegative?Math.min(0,...data.map(x=>Number(x.value)||0)):0,max=Math.max(1,...data.map(x=>Number(x.value)||0));if(min===max)max=min+1;const range=max-min,bw=Math.max(5,Math.min(34,pw/(data.length*1.7))),slot=pw/data.length,y=v=>P.t+ph-(v-min)/range*ph,zero=y(0);
  if(positiveNegative)addSvg(svg,'line',{x1:P.l,y1:zero,x2:W-P.r,y2:zero,stroke:'#cfc8c1','stroke-width':1});
  data.forEach((d,i)=>{const cx=P.l+slot*i+slot/2,val=Number(d.value)||0,yy=y(val),top=Math.min(yy,zero),h=Math.max(1,Math.abs(zero-yy)),cls=positiveNegative?(val>=0?'barGreen':'barRed'):'barRed';const rect=addSvg(svg,'rect',{x:cx-bw/2,y:top,width:bw,height:h,rx:3,class:cls});addSvg(rect,'title',{},`${d.label}: ${percentMode?(val.toFixed(1)+'%'):moneyMode?money(val):numFmt(val)}`);if(data.length<=15||i%Math.ceil(data.length/10)===0)addSvg(svg,'text',{x:cx,y:H-8,'text-anchor':'middle',class:'axisText'},String(d.label).slice(-5))})
}
function renderTarget(){
  const month=($('from').value||vnDate()).slice(0,7),monthRows=filteredIgnoringDate(month),k=overview(monthRows),tm=targetMonth(),td=effectiveDailyTarget(month);
  const current=month===vnDate().slice(0,7),elapsed=current?Number(vnDate().slice(8,10)):daysInMonth(month),totalDays=daysInMonth(month),time=elapsed/totalDays,completion=tm?k.createdRevenue/tm:0,gapPoints=(completion-time)*100,forecast=elapsed?k.createdRevenue/elapsed*totalDays:0;
  $('targetPanel').innerHTML=`<div class="targetHero"><div><span>DOANH SỐ THÁNG</span><strong>${compact(k.createdRevenue)}</strong></div><div class="gapBadge ${gapClass(gapPoints)}">${gapPoints>=0?'Vượt':'Chậm'} ${Math.abs(gapPoints).toFixed(2).replace('.',',')} điểm %</div></div>
    <div class="progressRow"><div class="progressLabel"><span>Hoàn thành target</span><b>${pct(completion)}</b></div><div class="track"><i style="width:${Math.min(100,completion*100)}%"></i></div></div>
    <div class="progressRow"><div class="progressLabel"><span>Tiến độ thời gian</span><b>${pct(time)}</b></div><div class="track gray"><i style="width:${Math.min(100,time*100)}%"></i></div></div>
    <div class="targetStats"><div><span>Target tháng</span><b>${compact(tm)}</b></div><div><span>Target/ngày</span><b>${compact(td)}</b></div><div><span>Dự báo</span><b>${compact(forecast)}</b></div></div>`
}
function renderChannels(rows){
  const stats=channelStats(rows),total=Math.max(1,overview(rows).createdRevenue),sumData=stats.reduce((a,x)=>a+x.data,0);
  $('channelRows').innerHTML=stats.map(x=>{const cr=x.data?x.orders/x.data:null;return `<tr><td>${esc(x.name)}</td><td>${compact(x.createdRevenue)}</td><td>${compact(x.successfulRevenue)}</td><td>${numFmt(x.orders)}</td><td><input class="dataInput" data-channel="${esc(x.name)}" type="number" min="0" step="1" value="${x.data||''}" placeholder="Nhập data"></td><td class="${cr!=null&&cr<.1?'bad':''}">${pct(cr)}</td><td>${pct(x.createdRevenue/total)}</td><td>${compact(x.aov)}</td><td class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td></tr>`}).join('')||'<tr><td colspan="9">Không có dữ liệu</td></tr>';
  const fbAds=stats.find(x=>x.name==='Facebook Ads')?.createdRevenue||0,live=stats.find(x=>x.name==='Livestream')?.createdRevenue||0;
  $('channelDataSummary').textContent=`FB tổng: ${compact(fbAds+live)} · Data: ${sumData?numFmt(sumData):'chưa nhập'} · CR tổng: ${sumData?pct(overview(rows).orders/sumData):'—'}`;
  drawGroupedBars($('channelCompareChart'),stats.map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),true);
  drawSingleBars($('channelCrChart'),stats.map(x=>({label:x.name,value:x.data?x.orders/x.data*100:0})),{percentMode:true});
  document.querySelectorAll('.dataInput').forEach(inp=>{
    const commit=()=>{const v=Math.max(0,Number(inp.value)||0);channelData[rangeKey(inp.dataset.channel)]=v;saveChannelData();renderAll()};
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit()}};
    inp.onblur=()=>{const v=Math.max(0,Number(inp.value)||0);if(v!==channelDataValue(inp.dataset.channel))commit()}
  })
}
function renderSales(rows){
  const stats=Object.entries(group(rows,x=>x.salesStaff||'Chưa gán')).map(([name,r])=>({name,...overview(r)})).sort((a,b)=>b.createdRevenue-a.createdRevenue);
  $('staffRows').innerHTML=stats.map(x=>`<tr><td>${esc(x.name)}</td><td>${compact(x.createdRevenue)}</td><td>${compact(x.successfulRevenue)}</td><td>${numFmt(x.orders)}</td><td>${numFmt(x.successfulOrders)}</td><td>${compact(x.pendingRevenue)}</td><td>${compact(x.shippingRevenue)}</td><td>${compact(x.returnRevenue)}</td><td class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td><td>${compact(x.aov)}</td></tr>`).join('')||'<tr><td colspan="10">Không có dữ liệu</td></tr>';
  drawGroupedBars($('staffChart'),stats.slice(0,12).map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),true);
  drawSingleBars($('staffReturnChart'),stats.slice(0,12).map(x=>({label:x.name,value:x.returnRate*100})),{percentMode:true})
}
function renderMonthly(){
  const month=($('from').value||vnDate()).slice(0,7),rows=filteredIgnoringDate(month),days=daysInMonth(month),g=group(rows,x=>orderDate(x)),dailyTarget=effectiveDailyTarget(month),tm=targetMonth(),daily=[],cumulative=[];let run=0;
  for(let d=1;d<=days;d++){const key=`${month}-${pad(d)}`,rr=g[key]||[],o=overview(rr);run+=o.createdRevenue;daily.push({label:key,value:o.createdRevenue-dailyTarget,created:o.createdRevenue,success:o.successfulRevenue,orders:o.orders});cumulative.push({label:key,actual:run,target:tm*d/days})}
  const nowMonth=month===vnDate().slice(0,7),lastDay=nowMonth?Number(vnDate().slice(8,10)):days,actualToDate=cumulative[Math.max(0,lastDay-1)]?.actual||0,time=lastDay/days,completion=tm?actualToDate/tm:0,gapPts=(completion-time)*100,forecast=lastDay?actualToDate/lastDay*days:0;
  $('monthlyKpis').innerHTML=[mini('Target tháng',compact(tm)),mini('Đã đạt',compact(actualToDate)),mini('% hoàn thành',pct(completion)),mini('Tiến độ thời gian',pct(time)),mini('Dự báo cuối tháng',compact(forecast))].join('');
  drawLineChart($('cumulativeChart'),cumulative.slice(0,lastDay),[{key:'actual',class:'lineRed',point:'pointRed'},{key:'target',class:'lineTarget',point:'pointDark'}],null);
  drawSingleBars($('dailyGapChart'),daily.slice(0,lastDay),{moneyMode:true,positiveNegative:true});
  $('dailyRows').innerHTML=daily.slice(0,lastDay).reverse().map(d=>`<tr><td>${d.label.split('-').reverse().slice(0,2).join('/')}</td><td>${compact(d.created)}</td><td>${compact(d.success)}</td><td>${compact(dailyTarget)}</td><td class="${d.value>=0?'good':'bad'}">${d.value>=0?'+':''}${compact(d.value)}</td><td>${pct(dailyTarget?d.created/dailyTarget:0)}</td><td>${d.orders}</td></tr>`).join('');
  const gapText=`${gapPts>=0?'Vượt':'Chậm'} ${Math.abs(gapPts).toFixed(2).replace('.',',')} điểm %`;
  document.querySelector('#view-monthly .sectionHead p').textContent=`Nhịp tháng ${month} · ${gapText}`
}
function quickReportRows(){
  const from=$('from').value,to=$('to').value;
  return sourceOrders.filter(o=>{
    const d=orderDate(o);
    return (!from||d>=from)&&(!to||d<=to)&&!isDefaultExcluded(o)
  })
}
function quickReportStats(){
  const rows=quickReportRows();
  const adsRows=rows.filter(o=>o.channel==='Facebook Ads');
  const liveRows=rows.filter(o=>o.channel==='Livestream');
  const adsData=channelDataValue('Facebook Ads');
  const totalData=quickTotalDataValue();
  const adsRevenue=sum(adsRows,o=>o.netAmount??o.totalAmount);
  const liveRevenue=sum(liveRows,o=>o.netAmount??o.totalAmount);
  const adsOrders=adsRows.length;
  return {
    totalData,adsData,adsOrders,
    adsCr:adsData?adsOrders/adsData:null,
    adsRevenue,liveRevenue
  }
}
function quickReportText(s=quickReportStats()){
  return [
    `Data mới toàn kênh: ${s.totalData?numFmt(s.totalData):'Chưa nhập'}`,
    `Data Ads: ${s.adsData?numFmt(s.adsData):'Chưa nhập'}`,
    `CR Ads: ${pct(s.adsCr)}`,
    `Doanh số Ads: ${money(s.adsRevenue)}`,
    `Doanh số live: ${money(s.liveRevenue)}`
  ].join('\n')
}
function renderQuickReport({syncInputs=true}={}){
  const s=quickReportStats();
  $('quickPeriod').textContent=`${$('from').value} → ${$('to').value} · Tự động bỏ Huỷ/Xoá + Đơn đổi`;
  if(syncInputs){
    $('quickTotalData').value=s.totalData||'';
    $('quickAdsData').value=s.adsData||'';
  }
  $('quickAdsCr').textContent=pct(s.adsCr);
  $('quickAdsCrSub').textContent=s.adsData?`${numFmt(s.adsOrders)} đơn Ads / ${numFmt(s.adsData)} data`:'Nhập Data Ads để tính CR';
  $('quickAdsRevenue').textContent=money(s.adsRevenue);
  $('quickLiveRevenue').textContent=money(s.liveRevenue);
  $('quickTextBox').textContent=quickReportText(s)
}
function openQuickReport(){
  renderQuickReport({syncInputs:true});
  $('quickReportDialog').showModal();
  setTimeout(()=>$('quickTotalData').focus(),60)
}
function updateQuickTotalDataFromInput(){
  quickTotalDataStore[currentDateRangeKey()]=Math.max(0,Number($('quickTotalData').value)||0);
  saveQuickTotalData();
  renderQuickReport({syncInputs:false})
}
function updateQuickAdsDataFromInput(){
  channelData[rangeKey('Facebook Ads')]=Math.max(0,Number($('quickAdsData').value)||0);
  saveChannelData();
  renderQuickReport({syncInputs:false})
}
async function copyQuickReport(){
  const report=quickReportText();
  let copied=false;
  try{
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(report);
      copied=true
    }
  }catch{}
  if(!copied){
    try{
      const ta=document.createElement('textarea');
      ta.value=report;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();copied=document.execCommand('copy');ta.remove()
    }catch{}
  }
  if(copied){
    const btn=$('copyQuickReportBtn'),old=btn.textContent;
    btn.textContent='Đã sao chép';btn.classList.add('copyDone');
    setTimeout(()=>{btn.textContent=old;btn.classList.remove('copyDone')},1400)
  }else{
    showError('Trình duyệt chưa cho phép sao chép tự động.')
  }
}

function switchView(view){
  currentView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));
  document.querySelectorAll('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={overview:'Tổng quan doanh thu',channels:'Hiệu quả theo kênh',sales:'Sale Online',monthly:'Tiến độ tháng'};
  $('pageTitle').textContent=titles[view]||titles.overview;renderAll();window.scrollTo({top:0,behavior:'smooth'})
}
function openSettings(){
  $('targetMonthInput').value=Math.round(targetMonth());
  $('targetDayInput').value=Math.round(targetDay());
  $('gapDayInput').value=Math.round(gapDay());
  $('settingsDialog').showModal()
}
function showError(msg){$('error').textContent=msg;$('error').style.display='block';setTimeout(()=>$('error').style.display='none',7000)}
async function tryAutoLive(){
  const saved=sessionStorage.getItem('sevenam_dashboard_password');if(!saved)return false;
  try{applyPayload(await fetchLive(saved));return true}catch{sessionStorage.removeItem('sevenam_dashboard_password');return false}
}
async function init(){
  dateRange('today');sourceOrders=mockData();setMode('DEMO');populateFilters();renderAll();await tryAutoLive();
  setInterval(async()=>{if(meta.source==='PANCAKE'){const pwd=sessionStorage.getItem('sevenam_dashboard_password');if(pwd)try{applyPayload(await fetchLive(pwd))}catch(e){showError('Chưa tải được bản sync mới: '+e.message)}}},60000)
}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>dateRange(b.dataset.range));
['from','to','channel','staff','status'].forEach(id=>$(id).onchange=()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));renderAll()});
document.querySelectorAll('.navBtn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$(b.dataset.closeDialog).close());
$('settingsBtn').onclick=openSettings;$('openSettingsInline').onclick=openSettings;$('openSettingsMonthly').onclick=openSettings;
$('quickReportBarBtn').onclick=openQuickReport;
$('quickTotalData').oninput=updateQuickTotalDataFromInput;
$('quickAdsData').oninput=updateQuickAdsDataFromInput;
$('quickTotalData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickTotalDataFromInput()}};
$('quickAdsData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickAdsDataFromInput();renderAll()}};
$('quickAdsData').onblur=()=>{updateQuickAdsDataFromInput();renderAll()};
$('copyQuickReportBtn').onclick=copyQuickReport;
$('settingsForm').onsubmit=e=>{e.preventDefault();settings.targetMonth=Math.max(0,Number($('targetMonthInput').value)||0);settings.targetDay=Math.max(0,Number($('targetDayInput').value)||0);settings.gapDay=Number($('gapDayInput').value)||0;saveSettings();$('settingsDialog').close();renderAll()};
$('unlockBtn').onclick=()=>{$('unlockError').style.display='none';$('password').value='';$('unlockDialog').showModal();setTimeout(()=>$('password').focus(),50)};
$('unlockForm').onsubmit=async e=>{e.preventDefault();const pwd=$('password').value,box=$('unlockError');box.style.display='none';try{$('app').classList.add('loading');const p=await fetchLive(pwd);sessionStorage.setItem('sevenam_dashboard_password',pwd);applyPayload(p);$('unlockDialog').close()}catch(err){box.textContent='Không mở được dữ liệu: sai mật khẩu hoặc bản LIVE chưa sẵn sàng.';box.style.display='block'}finally{$('app').classList.remove('loading')}};
$('reloadBtn').onclick=async()=>{const pwd=sessionStorage.getItem('sevenam_dashboard_password');if(meta.source==='PANCAKE'&&pwd)try{$('app').classList.add('loading');applyPayload(await fetchLive(pwd))}catch(e){showError(e.message)}finally{$('app').classList.remove('loading')}else renderAll()};
init();
