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
let sourceOrders=[],meta={source:'DEMO',lastUpdated:new Date().toISOString()},payloadMonthlyTarget=2300000000,currentView='overview',productPeriod='day';

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
const DIRECT_PANCAKE_API=location.hostname.endsWith('.vercel.app')
  ? '/api/pancake'
  : 'https://sevenam-pancake-live.vercel.app/api/pancake';
const STATIC_PANCAKE_SNAPSHOT='https://zxcvbnm22121.github.io/BaoCao/data/live.enc';
async function fetchLiveStatic(password){
  const r=await fetch(STATIC_PANCAKE_SNAPSHOT+'?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('Chưa có bản dữ liệu LIVE dự phòng');
  return decryptEnvelope(await r.json(),password)
}
async function callPancakeBackend(password,action='live',timeoutMs=55000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(DIRECT_PANCAKE_API,{
      method:'POST',
      mode:'cors',
      cache:'no-store',
      headers:{'Content-Type':'application/json','X-Dashboard-Password':password},
      body:JSON.stringify({action}),
      signal:controller.signal
    });
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||('Backend Pancake '+r.status));
    return body
  }finally{clearTimeout(timer)}
}
async function fetchLiveDirect(password){
  return callPancakeBackend(password,'live',55000)
}
async function fetchLiveOpen(password){
  return callPancakeBackend(password,'open',12000)
}
async function fetchLiveDelta(password){
  return callPancakeBackend(password,'delta',30000)
}
async function fetchLive(password,{directOnly=false}={}){
  try{return await fetchLiveDirect(password)}
  catch(error){
    if(directOnly)throw error;
    console.warn('Direct Pancake backend unavailable; using encrypted GitHub fallback.',error);
    return fetchLiveStatic(password)
  }
}
async function openLiveFast(password){
  // Login no longer decrypts in the browser. The backend authenticates the
  // password and returns the latest snapshot immediately.
  return fetchLiveOpen(password)
}

function applyPayload(p){
  if(!p||!Array.isArray(p.orders))throw new Error('Bản dữ liệu Pancake không hợp lệ');
  verifySnapshot(p);
  sourceOrders=p.orders;
  meta=p.meta||meta;
  payloadMonthlyTarget=Number(p.monthlyTarget)||2300000000;
  if(settings.targetMonth==null) settings.targetMonth=payloadMonthlyTarget;
  setMode(meta.source==='PANCAKE'?'LIVE':'DEMO');
  populateFilters();
  renderAll()
}
function mergeLiveDelta(p){
  if(!p||!Array.isArray(p.orders))throw new Error('Bản cập nhật Pancake không hợp lệ');
  if(!p.meta?.partial)return applyPayload(p);
  verifySnapshot(p);

  const from=String(p.meta.from||''),to=String(p.meta.to||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){
    throw new Error('Khoảng cập nhật Pancake không hợp lệ')
  }

  const previousMeta=meta||{};
  const kept=sourceOrders.filter(o=>{
    const d=orderDate(o);
    return d<from||d>to
  });
  const mergedOrders=[...kept,...p.orders];

  const mergedRecon={...(previousMeta.dayReconciliation||{})};
  Object.keys(mergedRecon).forEach(day=>{if(day>=from&&day<=to)delete mergedRecon[day]});
  Object.assign(mergedRecon,p.meta.dayReconciliation||{});

  const mergedFrom=previousMeta.from&&previousMeta.from<from?previousMeta.from:from;
  const mergedTo=previousMeta.to&&previousMeta.to>to?previousMeta.to:to;
  const mergedMeta={
    ...previousMeta,
    ...p.meta,
    partial:false,
    transport:'VERCEL_DIRECT',
    from:mergedFrom,
    to:mergedTo,
    count:mergedOrders.length,
    dayReconciliation:mergedRecon
  };

  verifySnapshot({orders:mergedOrders,meta:{dayReconciliation:mergedRecon}});
  sourceOrders=mergedOrders;
  meta=mergedMeta;
  payloadMonthlyTarget=Number(p.monthlyTarget)||payloadMonthlyTarget||2300000000;
  setMode('LIVE');
  populateFilters();
  renderAll()
}

function setMode(mode){
  const live=mode==='LIVE';
  $('modePill').textContent=live?'LIVE':'CHƯA MỞ';
  $('modePill').classList.toggle('demo',!live);
  const direct=live&&meta.transport==='VERCEL_DIRECT';
  const serverSnapshot=live&&meta.transport==='VERCEL_SNAPSHOT';
  $('sourceText').textContent=live?(direct?'PANCAKE · TRỰC TIẾP':serverSnapshot?'PANCAKE · ĐANG CẬP NHẬT':'PANCAKE · DỰ PHÒNG'):'CHƯA MỞ LIVE';
  $('sourceSub').textContent=live?(direct?'Backend cập nhật trực tiếp':serverSnapshot?'Đã mở dữ liệu, đang lấy bản mới':'Bản mã hóa GitHub dự phòng'):'Không hiển thị số liệu giả';
  updateDataFreshness();
}
function updateDataFreshness(){
  const note=$('notice');
  if(meta.source!=='PANCAKE'){
    note.style.display='block';
    note.innerHTML='Chưa mở dữ liệu Pancake LIVE. Bấm biểu tượng 🔒 để nhập mật khẩu. <b>Website không hiển thị doanh số DEMO.</b>';
    return;
  }
  const updatedMs=Date.parse(meta.lastUpdated||'');
  const ageMinutes=Number.isFinite(updatedMs)?Math.max(0,Math.floor((Date.now()-updatedMs)/60000)):Infinity;
  const messages=[];
  const error=reportCoverageError();
  if(error)messages.push('⚠ '+esc(error));
  const direct=meta.transport==='VERCEL_DIRECT';
  const staleAfter=direct?2:6;
  if(ageMinutes>=staleAfter){
    const when=Number.isFinite(updatedMs)?new Date(updatedMs).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'không xác định';
    messages.push(direct
      ? `⚠ Backend trực tiếp chưa cập nhật trong <b>${ageMinutes} phút</b> (lần cuối ${esc(when)}). Hệ thống sẽ tự thử lại.`
      : `⚠ Đang dùng bản GitHub dự phòng, cập nhật lần cuối lúc <b>${esc(when)}</b> (${Number.isFinite(ageMinutes)?ageMinutes+' phút trước':'chưa rõ thời gian'}).`);
  }
  note.style.display=messages.length?'block':'none';
  note.innerHTML=messages.join(' ');
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
  if($('productAnchor'))$('productAnchor').value=to;
  document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range===kind));
  renderAll()
}

