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
let mainRangeRequestId=0,mainRangeLoadingKey='',mainRangeError='';
let productRangeOrders=[],productRangeLoadedKey='',productRangeLoadingKey='',productRangeError='',productRangeRequestId=0;

const SETTINGS_KEY='sevenam_kpi_settings_v3';
const DATA_KEY='sevenam_channel_data_v3';
const QUICK_DATA_KEY='sevenam_quick_total_data_v1';

function readJsonStorage(key){
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}
  }catch(e){
    console.warn('Bỏ qua dữ liệu trình duyệt lỗi:',key,e);
    try{localStorage.removeItem(key)}catch{}
    return {}
  }
}
function writeJsonStorage(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true}
  catch(e){console.warn('Không lưu được dữ liệu trình duyệt:',key,e);return false}
}
function sessionGet(key){try{return sessionStorage.getItem(key)}catch{return null}}
function sessionSet(key,value){try{sessionStorage.setItem(key,value);return true}catch{return false}}
function sessionRemove(key){try{sessionStorage.removeItem(key)}catch{}}

let settings=readJsonStorage(SETTINGS_KEY);
let channelData=readJsonStorage(DATA_KEY);
let quickTotalDataStore=readJsonStorage(QUICK_DATA_KEY);

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
      const ch=pick(r,['Facebook Ads','Facebook Ads','Facebook Ads','Livestream','Livestream','Zalo']);
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
async function callPancakeBackend(password,action='live',timeoutMs=55000,extra={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(DIRECT_PANCAKE_API,{
      method:'POST',
      mode:'cors',
      cache:'no-store',
      headers:{'Content-Type':'application/json','X-Dashboard-Password':password},
      body:JSON.stringify({action,...extra}),
      signal:controller.signal
    });
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||('Backend Pancake '+r.status));
    return body
  }finally{clearTimeout(timer)}
}
async function fetchLiveOpen(password){
  return callPancakeBackend(password,'open',58000)
}
// Any date range is read straight from Pancake POS, one calendar month per
// backend call (each call fits the backend's time budget). The month that
// contains today is always re-read; older months are reused for up to
// PAST_CHUNK_MAX_AGE_MS so long ranges stay live without hammering Pancake.
const PAST_CHUNK_MAX_AGE_MS=120000;
const rangeChunkCache=new Map();
async function fetchRangeChunks(password,from,to,{force=false}={}){
  const today=vnDate(),payloads=[];
  const chunks=productMonthChunks(from,to);
  for(let i=0;i<chunks.length;i+=3){
    const batch=await Promise.all(chunks.slice(i,i+3).map(async chunk=>{
      const key=chunk.from+'|'+chunk.to,hit=rangeChunkCache.get(key);
      const maxAge=chunk.to<today?PAST_CHUNK_MAX_AGE_MS:0;
      if(!force&&hit&&Date.now()-hit.at<maxAge)return hit.payload;
      const payload=await callPancakeBackend(password,'range',58000,chunk);
      if(!payload||!Array.isArray(payload.orders))throw new Error('Dữ liệu Pancake không hợp lệ');
      rangeChunkCache.set(key,{at:Date.now(),payload});
      return payload
    }));
    payloads.push(...batch)
  }
  return payloads
}
function combineRangePayloads(payloads,from,to){
  const orders=[],dayReconciliation={};
  let skippedOrders=0,latest=payloads[payloads.length-1];
  for(const p of payloads){
    orders.push(...p.orders);
    Object.assign(dayReconciliation,p.meta?.dayReconciliation||{});
    skippedOrders+=Number(p.meta?.skippedOrders)||0
  }
  return {
    orders,
    monthlyTarget:latest?.monthlyTarget,
    meta:{
      source:'PANCAKE',transport:'VERCEL_DIRECT',from,to,count:orders.length,skippedOrders,dayReconciliation,
      // Freshness follows the newest chunk, which is the one re-read every time.
      lastUpdated:latest?.meta?.lastUpdated||new Date().toISOString()
    }
  }
}
async function openLiveFast(password){
  try{return await fetchLiveOpen(password)}
  catch(error){
    console.warn('Backend mở LIVE không khả dụng; thử bản GitHub mã hóa dự phòng.',error);
    return fetchLiveStatic(password)
  }
}

