import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const API_KEY=(process.env.PANCAKE_API_KEY||'').trim();
let SHOP_ID=(process.env.PANCAKE_SHOP_ID||'').trim();
const PASSWORD=process.env.DASHBOARD_PASSWORD||'';
const MONTHLY_TARGET=Number(process.env.MONTHLY_TARGET||2300000000);
const CHANNEL_TARGETS={"Facebook Ads":1350000000,"Livestream":650000000,"Shopee":180000000,"Website":70000000,"Zalo/CSKH":50000000};
const OUT='site/data/live.enc';
const STATUS='site/data/status.json';
const TZ='Asia/Bangkok';

const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const get=(o,path)=>String(path).split('|').map(x=>x.trim()).map(p=>p.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,o)).find(v=>v!==undefined&&v!==null&&v!=='');
const num=v=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const str=(v,f='')=>v==null?f:String(v);
function parsePancakeDate(value){
  if(value==null||value==='')throw new Error('Pancake order missing a creation timestamp; refusing an inaccurate daily total');
  const raw=String(value).trim();
  let dt;
  if(/^\d{10,13}$/.test(raw)){
    const n=Number(raw);
    dt=new Date(raw.length===10?n*1000:n);
  }else{
    let iso=raw;
    // POS timestamps without an explicit offset are local Vietnam times,
    // never the timezone of the GitHub Actions runner.
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso))iso+='T00:00:00+07:00';
    else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso)){
      iso=iso.replace(' ','T')+'+07:00';
    }
    dt=new Date(iso);
  }
  if(!Number.isFinite(dt.getTime()))throw new Error('Pancake returned an invalid order creation timestamp; refusing an inaccurate daily total');
  return dt;
}

function mapStatus(code,name=''){
  code=Number(code);name=str(name).toLowerCase();
  if([3,16].includes(code))return'THANH_CONG';
  if(code===2)return'DANG_GIAO';
  if([4,5,15].includes(code))return'HOAN';
  if([6,7].includes(code))return'HUY';
  if([0,17,1,11,20,12,13,8,9].includes(code))return'TREO';
  if(/canceled|cancelled|removed|hủy|huy|xóa|xoa/.test(name))return'HUY';
  if(/part_returned|returned|returning|refund|hoàn|hoan/.test(name))return'HOAN';
  if(/delivered|collected|completed|success|đã nhận|da nhan|thu tiền|thu tien/.test(name))return'THANH_CONG';
  if(/shipped|shipping|in transit|đang giao|dang giao/.test(name))return'DANG_GIAO';
  return'TREO'
}
function mapChannel(raw,source='',rawOrder={}){
  const liveFlag=get(rawOrder,'is_live|is_livestream|is_live_shopping|livestream_id|live_id|live_video_id');
  const marketplace=get(rawOrder,'marketplace_id|partner|system_id');
  const utm=get(rawOrder,'p_utm_source|p_utm_medium|p_utm_campaign|ads_source');
  const page=get(rawOrder,'page.name|page.username');
  const v=`${str(raw)} ${str(source)} ${str(marketplace)} ${str(utm)} ${str(page)}`.toLowerCase();
  if(liveFlag===true||liveFlag===1||liveFlag==='1'||/live|livestream/.test(v))return'Livestream';
  if(/shopee/.test(v))return'Shopee';
  if(/tiktok/.test(v))return'TikTok Shop';
  if(/lazada/.test(v))return'Lazada';
  if(/webcake|website|web site|shopify|woocommerce/.test(v))return'Website';
  if(/zalo|cskh|crm/.test(v))return'Zalo/CSKH';
  if(/facebook|messenger|meta|fb|page/.test(v))return'Facebook Ads';
  if(/pos|offline|showroom|tại quầy|tai quay|cửa hàng|cua hang/.test(v))return'Showroom/POS';
  return'Khác'
}
function normalize(raw){
  const statusCode=num(get(raw,'status|order_status|status_id'));
  const statusName=str(get(raw,'status_name|order_status_name|shipping_status_name'));
  const status=mapStatus(statusCode,statusName);

  const grossAmount=num(get(raw,'total_price|total_amount|total'));
  // A valid after-discount amount can be 0 (fully discounted/refunded).
  // Do not use || here: it incorrectly replaces 0 with COD or gross revenue.
  const afterDiscountRaw=get(raw,'total_price_after_sub_discount|buyer_total_amount');
  const afterDiscountField=afterDiscountRaw===undefined?null:num(afterDiscountRaw);
  const codAmount=num(get(raw,'cod|cod_amount|money_to_collect|total_cod'));
  const prepaidAmount=num(get(raw,'prepaid|prepaid_amount'));
  const derivedPaid=codAmount+prepaidAmount;
  const netAmount=afterDiscountField!==null?afterDiscountField:(derivedPaid||grossAmount);
  const discountAmount=Math.max(0,grossAmount-netAmount);

  const sourceName=str(get(raw,'order_sources_name|order_source_name|source_name'));
  const source=get(raw,'order_sources|order_sources_name|source|page_id|conversation_id');
  const created=get(raw,'inserted_at|created_at|creation_time');
  const dt=parsePancakeDate(created);
  const iso=dt.toISOString();
  const createdDate=dateKey(dt);

  const partial=statusCode===15||/part_returned|partial/i.test(statusName)||Boolean(get(raw,'is_partial_return|partial_return'));
  const explicitSuccess=num(get(raw,'successful_amount|received_amount|collected_amount|paid_amount'));
  let successfulAmount=0;
  if(status==='THANH_CONG')successfulAmount=explicitSuccess||netAmount;
  else if(partial)successfulAmount=codAmount||explicitSuccess||0;

  const excludedStatus=[6,7].includes(statusCode);
  const excludedExchangeSource=/^\s*(đơn|don)\s+đổi\b/i.test(sourceName);

  return{
    createdAt:iso,
    createdDate,
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    sourceName,
    status,
    statusCode,
    statusName,
    grossAmount,
    netAmount,
    discountAmount,
    codAmount,
    prepaidAmount,
    totalAmount:netAmount,
    successfulAmount,
    isPartialReturn:partial,
    excludedStatus,
    excludedExchangeSource,
    excludedFromDefaultReport:excludedStatus||excludedExchangeSource
  }
}