function orderDate(o){
  if(o&&/^\d{4}-\d{2}-\d{2}$/.test(String(o.createdDate||'')))return String(o.createdDate);
  const d=new Date(o?.createdAt||'');
  return Number.isFinite(d.getTime())?vnDate(d):''
}
function selectedCalendarDays(){
  const from=$('from').value,to=$('to').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return [];
  const first=Date.parse(from+'T12:00:00Z'),last=Date.parse(to+'T12:00:00Z');
  if(!Number.isFinite(first)||!Number.isFinite(last)||last-first>366*86400000)return [];
  const days=[];
  for(let t=first;t<=last;t+=86400000)days.push(new Date(t).toISOString().slice(0,10));
  return days
}
function reportTimeProgress(days){
  if(!days.length)return 0;
  const today=vnDate();
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const hh=Number(parts.find(x=>x.type==='hour')?.value||0);
  const mm=Number(parts.find(x=>x.type==='minute')?.value||0);
  const fraction=(hh*60+mm)/1440;
  return days.reduce((sum,day)=>sum+(day<today?1:day===today?fraction:0),0)/days.length
}
function periodTarget(days){return days.reduce((sum,date)=>sum+effectiveDailyTarget(date.slice(0,7)),0)}
function reportCoverageError(){
  if(meta.source!=='PANCAKE')return '';
  const from=$('from').value,to=$('to').value;
  if(!selectedCalendarDays().length)return 'Khoảng ngày không hợp lệ. Từ ngày phải trước hoặc bằng Đến ngày.';
  if((meta.from&&from<meta.from)||(meta.to&&to>meta.to))
    return 'Dữ liệu đã đồng bộ chỉ từ '+(meta.from||'?')+' đến '+(meta.to||'?')+'. Khoảng đang chọn '+from+' → '+to+' ngoài phạm vi nguồn.';
  return ''
}
function verifySnapshot(p){
  const expected=p?.meta?.dayReconciliation;
  if(!expected)return;
  const actual={};
  for(const o of p.orders||[]){
    if(isDefaultExcluded(o))continue;
    const date=orderDate(o);
    if(!actual[date])actual[date]={orders:0,net:0,cod:0,prepaid:0,gross:0};
    const d=actual[date];
    d.orders++;d.net+=orderRevenue(o);
    d.cod+=Number(o.codAmount)||0;
    d.prepaid+=Number(o.prepaidAmount)||0;
    d.gross+=Number(o.grossAmount??o.totalAmount)||0;
  }
  if(Object.keys(expected).length!==Object.keys(actual).length)throw new Error('Dữ liệu Pancake không khớp số ngày báo cáo');
  for(const [day,ref] of Object.entries(expected)){
    const d=actual[day];
    if(!d||d.orders!==ref.orders||['cod','prepaid','gross'].some(k=>Math.abs(d[k]-ref[k])>.01))
      throw new Error('Dữ liệu đồng bộ chưa khớp tại ngày '+day);
  }
}

