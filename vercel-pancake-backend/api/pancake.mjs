const TZ='Asia/Ho_Chi_Minh';

const API_KEY=(process.env.PANCAKE_API_KEY||'').trim();
let SHOP_ID=(process.env.PANCAKE_SHOP_ID||'').trim();
const DASHBOARD_PASSWORD=process.env.DASHBOARD_PASSWORD||'';
const ALLOWED_ORIGIN=(process.env.ALLOWED_ORIGIN||'https://zxcvbnm22121.github.io').replace(/\/$/,'');
const MONTHLY_TARGET=Number(process.env.MONTHLY_TARGET||2300000000);
const CHANNEL_TARGETS={"Facebook Ads":1350000000,"Livestream":650000000,"Shopee":180000000,"Website":70000000,"Zalo/CSKH":50000000};

let cache={at:0,payload:null};
const CACHE_MS=20000;

const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const get=(o,path)=>String(path).split('|').map(x=>x.trim()).map(p=>p.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,o)).find(v=>v!==undefined&&v!==null&&v!=='');
const num=v=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const str=(v,f='')=>v==null?f:String(v);

function parsePancakeDate(value){
  if(value==null||value==='')throw new Error('Missing Pancake creation timestamp');
  const raw=String(value).trim();
  let dt;
  if(/^\d{10,13}$/.test(raw)){
    const n=Number(raw);
    dt=new Date(raw.length===10?n*1000:n);
  }else{
    let iso=raw;
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso))iso+='T00:00:00+07:00';
    else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso))iso=iso.replace(' ','T')+'+07:00';
    dt=new Date(iso);
  }
  if(!Number.isFinite(dt.getTime()))throw new Error('Invalid Pancake creation timestamp');
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
    createdAt:dt.toISOString(),
    createdDate:dateKey(dt),
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    sourceName,status,statusCode,statusName,grossAmount,netAmount,discountAmount,codAmount,prepaidAmount,
    totalAmount:netAmount,successfulAmount,isPartialReturn:partial,excludedStatus,excludedExchangeSource,
    excludedFromDefaultReport:excludedStatus||excludedExchangeSource
  }
}

async function fetchJson(url,attempt=1){
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
    if(!r.ok){
      if(r.status!==429&&r.status<500)throw Object.assign(new Error('Pancake API '+r.status),{permanent:true});
      throw new Error('Pancake API '+r.status);
    }
    return await r.json();
  }catch(e){
    if(attempt>=4||e.permanent)throw e;
    await new Promise(resolve=>setTimeout(resolve,500*2**(attempt-1)));
    return fetchJson(url,attempt+1);
  }
}

async function discoverShopId(){
  if(SHOP_ID)return SHOP_ID;
  const url=new URL('https://pos.pages.fm/api/v1/shops');
  url.searchParams.set('api_key',API_KEY);
  const body=await fetchJson(url);
  const shops=Array.isArray(body.shops)?body.shops:Array.isArray(body.data)?body.data:[];
  if(!shops.length)throw new Error('No Pancake shop found');
  SHOP_ID=String(shops[0].id);
  return SHOP_ID;
}

async function fetchOrderPage(from,to,page){
  const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(SHOP_ID)}/orders`);
  url.searchParams.set('api_key',API_KEY);
  url.searchParams.set('from_date',from);
  url.searchParams.set('to_date',to);
  url.searchParams.set('page_number',String(page));
  url.searchParams.set('page_size','500');
  [0,17,1,11,20,12,13,8,9,2,3,16,4,15,5,6,7].forEach(s=>url.searchParams.append('filter_status[]',String(s)));
  const body=await fetchJson(url);
  const data=Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];
  const totalPages=num(get(body,'total_pages|pagination.total_pages|paging.total_pages|meta.total_pages'));
  return {data,totalPages}
}

function rawOrderKey(raw,index=0){return str(get(raw,'id|display_id|order_id|code'))||`${str(get(raw,'inserted_at|created_at|creation_time'))}:${index}`}
function pageBounds(data){
  const dates=data.map(x=>normalize(x).createdDate).sort();
  return {min:dates[0]||null,max:dates[dates.length-1]||null}
}

async function fetchOrders(from,to){
  const rawMap=new Map();
  for(let pass=1;pass<=2;pass++){
    for(let page=1;page<=200;page++){
      const {data,totalPages}=await fetchOrderPage(from,to,page);
      const bounds=pageBounds(data);
      data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));
      if(!data.length||bounds.max&&bounds.max<from||totalPages&&page>=totalPages)break;
      if(page===200)throw new Error('Pancake pagination limit reached');
    }
  }
  const latest=await fetchOrderPage(from,to,1);
  latest.data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));
  return [...rawMap.values()].map(normalize).filter(o=>o.createdDate>=from&&o.createdDate<=to);
}

function buildPayload(orders,from,to){
  const statusDistribution=orders.reduce((m,o)=>{const k=`${o.statusCode}:${o.status}`;m[k]=(m[k]||0)+1;return m},{});
  const channelDistribution=orders.reduce((m,o)=>{const k=o.channel||'Khác';m[k]=(m[k]||0)+1;return m},{});
  const reportOrders=orders.filter(o=>!o.excludedFromDefaultReport);
  const dayReconciliation={};
  for(const o of reportOrders){
    const d=dayReconciliation[o.createdDate]??={orders:0,net:0,cod:0,prepaid:0,gross:0};
    d.orders++;d.net+=o.netAmount;d.cod+=o.codAmount;d.prepaid+=o.prepaidAmount;d.gross+=o.grossAmount;
  }
  return {
    meta:{source:'PANCAKE_DIRECT',lastUpdated:new Date().toISOString(),from,to,count:orders.length,statusDistribution,channelDistribution,dayReconciliation},
    monthlyTarget:MONTHLY_TARGET,
    channelTargets:CHANNEL_TARGETS,
    orders
  }
}

function secureEqual(a,b){
  const x=new TextEncoder().encode(String(a||'')),y=new TextEncoder().encode(String(b||''));
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}

function cors(req,res){
  const origin=req.headers.origin||'';
  if(origin===ALLOWED_ORIGIN||origin===ALLOWED_ORIGIN+'/BaoCao'){
    res.setHeader('Access-Control-Allow-Origin',origin);
  }else{
    res.setHeader('Access-Control-Allow-Origin',ALLOWED_ORIGIN);
  }
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Dashboard-Password');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Cache-Control','no-store');
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!API_KEY||!DASHBOARD_PASSWORD)return res.status(503).json({error:'Backend secrets not configured'});
  const supplied=req.headers['x-dashboard-password']||req.body?.password||'';
  if(!secureEqual(supplied,DASHBOARD_PASSWORD))return res.status(401).json({error:'Sai mật khẩu dashboard'});

  try{
    const now=Date.now();
    if(cache.payload&&now-cache.at<CACHE_MS)return res.status(200).json(cache.payload);
    await discoverShopId();
    const to=dateKey(),from=to.slice(0,7)+'-01';
    const orders=await fetchOrders(from,to);
    const payload=buildPayload(orders,from,to);
    cache={at:now,payload};
    return res.status(200).json(payload);
  }catch(e){
    console.error(e);
    return res.status(502).json({error:'Không tải được Pancake lúc này'});
  }
}