async function discoverShopId(){if(SHOP_ID)return SHOP_ID;const url=new URL('https://pos.pages.fm/api/v1/shops');url.searchParams.set('api_key',API_KEY);const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Pancake shops ${r.status}: ${(await r.text()).slice(0,180)}`);const body=await r.json();const shops=Array.isArray(body.shops)?body.shops:Array.isArray(body.data)?body.data:[];if(!shops.length)throw new Error('API Key hợp lệ nhưng không tìm thấy shop Pancake nào.');if(shops.length>1)console.log(`API Key trả về ${shops.length} shop; dùng shop đầu tiên: ${shops[0].id} - ${shops[0].name||''}`);SHOP_ID=String(shops[0].id);return SHOP_ID}

async function fetchOrderPage(from,to,page){
  const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(SHOP_ID)}/orders`);
  url.searchParams.set('api_key',API_KEY);
  url.searchParams.set('from_date',from);
  url.searchParams.set('to_date',to);
  url.searchParams.set('page_number',String(page));
  url.searchParams.set('page_size','500');
  // Pancake's default order listing can omit some lifecycle statuses.
  // Explicitly request the full documented POS status set so dashboard totals
  // reconcile with the POS "Tất cả" view before applying our exclusions.
  [0,17,1,11,20,12,13,8,9,2,3,16,4,15,5,6,7].forEach(s=>url.searchParams.append('filter_status[]',String(s)));
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const r=await fetch(url,{
        headers:{Accept:'application/json','Cache-Control':'no-cache'},
        signal:AbortSignal.timeout(45000)
      });
      if(!r.ok){
        // Authentication and request issues should fail immediately.
        if(r.status!==429 && r.status<500)throw Object.assign(new Error('Pancake API '+r.status),{permanent:true});
        throw new Error('Pancake API temporarily unavailable, status '+r.status);
      }
      const body=await r.json();
      const data=Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];
      const totalPages=num(get(body,'total_pages|pagination.total_pages|paging.total_pages|meta.total_pages'));
      return {data,totalPages,body}
    }catch(e){
      if(attempt===5||e.permanent)throw e;
      const delay=Math.min(16000,1000*2**(attempt-1));
      console.warn('Pancake page '+page+' failed attempt '+attempt+', retry in '+delay+'ms');
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
  }
}

function normalizedDateKey(order){
  return order.createdDate||dateKey(new Date(order.createdAt))
}
function keepInRange(order,from,to){
  const d=normalizedDateKey(order);
  return d>=from&&d<=to
}
function pageDateBounds(data){
  const dates=data.map(normalize).map(normalizedDateKey).filter(Boolean).sort();
  return {min:dates[0]||null,max:dates[dates.length-1]||null}
}
function rawOrderKey(raw,index=0){
  return str(get(raw,'id|display_id|order_id|code')) || `${str(get(raw,'inserted_at|created_at|creation_time'))}:${index}`
}