function orderHour(o){
  try{return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',hour:'2-digit',hour12:false}).format(new Date(o.createdAt))+'h'}catch{return'—'}
}
function populateFilters(){
  const fill=(id,vals)=>{const el=$(id),old=el.value;el.innerHTML=['Tất cả',...Array.from(new Set(vals.filter(Boolean))).sort()].map(x=>`<option>${esc(x)}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old};
  fill('channel',sourceOrders.map(x=>x.channel));
  fill('productChannel',sourceOrders.map(x=>x.channel));
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
function orderRevenue(o){
  // Single source of truth for Pancake headline revenue:
  // Tổng tiền sau CK = COD + Trả trước.
  return (Number(o?.codAmount)||0)+(Number(o?.prepaidAmount)||0)
}
function successful(o){
  if(o?.status==='THANH_CONG')return orderRevenue(o);
  if(o?.isPartialReturn)return (Number(o?.codAmount)||0)||(Number(o?.successfulAmount)||0);
  return Number(o?.successfulAmount)||0
}
function overview(rows){
  const net=sum(rows,orderRevenue),gross=sum(rows,x=>x.grossAmount??x.totalAmount),success=sum(rows,successful),returns=rows.filter(x=>x.status==='HOAN');
  const cod=sum(rows,x=>x.codAmount??0),prepaid=sum(rows,x=>x.prepaidAmount??0),discount=sum(rows,x=>Math.max(0,(Number(x.grossAmount??x.totalAmount)||0)-orderRevenue(x)));
  return {
    createdRevenue:net,grossRevenue:gross,discountRevenue:discount,codRevenue:cod,prepaidRevenue:prepaid,
    successfulRevenue:success,orders:rows.length,
    successfulOrders:rows.filter(x=>successful(x)>0||x.status==='THANH_CONG').length,
    pendingRevenue:sum(rows,x=>x.status==='TREO'?orderRevenue(x):0),
    shippingRevenue:sum(rows,x=>x.status==='DANG_GIAO'?orderRevenue(x):0),
    returnRevenue:sum(rows,x=>x.status==='HOAN'?orderRevenue(x):0),
    cancelledRevenue:sum(rows,x=>x.status==='HUY'?orderRevenue(x):0),
    returnRate:rows.length?returns.length/rows.length:0,
    aov:rows.length?net/rows.length:0
  }
}
function group(rows,key){const m={};for(const r of rows)(m[key(r)]??=[]).push(r);return m}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function daysInMonth(month){const [y,m]=month.split('-').map(Number);return new Date(y,m,0).getDate()}
const KPI_CHANNELS=[
  {key:'ads',channel:'Facebook Ads',label:'Ads'},
  {key:'live',channel:'Livestream',label:'Live'},
  {key:'zalo',channel:'Zalo/CSKH',label:'Zalo'},
  {key:'website',channel:'Website',label:'Website'}
];
function hasChannelTargets(){return Boolean(settings.channelTargetsConfigured)}
function channelTargetMonth(channel){
  const cfg=settings.channelTargets||{};
  const item=KPI_CHANNELS.find(x=>x.channel===channel);
  return item?Math.max(0,Number(cfg[item.key])||0):0
}
function targetMonth(channel=$('channel')?.value||'Tất cả'){
  if(hasChannelTargets()){
    if(channel&&channel!=='Tất cả')return channelTargetMonth(channel);
    return KPI_CHANNELS.reduce((n,x)=>n+channelTargetMonth(x.channel),0)
  }
  return Number(settings.targetMonth)||payloadMonthlyTarget||2300000000
}
function targetDay(month=$('from').value.slice(0,7)||vnDate().slice(0,7),channel=$('channel')?.value||'Tất cả'){
  return Math.round(targetMonth(channel)/daysInMonth(month))
}
function effectiveDailyTarget(month,channel=$('channel')?.value||'Tất cả'){
  return Math.max(0,targetDay(month,channel))
}
function rangeKey(channel){return `${$('from').value}|${$('to').value}|${channel}`}
function channelDataValue(channel){return Number(channelData[rangeKey(channel)])||0}
function totalManualData(rows){
  const channels=Array.from(new Set(rows.map(x=>x.channel)));
  return channels.reduce((a,c)=>a+channelDataValue(c),0)
}
function gapClass(v){return v<-10?'red':v<=10?'orange':v<=20?'blue':'green'}
function card(label,value,sub,primary=false,drillType='',drillValue='',drillTitle=''){
  const attrs=drillType?` data-drill-type="${esc(drillType)}" data-drill-value="${esc(drillValue)}" data-drill-title="${esc(drillTitle||label)}"`:'';
  return `<div class="card${primary?' primary':''}${drillType?' clickable':''}"${attrs}><span class="cardLabel">${label}</span><strong class="cardValue">${value}</strong><span class="cardSub">${sub||''}</span></div>`
}
function mini(label,value,cls=''){return `<div class="miniKpi ${cls}"><span>${label}</span><b>${value}</b></div>`}


function currentFilterLabel(){
  const parts=[];
  if($('channel').value!=='Tất cả')parts.push($('channel').value);
  if($('staff').value!=='Tất cả')parts.push($('staff').value);
  if($('status').value!=='Tất cả')parts.push(statusLabels[$('status').value]||$('status').value);
  return parts.length?parts.join(' · '):'Tất cả kênh · Sale · trạng thái'
}
function drillRows(type,value){
  if(type==='excluded'){
    const from=$('from').value,to=$('to').value;
    return sourceOrders.filter(o=>{const d=orderDate(o);return d>=from&&d<=to&&isDefaultExcluded(o)})
  }
  let rows=filteredRows();
  if(type==='status')rows=rows.filter(o=>o.status===value);
  else if(type==='statusCodes'){const codes=String(value).split(',').map(Number);rows=rows.filter(o=>codes.includes(Number(o.statusCode)))}
  else if(type==='successful')rows=rows.filter(o=>successful(o)>0||o.status==='THANH_CONG');
  else if(type==='channel')rows=rows.filter(o=>o.channel===value);
  else if(type==='staff')rows=rows.filter(o=>(o.salesStaff||'Chưa gán')===value);
  else if(type==='returnReason')rows=rows.filter(o=>o.status==='HOAN'&&returnReasonLabel(o)===value);
  return rows
}
function formatOrderTime(o){
  const d=new Date(o.createdAt||'');
  return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):orderDate(o)
}
function returnReasonLabel(o){return String(o.returnedReasonName||'').trim()||'Chưa ghi lý do'}
function openOrderDrill(type,value,title){
  const rows=drillRows(type,value).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const k=overview(rows),shown=rows.slice(0,300);
  $('orderDrillTitle').textContent=title||'Danh sách đơn';
  $('orderDrillMeta').textContent=`${$('from').value} → ${$('to').value} · ${currentFilterLabel()}`;
  $('orderDrillSummary').innerHTML=[
    `<span><b>${numFmt(rows.length)}</b> đơn</span>`,
    `<span>Tổng <b>${money(k.createdRevenue)}</b></span>`,
    `<span>Thành công <b>${money(k.successfulRevenue)}</b></span>`,
    rows.length>300?`<span>Đang hiển thị 300/${numFmt(rows.length)} đơn</span>`:''
  ].join('');
  $('orderDrillRows').innerHTML=shown.map(o=>`<tr>
    <td data-label="Mã đơn">${esc(o.orderCode||'—')}</td>
    <td data-label="Ngày giờ">${esc(formatOrderTime(o))}</td>
    <td data-label="Sale">${esc(o.salesStaff||'Chưa gán')}</td>
    <td data-label="Kênh">${esc(o.channel||'Khác')}</td>
    <td data-label="Trạng thái">${esc(statusLabels[o.status]||o.status||'—')}</td>
    <td data-label="Sau CK">${money(orderRevenue(o))}</td>
    <td data-label="Lý do hoàn">${o.status==='HOAN'?esc(returnReasonLabel(o)):'—'}</td>
  </tr>`).join('')||'<tr><td colspan="7">Không có đơn phù hợp bộ lọc.</td></tr>';
  $('orderDrillDialog').showModal()
}
function bindDrilldowns(){
  document.querySelectorAll('[data-drill-type]').forEach(el=>{
    el.onclick=e=>{
      if(e.target.closest('input,button,select,a'))return;
      openOrderDrill(el.dataset.drillType,el.dataset.drillValue||'',el.dataset.drillTitle||'Chi tiết đơn')
    }
  })
}
function renderLiveAlerts(rows){
  const alerts=[],days=selectedCalendarDays(),k=overview(rows),goal=periodTarget(days),time=reportTimeProgress(days);
  const completion=goal?k.createdRevenue/goal:0,gapPts=(completion-time)*100;
  if(gapPts<-10)alerts.push({level:'bad',title:'Doanh số đang chậm tiến độ',text:`Chậm ${Math.abs(gapPts).toFixed(1).replace('.',',')} điểm % so với tiến độ thời gian.`});

  const ads=rows.filter(o=>o.channel==='Facebook Ads'),adsData=channelDataValue('Facebook Ads');
  if(adsData>0&&ads.length/adsData<.10)alerts.push({level:'bad',title:'CR Ads dưới 10%',text:`${numFmt(ads.length)} đơn / ${numFmt(adsData)} data = ${pct(ads.length/adsData)}.`});

  const todayOnly=$('from').value===vnDate()&&$('to').value===vnDate();
  const liveRevenue=sum(rows.filter(o=>o.channel==='Livestream'),orderRevenue);
  if(todayOnly&&liveRevenue<=0)alerts.push({level:'warn',title:'Livestream chưa có doanh số',text:'Chưa ghi nhận doanh số Live trong dữ liệu hôm nay.'});

  if(k.returnRate>.20)alerts.push({level:'bad',title:'Tỷ lệ hoàn trên 20%',text:`Hiện tại ${pct(k.returnRate)} · ${numFmt(rows.filter(o=>o.status==='HOAN').length)} đơn hoàn.`});

  const age=(Date.now()-Date.parse(meta.lastUpdated||''))/60000;
  const stale=meta.transport==='VERCEL_DIRECT'?2:6;
  if(Number.isFinite(age)&&age>=stale)alerts.push({level:'warn',title:'Dữ liệu chưa đủ mới',text:`Lần cập nhật gần nhất ${Math.floor(age)} phút trước.`});

  if(!alerts.length)alerts.push({level:'good',title:'Chưa có cảnh báo theo ngưỡng',text:'Tiến độ, CR Ads, Live, hoàn và độ mới dữ liệu chưa chạm ngưỡng cảnh báo.'});
  $('alertHealth').textContent=alerts.some(a=>a.level==='bad')?'CẦN XỬ LÝ':alerts.some(a=>a.level==='warn')?'THEO DÕI':'ỔN';
  $('alertHealth').className='healthPill '+(alerts.some(a=>a.level==='bad')?'bad':alerts.some(a=>a.level==='warn')?'warn':'good');
  $('liveAlerts').innerHTML=alerts.map(a=>`<div class="alertItem ${a.level}"><i></i><div><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></div>`).join('')
}
function renderReconciliation(rows){
  const k=overview(rows),checks=[];
  const total=k.createdRevenue,eps=.01;
  const channelTotal=Object.values(group(rows,o=>o.channel||'Khác')).reduce((n,r)=>n+overview(r).createdRevenue,0);
  const staffTotal=Object.values(group(rows,o=>o.salesStaff||'Chưa gán')).reduce((n,r)=>n+overview(r).createdRevenue,0);
  const statusTotal=Object.values(group(rows,o=>o.status||'TREO')).reduce((n,r)=>n+overview(r).createdRevenue,0);
  checks.push({name:'Tổng theo kênh',ok:Math.abs(channelTotal-total)<eps,value:channelTotal});
  checks.push({name:'Tổng theo Sale',ok:Math.abs(staffTotal-total)<eps,value:staffTotal});
  checks.push({name:'Tổng theo trạng thái',ok:Math.abs(statusTotal-total)<eps,value:statusTotal});

  const noDimensionFilter=$('channel').value==='Tất cả'&&$('staff').value==='Tất cả'&&$('status').value==='Tất cả';
  if(noDimensionFilter&&meta.dayReconciliation){
    const dates=selectedCalendarDays(),refs=dates.map(d=>meta.dayReconciliation[d]).filter(Boolean);
    const expected={orders:sum(refs,x=>x.orders),net:sum(refs,x=>x.net),cod:sum(refs,x=>x.cod),prepaid:sum(refs,x=>x.prepaid)};
    checks.push({name:'Khớp nguồn API · số đơn',ok:expected.orders===rows.length,text:`${numFmt(rows.length)} / ${numFmt(expected.orders)} đơn`});
    checks.push({name:'Khớp nguồn API · sau CK',ok:Math.abs(expected.net-total)<eps,text:`${money(total)} / ${money(expected.net)}`});
    checks.push({name:'Khớp nguồn API · COD + trả trước',ok:Math.abs((expected.cod+expected.prepaid)-(k.codRevenue+k.prepaidRevenue))<eps,text:`${money(k.codRevenue+k.prepaidRevenue)} / ${money(expected.cod+expected.prepaid)}`});
  }else{
    checks.push({name:'Đối soát nguồn API',ok:true,text:'Đang có bộ lọc · kiểm tra nội bộ'});
  }
  const bad=checks.filter(x=>!x.ok);
  $('reconcileHealth').textContent=bad.length?'CÓ LỆCH':'DỮ LIỆU OK';
  $('reconcileHealth').className='healthPill '+(bad.length?'bad':'good');
  $('reconcileBoard').innerHTML=checks.map(x=>`<div class="reconcileRow ${x.ok?'':'bad'}"><span>${esc(x.name)}</span><b>${x.text?esc(x.text):money(x.value)} ${x.ok?'✓':'✕'}</b></div>`).join('')
}
function renderFunnel(rows){
  const k=overview(rows),data=totalManualData(rows),orders=Math.max(1,rows.length);
  const stage=(label,rr,value,type='',drillValue='')=>{
    const count=rr==null?'—':numFmt(rr.length),share=rr==null?'':` · ${pct(rr.length/orders)}`;
    return `<div class="funnelStage ${type?'clickable':''}" ${type?`data-drill-type="${type}" data-drill-value="${esc(drillValue)}" data-drill-title="${esc(label)}"`:''}><strong>${label}</strong><span>${count}${share}</span><b>${value}</b></div>`
  };
  const pending=rows.filter(o=>o.status==='TREO'),shipping=rows.filter(o=>o.status==='DANG_GIAO'),success=rows.filter(o=>o.status==='THANH_CONG'),returns=rows.filter(o=>o.status==='HOAN');
  $('funnelBoard').innerHTML=[
    `<div class="funnelStage"><strong>Data</strong><span>${data?numFmt(data):'Chưa nhập'}</span><b>${data?'CR '+pct(rows.length/data):'—'}</b></div>`,
    stage('Tạo đơn',rows,money(k.createdRevenue),'all',''),
    stage('Treo',pending,money(sum(pending,orderRevenue)),'status','TREO'),
    stage('Đang giao',shipping,money(sum(shipping,orderRevenue)),'status','DANG_GIAO'),
    stage('Thành công',rows.filter(o=>successful(o)>0||o.status==='THANH_CONG'),money(k.successfulRevenue),'successful',''),
    stage('Hoàn',returns,money(k.returnRevenue),'status','HOAN')
  ].join('')
}
function renderReturnReasons(rows){
  const returns=rows.filter(o=>o.status==='HOAN'),g=group(returns,returnReasonLabel);
  const list=Object.entries(g).map(([reason,r])=>({reason,rows:r,count:r.length,value:sum(r,orderRevenue)})).sort((a,b)=>b.count-a.count||b.value-a.value);
  const missing=returns.filter(o=>returnReasonLabel(o)==='Chưa ghi lý do').length;
  $('returnReasonSummary').textContent=`${numFmt(returns.length)} đơn hoàn${missing?' · '+missing+' chưa có lý do':''}`;
  $('returnReasonList').innerHTML=list.length?list.map(x=>`<div class="returnReasonRow clickable" data-drill-type="returnReason" data-drill-value="${esc(x.reason)}" data-drill-title="Hoàn · ${esc(x.reason)}">
    <strong>${esc(x.reason)}</strong>
    <span>${numFmt(x.count)} đơn</span>
    <span class="returnReasonPct">${pct(returns.length?x.count/returns.length:0)}</span>
    <span class="moneyCell">${money(x.value)}</span>
  </div>`).join(''):'<div class="returnReasonEmpty">Không có đơn hoàn trong khoảng đang chọn.</div>'
}
function renderOperationalPanels(rows){
  renderLiveAlerts(rows);
  renderReconciliation(rows);
  renderFunnel(rows);
  renderReturnReasons(rows)
}
function renderSaleLeaderboard(rows){
  const stats=Object.entries(group(rows,o=>o.salesStaff||'Chưa gán'))
    .map(([name,r])=>({name,rows:r,...overview(r)}))
    .sort((a,b)=>b.createdRevenue-a.createdRevenue)
    .slice(0,3);
  $('saleLeaderboard').innerHTML=stats.map((x,i)=>`<article class="saleRankCard clickable" data-drill-type="staff" data-drill-value="${esc(x.name)}" data-drill-title="Sale · ${esc(x.name)}">
    <div class="saleRankNo">#${i+1} SALE</div><h4>${esc(x.name)}</h4><div class="saleRankRevenue">${money(x.createdRevenue)}</div>
    <div class="saleRankMeta"><div><span>Đơn</span><b>${numFmt(x.orders)}</b></div><div><span>Thành công</span><b>${numFmt(x.successfulOrders)}</b></div><div><span>Hoàn</span><b>${pct(x.returnRate)}</b></div></div>
  </article>`).join('')||'<div class="returnReasonEmpty">Không có dữ liệu Sale.</div>'
}

function renderAll(){
  if(meta.source!=='PANCAKE'){
    $('kpis').innerHTML=card('DOANH SỐ PANCAKE','Chưa mở LIVE','Nhập mật khẩu qua nút 🔒 để xem tổng tiền thực tế',true);
    $('periodStat').textContent=`${$('from').value} → ${$('to').value} · Chưa có dữ liệu LIVE`;
    ['channelChart','trendChart','statusChart','staffChart','staffReturnChart','channelCompareChart','channelCrChart','monthlyChart'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    ['targetPanel','channelRows','staffRows','dailyRows','statusBreakdown','statusDetail','channelDataSummary','liveAlerts','reconcileBoard','funnelBoard','returnReasonList','saleLeaderboard','productKpis','productRows','productRangeSummary','productDataNote'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    $('updatedAt').textContent='Chưa mở Pancake LIVE';
    $('pageSub').textContent='Chưa có dữ liệu Pancake đã xác thực';
    updateDataFreshness();
    return;
  }
  updateDataFreshness();
  const coverageError=reportCoverageError();
  if(coverageError){
    $('kpis').innerHTML=card('CHƯA CÓ ĐỦ DỮ LIỆU','Không thể đối soát',esc(coverageError),true);
    $('periodStat').textContent=$('from').value+' → '+$('to').value+' · Khoảng lọc chưa hợp lệ';
    ['targetPanel','channelRows','staffRows','dailyRows','statusViz','statusDetail','monthlyKpis','channelDataSummary','liveAlerts','reconcileBoard','funnelBoard','returnReasonList','saleLeaderboard','productKpis','productRows','productRangeSummary','productDataNote'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    ['trendChart','channelChart','staffChart','staffReturnChart','channelCompareChart','channelCrChart','cumulativeChart','dailyGapChart'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    $('updatedAt').textContent='Khoảng lọc nằm ngoài dữ liệu đã đồng bộ';
    return;
  }
  const rows=filteredRows(),k=overview(rows),data=totalManualData(rows);
  $('kpis').innerHTML=[
    card('Tổng tiền sau CK',money(k.createdRevenue),`${numFmt(k.orders)} đơn · tiền sau chiết khấu · đồng bộ ${new Date(meta.lastUpdated).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}`,true,'all','','Tất cả đơn trong kỳ'),
    card('COD',money(k.codRevenue),'Tiền thu hộ',false,'all','','Đơn tạo trong kỳ'),
    card('Trả trước',money(k.prepaidRevenue),'Khách đã thanh toán trước',false,'all','','Đơn tạo trong kỳ'),
    card('Tổng chiết khấu',compact(k.discountRevenue),`Trước CK ${compact(k.grossRevenue)}`,false,'all','','Đơn tạo trong kỳ'),
    card('Doanh thu thành công',compact(k.successfulRevenue),`${numFmt(k.successfulOrders)} đơn thành công`,false,'successful','','Đơn có doanh thu thành công'),
    card('Đang giao',compact(k.shippingRevenue),'Đơn đang vận chuyển',false,'status','DANG_GIAO','Đơn đang giao'),
    card('Treo',compact(k.pendingRevenue),'Mới / chờ hàng / xác nhận...',false,'status','TREO','Đơn treo'),
    card('Hoàn',compact(k.returnRevenue),`Tỷ lệ hoàn ${pct(k.returnRate)}`,false,'status','HOAN','Đơn hoàn'),
    card('Tổng Data',data?numFmt(data):'Chưa nhập',data?`CR chốt ${pct(k.orders/data)}`:'Nhập tại màn Theo kênh'),
    card('CR chốt',data?pct(k.orders/data):'—',data?`${numFmt(k.orders)} đơn / ${numFmt(data)} data`:'Chưa có data'),
    card('AOV',compact(k.aov),'Giá trị đơn sau CK trung bình',false,'all','','Đơn tạo trong kỳ'),
    card('Đơn đã loại',numFmt(sourceOrders.filter(o=>orderDate(o)>=$('from').value&&orderDate(o)<=$('to').value&&isDefaultExcluded(o)).length),'Huỷ/Xoá + các nguồn Đơn đổi',false,'excluded','','Đơn đã loại')
  ].join('');
  $('periodStat').textContent=`${$('from').value} → ${$('to').value} · ${numFmt(rows.length)} đơn · Ngày tạo đơn (giờ VN) · trạng thái tại lần đồng bộ`;
  renderTrend(rows);
  renderStatus(rows);
  renderChannelChart(rows,'channelChart');
  renderTarget();
  renderOperationalPanels(rows);
  renderChannels(rows);
  renderProducts();
  renderSales(rows);
  renderSaleLeaderboard(rows);
  renderMonthly();
  bindDrilldowns();
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
  const g=group(rows,o=>o.status||'TREO'),total=Math.max(1,sum(rows,orderRevenue));
  const order=['TREO','DANG_GIAO','THANH_CONG','HOAN','HUY'];
  $('statusViz').innerHTML=order.map(s=>{
    const rr=g[s]||[],v=sum(rr,orderRevenue),share=v/total*100;
    return `<div class="statusItem clickable" data-drill-type="status" data-drill-value="${s}" data-drill-title="${statusLabels[s]}"><div class="statusTop"><span>${statusLabels[s]}</span><b>${compact(v)}</b></div><div class="statusTrack"><i style="width:${Math.min(100,share)}%;background:${statusColors[s]}"></i></div><div class="statusMeta">${numFmt(rr.length)} đơn · ${share.toFixed(1).replace('.',',')}%</div></div>`
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
    const amount=sum(rr,orderRevenue);
    return `<div class="statusDetailRow ${rr.length?'clickable':'zero'}" ${rr.length?`data-drill-type="statusCodes" data-drill-value="${item.codes.join(',')}" data-drill-title="${item.label}"`:''}><span class="statusName">${item.label}</span><span class="statusCount">${numFmt(rr.length)} đơn</span><span class="statusMoney">${compact(amount)}</span></div>`
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
  const days=selectedCalendarDays(),rows=filteredRows(),k=overview(rows),goal=periodTarget(days);
  const time=reportTimeProgress(days),expected=goal*time,completion=goal?k.createdRevenue/goal:0;
  const gapMoney=expected-k.createdRevenue,gapPoints=goal?(k.createdRevenue/goal-time)*100:0;
  const dayTarget=days.length?goal/days.length:0,forecast=time>0?k.createdRevenue/time:0;
  const selectedChannel=$('channel').value;
  const breakdown=KPI_CHANNELS
    .filter(x=>selectedChannel==='Tất cả'||x.channel===selectedChannel)
    .map(x=>{
      const rr=rows.filter(o=>o.channel===x.channel);
      const actual=overview(rr).createdRevenue;
      const channelGoal=days.reduce((n,date)=>n+effectiveDailyTarget(date.slice(0,7),x.channel),0);
      const channelExpected=channelGoal*time;
      const gap=channelExpected-actual;
      const pacing=channelExpected?actual/channelExpected:null;
      return `<div class="channelTargetRow">
        <span class="channelTargetName">${esc(x.label)}</span>
        <span><small>Thực đạt</small><b>${compact(actual)}</b></span>
        <span><small>Phải đạt</small><b>${compact(channelExpected)}</b></span>
        <span class="${gap>0?'bad':'good'}"><small>${gap>0?'GAP thiếu':'Vượt'}</small><b>${compact(Math.abs(gap))}</b></span>
        <span><small>% tiến độ</small><b>${pct(pacing)}</b></span>
      </div>`
    }).join('');
  $('targetPanel').innerHTML=`<div class="targetHero"><div><span>DOANH SỐ KHOẢNG LỌC</span><strong>${money(k.createdRevenue)}</strong></div><div class="gapBadge ${gapClass(gapPoints)}">${gapMoney>0?'GAP '+compact(gapMoney):'Vượt '+compact(Math.abs(gapMoney))}</div></div>
    <div class="progressRow"><div class="progressLabel"><span>Hoàn thành target khoảng lọc</span><b>${pct(completion)}</b></div><div class="track"><i style="width:${Math.min(100,Math.max(0,completion*100))}%"></i></div></div>
    <div class="progressRow"><div class="progressLabel"><span>Target phải đạt theo tiến độ</span><b>${money(expected)}</b></div><div class="track gray"><i style="width:${Math.min(100,Math.max(0,time*100))}%"></i></div></div>
    <div class="targetStats"><div><span>Target khoảng lọc</span><b>${compact(goal)}</b></div><div><span>Target/ngày TB</span><b>${compact(dayTarget)}</b></div><div><span>Dự báo hết kỳ</span><b>${time>0?compact(forecast):'—'}</b></div></div>
    ${hasChannelTargets()?'<div class="channelTargetBoard">'+breakdown+'</div>':'<div class="targetConfigNotice">Chưa cấu hình target theo kênh. Bấm “Chỉnh target” để nhập Ads, Live, Zalo và Website.</div>'}`;
}
function shiftIsoDay(day,offset){
  const d=new Date(String(day||vnDate())+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10)
}
function normalizeSevenCode(raw){
  const value=String(raw||'').trim().toUpperCase();
  if(!value)return'';
  const compact=value.replace(/\s+/g,'');
  let m=compact.match(/^([A-Z]\d{6}[A-Z])[1-5]$/);
  if(m)return m[1];
  if(/^[A-Z]\d{6}[A-Z]$/.test(compact)||/^[A-Z]\d{6}$/.test(compact))return compact;
  m=value.match(/(?:^|[^A-Z0-9])([A-Z]\d{6}[A-Z])[1-5]?(?=$|[^A-Z0-9])/);
  if(m)return m[1];
  m=value.match(/(?:^|[^A-Z0-9])([A-Z]\d{6})(?=$|[^A-Z0-9])/);
  return m?m[1]:''
}
function productThumb(url,code){
  const src=String(url||'').trim();
  if(!src)return '<div class="productThumb empty"><span>7A</span></div>';
  return `<div class="productThumb"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(src)}" alt="${esc(code||'Sản phẩm')}" onerror="this.parentElement.classList.add('imageError')"><span>7A</span></div>`
}
function productDateRange(){
  const anchor=($('productAnchor')?.value||$('to').value||vnDate());
  if(productPeriod==='week')return{from:shiftIsoDay(anchor,-6),to:anchor,label:'7 ngày'};
  if(productPeriod==='month')return{from:anchor.slice(0,7)+'-01',to:anchor,label:'Tháng'};
  return{from:anchor,to:anchor,label:'Ngày'}
}
function productSourceRows(){
  const r=productDateRange(),ch=$('productChannel')?.value||'Tất cả';
  return sourceOrders.filter(o=>{
    const d=orderDate(o);
    return d>=r.from&&d<=r.to&&!isDefaultExcluded(o)&&(ch==='Tất cả'||o.channel===ch)
  })
}
function aggregateProducts(rows){
  const map=new Map();
  let ordersWithItems=0,ordersMissingItems=0,partialUnknown=0,totalLines=0;
  for(const o of rows){
    const items=Array.isArray(o.products)?o.products:[];
    if(!items.length){ordersMissingItems++;continue}
    ordersWithItems++;
    if(o.partialReturnProductDetailMissing)partialUnknown++;
    const seen=new Set();
    for(const item of items){
      const quantity=Math.max(0,Number(item?.quantity)||0);
      if(!quantity)continue;
      const returned=Math.min(quantity,Math.max(0,Number(item?.returnedQuantity)||0));
      const displayCode=
        normalizeSevenCode(item?.displayCode)||
        normalizeSevenCode(item?.productCode)||
        normalizeSevenCode(item?.sku)||
        normalizeSevenCode(item?.name);
      const fallbackKey=String(item?.productId||item?.variationId||item?.name||'unknown').trim().toLowerCase();
      const key=displayCode?('code:'+displayCode.toLowerCase()):('fallback:'+fallbackKey);
      let p=map.get(key);
      if(!p){
        p={
          code:displayCode,
          name:String(item?.name||displayCode||'Chưa rõ sản phẩm').trim(),
          imageUrl:String(item?.imageUrl||'').trim(),
          soldQty:0,returnedQty:0,orders:0,returnOrders:0
        };
        map.set(key,p)
      }else if(!p.imageUrl&&item?.imageUrl){
        p.imageUrl=String(item.imageUrl).trim()
      }
      p.soldQty+=quantity;
      p.returnedQty+=returned;
      totalLines++;
      const orderKey=String(o.orderCode||o.createdAt||'');
      if(!seen.has(key)){p.orders++;seen.add(key)}
      if(returned>0){
        const returnKey=key+'|'+orderKey;
        if(!seen.has(returnKey)){p.returnOrders++;seen.add(returnKey)}
      }
    }
  }
  const products=[...map.values()].map(p=>({
    ...p,
    netQty:Math.max(0,p.soldQty-p.returnedQty),
    returnRate:p.soldQty?p.returnedQty/p.soldQty:0
  })).sort((a,b)=>b.soldQty-a.soldQty||b.netQty-a.netQty||b.orders-a.orders||a.code.localeCompare(b.code,'vi'));
  return{products,ordersWithItems,ordersMissingItems,partialUnknown,totalLines}
}
function renderProducts(){
  const kpis=$('productKpis'),tbody=$('productRows'),summary=$('productRangeSummary'),note=$('productDataNote');
  if(!kpis||!tbody||!summary||!note)return;
  const range=productDateRange(),rows=productSourceRows(),agg=aggregateProducts(rows),list=agg.products;
  const sold=sum(list,x=>x.soldQty),returned=sum(list,x=>x.returnedQty),net=sold-returned,rate=sold?returned/sold:0;
  kpis.innerHTML=[
    mini('Sản phẩm',numFmt(list.length)),
    mini('SL bán',numFmt(sold)),
    mini('SL hoàn',numFmt(returned),rate>.20?'bad':''),
    mini('SL bán thực',numFmt(net)),
    mini('Tỷ lệ hoàn',pct(rate),rate>.20?'bad':'')
  ].join('');
  const ch=$('productChannel')?.value||'Tất cả';
  summary.textContent=`${range.from} → ${range.to} · ${ch}`;
  const messages=[];
  if(!agg.ordersWithItems&&rows.length)messages.push('Dữ liệu đơn trong kỳ chưa có line-item sản phẩm từ Pancake.');
  else if(agg.ordersMissingItems)messages.push(`${numFmt(agg.ordersMissingItems)} đơn chưa có chi tiết sản phẩm.`);
  if(agg.partialUnknown)messages.push(`${numFmt(agg.partialUnknown)} đơn hoàn một phần chưa có SKU hoàn chi tiết — không tự gán hoàn cho toàn bộ sản phẩm.`);
  note.textContent=messages.join(' ');
  note.style.display=messages.length?'block':'none';
  tbody.innerHTML=list.slice(0,100).map((p,i)=>`<tr>
    <td data-label="#">${i+1}</td>
    <td data-label="Ảnh">${productThumb(p.imageUrl,p.code)}</td>
    <td data-label="Mã SP"><strong>${esc(p.code||'Chưa có mã')}</strong></td>
    <td data-label="Tên SP">${esc(p.name||'—')}</td>
    <td data-label="SL bán">${numFmt(p.soldQty)}</td>
    <td data-label="SL hoàn" class="${p.returnedQty?'bad':''}">${numFmt(p.returnedQty)}</td>
    <td data-label="SL bán thực">${numFmt(p.netQty)}</td>
    <td data-label="Tỷ lệ hoàn" class="${p.returnRate>.20?'bad':p.returnRate>.10?'warnText':''}">${pct(p.returnRate)}</td>
    <td data-label="Số đơn">${numFmt(p.orders)}</td>
  </tr>`).join('')||'<tr><td colspan="9">Không có dữ liệu sản phẩm trong kỳ lọc.</td></tr>'
}
function renderChannels(rows){
  const stats=channelStats(rows),total=Math.max(1,overview(rows).createdRevenue),sumData=stats.reduce((a,x)=>a+x.data,0);
  $('channelRows').innerHTML=stats.map(x=>{const cr=x.data?x.orders/x.data:null;return `<tr class="clickable" data-drill-type="channel" data-drill-value="${esc(x.name)}" data-drill-title="Kênh · ${esc(x.name)}"><td data-label="Kênh">${esc(x.name)}</td><td data-label="Tạo đơn">${money(x.createdRevenue)}</td><td data-label="Thành công">${money(x.successfulRevenue)}</td><td data-label="Số đơn">${numFmt(x.orders)}</td><td data-label="Data"><input class="dataInput" data-channel="${esc(x.name)}" type="number" min="0" step="1" value="${x.data||''}" placeholder="Nhập data"></td><td data-label="CR chốt" class="${cr!=null&&cr<.1?'bad':''}">${pct(cr)}</td><td data-label="Tỷ trọng">${pct(x.createdRevenue/total)}</td><td data-label="AOV">${compact(x.aov)}</td><td data-label="Hoàn" class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td></tr>`}).join('')||'<tr><td colspan="9">Không có dữ liệu</td></tr>';
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
  $('staffRows').innerHTML=stats.map(x=>`<tr class="clickable" data-drill-type="staff" data-drill-value="${esc(x.name)}" data-drill-title="Sale · ${esc(x.name)}"><td data-label="Nhân viên">${esc(x.name)}</td><td data-label="Tạo đơn">${money(x.createdRevenue)}</td><td data-label="Thành công">${money(x.successfulRevenue)}</td><td data-label="Số đơn">${numFmt(x.orders)}</td><td data-label="Đơn TC">${numFmt(x.successfulOrders)}</td><td data-label="Treo">${compact(x.pendingRevenue)}</td><td data-label="Đang giao">${compact(x.shippingRevenue)}</td><td data-label="Hoàn">${compact(x.returnRevenue)}</td><td data-label="Tỷ lệ hoàn" class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td><td data-label="AOV">${compact(x.aov)}</td></tr>`).join('')||'<tr><td colspan="10">Không có dữ liệu</td></tr>';
  drawGroupedBars($('staffChart'),stats.slice(0,12).map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),true);
  drawSingleBars($('staffReturnChart'),stats.slice(0,12).map(x=>({label:x.name,value:x.returnRate*100})),{percentMode:true})
}
function renderMonthly(){
  const days=selectedCalendarDays(),rows=filteredRows(),g=group(rows,o=>orderDate(o)),daily=[],cumulative=[];
  const periodGoal=periodTarget(days),time=reportTimeProgress(days);
  let createdSum=0,targetSum=0;
  for(const key of days){
    const rr=g[key]||[],o=overview(rr),target=effectiveDailyTarget(key.slice(0,7));
    createdSum+=o.createdRevenue;
    targetSum+=target;
    daily.push({label:key,value:o.createdRevenue-target,created:o.createdRevenue,success:o.successfulRevenue,orders:o.orders,target});
    cumulative.push({label:key,actual:createdSum,target:targetSum});
  }
  const completion=periodGoal?createdSum/periodGoal:0,gapPts=(completion-time)*100,forecast=time>0?createdSum/time:0;
  $('monthlyKpis').innerHTML=[
    mini('Target khoảng lọc',compact(periodGoal)),mini('Đã đạt',money(createdSum)),
    mini('% hoàn thành',pct(completion)),mini('Tiến độ thời gian',pct(time)),
    mini('Dự báo cuối kỳ',time>0?compact(forecast):'—')
  ].join('');
  drawLineChart($('cumulativeChart'),cumulative,[{key:'actual',class:'lineRed',point:'pointRed'},{key:'target',class:'lineTarget',point:'pointDark'}],null);
  drawSingleBars($('dailyGapChart'),daily,{moneyMode:true,positiveNegative:true});
  $('dailyRows').innerHTML=daily.slice().reverse().map(d=>`<tr>
    <td data-label="Ngày">${d.label.slice(8,10)}/${d.label.slice(5,7)}</td>
    <td data-label="Tạo đơn">${money(d.created)}</td>
    <td data-label="Thành công">${money(d.success)}</td>
    <td data-label="Target ngày">${money(d.target)}</td>
    <td data-label="Gap" class="${d.value>=0?'good':'bad'}">${d.value>=0?'+':''}${money(d.value)}</td>
    <td data-label="% đạt">${pct(d.target?d.created/d.target:0)}</td>
    <td data-label="Số đơn">${d.orders}</td>
  </tr>`).join('');
  const gapText=`${gapPts>=0?'Vượt':'Chậm'} ${Math.abs(gapPts).toFixed(2).replace('.',',')} điểm %`;
  document.querySelector('#view-monthly .sectionHead p').textContent=`Khoảng lọc ${$('from').value} → ${$('to').value} · ${gapText}`;
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
  const adsOrders=adsRows.length;
  return {
    totalData,
    adsData,
    adsCr:adsData?adsOrders/adsData:null,
    adsRevenue:sum(adsRows,orderRevenue),
    liveRevenue:sum(liveRows,orderRevenue)
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
  $('quickPeriod').textContent=`${$('from').value} → ${$('to').value}`;
  if(syncInputs){
    $('quickTotalData').value=s.totalData||'';
    $('quickAdsData').value=s.adsData||'';
  }
  $('quickAdsCr').textContent=pct(s.adsCr);
  $('quickAdsRevenue').textContent=money(s.adsRevenue);
  $('quickLiveRevenue').textContent=money(s.liveRevenue);
  $('quickTextBox').textContent=quickReportText(s)
}
function openQuickReport(){
  const rangeError=reportCoverageError();
  if(rangeError){showError(rangeError);return}
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
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(report);copied=true}
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
  }else showError('Trình duyệt chưa cho phép sao chép tự động.')
}

