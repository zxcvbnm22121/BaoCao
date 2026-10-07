import crypto from 'node:crypto';

const TZ='Asia/Bangkok';
const CHANNEL_TARGETS={"Facebook Ads":1350000000,"Livestream":650000000,"Shopee":180000000,"Website":70000000,"Zalo/CSKH":50000000};
const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const get=(o,path)=>String(path).split('|').map(x=>x.trim()).map(p=>p.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,o)).find(v=>v!==undefined&&v!==null&&v!=='');
const num=v=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const str=(v,f='')=>v==null?f:String(v);

function parsePancakeDate(value){
  if(value==null||value==='')throw new Error('Missing order creation timestamp');
  const raw=String(value).trim();
  let dt;
  if(/^\d{10,13}$/.test(raw)){
    const n=Number(raw);dt=new Date(raw.length===10?n*1000:n);
  }else{
    let iso=raw;
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso))iso+='T00:00:00+07:00';
    else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso))iso=iso.replace(' ','T')+'+07:00';
    dt=new Date(iso);
  }
  if(!Number.isFinite(dt.getTime()))throw new Error('Invalid order creation timestamp');
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
  return'TREO';
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
  return'Khác';
}
function normalize(raw){
  const statusCode=num(get(raw,'status|order_status|status_id'));
  const statusName=str(get(raw,'status_name|order_status_name|shipping_status_name'));
  const status=mapStatus(statusCode,statusName);
  const grossAmount=num(get(raw,'total_price|total_amount|total'));
  const afterDiscountRaw=get(raw,'total_price_after_sub_discount|buyer_total_amount');
  const afterDiscountField=afterDiscountRaw===undefined?null:num(afterDiscountRaw);
  const codAmount=num(get(raw,'cod|cod_amount|money_to_collect|total_cod'));
  const prepaidAmount=num(get(raw,'prepaid|prepaid_amount'));
  const netAmount=afterDiscountField!==null?afterDiscountField:((codAmount+prepaidAmount)||grossAmount);
  const discountAmount=Math.max(0,grossAmount-netAmount);
  const sourceName=str(get(raw,'order_sources_name|order_source_name|source_name'));
  const source=get(raw,'order_sources|order_sources_name|source|page_id|conversation_id');
  const dt=parsePancakeDate(get(raw,'inserted_at|created_at|creation_time'));
  const partial=statusCode===15||/part_returned|partial/i.test(statusName)||Boolean(get(raw,'is_partial_return|partial_return'));
  const explicitSuccess=num(get(raw,'successful_amount|received_amount|collected_amount|paid_amount'));
  let successfulAmount=0;
  if(status==='THANH_CONG')successfulAmount=explicitSuccess||netAmount;
  else if(partial)successfulAmount=codAmount||explicitSuccess||0;
  const excludedStatus=[6,7].includes(statusCode);
  const excludedExchangeSource=/^\s*(đơn|don)\s+đổi\b/i.test(sourceName);
  return{
    createdAt:dt.toISOString(),createdDate:dateKey(dt),
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    sourceName,status,statusCode,statusName,grossAmount,netAmount,discountAmount,codAmount,prepaidAmount,totalAmount:netAmount,
    successfulAmount,isPartialReturn:partial,excludedStatus,excludedExchangeSource,
    excludedFromDefaultReport:excludedStatus||excludedExchangeSource
  };
}
async function retryFetch(url){
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const r=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
      if(!r.ok){
        if(r.status!==429&&r.status<500)throw Object.assign(new Error('Pancake API '+r.status),{permanent:true});
        throw new Error('Pancake API '+r.status);
      }
      return await r.json();
    }catch(e){
      if(attempt===4||e.permanent)throw e;
      await new Promise(resolve=>setTimeout(resolve,750*Math.pow(2,attempt-1)));
    }
  }
}
async function discoverShopId(apiKey){
  if(process.env.PANCAKE_SHOP_ID)return String(process.env.PANCAKE_SHOP_ID).trim();
  const url=new URL('https://pos.pages.fm/api/v1/shops');url.searchParams.set('api_key',apiKey);
  const body=await retryFetch(url);
  const shops=Array.isArray(body.shops)?body.shops:Array.isArray(body.data)?body.data:[];
  if(!shops.length)throw new Error('No Pancake shop found');
  return String(shops[0].id);
}
async function fetchPage(apiKey,shopId,from,to,page){
  const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(shopId)}/orders`);
  url.searchParams.set('api_key',apiKey);url.searchParams.set('from_date',from);url.searchParams.set('to_date',to);
  url.searchParams.set('page_number',String(page));url.searchParams.set('page_size','500');
  [0,17,1,11,20,12,13,8,9,2,3,16,4,15,5,6,7].forEach(s=>url.searchParams.append('filter_status[]',String(s)));
  const body=await retryFetch(url);
  return Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];
}
function rawKey(raw,index){return str(get(raw,'id|display_id|order_id|code'))||`${str(get(raw,'inserted_at|created_at|creation_time'))}:${index}`;}
async function fetchOrders(apiKey,shopId,from,to){
  const rawMap=new Map();
  // Two passes protect against pagination shifts while new orders are inserted.
  for(let pass=0;pass<2;pass++){
    for(let page=1;page<=20;page++){
      const data=await fetchPage(apiKey,shopId,from,to,page);
      data.forEach((raw,i)=>rawMap.set(rawKey(raw,i),raw));
      if(!data.length)break;
      const dates=data.map(normalize).map(x=>x.createdDate).filter(Boolean).sort();
      if(dates.length&&dates[dates.length-1]<from)break;
      if(data.length<500)break;
    }
  }
  const orders=[...rawMap.values()].map(normalize).filter(o=>o.createdDate>=from&&o.createdDate<=to);
  if(orders.some(o=>!Number.isFinite(o.netAmount)||o.netAmount<0))throw new Error('Invalid Pancake amount');
  return orders;
}
function buildPayload(orders,from,to){
  const statusDistribution=orders.reduce((m,o)=>{const k=`${o.statusCode}:${o.status}`;m[k]=(m[k]||0)+1;return m},{});
  const channelDistribution=orders.reduce((m,o)=>{const k=o.channel||'Khác';m[k]=(m[k]||0)+1;return m},{});
  const included=orders.filter(o=>!o.excludedFromDefaultReport),dayReconciliation={};
  for(const o of included){
    const d=dayReconciliation[o.createdDate]??={orders:0,net:0,cod:0,prepaid:0,gross:0};
    d.orders++;d.net+=o.netAmount;d.cod+=o.codAmount;d.prepaid+=o.prepaidAmount;d.gross+=o.grossAmount;
  }
  return {
    meta:{source:'PANCAKE',transport:'VERCEL_LIVE',lastUpdated:new Date().toISOString(),from,to,count:orders.length,statusDistribution,channelDistribution,dayReconciliation},
    monthlyTarget:Number(process.env.MONTHLY_TARGET||2300000000),channelTargets:CHANNEL_TARGETS,orders
  };
}
function encryptJson(payload,password){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(password,salt,210000,32,'sha256');
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),plain=Buffer.from(JSON.stringify(payload));
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
  return{v:1,kdf:'PBKDF2-SHA256',iterations:210000,cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),data:Buffer.concat([ciphertext,tag]).toString('base64')};
}

let memoryCache={at:0,body:null};
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','https://zxcvbnm22121.github.io');
  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','public, s-maxage=20, stale-while-revalidate=40');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  if(req.method!=='GET'){res.status(405).json({error:'method_not_allowed'});return;}
  const apiKey=String(process.env.PANCAKE_API_KEY||'').trim(),password=String(process.env.DASHBOARD_PASSWORD||'');
  if(!apiKey||!password){res.status(503).json({error:'backend_not_configured'});return;}
  try{
    if(memoryCache.body&&Date.now()-memoryCache.at<15000){res.status(200).json(memoryCache.body);return;}
    const shopId=await discoverShopId(apiKey),to=dateKey(),from=to.slice(0,7)+'-01';
    const orders=await fetchOrders(apiKey,shopId,from,to),payload=buildPayload(orders,from,to),body=encryptJson(payload,password);
    memoryCache={at:Date.now(),body};
    res.status(200).json(body);
  }catch(e){
    res.status(502).json({error:'pancake_sync_failed',message:String(e?.message||e).slice(0,140)});
  }
}