function applyPayload(p){
  if(!p||!Array.isArray(p.orders))throw new Error('Bản dữ liệu Pancake không hợp lệ');
  verifySnapshot(p);
  // Only Ads / Live / Zalo are tracked. Payloads built before the backend
  // dropped other channels still carry them: verify the payload as sent,
  // then keep the tracked orders and reconcile against those.
  sourceOrders=p.orders.filter(o=>isKpiChannel(o.channel));
  meta=p.meta||meta;
  if(sourceOrders.length!==p.orders.length&&meta.dayReconciliation)
    meta={...meta,count:sourceOrders.length,dayReconciliation:dayReconciliationOf(sourceOrders)};
  payloadMonthlyTarget=Number(p.monthlyTarget)||2300000000;
  if(settings.targetMonth==null) settings.targetMonth=payloadMonthlyTarget;
  setMode(meta.source==='PANCAKE'?'LIVE':'DEMO');
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
  const skipped=Number(meta.skippedOrders)||0;
  if(skipped)messages.push(`⚠ <b>${numFmt(skipped)} đơn</b> Pancake thiếu ngày tạo hoặc có số tiền âm nên chưa được tính.`);
  const direct=meta.transport==='VERCEL_DIRECT';
  const when=Number.isFinite(updatedMs)?new Date(updatedMs).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'không xác định';
  const age=Number.isFinite(ageMinutes)?ageMinutes+' phút trước':'chưa rõ thời gian';
  // Say why live data is missing, not just that a saved copy is shown.
  const liveError=!error&&mainRangeError?` Lỗi khi lấy trực tiếp: <b>${esc(mainRangeError)}</b>. Hệ thống tự thử lại mỗi 30 giây.`:'';
  if(direct){
    if(ageMinutes>=2)messages.push(`⚠ Dữ liệu trực tiếp chưa cập nhật trong <b>${ageMinutes} phút</b> (lần cuối ${esc(when)}).${liveError||' Hệ thống sẽ tự thử lại.'}`);
  }else if(mainRangeLoadingKey&&!liveError){
    messages.push(`Đang lấy dữ liệu trực tiếp từ Pancake… Tạm hiển thị bản lưu GitHub lúc <b>${esc(when)}</b> (${age}).`);
  }else if(liveError||ageMinutes>=6){
    messages.push(`⚠ Đang hiển thị bản lưu GitHub lúc <b>${esc(when)}</b> (${age}), chưa phải dữ liệu trực tiếp.${liveError}`);
  }
  note.style.display=messages.length?'block':'none';
  note.innerHTML=messages.join(' ');
}
function saveSettings(){writeJsonStorage(SETTINGS_KEY,settings)}
function saveChannelData(){writeJsonStorage(DATA_KEY,channelData)}
function saveQuickTotalData(){writeJsonStorage(QUICK_DATA_KEY,quickTotalDataStore)}
function currentDateRangeKey(){return `${$('from').value}|${$('to').value}`}
function quickTotalDataValue(){return Number(quickTotalDataStore[currentDateRangeKey()])||0}
function dateRange(kind){
  const now=new Date(),today=vnDate(now);let from=today,to=today;
  if(kind==='yesterday'){const d=new Date(now.getTime()-86400000);from=to=vnDate(d)}
  else if(kind==='7d')from=vnDate(new Date(now.getTime()-6*86400000));
  else if(kind==='month')from=today.slice(0,7)+'-01';
  $('from').value=from;$('to').value=to;
  document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range===kind));
  renderAll();
  loadMainRange()
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
  if((meta.from&&from<meta.from)||(meta.to&&to>meta.to)){
    if(mainRangeLoadingKey===from+'|'+to)return 'Đang lấy dữ liệu Pancake POS cho '+from+' → '+to+'…';
    if(mainRangeError)return 'Không tải được '+from+' → '+to+' từ Pancake: '+mainRangeError;
    return 'Dữ liệu đã đồng bộ chỉ từ '+(meta.from||'?')+' đến '+(meta.to||'?')+'. Khoảng đang chọn '+from+' → '+to+' ngoài phạm vi nguồn.';
  }
  return ''
}
function dayReconciliationOf(orders){
  const actual={};
  for(const o of orders||[]){
    if(isDefaultExcluded(o))continue;
    const date=orderDate(o);
    if(!actual[date])actual[date]={orders:0,net:0,cod:0,prepaid:0,gross:0};
    const d=actual[date];
    d.orders++;d.net+=orderRevenue(o);
    d.cod+=Number(o.codAmount)||0;
    d.prepaid+=Number(o.prepaidAmount)||0;
    d.gross+=Number(o.grossAmount??o.totalAmount)||0;
  }
  return actual
}
function verifySnapshot(p){
  const expected=p?.meta?.dayReconciliation;
  if(!expected)return;
  const actual=dayReconciliationOf(p.orders);
  if(Object.keys(expected).length!==Object.keys(actual).length)throw new Error('Dữ liệu Pancake không khớp số ngày báo cáo');
  for(const [day,ref] of Object.entries(expected)){
    const d=actual[day];
    if(!d||d.orders!==ref.orders||['net','cod','prepaid','gross'].some(k=>Math.abs(d[k]-ref[k])>.01))
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
function isCskhSourceOrder(o){
  return Boolean(o?.excludedCskhSource)||/^\s*cskh\b/i.test(String(o?.sourceName||''))
}
function isDefaultExcluded(o){
  return Boolean(o.excludedFromDefaultReport||o.excludedExchangeSource||isCskhSourceOrder(o)||o.excludedStatus)
}
// "Tất cả" hides cancelled orders plus CSKH / Đơn đổi sources. Picking a
// specific status (including Huỷ) shows that status, but CSKH and Đơn đổi
// stay hidden so every status view is a subset of the same order base.
function matchesStatusFilter(o,status){
  if(status==='Tất cả')return !isDefaultExcluded(o);
  return o.status===status&&!isExchangeSourceOrder(o)&&!isCskhSourceOrder(o)
}
function filteredRows(opts={}){
  const from=opts.from||$('from').value,to=opts.to||$('to').value,ch=$('channel').value,staff=$('staff').value,status=$('status').value;
  return sourceOrders.filter(o=>{
    const d=orderDate(o);
    const defaultRule=matchesStatusFilter(o,status);
    return (!from||d>=from)&&(!to||d<=to)&&(ch==='Tất cả'||o.channel===ch)&&(staff==='Tất cả'||o.salesStaff===staff)&&defaultRule
  })
}
function filteredIgnoringDate(month){
  const ch=$('channel').value,staff=$('staff').value,status=$('status').value;
  return sourceOrders.filter(o=>{
    const defaultRule=matchesStatusFilter(o,status);
    return orderDate(o).startsWith(month)&&(ch==='Tất cả'||o.channel===ch)&&(staff==='Tất cả'||o.salesStaff===staff)&&defaultRule
  })
}
function sum(rows,fn){return rows.reduce((a,x)=>a+(Number(fn(x))||0),0)}
function orderRevenue(o){
  // Single source of truth for Pancake headline revenue:
  // use Pancake's normalized after-discount total. Preserve a valid zero.
  const primary=o?.netAmount;
  if(primary!==undefined&&primary!==null&&primary!==''){
    const n=Number(primary);
    if(Number.isFinite(n))return n
  }
  const legacy=o?.totalAmount;
  if(legacy!==undefined&&legacy!==null&&legacy!==''){
    const n=Number(legacy);
    if(Number.isFinite(n))return n
  }
  const payment=(Number(o?.codAmount)||0)+(Number(o?.prepaidAmount)||0);
  return payment||(Number(o?.grossAmount)||0)
}
function successful(o){
  if(o?.status==='THANH_CONG')return orderRevenue(o);
  // Partial return: backend puts the kept-items part of the order here.
  return Number(o?.successfulAmount)||0
}
// Money that went back: whole order for a full return, only the returned
// items for a partial return (the kept part counts as successful revenue).
function returnedRevenue(o){
  if(o?.status!=='HOAN')return 0;
  const explicit=Number(o?.returnedAmount);
  if(o?.returnedAmount!=null&&Number.isFinite(explicit))return explicit;
  return o?.isPartialReturn?Math.max(0,orderRevenue(o)-successful(o)):orderRevenue(o)
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
    returnRevenue:sum(rows,returnedRevenue),
    cancelledRevenue:sum(rows,x=>x.status==='HUY'?orderRevenue(x):0),
    returnRate:rows.length?returns.length/rows.length:0,
    aov:rows.length?net/rows.length:0
  }
}
function group(rows,key){const m={};for(const r of rows)(m[key(r)]??=[]).push(r);return m}
function pageLabel(o){
  const name=String(o?.pageName||'').trim();
  const username=String(o?.pageUsername||'').trim();
  const id=String(o?.pageId||'').trim();
  if(name)return name;
  if(username)return username.replace(/^@/,'');
  if(id)return 'Page '+id;
  return 'Chưa xác định Page'
}
function pageGroupKey(o){
  const id=String(o?.pageId||'').trim();
  if(id)return 'id:'+id;
  return 'name:'+pageLabel(o).toLowerCase()
}
function isPageRelevantOrder(o){
  return Boolean(String(o?.pageName||o?.pageUsername||o?.pageId||'').trim())
    || o?.channel==='Facebook Ads'
    || o?.channel==='Livestream'
}
function isLiveSourceOrder(o){
  const source=String(o?.sourceName||'').trim();
  return o?.channel==='Livestream'||/(?:^|[^a-z0-9])live/i.test(source)
}
function isExchangeSourceOrder(o){
  const source=String(o?.sourceName||'').trim();
  return Boolean(o?.excludedExchangeSource)||/^\s*(đơn|don)\s+đổi\b/i.test(source)
}
function isPageRevenueOrder(o){
  return isPageRelevantOrder(o)&&!isExchangeSourceOrder(o)&&!isLiveSourceOrder(o)
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function daysInMonth(month){const [y,m]=month.split('-').map(Number);return new Date(y,m,0).getDate()}
const KPI_CHANNELS=[
  {key:'ads',channel:'Facebook Ads',label:'Ads'},
  {key:'live',channel:'Livestream',label:'Live'},
  {key:'zalo',channel:'Zalo',label:'Zalo'}
];
const KPI_CHANNEL_SET=new Set(KPI_CHANNELS.map(x=>x.channel));
function isKpiChannel(channel){return KPI_CHANNEL_SET.has(channel)}
function targetAvailableForChannel(channel=$('channel')?.value||'Tất cả'){
  return hasChannelTargets()&&(channel==='Tất cả'||isKpiChannel(channel))
}
function scopeRowsForTarget(rows,channel=$('channel')?.value||'Tất cả'){
  if(!hasChannelTargets()||channel!=='Tất cả')return rows;
  return rows.filter(o=>isKpiChannel(o.channel))
}
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
  const selected=$('channel')?.value||'Tất cả';
  if(selected!=='Tất cả')return channelDataValue(selected);
  const channels=Array.from(new Set(sourceOrders.map(x=>x.channel).filter(Boolean)));
  return channels.reduce((a,c)=>a+channelDataValue(c),0)
}
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
    const from=$('from').value,to=$('to').value,ch=$('channel').value,staff=$('staff').value;
    return sourceOrders.filter(o=>{
      const d=orderDate(o);
      return d>=from&&d<=to&&
        (ch==='Tất cả'||o.channel===ch)&&
        (staff==='Tất cả'||o.salesStaff===staff)&&
        isDefaultExcluded(o)
    })
  }
  let rows=filteredRows();
  if(type==='status')rows=rows.filter(o=>o.status===value);
  else if(type==='statusCodes'){const codes=String(value).split(',').map(Number);rows=rows.filter(o=>codes.includes(Number(o.statusCode)))}
  else if(type==='successful')rows=rows.filter(o=>successful(o)>0||o.status==='THANH_CONG');
  else if(type==='channel')rows=rows.filter(o=>o.channel===value);
  else if(type==='page')rows=rows.filter(o=>isPageRevenueOrder(o)&&pageGroupKey(o)===value);
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
    <td data-label="Page">${esc(pageLabel(o))}</td>
    <td data-label="Trạng thái">${esc(statusLabels[o.status]||o.status||'—')}</td>
    <td data-label="Sau CK">${money(orderRevenue(o))}</td>
    <td data-label="Lý do hoàn">${o.status==='HOAN'?esc(returnReasonLabel(o)):'—'}</td>
  </tr>`).join('')||'<tr><td colspan="8">Không có đơn phù hợp bộ lọc.</td></tr>';
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
  const list=Object.entries(g).map(([reason,r])=>({reason,rows:r,count:r.length,value:sum(r,returnedRevenue)})).sort((a,b)=>b.count-a.count||b.value-a.value);
  const missing=returns.filter(o=>returnReasonLabel(o)==='Chưa ghi lý do').length;
  $('returnReasonSummary').textContent=`${numFmt(returns.length)} đơn hoàn${missing?' · '+missing+' chưa có lý do':''}`;
  $('returnReasonList').innerHTML=list.length?list.map(x=>`<div class="returnReasonRow clickable" data-drill-type="returnReason" data-drill-value="${esc(x.reason)}" data-drill-title="Hoàn · ${esc(x.reason)}">
    <strong>${esc(x.reason)}</strong>
    <span>${numFmt(x.count)} đơn</span>
    <span class="returnReasonPct">${pct(returns.length?x.count/returns.length:0)}</span>
    <span class="moneyCell">${compact(x.value)}</span>
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
    $('heroPanel').innerHTML='<div class="heroLabel">Doanh số Ads + Live + Zalo</div><div class="heroValue">—</div><div class="heroSub">Bấm 🔒 và nhập mật khẩu để mở dữ liệu Pancake LIVE.</div>';
    $('kpis').innerHTML='';
    $('periodStat').textContent=`${$('from').value} → ${$('to').value} · Chưa có dữ liệu LIVE`;
    ['trendChart','staffChart','staffReturnChart','channelCompareChart','channelCrChart','cumulativeChart','dailyGapChart','pageRevenueChart','pageShareChart'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    ['channelCards','channelRows','staffRows','dailyRows','statusViz','statusDetail','trendLegend','channelDataSummary','liveAlerts','reconcileBoard','funnelBoard','returnReasonList','saleLeaderboard','productKpis','productRows','productRangeSummary','productDataNote'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    $('updatedAt').textContent='Chưa mở Pancake LIVE';
    $('pageSub').textContent='Chưa có dữ liệu Pancake đã xác thực';
    updateDataFreshness();
    return;
  }
  updateDataFreshness();
  const coverageError=reportCoverageError();
  if(coverageError&&currentView==='products'){
    renderProducts();
    $('updatedAt').textContent='Cập nhật dữ liệu: '+new Date(meta.lastUpdated||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
    $('pageSub').textContent='Sản phẩm dùng bộ lọc ngày/kênh riêng';
    return
  }
  if(coverageError){
    const loading=mainRangeLoadingKey===$('from').value+'|'+$('to').value;
    $('heroPanel').innerHTML=`<div class="heroLabel">${loading?'Đang tải từ Pancake POS':'Chưa có đủ dữ liệu'}</div><div class="heroValue">${loading?'Đang tải…':'—'}</div><div class="heroSub">${esc(coverageError)}</div>`;
    $('kpis').innerHTML='';
    $('periodStat').textContent=$('from').value+' → '+$('to').value+' · Khoảng lọc chưa hợp lệ';
    ['channelCards','channelRows','staffRows','dailyRows','statusViz','statusDetail','monthlyKpis','trendLegend','channelDataSummary','liveAlerts','reconcileBoard','funnelBoard','returnReasonList','saleLeaderboard','productKpis','productRows','productRangeSummary','productDataNote'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    ['trendChart','staffChart','staffReturnChart','channelCompareChart','channelCrChart','cumulativeChart','dailyGapChart','pageRevenueChart','pageShareChart'].forEach(id=>{const el=$(id);if(el)el.innerHTML=''});
    $('updatedAt').textContent='Khoảng lọc nằm ngoài dữ liệu đã đồng bộ';
    return;
  }
  const rows=filteredRows();
  renderHero(rows);
  renderChannelCards(rows);
  renderKpiTiles(rows);
  $('periodStat').textContent=`${shortLabel($('from').value)} → ${shortLabel($('to').value)} · ${numFmt(rows.length)} đơn · ${currentFilterLabel()}`;
  renderTrend(rows);
  renderStatus(rows);
  renderOperationalPanels(rows);
  renderChannels(rows);
  renderPages(rows);
  renderProducts();
  renderSales(rows);
  renderSaleLeaderboard(rows);
  renderMonthly();
  bindDrilldowns();
  $('updatedAt').textContent='Cập nhật dữ liệu: '+new Date(meta.lastUpdated||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
  $('pageSub').textContent=`Pancake POS · doanh số sau chiết khấu · ngày tạo đơn theo giờ Việt Nam`;
}
// ---------- Chart kit ----------
// Charts draw at the container's real pixel size (no stretched viewBox), so
// text never distorts; renderAll re-runs on resize. Every chart has a hover
// layer: a crosshair + one tooltip listing every series on line charts, and
// a per-group tooltip on bars. Values stay reachable in the tables too.
const CHANNEL_CLASS={'Facebook Ads':'ads','Livestream':'live','Zalo':'zalo'};
function channelLabel(ch){return KPI_CHANNELS.find(x=>x.channel===ch)?.label||ch}
const SVG_NS='http://www.w3.org/2000/svg';
let chartTipEl=null;
function chartTip(){
  if(!chartTipEl){chartTipEl=document.createElement('div');chartTipEl.className='chartTip';document.body.appendChild(chartTipEl)}
  return chartTipEl
}
function showTip(evt,title,rows){
  const tip=chartTip();
  tip.replaceChildren();
  const head=document.createElement('div');head.className='tipTitle';head.textContent=title;tip.appendChild(head);
  for(const r of rows){
    const row=document.createElement('div');row.className='tipRow';
    const key=document.createElement('i');key.className=(r.rect?'rect ':'')+(r.cls||'');
    const name=document.createElement('span');name.textContent=r.label;
    const val=document.createElement('b');val.textContent=r.value;
    row.append(key,name,val);tip.appendChild(row)
  }
  tip.classList.add('show');
  const pad=14,w=tip.offsetWidth||180,h=tip.offsetHeight||80,vw=window.innerWidth||1200,vh=window.innerHeight||800;
  let x=evt.clientX+pad,y=evt.clientY+pad;
  if(x+w>vw-8)x=evt.clientX-w-pad;
  if(y+h>vh-8)y=evt.clientY-h-pad;
  tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px'
}
function hideTip(){if(chartTipEl)chartTipEl.classList.remove('show')}
function chartBase(el,{left=56}={}){
  const W=Math.max(280,Math.round(el.clientWidth||920)),H=Math.max(180,Math.round(el.clientHeight||260));
  const P={l:left,r:18,t:18,b:28};
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"></svg>`;
  return {svg:el.firstElementChild,W,H,P,pw:W-P.l-P.r,ph:H-P.t-P.b}
}
function addSvg(parent,tag,attrs,text){
  const n=document.createElementNS(SVG_NS,tag);
  Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));
  if(text!=null)n.textContent=text;
  parent.appendChild(n);return n
}
function chartEmpty(el,text='Không có dữ liệu trong khoảng đang chọn'){el.innerHTML=`<div class="chartEmpty">${esc(text)}</div>`}
function niceScale(min,max,count=4){
  if(!(max>min)){max=min+1}
  const raw=(max-min)/count,mag=10**Math.floor(Math.log10(raw));
  const step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw)||raw;
  const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;
  const ticks=[];for(let v=lo;v<=hi+step/2;v+=step)ticks.push(Math.round(v*1e6)/1e6);
  return {lo,hi,ticks}
}
function axisMoney(v){
  const a=Math.abs(v),s=v<0?'−':'';
  if(a>=1e9)return s+(a/1e9).toFixed(a%1e9?1:0).replace('.',',')+' tỷ';
  if(a>=1e6)return s+Math.round(a/1e6)+'tr';
  if(a>=1e3)return s+Math.round(a/1e3)+'k';
  return s+Math.round(a)
}
function shortLabel(label){return /^\d{4}-\d{2}-\d{2}$/.test(label)?label.slice(8,10)+'/'+label.slice(5,7):label}
function drawYAxis(svg,{W,P,ph},scale,y,fmt){
  for(const v of scale.ticks){
    const yy=y(v);
    addSvg(svg,'line',{x1:P.l,y1:yy,x2:W-P.r,y2:yy,class:v===0?'baseLine':'gridLine'});
    addSvg(svg,'text',{x:P.l-8,y:yy+4,'text-anchor':'end',class:'axisText'},fmt(v))
  }
}
function drawXLabels(svg,{H},labels,x,maxLabels){
  const step=Math.max(1,Math.ceil(labels.length/maxLabels));
  labels.forEach((l,i)=>{if(i%step===0||i===labels.length-1&&labels.length-1-i>=step/2)addSvg(svg,'text',{x:x(i),y:H-8,'text-anchor':'middle',class:'axisText'},l)})
}
// data: [{label, [series.key]: number}], series: [{key,label,cls,area}]
function drawLineChart(el,data,series,{target=null,targetLabel='Target',fmt=money,axisFmt=axisMoney}={}){
  if(!el)return;
  const values=data.flatMap(d=>series.map(s=>Number(d[s.key])||0));
  if(!data.length||!values.some(v=>v!==0)){chartEmpty(el);return}
  const base=chartBase(el),{svg,W,H,P,pw,ph}=base;
  const scale=niceScale(0,Math.max(...values,target||0));
  const x=i=>P.l+(data.length===1?pw/2:i*pw/(data.length-1));
  const y=v=>P.t+ph-((Number(v)||0)-scale.lo)/(scale.hi-scale.lo)*ph;
  drawYAxis(svg,base,scale,y,axisFmt);
  if(target!=null&&target>0){
    addSvg(svg,'line',{x1:P.l,y1:y(target),x2:W-P.r,y2:y(target),class:'lineTarget'});
    addSvg(svg,'text',{x:W-P.r,y:y(target)-6,'text-anchor':'end',class:'axisText'},targetLabel+' '+axisMoney(target))
  }
  const single=series.length===1;
  for(const s of series){
    const pts=data.map((d,i)=>[x(i),y(d[s.key])]);
    const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
    if(single||s.area)addSvg(svg,'path',{d:d+` L${pts[pts.length-1][0].toFixed(1)},${y(scale.lo).toFixed(1)} L${pts[0][0].toFixed(1)},${y(scale.lo).toFixed(1)} Z`,class:'area '+(s.cls||'')});
    addSvg(svg,'path',{d,class:'ln '+(s.cls||'')});
    const last=pts[pts.length-1];
    addSvg(svg,'circle',{cx:last[0],cy:last[1],r:4,class:'dot '+(s.cls||'')})
  }
  drawXLabels(svg,base,data.map(d=>shortLabel(d.label)),x,Math.max(3,Math.floor(pw/70)));
  // hover layer: crosshair snaps to the nearest x
  const cross=addSvg(svg,'line',{x1:0,y1:P.t,x2:0,y2:P.t+ph,class:'crosshair',visibility:'hidden'});
  const marks=series.map(s=>addSvg(svg,'circle',{r:4,class:'dot '+(s.cls||''),visibility:'hidden'}));
  const hit=addSvg(svg,'rect',{x:P.l-8,y:P.t,width:pw+16,height:ph,fill:'transparent',tabindex:0});
  const show=(evt,i)=>{
    cross.setAttribute('x1',x(i));cross.setAttribute('x2',x(i));cross.setAttribute('visibility','visible');
    series.forEach((s,j)=>{marks[j].setAttribute('cx',x(i));marks[j].setAttribute('cy',y(data[i][s.key]));marks[j].setAttribute('visibility','visible')});
    const rows=series.map(s=>({label:s.label,value:fmt(Number(data[i][s.key])||0),cls:s.cls}));
    if(series.length>1&&series.every(s=>s.cls!=='target'))rows.push({label:'Tổng',value:fmt(series.reduce((n,s)=>n+(Number(data[i][s.key])||0),0)),cls:'ink'});
    if(target)rows.push({label:targetLabel,value:fmt(target),cls:'target'});
    showTip(evt,data[i].label.length===10?shortLabel(data[i].label)+'/'+data[i].label.slice(0,4):data[i].label,rows)
  };
  const nearest=evt=>{
    const r=svg.getBoundingClientRect?.();const px=r&&r.width?(evt.clientX-r.left)*W/r.width:0;
    return Math.max(0,Math.min(data.length-1,Math.round(data.length===1?0:(px-P.l)/pw*(data.length-1))))
  };
  hit.addEventListener('pointermove',e=>show(e,nearest(e)));
  hit.addEventListener('pointerleave',()=>{hideTip();cross.setAttribute('visibility','hidden');marks.forEach(m=>m.setAttribute('visibility','hidden'))});
}
// Bars with a 4px rounded data-end, square at the baseline (works below 0 too).
function barPath(x,y0,y1,w){
  const h=Math.abs(y1-y0),r=Math.min(4,h,w/2),up=y1<y0;
  if(h<0.5)return `M${x},${y0}h${w}`;
  return up
    ?`M${x},${y0}V${y1+r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1+r}V${y0}Z`
    :`M${x},${y0}V${y1-r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1-r}V${y0}Z`
}
// data: [{label, cls?, [series.key]: number}], series: [{key,label,cls,soft}]
// cls 'item' takes the data item's own class (e.g. its channel color);
// clsFn(d,s) lets a chart color one bar by meaning (e.g. bad return rate).
function drawBars(el,data,series,{fmt=money,axisFmt=axisMoney,valueFmt=axisFmt,clsFn=null,labels=null}={}){
  if(!el)return;
  const values=data.flatMap(d=>series.map(s=>Number(d[s.key])||0));
  if(!data.length||!values.some(v=>v!==0)){chartEmpty(el);return}
  const base=chartBase(el),{svg,W,H,P,pw,ph}=base;
  const scale=niceScale(Math.min(0,...values),Math.max(0,...values));
  const y=v=>P.t+ph-((Number(v)||0)-scale.lo)/(scale.hi-scale.lo)*ph;
  drawYAxis(svg,base,scale,y,axisFmt);
  const band=pw/data.length,gap=2,bw=Math.max(4,Math.min(24,(band*.7-gap*(series.length-1))/series.length));
  const groupW=bw*series.length+gap*(series.length-1);
  const showValues=labels??(series.length===1&&data.length<=8);
  const shortLabels=data.every(d=>String(d.label).length<=6),labelStep=Math.max(1,Math.ceil(data.length/Math.max(2,Math.floor(pw/46))));
  data.forEach((d,i)=>{
    const cx=P.l+band*i+band/2,x0=cx-groupW/2;
    const g=addSvg(svg,'g',{});
    series.forEach((s,j)=>{
      const v=Number(d[s.key])||0,cls=clsFn?.(d,s)??(s.cls==='item'?(d.cls||''):(s.cls||''));
      addSvg(g,'path',{d:barPath(x0+j*(bw+gap),y(0),y(v),bw),class:'bar '+cls+(s.soft?' soft':'')});
      if(showValues&&v!==0)addSvg(svg,'text',{x:x0+j*(bw+gap)+bw/2,y:v>=0?y(v)-6:y(v)+14,'text-anchor':'middle',class:'barLabel'},valueFmt(v))
    });
    const text=String(d.label);
    // short labels (dates) thin out instead of being cut; long names truncate
    if(shortLabels){if(i%labelStep===0)addSvg(svg,'text',{x:cx,y:H-8,'text-anchor':'middle',class:'axisText'},text)}
    else{const maxChars=Math.max(3,Math.floor(band/7));addSvg(svg,'text',{x:cx,y:H-8,'text-anchor':'middle',class:'axisText'},text.length>maxChars?text.slice(0,maxChars-1)+'…':text)}
    const hit=addSvg(svg,'rect',{x:P.l+band*i,y:P.t,width:band,height:ph,fill:'transparent',tabindex:0});
    const rows=series.map(s=>({label:s.label,value:fmt(Number(d[s.key])||0),cls:(clsFn?.(d,s)??(s.cls==='item'?(d.cls||''):(s.cls||''))),rect:true}));
    hit.addEventListener('pointermove',e=>{(g.querySelectorAll?.('.bar')||[]).forEach(b=>b.classList.add('hover'));showTip(e,text,rows)});
    hit.addEventListener('pointerleave',()=>{(g.querySelectorAll?.('.bar')||[]).forEach(b=>b.classList.remove('hover'));hideTip()});
  })
}