function switchView(view){
  currentView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));
  document.querySelectorAll('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelectorAll('.mobileNavBtn').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===view));
  const titles={overview:'Tổng quan doanh thu',channels:'Hiệu quả theo kênh',products:'Sản phẩm bán chạy',sales:'Sale Online',monthly:'Tiến độ tháng'};
  $('pageTitle').textContent=titles[view]||titles.overview;renderAll();window.scrollTo({top:0,behavior:'smooth'})
}
function setMobileFilter(open){document.body.classList.toggle('mobileFilterOpen',!!open)}
function updateTargetTotalPreview(){
  const ids=['targetAdsInput','targetLiveInput','targetZaloInput','targetWebsiteInput'];
  const total=ids.reduce((n,id)=>n+Math.max(0,Number($(id)?.value)||0),0);
  if($('targetTotalInput'))$('targetTotalInput').value=money(total)
}
function openSettings(){
  const cfg=settings.channelTargets||{};
  $('targetAdsInput').value=Math.round(Number(cfg.ads)||0);
  $('targetLiveInput').value=Math.round(Number(cfg.live)||0);
  $('targetZaloInput').value=Math.round(Number(cfg.zalo)||0);
  $('targetWebsiteInput').value=Math.round(Number(cfg.website)||0);
  updateTargetTotalPreview();
  $('settingsDialog').showModal()
}
function showError(msg){$('error').textContent=msg;$('error').style.display='block';setTimeout(()=>$('error').style.display='none',7000)}
async function tryAutoLive(){
  const saved=sessionStorage.getItem('sevenam_dashboard_password');if(!saved)return false;
  try{
    applyPayload(await openLiveFast(saved));
    setTimeout(refreshLiveWhenVisible,50);
    return true
  }catch{
    sessionStorage.removeItem('sevenam_dashboard_password');
    return false
  }
}
async function init(){
  sourceOrders=[];
  setMode('LOCKED');
  if($('productAnchor'))$('productAnchor').value=vnDate();
  dateRange('today');
  populateFilters();
  await tryAutoLive();
  setInterval(async()=>{
    const active=document.querySelector('[data-range].active')?.dataset.range;
    if(active==='today'&&$('from').value!==vnDate())dateRange('today');
    if(active==='yesterday'&&$('to').value!==vnDate(new Date(Date.now()-86400000)))dateRange('yesterday');
    updateDataFreshness();
    await refreshLiveWhenVisible();
  },30000)
}
let liveRefreshInFlight=false;
async function refreshLiveWhenVisible(){
  if(liveRefreshInFlight||meta.source!=='PANCAKE')return;
  const pwd=sessionStorage.getItem('sevenam_dashboard_password');
  if(!pwd)return;
  liveRefreshInFlight=true;
  try{
    const next=await fetchLiveDelta(pwd);
    if(next.meta?.lastUpdated!==meta.lastUpdated)mergeLiveDelta(next);
    else updateDataFreshness();
  }catch(e){
    updateDataFreshness();
    console.warn('Direct refresh failed:',e);
  }finally{liveRefreshInFlight=false}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLiveWhenVisible()});