async function fetchOrders(from,to){
  const rawMap=new Map();
  const maxPages=200;

  // The POS list changes as orders are added/edited. A second complete scan
  // closes page-boundary gaps that arise when a new order shifts pagination.
  for(let pass=1;pass<=2;pass++){
    let completed=false;
    for(let page=1;page<=maxPages;page++){
      const res=await fetchOrderPage(from,to,page);
      const data=res.data;
      const bounds=pageDateBounds(data);

      data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));
      console.log(`Orders pass ${pass} page ${page}: ${data.length} rows${page===1&&res.totalPages?' / '+res.totalPages+' pages':''} · ${bounds.min||'?'} → ${bounds.max||'?'}`);

      if(!data.length){completed=true;break;}
      // This endpoint can ignore from/to. Only stop after a complete page
      // lies before the beginning of the requested date range.
      if(bounds.max&&bounds.max<from){completed=true;break;}
      if(res.totalPages&&page>=res.totalPages){completed=true;break;}
    }
    if(!completed)throw new Error('Pancake pagination limit reached before the date range was fully read');
  }

  // Capture the first page again immediately before publishing the snapshot.
  const latest=await fetchOrderPage(from,to,1);
  latest.data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));

  const normalized=[...rawMap.values()].map(normalize);
  const inRange=normalized.filter(x=>keepInRange(x,from,to));
  if(inRange.some(x=>!Number.isFinite(x.netAmount)||x.netAmount<0))throw new Error('Pancake returned an invalid net amount; refusing to publish an inaccurate daily total');
  if(!inRange.length&&from<dateKey())throw new Error('Pancake returned zero historical orders for the requested period; refusing to publish empty totals');
  console.log(`Pancake bounded scan: ${rawMap.size} unique raw orders; ${inRange.length} orders in ${from} → ${to}.`);
  return inRange
}
function encryptJson(payload,password){const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(password,salt,210000,32,'sha256'),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const plain=Buffer.from(JSON.stringify(payload)),ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag(),combined=Buffer.concat([ciphertext,tag]);return{v:1,kdf:'PBKDF2-SHA256',iterations:210000,cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),data:combined.toString('base64')}}

await fs.mkdir('site/data',{recursive:true});
if(!API_KEY||!PASSWORD){await fs.rm(OUT,{force:true});await fs.writeFile(STATUS,JSON.stringify({mode:'DEMO',updatedAt:new Date().toISOString(),reason:'Missing GitHub Secrets'},null,2));console.log('DEMO mode: set PANCAKE_API_KEY and DASHBOARD_PASSWORD in GitHub Actions secrets. PANCAKE_SHOP_ID is optional.');process.exit(0)}
await discoverShopId();
const today=dateKey(),from=today.slice(0,7)+'-01';
console.log(`Sync Pancake shop ${SHOP_ID}: ${from} -> ${today}`);
const orders=await fetchOrders(from,today);
const statusDistribution=orders.reduce((m,o)=>{const k=`${o.statusCode}:${o.status}`;m[k]=(m[k]||0)+1;return m},{});
const channelDistribution=orders.reduce((m,o)=>{const k=o.channel||'Khác';m[k]=(m[k]||0)+1;return m},{});
const dates=orders.map(o=>String(o.createdAt||'')).filter(Boolean).sort();
console.log('Seven.AM date coverage:',JSON.stringify({min:dates[0]||null,max:dates[dates.length-1]||null,count:orders.length}));

const yesterday=dateKey(new Date(Date.now()-86400000));
const yAll=orders.filter(o=>o.createdDate===yesterday);
const yRows=yAll.filter(o=>!o.excludedFromDefaultReport);
const recon={
  date:yesterday,
  orders:yRows.length,
  total_after_discount:yRows.reduce((a,o)=>a+o.netAmount,0),
  cod:yRows.reduce((a,o)=>a+o.codAmount,0),
  prepaid:yRows.reduce((a,o)=>a+o.prepaidAmount,0),
  gross_before_discount:yRows.reduce((a,o)=>a+o.grossAmount,0),
  discount:yRows.reduce((a,o)=>a+o.discountAmount,0),
  excluded_status:yAll.filter(o=>o.excludedStatus).length,
  excluded_exchange_source:yAll.filter(o=>o.excludedExchangeSource).length,
  source_names_excluded:Array.from(new Set(yAll.filter(o=>o.excludedExchangeSource).map(o=>o.sourceName))).sort()
};
console.log('YESTERDAY_RECONCILIATION:',JSON.stringify(recon));
const yStatusAll=yAll.reduce((m,o)=>{const k=String(o.statusCode);m[k]=(m[k]||0)+1;return m},{});
const yStatusIncluded=yRows.reduce((m,o)=>{const k=String(o.statusCode);m[k]=(m[k]||0)+1;return m},{});
const ySourceAll=yAll.reduce((m,o)=>{const k=o.sourceName||'(blank)';m[k]=(m[k]||0)+1;return m},{});
console.log('YESTERDAY_STATUS_ALL:',JSON.stringify(yStatusAll));
console.log('YESTERDAY_STATUS_INCLUDED:',JSON.stringify(yStatusIncluded));
console.log('YESTERDAY_SOURCE_ALL:',JSON.stringify(ySourceAll));