// ---------- Overview: hero, channel scorecards, insights ----------
function remainingDayUnits(days){
  const today=vnDate(),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const fraction=(Number(parts.find(x=>x.type==='hour')?.value||0)*60+Number(parts.find(x=>x.type==='minute')?.value||0))/1440;
  return days.reduce((n,d)=>n+(d>today?1:d===today?1-fraction:0),0)
}
// Pace of one scope against its target over the selected days.
function paceOf(rows,channel){
  const days=selectedCalendarDays(),time=reportTimeProgress(days),k=overview(rows);
  const goal=targetAvailableForChannel(channel)?days.reduce((n,d)=>n+effectiveDailyTarget(d.slice(0,7),channel),0):0;
  const expected=goal*time,remaining=remainingDayUnits(days);
  return {
    k,goal,time,expected,
    completion:goal?k.createdRevenue/goal:0,
    pacing:expected?k.createdRevenue/expected:null,
    gap:expected-k.createdRevenue,
    gapPts:goal?(k.createdRevenue/goal-time)*100:0,
    forecast:time>0?k.createdRevenue/time:0,
    needPerDay:remaining>0?Math.max(0,goal-k.createdRevenue)/remaining:0,
    remaining
  }
}
function paceLevel(p){return !p.goal?'neutral':p.gapPts>=0?'good':p.gapPts>=-10?'warn':'bad'}
function paceText(p){return !p.goal?'Chưa có target':p.gapPts>=0?'Đúng tiến độ':p.gapPts>=-10?'Chậm nhẹ':'Chậm tiến độ'}
function meterHtml(p,cls=''){
  const fill=Math.min(100,Math.max(0,p.completion*100)),mark=Math.min(100,Math.max(0,p.time*100));
  return `<div class="meter">
    <div class="meterHead"><span>Đạt <b>${pct(p.completion)}</b> target</span><span>Thời gian ${pct(p.time)} · phải đạt <b>${compact(p.expected)}</b></span></div>
    <div class="meterTrack" role="img" aria-label="Đạt ${pct(p.completion)} target, thời gian đã qua ${pct(p.time)}"><div class="meterFill ${cls}" style="width:${fill}%"></div><div class="meterMarker" style="left:calc(${mark}% - 1px)"></div></div>
  </div>`
}
function renderHero(rows){
  const el=$('heroPanel');if(!el)return;
  const sel=$('channel').value,scoped=scopeRowsForTarget(rows,sel),p=paceOf(scoped,sel),k=p.k;
  const label=sel==='Tất cả'?'Doanh số Ads + Live + Zalo':'Doanh số '+channelLabel(sel);
  const successShare=k.createdRevenue?k.successfulRevenue/k.createdRevenue:0;
  const head=`<div class="heroTop"><div>
      <div class="heroLabel">${esc(label)}</div>
      <div class="heroValue">${money(k.createdRevenue)}</div>
      <div class="heroSub">${numFmt(k.orders)} đơn · AOV ${compact(k.aov)} · thành công ${compact(k.successfulRevenue)} (${pct(successShare)})</div>
    </div><span class="paceBadge ${paceLevel(p)}">${paceText(p)}</span></div>`;
  if(!p.goal){
    el.innerHTML=head+`<div class="heroEmpty"><span>Nhập target tháng cho Ads, Live, Zalo để xem tiến độ, chênh lệch và dự báo.</span><button type="button" class="miniBtn" data-open-settings>Nhập target</button></div>`;
  }else{
    const ahead=p.gap<=0;
    el.innerHTML=head+meterHtml(p)+
      `<div class="meterLegend"><span><i></i>Đã đạt</span><span><i class="mark"></i>Thời gian đã qua của khoảng lọc</span></div>
      <div class="heroStats">
        <div><span>Target khoảng lọc</span><b>${compact(p.goal)}</b></div>
        <div><span>${ahead?'Vượt mức phải đạt':'Thiếu so với mức phải đạt'}</span><b class="${ahead?'good':'bad'}">${compact(Math.abs(p.gap))}</b></div>
        <div><span>Dự báo cuối kỳ</span><b>${p.time>0?compact(p.forecast):'—'}</b></div>
        <div><span>Cần mỗi ngày còn lại</span><b class="${p.k.createdRevenue>=p.goal?'good':''}">${p.k.createdRevenue>=p.goal?'Đã đạt target':p.remaining>0?compact(p.needPerDay):'—'}</b></div>
      </div>`;
  }
  (el.querySelectorAll?.('[data-open-settings]')||[]).forEach(b=>b.onclick=openSettings)
}
function renderChannelCards(rows){
  const el=$('channelCards');if(!el)return;
  const sel=$('channel').value,total=sum(rows,orderRevenue);
  const list=KPI_CHANNELS.filter(c=>sel==='Tất cả'||c.channel===sel);
  el.style.gridTemplateColumns=list.length===1?'1fr':'';
  el.innerHTML=list.map(c=>{
    const rr=rows.filter(o=>o.channel===c.channel),p=paceOf(rr,c.channel),k=p.k,data=channelDataValue(c.channel);
    const share=total?k.createdRevenue/total:0;
    return `<article class="panel chCard" data-drill-type="channel" data-drill-value="${esc(c.channel)}" data-drill-title="Kênh · ${esc(c.label)}">
      <div class="chHead"><span class="chName"><i class="${c.key}"></i>${esc(c.label)}</span><span class="paceBadge ${paceLevel(p)}">${paceText(p)}</span></div>
      <div class="chValue">${money(k.createdRevenue)}</div>
      <div class="chSub">${numFmt(k.orders)} đơn · ${pct(share)} tổng 3 kênh</div>
      ${p.goal?meterHtml(p,c.key):'<div class="chNoTarget">Chưa có target cho kênh này.</div>'}
      <div class="chStats">
        <div><span>Thành công</span><b>${compact(k.successfulRevenue)}</b></div>
        <div><span>AOV</span><b>${compact(k.aov)}</b></div>
        <div><span>Tỷ lệ hoàn</span><b class="${k.returnRate>.2?'bad':''}">${pct(k.returnRate)}</b></div>
        <div><span>CR chốt</span><b class="${data&&k.orders/data<.1?'bad':''}">${data?pct(k.orders/data):'—'}</b></div>
      </div>
    </article>`
  }).join('')
}
function renderLiveAlerts(rows){
  const alerts=[],add=(level,title,text)=>alerts.push({level,title,text});
  const sel=$('channel').value,overall=paceOf(scopeRowsForTarget(rows,sel),sel);
  if(overall.goal){
    if(overall.gapPts<-10)add('bad','Tổng doanh số chậm tiến độ',`Đạt ${pct(overall.completion)} target trong khi thời gian đã qua ${pct(overall.time)}. Thiếu ${compact(overall.gap)}${overall.remaining>0?`; cần ${compact(overall.needPerDay)}/ngày để về đích`:''}.`);
    else if(overall.gapPts<0)add('warn','Hơi chậm so với tiến độ',`Thiếu ${compact(overall.gap)} so với mức phải đạt đến giờ (${compact(overall.expected)}).`);
    else add('good','Đang đúng tiến độ',`Vượt ${compact(-overall.gap)} so với mức phải đạt đến giờ. Dự báo cuối kỳ ${compact(overall.forecast)}.`);
  }
  if(sel==='Tất cả'){
    const per=KPI_CHANNELS.map(c=>({c,p:paceOf(rows.filter(o=>o.channel===c.channel),c.channel)}));
    for(const {c,p} of per.filter(x=>x.p.goal&&x.p.pacing!=null&&x.p.expected>0).sort((a,b)=>a.p.pacing-b.p.pacing)){
      if(p.pacing<.9)add(p.pacing<.75?'bad':'warn',`${c.label} thiếu ${compact(p.gap)}`,`Mới đạt ${pct(p.pacing)} mức phải đạt đến giờ của kênh${p.remaining>0?`; cần ${compact(p.needPerDay)}/ngày`:''}.`);
    }
    const best=per.filter(x=>x.p.goal&&x.p.pacing>=1.1).sort((a,b)=>b.p.pacing-a.p.pacing)[0];
    if(best)add('good',`${best.c.label} vượt nhịp`,`Đạt ${pct(best.p.pacing)} mức phải đạt đến giờ, vượt ${compact(-best.p.gap)}.`);
  }
  const k=overview(rows);
  if(k.returnRate>.2)add('bad','Tỷ lệ hoàn trên 20%',`${pct(k.returnRate)} · ${numFmt(rows.filter(o=>o.status==='HOAN').length)} đơn hoàn, giá trị hoàn ${compact(k.returnRevenue)}.`);
  else for(const c of KPI_CHANNELS){
    const r=overview(rows.filter(o=>o.channel===c.channel));
    if(r.orders>=10&&r.returnRate>.2)add('warn',`Hoàn cao ở ${c.label}`,`${pct(r.returnRate)} đơn hoàn trong kênh.`)
  }
  if(k.createdRevenue&&k.pendingRevenue/k.createdRevenue>.25){
    const n=rows.filter(o=>o.status==='TREO').length;
    add('warn',`${numFmt(n)} đơn đang treo`,`Treo ${compact(k.pendingRevenue)} (${pct(k.pendingRevenue/k.createdRevenue)} doanh số). Nên ưu tiên xác nhận.`)
  }
  const adsData=channelDataValue('Facebook Ads'),adsOrders=rows.filter(o=>o.channel==='Facebook Ads').length;
  if(adsData>0&&adsOrders/adsData<.10)add('bad','CR Ads dưới 10%',`${numFmt(adsOrders)} đơn / ${numFmt(adsData)} data = ${pct(adsOrders/adsData)}.`);
  const todayOnly=$('from').value===vnDate()&&$('to').value===vnDate();
  if(todayOnly&&(sel==='Tất cả'||sel==='Livestream')&&!rows.some(o=>o.channel==='Livestream'))add('warn','Live chưa có đơn hôm nay','Chưa ghi nhận đơn nguồn Live trong dữ liệu hôm nay.');
  const age=(Date.now()-Date.parse(meta.lastUpdated||''))/60000;
  if(Number.isFinite(age)&&age>=(meta.transport==='VERCEL_DIRECT'?2:6))add('warn','Dữ liệu chưa đủ mới',`Lần cập nhật gần nhất ${Math.floor(age)} phút trước.`);
  const staff=Object.entries(group(rows,o=>o.salesStaff||'Chưa gán')).map(([name,r])=>({name,v:sum(r,orderRevenue)})).sort((a,b)=>b.v-a.v)[0];
  if(staff&&staff.v>0&&staff.name!=='Chưa gán')add('info',`${staff.name} dẫn đầu Sale`,`${compact(staff.v)} · ${pct(k.createdRevenue?staff.v/k.createdRevenue:0)} doanh số khoảng lọc.`);
  if(!alerts.length)add('info','Chưa có gì cần chú ý','Nhập target và Data kênh để dashboard so sánh tiến độ và CR.');
  const rank={bad:0,warn:1,good:2,info:3};
  alerts.sort((a,b)=>rank[a.level]-rank[b.level]);
  const shown=alerts.slice(0,6),health=alerts.some(a=>a.level==='bad')?'bad':alerts.some(a=>a.level==='warn')?'warn':'good';
  $('alertHealth').textContent=health==='bad'?'Cần xử lý':health==='warn'?'Theo dõi':'Ổn định';
  $('alertHealth').className='healthPill '+health;
  $('liveAlerts').innerHTML=shown.map(a=>`<div class="alertItem ${a.level}"><i aria-hidden="true"></i><div><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></div>`).join('')
}
function tile(label,value,sub,{dot='',drill=null}={}){
  const attrs=drill?` data-drill-type="${esc(drill[0])}" data-drill-value="${esc(drill[1]||'')}" data-drill-title="${esc(drill[2]||label)}"`:'';
  return `<div class="card${drill?' clickable':''}"${attrs}><span class="cardLabel">${dot?`<i class="${dot}"></i>`:''}${label}</span><strong class="cardValue">${value}</strong><span class="cardSub">${sub||''}</span></div>`
}
function renderKpiTiles(rows){
  const k=overview(rows),data=totalManualData(rows),sel=$('channel').value,staff=$('staff').value;
  const excluded=sourceOrders.filter(o=>{const d=orderDate(o);return d>=$('from').value&&d<=$('to').value&&(sel==='Tất cả'||o.channel===sel)&&(staff==='Tất cả'||o.salesStaff===staff)&&isDefaultExcluded(o)}).length;
  const share=v=>k.createdRevenue?pct(v/k.createdRevenue)+' doanh số':'';
  $('kpis').innerHTML=[
    tile('Thành công',compact(k.successfulRevenue),`${numFmt(k.successfulOrders)} đơn · ${share(k.successfulRevenue)}`,{dot:'st-THANH_CONG',drill:['successful','','Đơn có doanh thu thành công']}),
    tile('Đang giao',compact(k.shippingRevenue),share(k.shippingRevenue),{dot:'st-DANG_GIAO',drill:['status','DANG_GIAO','Đơn đang giao']}),
    tile('Treo',compact(k.pendingRevenue),share(k.pendingRevenue),{dot:'st-TREO',drill:['status','TREO','Đơn treo']}),
    tile('Hoàn',compact(k.returnRevenue),`Tỷ lệ hoàn ${pct(k.returnRate)}`,{dot:'st-HOAN',drill:['status','HOAN','Đơn hoàn']}),
    tile('CR chốt',data?pct(k.orders/data):'—',data?`${numFmt(k.orders)} đơn / ${numFmt(data)} data`:'Nhập Data ở màn Theo kênh'),
    tile('Đơn đã loại',numFmt(excluded),'Huỷ/Xoá, Đơn đổi, CSKH',{drill:['excluded','','Đơn đã loại']}),
    tile('COD',compact(k.codRevenue),'Tiền thu hộ',{drill:['all','','Đơn tạo trong kỳ']}),
    tile('Trả trước',compact(k.prepaidRevenue),'Khách đã thanh toán',{drill:['all','','Đơn tạo trong kỳ']}),
    tile('Chiết khấu',compact(k.discountRevenue),`Trước CK ${compact(k.grossRevenue)}`),
    tile('Data đã nhập',data?numFmt(data):'—','Theo khoảng ngày đang chọn'),
    tile('AOV',compact(k.aov),'Giá trị đơn trung bình'),
    tile('Số đơn',numFmt(k.orders),`${numFmt(k.successfulOrders)} đơn thành công`,{drill:['all','','Tất cả đơn trong kỳ']})
  ].join('')
}
function renderTrend(rows){
  const single=$('from').value===$('to').value,sel=$('channel').value;
  const chans=KPI_CHANNELS.filter(c=>sel==='Tất cả'||c.channel===sel);
  let labels,keyOf;
  if(single){
    const hours=rows.map(o=>parseInt(orderHour(o),10)).filter(Number.isFinite);
    const lo=Math.min(8,...hours),hi=Math.max(22,...hours);
    labels=Array.from({length:hi-lo+1},(_,i)=>pad(lo+i)+'h');keyOf=orderHour;
  }else{labels=selectedCalendarDays();keyOf=orderDate}
  const g=group(rows,keyOf);
  const data=labels.map(l=>{const rr=g[l]||[],d={label:l};for(const c of chans)d[c.key]=sum(rr.filter(o=>o.channel===c.channel),orderRevenue);return d});
  const series=chans.map(c=>({key:c.key,label:c.label,cls:c.key}));
  const target=!single&&chans.length===1&&targetAvailableForChannel(sel)?effectiveDailyTarget($('from').value.slice(0,7),sel):null;
  $('trendSub').textContent=single?'Theo giờ trong ngày · doanh số sau chiết khấu':'Theo ngày · doanh số sau chiết khấu';
  $('trendLegend').innerHTML=series.map(s=>`<span><i class="${s.cls}"></i>${esc(s.label)}</span>`).join('')+(target?'<span><i class="target"></i>Target/ngày</span>':'');
  drawLineChart($('trendChart'),data,series,{target,targetLabel:'Target/ngày'})
}
function renderStatus(rows){
  const g=group(rows,o=>o.status||'TREO'),total=sum(rows,orderRevenue);
  const order=['THANH_CONG','DANG_GIAO','TREO','HOAN','HUY'];
  const items=order.map(s=>({s,rows:g[s]||[],v:sum(g[s]||[],orderRevenue)})).filter(x=>x.rows.length||x.s!=='HUY');
  $('statusViz').innerHTML=`<div class="statusStack" role="img" aria-label="Tỷ trọng doanh số theo trạng thái">${items.filter(x=>x.v>0).map(x=>`<i class="st-${x.s}" style="flex:${x.v}" title="${esc(statusLabels[x.s])}: ${money(x.v)}"></i>`).join('')}</div>`+
    items.map(x=>`<div class="statusItem clickable" data-drill-type="status" data-drill-value="${x.s}" data-drill-title="${statusLabels[x.s]}"><i class="st-${x.s}"></i><span class="statusName">${statusLabels[x.s]}</span><span class="statusMeta">${numFmt(x.rows.length)} đơn · ${pct(total?x.v/total:0)}</span><span class="statusMoney">${compact(x.v)}</span></div>`).join('');
  const detailed=[
    {label:'Mới',codes:[0]},{label:'Chờ hàng',codes:[11]},{label:'Đã xác nhận',codes:[1]},{label:'Chờ chuyển hàng',codes:[9]},
    {label:'Đang giao',codes:[2]},{label:'Thành công',codes:[3,16]},{label:'Hoàn',codes:[4,5]},{label:'Hoàn 1 phần',codes:[15]}
  ];
  $('statusDetail').innerHTML=detailed.map(item=>{
    const rr=rows.filter(o=>item.codes.includes(Number(o.statusCode)));
    return `<div class="statusDetailRow ${rr.length?'clickable':'zero'}" ${rr.length?`data-drill-type="statusCodes" data-drill-value="${item.codes.join(',')}" data-drill-title="${item.label}"`:''}><span class="statusName">${item.label}</span><span class="statusCount">${numFmt(rr.length)} đơn</span><span class="statusMoney">${compact(sum(rr,orderRevenue))}</span></div>`
  }).join('')
}
function channelStats(rows){
  const grouped=group(rows,x=>x.channel||'Khác');
  const names=KPI_CHANNELS.map(x=>x.channel);
  return names.map(name=>({name,...overview(grouped[name]||[]),data:channelDataValue(name)})).sort((a,b)=>b.createdRevenue-a.createdRevenue)
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
  let m=compact.match(/^([A-Z]\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])$/);
  if(m)return m[1];
  if(/^[A-Z]\d{6}[A-Z]{1,3}$/.test(compact)||/^[A-Z]\d{6}$/.test(compact))return compact;
  m=value.match(/(?:^|[^A-Z0-9])([A-Z]\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])?(?=$|[^A-Z0-9])/);
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
  const today=vnDate();
  let from=$('productFrom')?.value||today;
  let to=$('productTo')?.value||from;
  if(from>to)[from,to]=[to,from];
  return{from,to,label:productPeriod==='custom'?'Tùy chọn':productPeriod==='week'?'7 ngày':productPeriod==='month'?'Tháng':'Ngày'}
}
function productRangeKey(range=productDateRange()){return range.from+'|'+range.to}
function productRangeInsideMain(range=productDateRange()){
  return meta.source==='PANCAKE'&&Boolean(meta.from)&&Boolean(meta.to)&&range.from>=meta.from&&range.to<=meta.to
}
function productBaseRows(range=productDateRange()){
  if(productRangeLoadedKey===productRangeKey(range))return productRangeOrders;
  return sourceOrders
}
function productSourceRows(){
  const r=productDateRange(),ch=$('productChannel')?.value||'Tất cả',base=productBaseRows(r);
  return base.filter(o=>{
    const d=orderDate(o);
    return d>=r.from&&d<=r.to&&!isDefaultExcluded(o)&&(ch==='Tất cả'||o.channel===ch)
  })
}
function productMonthChunks(from,to){
  const chunks=[];
  let cursor=from;
  while(cursor<=to){
    const d=new Date(cursor+'T12:00:00Z');
    const y=d.getUTCFullYear(),m=d.getUTCMonth();
    const monthEnd=new Date(Date.UTC(y,m+1,0,12)).toISOString().slice(0,10);
    const end=monthEnd<to?monthEnd:to;
    chunks.push({from:cursor,to:end});
    cursor=shiftIsoDay(end,1)
  }
  return chunks
}
function fillProductChannelFromRows(rows){
  const el=$('productChannel');if(!el)return;
  const old=el.value;
  const vals=['Tất cả',...Array.from(new Set(rows.map(x=>x.channel).filter(Boolean))).sort()];
  el.innerHTML=vals.map(x=>`<option>${esc(x)}</option>`).join('');
  el.value=vals.includes(old)?old:'Tất cả'
}
async function loadProductRange(force=false){
  const range=productDateRange(),key=productRangeKey(range);
  if(productRangeLoadingKey===key)return;
  productRangeError='';
  if(!force&&productRangeInsideMain(range)){
    productRangeLoadedKey='';
    productRangeOrders=[];
    fillProductChannelFromRows(sourceOrders.filter(o=>{const d=orderDate(o);return d>=range.from&&d<=range.to}));
    renderProducts();
    return
  }
  const pwd=sessionGet('sevenam_dashboard_password');
  if(!pwd){
    productRangeError='Cần mở dữ liệu LIVE để tải khoảng thời gian này.';
    renderProducts();
    return
  }
  const requestId=++productRangeRequestId;
  productRangeLoadingKey=key;
  renderProducts();
  try{
    const payloads=await fetchRangeChunks(pwd,range.from,range.to);
    if(requestId!==productRangeRequestId)return;
    productRangeOrders=payloads.flatMap(p=>p.orders).filter(o=>{const d=orderDate(o);return d>=range.from&&d<=range.to&&isKpiChannel(o.channel)});
    productRangeLoadedKey=key;
    fillProductChannelFromRows(productRangeOrders);
  }catch(e){
    if(requestId!==productRangeRequestId)return;
    productRangeError=e?.message||'Không tải được dữ liệu sản phẩm cho khoảng đã chọn.';
    console.warn('Product range load failed:',e)
  }finally{
    if(requestId===productRangeRequestId){
      productRangeLoadingKey='';
      renderProducts()
    }
  }
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
    for(let itemIndex=0;itemIndex<items.length;itemIndex++){
      const item=items[itemIndex];
      const quantity=Math.max(0,Number(item?.quantity)||0);
      if(!quantity)continue;
      const returned=Math.min(quantity,Math.max(0,Number(item?.returnedQuantity)||0));
      const displayCode=
        normalizeSevenCode(item?.displayCode)||
        normalizeSevenCode(item?.productCode)||
        normalizeSevenCode(item?.sku)||
        normalizeSevenCode(item?.name);
      const fallbackKey=String(item?.productId||item?.variationId||item?.name||'').trim().toLowerCase();
      const orderKey=String(o.orderCode||o.createdAt||'unknown-order');
      const safeFallback=fallbackKey||('unknown:'+orderKey+':'+itemIndex);
      const key=displayCode?('code:'+displayCode.toLowerCase()):('fallback:'+safeFallback);
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

function productGroupCard(title,subtitle,agg){
  const list=(agg?.products||[]).slice(0,5);
  const sold=sum(list,x=>x.soldQty);
  const allSold=sum(agg?.products||[],x=>x.soldQty);
  return `<article class="productGroupCard">
    <div class="productGroupCardHead">
      <div><h4>${esc(title)}</h4><p>${esc(subtitle||'')}</p></div>
      <span>${numFmt(allSold)} SP</span>
    </div>
    <div class="productGroupList">
      ${list.map((p,i)=>`<div class="productGroupRow">
        <div class="productGroupRank">#${i+1}</div>
        ${productThumb(p.imageUrl,p.code)}
        <div class="productGroupInfo">
          <strong>${esc(p.code||'Chưa có mã')}</strong>
          <span>${esc(p.name||'—')}</span>
        </div>
        <div class="productGroupMetrics">
          <b>${numFmt(p.soldQty)}</b>
          <small>Bán</small>
        </div>
        <div class="productGroupMetrics">
          <b>${numFmt(p.netQty)}</b>
          <small>Thực</small>
        </div>
        <div class="productGroupMetrics ${p.returnRate>.20?'bad':''}">
          <b>${pct(p.returnRate)}</b>
          <small>Hoàn</small>
        </div>
      </div>`).join('')||'<div class="productGroupEmpty">Không có dữ liệu sản phẩm</div>'}
    </div>
  </article>`
}

function renderProductBreakdowns(rows){
  const channelHost=$('channelProductGroups');
  const pageHost=$('pageProductGroups');
  const pageNote=$('pageProductNote');
  if(!channelHost||!pageHost||!pageNote)return;

  const channelGroups=Object.entries(group(rows,o=>o.channel||'Khác'))
    .map(([name,r])=>{
      const agg=aggregateProducts(r);
      return {name,rows:r,agg,sold:sum(agg.products,x=>x.soldQty)}
    })
    .filter(x=>x.sold>0)
    .sort((a,b)=>b.sold-a.sold||a.name.localeCompare(b.name,'vi'));

  channelHost.innerHTML=channelGroups.map(x=>productGroupCard(
    x.name,
    `${numFmt(x.rows.length)} đơn · ${numFmt(x.agg.products.length)} mã`,
    x.agg
  )).join('')||'<div class="productBreakdownEmpty">Không có dữ liệu sản phẩm theo kênh trong kỳ lọc.</div>';

  const relevant=rows.filter(isPageRevenueOrder);
  const pageMap=new Map();
  for(const o of relevant){
    const key=pageGroupKey(o);
    let x=pageMap.get(key);
    if(!x){
      x={key,name:pageLabel(o),pageId:String(o.pageId||'').trim(),rows:[]};
      pageMap.set(key,x)
    }
    x.rows.push(o)
  }

  const pageGroups=[...pageMap.values()]
    .map(x=>{
      const agg=aggregateProducts(x.rows);
      return {...x,agg,sold:sum(agg.products,p=>p.soldQty)}
    })
    .filter(x=>x.sold>0)
    .sort((a,b)=>b.sold-a.sold||a.name.localeCompare(b.name,'vi'));

  pageHost.innerHTML=pageGroups.map(x=>productGroupCard(
    x.name,
    `${x.pageId?'ID '+x.pageId+' · ':''}${numFmt(x.rows.length)} đơn · ${numFmt(x.agg.products.length)} mã`,
    x.agg
  )).join('')||'<div class="productBreakdownEmpty">Không có dữ liệu sản phẩm theo Page trong kỳ lọc.</div>';

  const unidentified=pageGroups.find(x=>x.name==='Chưa xác định Page');
  const liveExcluded=rows.filter(o=>isPageRelevantOrder(o)&&isLiveSourceOrder(o)).length;
  const exchangeExcluded=rows.filter(o=>isPageRelevantOrder(o)&&isExchangeSourceOrder(o)).length;
  const pageMessages=[];
  if(unidentified)pageMessages.push(`Có ${numFmt(unidentified.rows.length)} đơn chưa xác định Page; sản phẩm đang gom riêng vào “Chưa xác định Page”.`);
  if(liveExcluded)pageMessages.push(`Đã loại ${numFmt(liveExcluded)} đơn Live/Livestream.`);
  if(exchangeExcluded)pageMessages.push(`Đã loại ${numFmt(exchangeExcluded)} đơn đổi.`);
  pageNote.style.display=pageMessages.length?'block':'none';
  pageNote.textContent=pageMessages.join(' ');
}
function renderProducts(){
  const kpis=$('productKpis'),tbody=$('productRows'),summary=$('productRangeSummary'),note=$('productDataNote');
  if(!kpis||!tbody||!summary||!note)return;
  const range=productDateRange(),key=productRangeKey(range),ch=$('productChannel')?.value||'Tất cả';
  summary.textContent=`${range.from} → ${range.to} · ${ch}`;

  const needsRemote=!productRangeInsideMain(range)&&productRangeLoadedKey!==key;
  if(productRangeLoadingKey===key&&productRangeLoadedKey!==key){
    kpis.innerHTML=[mini('Sản phẩm','…'),mini('SL bán','…'),mini('SL hoàn','…'),mini('SL bán thực','…'),mini('Tỷ lệ hoàn','…')].join('');
    note.textContent=`Đang lấy dữ liệu Pancake cho ${range.from} → ${range.to}…`;
    note.style.display='block';
    tbody.innerHTML='<tr><td colspan="9">Đang tải dữ liệu sản phẩm theo khoảng đã chọn…</td></tr>';
    $('channelProductGroups').innerHTML='';
    $('pageProductGroups').innerHTML='';
    return
  }
  if(productRangeError&&needsRemote){
    kpis.innerHTML=[mini('Sản phẩm','—'),mini('SL bán','—'),mini('SL hoàn','—'),mini('SL bán thực','—'),mini('Tỷ lệ hoàn','—')].join('');
    note.textContent=productRangeError;
    note.style.display='block';
    tbody.innerHTML='<tr><td colspan="9">Không tải được khoảng dữ liệu này. Hãy thử lại.</td></tr>';
    return
  }
  if(needsRemote){
    kpis.innerHTML=[mini('Sản phẩm','…'),mini('SL bán','…'),mini('SL hoàn','…'),mini('SL bán thực','…'),mini('Tỷ lệ hoàn','…')].join('');
    note.textContent=`Khoảng ${range.from} → ${range.to} chưa có sẵn. Hệ thống sẽ lấy trực tiếp từ Pancake.`;
    note.style.display='block';
    tbody.innerHTML='<tr><td colspan="9">Đang chuẩn bị dữ liệu sản phẩm…</td></tr>';
    if(currentView==='products')queueMicrotask(()=>loadProductRange());
    return
  }

  const rows=productSourceRows(),agg=aggregateProducts(rows),list=agg.products;
  const sold=sum(list,x=>x.soldQty),returned=sum(list,x=>x.returnedQty),net=sold-returned,rate=sold?returned/sold:0;
  kpis.innerHTML=[
    mini('Sản phẩm',numFmt(list.length)),
    mini('SL bán',numFmt(sold)),
    mini('SL hoàn',numFmt(returned),rate>.20?'bad':''),
    mini('SL bán thực',numFmt(net)),
    mini('Tỷ lệ hoàn',pct(rate),rate>.20?'bad':'')
  ].join('');
  const messages=[];
  if(!agg.ordersWithItems&&rows.length)messages.push('Dữ liệu đơn trong kỳ chưa có line-item sản phẩm từ Pancake.');
  else if(agg.ordersMissingItems)messages.push(`${numFmt(agg.ordersMissingItems)} đơn chưa có chi tiết sản phẩm.`);
  const missingCodeLines=list.filter(p=>!p.code).reduce((n,p)=>n+p.soldQty,0);
  if(missingCodeLines)messages.push(`${numFmt(missingCodeLines)} sản phẩm chưa có mã cha từ Pancake — kiểm tra schema product_display_id.`);
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
  </tr>`).join('')||'<tr><td colspan="9">Không có dữ liệu sản phẩm trong kỳ lọc.</td></tr>';
  renderProductBreakdowns(rows)
}

function renderPages(rows){
  const relevant=rows.filter(isPageRevenueOrder);
  const liveExcluded=rows.filter(o=>isPageRelevantOrder(o)&&isLiveSourceOrder(o)).length;
  const exchangeExcluded=rows.filter(o=>isPageRelevantOrder(o)&&isExchangeSourceOrder(o)).length;
  const grouped=new Map();
  for(const o of relevant){
    const key=pageGroupKey(o);
    let item=grouped.get(key);
    if(!item){
      item={key,name:pageLabel(o),pageId:String(o.pageId||'').trim(),rows:[]};
      grouped.set(key,item)
    }
    item.rows.push(o)
  }

  const stats=[...grouped.values()].map(x=>({...x,...overview(x.rows)}))
    .sort((a,b)=>b.createdRevenue-a.createdRevenue||b.orders-a.orders||a.name.localeCompare(b.name,'vi'));

  const identified=stats.filter(x=>x.name!=='Chưa xác định Page');
  const unidentifiedRows=relevant.filter(o=>pageLabel(o)==='Chưa xác định Page');
  const baseRows=relevant;
  const totals=overview(baseRows);
  const total=totals.createdRevenue;
  const top=identified[0]||stats[0]||null;

  $('pageKpis').innerHTML=[
    mini('Số Page',numFmt(identified.length)),
    mini('Doanh thu Page',money(total)),
    mini('Thành công',money(totals.successfulRevenue)),
    mini('Top Page',top?esc(top.name):'—'),
    mini('Đơn chưa rõ Page',numFmt(unidentifiedRows.length))
  ].join('');

  $('pageSummary').textContent=`${numFmt(identified.length)} Page · ${money(total)}`;

  const note=$('pageDataNote'),notes=[];
  if(unidentifiedRows.length){
    notes.push(`${numFmt(unidentifiedRows.length)} đơn chưa xác định được Page; đang gom riêng vào “Chưa xác định Page”.`)
  }
  if(liveExcluded)notes.push(`Đã loại ${numFmt(liveExcluded)} đơn nguồn Live/Livestream khỏi doanh thu Page.`);
  if(exchangeExcluded)notes.push(`Đã loại ${numFmt(exchangeExcluded)} đơn đổi khỏi doanh thu Page.`);
  if(!relevant.length){
    notes.push('Không có đơn Page hợp lệ sau khi loại Đơn đổi và nguồn Live/Livestream.')
  }
  note.style.display=notes.length?'block':'none';
  note.textContent=notes.join(' ');

  const chartStats=identified.slice(0,12);
  drawBars($('pageRevenueChart'),chartStats.map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),[{key:'a',label:'Tạo đơn'},{key:'b',label:'Thành công',soft:true}]);
  drawBars($('pageShareChart'),chartStats.map(x=>({label:x.name,value:total?x.createdRevenue/total*100:0})),[{key:'value',label:'Tỷ trọng'}],{fmt:v=>v.toFixed(1).replace('.',',')+'%',axisFmt:v=>Math.round(v)+'%',valueFmt:v=>v.toFixed(1).replace('.',',')+'%'});

  $('pageRows').innerHTML=stats.map((x,i)=>`<tr class="clickable" data-drill-type="page" data-drill-value="${esc(x.key)}" data-drill-title="Page · ${esc(x.name)}">
    <td data-label="#">${i+1}</td>
    <td data-label="Page"><strong>${esc(x.name)}</strong></td>
    <td data-label="Page ID">${esc(x.pageId||'—')}</td>
    <td data-label="Tạo đơn">${money(x.createdRevenue)}</td>
    <td data-label="Thành công">${money(x.successfulRevenue)}</td>
    <td data-label="Số đơn">${numFmt(x.orders)}</td>
    <td data-label="Đơn TC">${numFmt(x.successfulOrders)}</td>
    <td data-label="Treo">${compact(x.pendingRevenue)}</td>
    <td data-label="Đang giao">${compact(x.shippingRevenue)}</td>
    <td data-label="Hoàn">${compact(x.returnRevenue)}</td>
    <td data-label="Tỷ lệ hoàn" class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td>
    <td data-label="AOV">${compact(x.aov)}</td>
    <td data-label="Tỷ trọng">${pct(total?x.createdRevenue/total:0)}</td>
  </tr>`).join('')||'<tr><td colspan="13">Không có dữ liệu Page trong khoảng lọc.</td></tr>'
}
function renderChannels(rows){
  const selectedChannel=$('channel').value,allStats=channelStats(rows);
  const stats=selectedChannel==='Tất cả'?allStats:allStats.filter(x=>x.name===selectedChannel);
  const total=Math.max(1,overview(rows).createdRevenue),sumData=stats.reduce((a,x)=>a+x.data,0);
  $('channelRows').innerHTML=stats.map(x=>{const cr=x.data?x.orders/x.data:null;return `<tr class="clickable" data-drill-type="channel" data-drill-value="${esc(x.name)}" data-drill-title="Kênh · ${esc(x.name)}"><td data-label="Kênh">${esc(x.name)}</td><td data-label="Tạo đơn">${money(x.createdRevenue)}</td><td data-label="Thành công">${money(x.successfulRevenue)}</td><td data-label="Số đơn">${numFmt(x.orders)}</td><td data-label="Data"><input class="dataInput" data-channel="${esc(x.name)}" type="number" min="0" step="1" value="${x.data||''}" placeholder="Nhập data"></td><td data-label="CR chốt" class="${cr!=null&&cr<.1?'bad':''}">${pct(cr)}</td><td data-label="Tỷ trọng">${pct(x.createdRevenue/total)}</td><td data-label="AOV">${compact(x.aov)}</td><td data-label="Hoàn" class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td></tr>`}).join('')||'<tr><td colspan="9">Không có dữ liệu</td></tr>';
  if(selectedChannel==='Tất cả'){
    const fbAds=allStats.find(x=>x.name==='Facebook Ads')?.createdRevenue||0,live=allStats.find(x=>x.name==='Livestream')?.createdRevenue||0;
    $('channelDataSummary').textContent=`FB tổng: ${compact(fbAds+live)} · Data: ${sumData?numFmt(sumData):'chưa nhập'} · CR tổng: ${sumData?pct(overview(rows).orders/sumData):'—'}`;
  }else{
    $('channelDataSummary').textContent=`${selectedChannel} · Data: ${sumData?numFmt(sumData):'chưa nhập'} · CR: ${sumData?pct(overview(rows).orders/sumData):'—'}`;
  }
  drawBars($('channelCompareChart'),stats.map(x=>({label:channelLabel(x.name),cls:CHANNEL_CLASS[x.name],a:x.createdRevenue,b:x.successfulRevenue})),[{key:'a',label:'Tạo đơn',cls:'item'},{key:'b',label:'Thành công',cls:'item',soft:true}]);
  drawBars($('channelCrChart'),stats.map(x=>({label:channelLabel(x.name),cls:CHANNEL_CLASS[x.name],value:x.data?x.orders/x.data*100:0})),[{key:'value',label:'CR chốt',cls:'item'}],{fmt:v=>v.toFixed(1).replace('.',',')+'%',axisFmt:v=>Math.round(v)+'%',valueFmt:v=>v.toFixed(1).replace('.',',')+'%'});
  document.querySelectorAll('.dataInput').forEach(inp=>{
    const commit=()=>{const v=Math.max(0,Number(inp.value)||0);channelData[rangeKey(inp.dataset.channel)]=v;saveChannelData();renderAll()};
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit()}};
    inp.onblur=()=>{const v=Math.max(0,Number(inp.value)||0);if(v!==channelDataValue(inp.dataset.channel))commit()}
  })
}
function renderSales(rows){
  const stats=Object.entries(group(rows,x=>x.salesStaff||'Chưa gán')).map(([name,r])=>({name,...overview(r)})).sort((a,b)=>b.createdRevenue-a.createdRevenue);
  $('staffRows').innerHTML=stats.map(x=>`<tr class="clickable" data-drill-type="staff" data-drill-value="${esc(x.name)}" data-drill-title="Sale · ${esc(x.name)}"><td data-label="Nhân viên">${esc(x.name)}</td><td data-label="Tạo đơn">${money(x.createdRevenue)}</td><td data-label="Thành công">${money(x.successfulRevenue)}</td><td data-label="Số đơn">${numFmt(x.orders)}</td><td data-label="Đơn TC">${numFmt(x.successfulOrders)}</td><td data-label="Treo">${compact(x.pendingRevenue)}</td><td data-label="Đang giao">${compact(x.shippingRevenue)}</td><td data-label="Hoàn">${compact(x.returnRevenue)}</td><td data-label="Tỷ lệ hoàn" class="${x.returnRate>.2?'bad':''}">${pct(x.returnRate)}</td><td data-label="AOV">${compact(x.aov)}</td></tr>`).join('')||'<tr><td colspan="10">Không có dữ liệu</td></tr>';
  drawBars($('staffChart'),stats.slice(0,12).map(x=>({label:x.name,a:x.createdRevenue,b:x.successfulRevenue})),[{key:'a',label:'Tạo đơn'},{key:'b',label:'Thành công',soft:true}]);
  drawBars($('staffReturnChart'),stats.slice(0,12).map(x=>({label:x.name,value:x.returnRate*100})),[{key:'value',label:'Tỷ lệ hoàn'}],{fmt:v=>v.toFixed(1).replace('.',',')+'%',axisFmt:v=>Math.round(v)+'%',valueFmt:v=>v.toFixed(1).replace('.',',')+'%',clsFn:d=>d.value>20?'bad':''})
}
function renderMonthly(){
  const selectedChannel=$('channel').value;
  if(!targetAvailableForChannel(selectedChannel)){
    const days=selectedCalendarDays(),rows=filteredRows(),g=group(rows,o=>orderDate(o));
    let createdSum=0;
    const daily=days.map(key=>{const o=overview(g[key]||[]);createdSum+=o.createdRevenue;return{label:key,created:o.createdRevenue,success:o.successfulRevenue,orders:o.orders,actual:createdSum}});
    $('monthlyKpis').innerHTML=[mini('Target khoảng lọc','Chưa cấu hình'),mini('Đã đạt',money(createdSum)),mini('% hoàn thành','—'),mini('Tiến độ thời gian',pct(reportTimeProgress(days))),mini('Dự báo cuối kỳ','—')].join('');
    drawLineChart($('cumulativeChart'),daily,[{key:'actual',label:'Thực đạt lũy kế',cls:'ink'}]);
    chartEmpty($('dailyGapChart'),'Cần nhập target theo kênh để tính chênh lệch');
    $('dailyRows').innerHTML=daily.slice().reverse().map(d=>`<tr><td data-label="Ngày">${d.label.slice(8,10)}/${d.label.slice(5,7)}</td><td data-label="Tạo đơn">${money(d.created)}</td><td data-label="Thành công">${money(d.success)}</td><td data-label="Target ngày">—</td><td data-label="Gap">—</td><td data-label="% đạt">—</td><td data-label="Số đơn">${d.orders}</td></tr>`).join('');
    document.querySelector('#view-monthly .sectionHead p').textContent=hasChannelTargets()?`Kênh ${selectedChannel} chưa được cấu hình target`:'Chưa nhập target theo kênh · bấm “Nhập mục tiêu”';
    return
  }
  const days=selectedCalendarDays(),rows=scopeRowsForTarget(filteredRows(),selectedChannel),g=group(rows,o=>orderDate(o)),daily=[],cumulative=[];
  const periodGoal=periodTarget(days),time=reportTimeProgress(days);
  let createdSum=0,targetSum=0;
  for(const key of days){
    const rr=g[key]||[],o=overview(rr),target=effectiveDailyTarget(key.slice(0,7));
    createdSum+=o.createdRevenue;
    targetSum+=target;
    daily.push({label:key,value:target-o.createdRevenue,created:o.createdRevenue,success:o.successfulRevenue,orders:o.orders,target});
    cumulative.push({label:key,actual:createdSum,target:targetSum});
  }
  const completion=periodGoal?createdSum/periodGoal:0,gapPts=(completion-time)*100,forecast=time>0?createdSum/time:0;
  $('monthlyKpis').innerHTML=[
    mini('Target khoảng lọc',compact(periodGoal)),mini('Đã đạt',money(createdSum)),
    mini('% hoàn thành',pct(completion)),mini('Tiến độ thời gian',pct(time)),
    mini('Dự báo cuối kỳ',time>0?compact(forecast):'—')
  ].join('');
  drawLineChart($('cumulativeChart'),cumulative,[{key:'actual',label:'Thực đạt lũy kế',cls:'ink'},{key:'target',label:'Target lũy kế',cls:'target'}]);
  drawBars($('dailyGapChart'),daily.map(d=>({label:shortLabel(d.label),diff:-d.value})),[{key:'diff',label:'Chênh lệch so với target ngày'}],{fmt:v=>(v>=0?'Vượt ':'Thiếu ')+money(Math.abs(v)),clsFn:d=>d.diff>=0?'good':'bad',labels:false});
  $('dailyRows').innerHTML=daily.slice().reverse().map(d=>`<tr>
    <td data-label="Ngày">${d.label.slice(8,10)}/${d.label.slice(5,7)}</td>
    <td data-label="Tạo đơn">${money(d.created)}</td>
    <td data-label="Thành công">${money(d.success)}</td>
    <td data-label="Target ngày">${money(d.target)}</td>
    <td data-label="Gap" class="${d.value>0?'bad':'good'}">${d.value>0?'GAP '+money(d.value):d.value<0?'Vượt '+money(Math.abs(d.value)):'Đạt'}</td>
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
  const titles={overview:'Tổng quan doanh thu',channels:'Hiệu quả theo kênh',pages:'Doanh thu theo Page',products:'Sản phẩm bán chạy',sales:'Sale Online',monthly:'Tiến độ tháng'};
  $('pageTitle').textContent=titles[view]||titles.overview;renderAll();
  if(view==='products')loadProductRange();
  window.scrollTo({top:0,behavior:'smooth'})
}

function setMobileFilter(open){document.body.classList.toggle('mobileFilterOpen',!!open)}
function updateTargetTotalPreview(){
  const ids=['targetAdsInput','targetLiveInput','targetZaloInput'];
  const total=ids.reduce((n,id)=>n+Math.max(0,Number($(id)?.value)||0),0);
  if($('targetTotalInput'))$('targetTotalInput').value=money(total)
}
function openSettings(){
  const cfg=settings.channelTargets||{};
  $('targetAdsInput').value=Math.round(Number(cfg.ads)||0);
  $('targetLiveInput').value=Math.round(Number(cfg.live)||0);
  $('targetZaloInput').value=Math.round(Number(cfg.zalo)||0);
  updateTargetTotalPreview();
  $('settingsDialog').showModal()
}
function showError(msg){$('error').textContent=msg;$('error').style.display='block';setTimeout(()=>$('error').style.display='none',7000)}
async function tryAutoLive(){
  const saved=sessionGet('sevenam_dashboard_password');if(!saved)return false;
  try{
    applyPayload(await openLiveFast(saved));
    setTimeout(refreshLiveWhenVisible,50);
    return true
  }catch{
    sessionRemove('sevenam_dashboard_password');
    return false
  }
}
async function init(){
  sourceOrders=[];
  setMode('LOCKED');
  const today=vnDate();
  if($('productFrom'))$('productFrom').value=today;
  if($('productTo'))$('productTo').value=today;
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
// The selected From/To range is always read from Pancake POS: on every
// range change and again on each refresh tick, so the whole range stays live.
async function loadMainRange({force=false}={}){
  if(meta.source!=='PANCAKE')return;
  const pwd=sessionGet('sevenam_dashboard_password');
  if(!pwd||!selectedCalendarDays().length)return;
  const from=$('from').value,to=$('to').value,requestId=++mainRangeRequestId;
  mainRangeLoadingKey=from+'|'+to;
  if(reportCoverageError())renderAll();else updateDataFreshness();
  try{
    const payloads=await fetchRangeChunks(pwd,from,to,{force});
    if(requestId!==mainRangeRequestId)return;
    mainRangeLoadingKey='';
    mainRangeError='';
    applyPayload(combineRangePayloads(payloads,from,to));
  }catch(e){
    if(requestId!==mainRangeRequestId)return;
    mainRangeLoadingKey='';
    mainRangeError=e?.message||'Không tải được dữ liệu Pancake';
    console.warn('Pancake range load failed:',e);
    if(reportCoverageError())renderAll();else updateDataFreshness();
    if(force)showError(mainRangeError);
  }
}
async function refreshLiveWhenVisible(){
  if(document.hidden||mainRangeLoadingKey||meta.source!=='PANCAKE')return;
  await loadMainRange();
  if(currentView==='products'&&!productRangeLoadingKey&&productDateRange().to>=vnDate())loadProductRange();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLiveWhenVisible()});
window.addEventListener('online',refreshLiveWhenVisible);
window.addEventListener('focus',refreshLiveWhenVisible);
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{dateRange(b.dataset.range);if(window.innerWidth<=720)setMobileFilter(false)});
document.querySelectorAll('[data-product-period]').forEach(b=>b.onclick=()=>{
  productPeriod=b.dataset.productPeriod||'day';
  const anchor=$('productTo')?.value||vnDate();
  if(productPeriod==='day'){
    $('productFrom').value=anchor;$('productTo').value=anchor
  }else if(productPeriod==='week'){
    $('productFrom').value=shiftIsoDay(anchor,-6);$('productTo').value=anchor
  }else if(productPeriod==='month'){
    $('productFrom').value=anchor.slice(0,7)+'-01';$('productTo').value=anchor
  }
  document.querySelectorAll('[data-product-period]').forEach(x=>x.classList.toggle('active',x===b));
  loadProductRange()
});
['productFrom','productTo'].forEach(id=>{
  if($(id))$(id).onchange=()=>{
    productPeriod='custom';
    document.querySelectorAll('[data-product-period]').forEach(x=>x.classList.remove('active'));
    loadProductRange()
  }
});
if($('productChannel'))$('productChannel').onchange=renderProducts;
['from','to'].forEach(id=>$(id).onchange=()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));renderAll();loadMainRange()});
['channel','staff','status'].forEach(id=>$(id).onchange=renderAll);
document.querySelectorAll('.navBtn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('.mobileNavBtn').forEach(b=>b.onclick=()=>switchView(b.dataset.mobileView));
$('mobileFilterBtn').onclick=()=>setMobileFilter(true);
$('mobileFilterClose').onclick=()=>setMobileFilter(false);
$('mobileFilterBackdrop').onclick=()=>setMobileFilter(false);
$('mobileQuickBtn').onclick=openQuickReport;
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$(b.dataset.closeDialog).close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
['settingsBtn','openSettingsMonthly'].forEach(id=>{if($(id))$(id).onclick=openSettings});
$('quickReportBarBtn').onclick=openQuickReport;
$('quickTotalData').oninput=updateQuickTotalDataFromInput;
$('quickAdsData').oninput=updateQuickAdsDataFromInput;
$('quickTotalData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickTotalDataFromInput();$('quickTotalData').blur()}};
$('quickAdsData').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateQuickAdsDataFromInput();$('quickAdsData').blur()}};
$('quickAdsData').onblur=()=>{updateQuickAdsDataFromInput();renderAll()};
$('copyQuickReportBtn').onclick=copyQuickReport;
['targetAdsInput','targetLiveInput','targetZaloInput'].forEach(id=>$(id).oninput=updateTargetTotalPreview);
$('settingsForm').onsubmit=e=>{
  e.preventDefault();
  settings.channelTargets={
    ads:Math.max(0,Number($('targetAdsInput').value)||0),
    live:Math.max(0,Number($('targetLiveInput').value)||0),
    zalo:Math.max(0,Number($('targetZaloInput').value)||0)
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
    sessionSet('sevenam_dashboard_password',pwd);
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
  const pwd=sessionGet('sevenam_dashboard_password');
  if(meta.source==='PANCAKE'&&pwd){
    try{
      $('app').classList.add('loading');
      await loadMainRange({force:true})
    }finally{$('app').classList.remove('loading')}
  }else renderAll()
};
const THEME_KEY='sevenam_theme';
function applyTheme(theme){
  const root=document.documentElement;if(!root)return;
  if(theme==='light'||theme==='dark')root.dataset.theme=theme;else delete root.dataset.theme;
  const btn=$('themeBtn');if(btn)btn.title=theme==='dark'?'Giao diện tối (bấm để chuyển sáng)':theme==='light'?'Giao diện sáng (bấm để theo hệ thống)':'Theo hệ thống (bấm để chuyển tối)'
}
let currentTheme='';try{currentTheme=localStorage.getItem(THEME_KEY)||''}catch{}
applyTheme(currentTheme);
if($('themeBtn'))$('themeBtn').onclick=()=>{
  currentTheme=currentTheme===''?'dark':currentTheme==='dark'?'light':'';
  try{currentTheme?localStorage.setItem(THEME_KEY,currentTheme):localStorage.removeItem(THEME_KEY)}catch{}
  applyTheme(currentTheme)
};
let resizeTimer=0;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(meta.source==='PANCAKE')renderAll()},180)});
init();