window.addEventListener('online',refreshLiveWhenVisible);
window.addEventListener('focus',refreshLiveWhenVisible);
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{dateRange(b.dataset.range);if(window.innerWidth<=720)setMobileFilter(false)});
document.querySelectorAll('[data-product-period]').forEach(b=>b.onclick=()=>{
  productPeriod=b.dataset.productPeriod||'day';
  document.querySelectorAll('[data-product-period]').forEach(x=>x.classList.toggle('active',x===b));
  renderProducts()
});
if($('productAnchor'))$('productAnchor').onchange=renderProducts;
if($('productChannel'))$('productChannel').onchange=renderProducts;
['from','to','channel','staff','status'].forEach(id=>$(id).onchange=()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));renderAll()});
document.querySelectorAll('.navBtn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('.mobileNavBtn').forEach(b=>b.onclick=()=>switchView(b.dataset.mobileView));
$('mobileFilterBtn').onclick=()=>setMobileFilter(true);
$('mobileFilterClose').onclick=()=>setMobileFilter(false);
$('mobileFilterBackdrop').onclick=()=>setMobileFilter(false);
$('mobileQuickBtn').onclick=openQuickReport;
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$(b.dataset.closeDialog).close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
$('settingsBtn').onclick=openSettings;$('openSettingsInline').onclick=openSettings;$('openSettingsMonthly').onclick=openSettings;
$('quickReportBarBtn').onclick=openQuickReport;
$('quickTotalData').oninput=updateQuickTotalDataFromInput;
$('quickAdsData').oninput=updateQuickAdsDataFromInput;
$('quickTotalData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickTotalDataFromInput();$('quickTotalData').blur()}};
$('quickAdsData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickAdsDataFromInput();$('quickAdsData').blur()}};
$('quickAdsData').onblur=()=>{updateQuickAdsDataFromInput();renderAll()};
$('copyQuickReportBtn').onclick=copyQuickReport;
['targetAdsInput','targetLiveInput','targetZaloInput','targetWebsiteInput'].forEach(id=>$(id).oninput=updateTargetTotalPreview);
$('settingsForm').onsubmit=e=>{
  e.preventDefault();
  settings.channelTargets={
    ads:Math.max(0,Number($('targetAdsInput').value)||0),
    live:Math.max(0,Number($('targetLiveInput').value)||0),
    zalo:Math.max(0,Number($('targetZaloInput').value)||0),
    website:Math.max(0,Number($('targetWebsiteInput').value)||0)
  };
  settings.channelTargetsConfigured=true;
  delete settings.targetDay;
  delete settings.gapDay;
  saveSettings();
  $('settingsDialog').close();
  renderAll()
};
$('unlockBtn').onclick=()=>{$('unlockError').style.display='none';$('password').value='';$('unlockDialog').showModal();if(window.innerWidth>720)setTimeout(()=>$('password').focus(),50)};
$('unlockForm').onsubmit=async e=>{
  e.preventDefault();
  const pwd=$('password').value,box=$('unlockError'),btn=$('unlockForm').querySelector('button[type="submit"]');
  const oldText=btn?.textContent||'Mở dữ liệu';
  box.textContent='Đang kiểm tra mật khẩu và mở dữ liệu...';
  box.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='Đang mở...'}
  try{
    $('app').classList.add('loading');
    const p=await openLiveFast(pwd);
    sessionStorage.setItem('sevenam_dashboard_password',pwd);
    applyPayload(p);
    $('unlockDialog').close();
    setTimeout(refreshLiveWhenVisible,80);
  }catch(err){
    box.textContent='Không mở được dữ liệu. Kiểm tra lại mật khẩu rồi thử lại.';
    box.style.display='block'
  }finally{
    $('app').classList.remove('loading');
    if(btn){btn.disabled=false;btn.textContent=oldText}
  }
};
$('reloadBtn').onclick=async()=>{
  const pwd=sessionStorage.getItem('sevenam_dashboard_password');
  if(meta.source==='PANCAKE'&&pwd){
    try{
      $('app').classList.add('loading');
      applyPayload(await fetchLive(pwd))
    }catch(e){showError(e.message)}
    finally{$('app').classList.remove('loading')}
  }else renderAll()
};
init();