const todayRows=orders.filter(o=>o.createdDate===today);
const todayIncluded=todayRows.filter(o=>!o.excludedFromDefaultReport);
const todayChannel=todayIncluded.reduce((m,o)=>{const k=o.channel||'Khác';m[k]=(m[k]||{orders:0,revenue:0});m[k].orders++;m[k].revenue+=o.netAmount||o.totalAmount||0;return m},{});
const todayRecon={
  date:today,
  all_orders:todayRows.length,
  included_orders:todayIncluded.length,
  total_after_discount:todayIncluded.reduce((a,o)=>a+o.netAmount,0),
  cod:todayIncluded.reduce((a,o)=>a+o.codAmount,0),
  prepaid:todayIncluded.reduce((a,o)=>a+o.prepaidAmount,0),
  excluded_status:todayRows.filter(o=>o.excludedStatus).length,
  excluded_exchange_source:todayRows.filter(o=>o.excludedExchangeSource).length
};
console.log('TODAY_RECONCILIATION:',JSON.stringify(todayRecon));
console.log('TODAY_CHANNEL_RECONCILIATION:',JSON.stringify(todayChannel));
const monthIncluded=orders.filter(o=>!o.excludedFromDefaultReport);
console.log('MONTH_RECONCILIATION:',JSON.stringify({
  from,to:today,orders:monthIncluded.length,
  total_after_discount:monthIncluded.reduce((a,o)=>a+o.netAmount,0),
  zero_net_orders:monthIncluded.filter(o=>o.netAmount===0).length
}));
console.log('Seven.AM status distribution:',JSON.stringify(statusDistribution));
console.log('Seven.AM channel distribution:',JSON.stringify(channelDistribution));
const reportOrders=orders.filter(o=>!o.excludedFromDefaultReport);
const dayReconciliation={};
const channelReconciliation={};
const staffReconciliation={};
for(const o of reportOrders){
  const k=o.createdDate;
  if(!dayReconciliation[k])dayReconciliation[k]={orders:0,net:0,cod:0,prepaid:0,gross:0};
  const d=dayReconciliation[k];
  d.orders++;d.net+=o.netAmount;d.cod+=o.codAmount;d.prepaid+=o.prepaidAmount;d.gross+=o.grossAmount;
  const c=o.channel||'Khác',staff=o.salesStaff||'Chưa gán';
  if(!channelReconciliation[c])channelReconciliation[c]={orders:0,net:0};
  channelReconciliation[c].orders++;channelReconciliation[c].net+=o.netAmount;
  if(!staffReconciliation[staff])staffReconciliation[staff]={orders:0,net:0};
  staffReconciliation[staff].orders++;staffReconciliation[staff].net+=o.netAmount;
}
const reportCount=reportOrders.length, reportNet=reportOrders.reduce((n,o)=>n+o.netAmount,0);
const checkAggregate=groups=>{
  const v=Object.values(groups);
  return v.reduce((n,x)=>n+x.orders,0)===reportCount &&
    Math.abs(v.reduce((n,x)=>n+x.net,0)-reportNet)<0.01;
};
if(!checkAggregate(dayReconciliation)||!checkAggregate(channelReconciliation)||!checkAggregate(staffReconciliation)){
  throw new Error('Daily, channel and staff totals do not reconcile; refusing to publish');
}
const moneyMismatchDays=Object.entries(dayReconciliation)
  .filter(([,d])=>Math.abs(d.net-(d.cod+d.prepaid))>0.01)
  .map(([date,d])=>({date,net:d.net,codPlusPrepaid:d.cod+d.prepaid}));
if(moneyMismatchDays.length)console.log('PANCAKE_MONEY_FIELDS_DIFFER:',JSON.stringify(moneyMismatchDays));
console.log('DAILY_RECONCILIATION:',JSON.stringify({from,to:today,byDate:dayReconciliation,month:{orders:reportCount,net:reportNet}}));
const payload={meta:{source:'PANCAKE',lastUpdated:new Date().toISOString(),from,to:today,count:orders.length,statusDistribution,channelDistribution,dayReconciliation},monthlyTarget:MONTHLY_TARGET,channelTargets:CHANNEL_TARGETS,orders};
await fs.writeFile(OUT,JSON.stringify(encryptJson(payload,PASSWORD)));
await fs.writeFile(STATUS,JSON.stringify({mode:'LIVE',updatedAt:payload.meta.lastUpdated,count:orders.length},null,2));
console.log(`Synced ${orders.length} normalized orders; encrypted artifact written.`);
