import crypto from 'node:crypto';

const TZ='Asia/Ho_Chi_Minh';

let API_KEY=(process.env.PANCAKE_API_KEY||'').trim();
let SHOP_ID=(process.env.PANCAKE_SHOP_ID||'').trim();
const DASHBOARD_PASSWORD=(process.env.DASHBOARD_PASSWORD||'').trim();
const KEY_ARTIFACT='https://zxcvbnm22121.github.io/BaoCao/data/pancake-key.enc';
const LIVE_ARTIFACT='https://zxcvbnm22121.github.io/BaoCao/data/live.enc';
const ALLOWED_ORIGIN=(process.env.ALLOWED_ORIGIN||'https://zxcvbnm22121.github.io').replace(/\/$/,'');
const MONTHLY_TARGET=Number(process.env.MONTHLY_TARGET||2300000000);
const CHANNEL_TARGETS={"Facebook Ads":1350000000,"Livestream":650000000,"Shopee":180000000,"Website":70000000,"Zalo/CSKH":50000000};

const responseCache=new Map();
const CACHE_MS=20000;

const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const get=(o,path)=>String(path).split('|').map(x=>x.trim()).map(p=>p.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,o)).find(v=>v!==undefined&&v!==null&&v!=='');
const num=v=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const str=(v,f='')=>v==null?f:String(v);

function decryptEnvelope(env,password){
  const salt=Buffer.from(env.salt,'base64');
  const iv=Buffer.from(env.iv,'base64');
  const combined=Buffer.from(env.data,'base64');
  if(combined.length<17)throw new Error('Invalid encrypted credential artifact');
  const ciphertext=combined.subarray(0,combined.length-16);
  const tag=combined.subarray(combined.length-16);
  const key=crypto.pbkdf2Sync(password,salt,Number(env.iterations||210000),32,'sha256');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
let credentialArtifactCache={at:0,env:null};
let snapshotArtifactCache={at:0,env:null};
async function loadSnapshot(password){
  let env=snapshotArtifactCache.env;
  if(!env||Date.now()-snapshotArtifactCache.at>=15000){
    const r=await fetch(LIVE_ARTIFACT+'?ts='+Date.now(),{
      headers:{Accept:'application/json','Cache-Control':'no-cache'},
      signal:AbortSignal.timeout(10000)
    });
    if(!r.ok)throw new Error('Dashboard snapshot unavailable');
    env=await r.json();
    snapshotArtifactCache={at:Date.now(),env};
  }
  try{
    const payload=decryptEnvelope(env,password);
    if(!payload||!Array.isArray(payload.orders))throw new Error('Invalid dashboard snapshot');
    payload.meta={...(payload.meta||{}),source:'PANCAKE',transport:'VERCEL_SNAPSHOT'};
    return payload;
  }catch(e){
    throw Object.assign(new Error('Sai mật khẩu dashboard'),{auth:true});
  }
}

async function loadCredentials(password){
  // Prefer Vercel's own protected environment when fully configured.
  // This removes the runtime dependency on GitHub Pages while still requiring
  // the dashboard password. The encrypted Pages credential remains fallback.
  if(DASHBOARD_PASSWORD&&API_KEY){
    if(!secureEqual(password,DASHBOARD_PASSWORD)){
      throw Object.assign(new Error('Sai mật khẩu dashboard'),{auth:true});
    }
    return {apiKey:String(API_KEY),shopId:String(SHOP_ID||'')};
  }

  let env=credentialArtifactCache.env;
  if(!env||Date.now()-credentialArtifactCache.at>=300000){
    const r=await fetch(KEY_ARTIFACT+'?ts='+Date.now(),{
      headers:{Accept:'application/json','Cache-Control':'no-cache'},
      signal:AbortSignal.timeout(15000)
    });
    if(!r.ok)throw new Error('Encrypted Pancake credential artifact unavailable');
    env=await r.json();
    credentialArtifactCache={at:Date.now(),env};
  }

  let payload;
  try{
    payload=decryptEnvelope(env,password);
  }catch(e){
    throw Object.assign(new Error('Sai mật khẩu dashboard'),{auth:true});
  }
  if(!payload?.apiKey && !API_KEY)throw new Error('Missing Pancake API key');

  return {
    apiKey:String(API_KEY||payload.apiKey),
    shopId:String(SHOP_ID||payload.shopId||'')
  };
}

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

function firstArray(raw,paths){
  for(const path of paths){
    const value=path.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,raw);
    if(Array.isArray(value)&&value.length)return value
  }
  return []
}
function sevenParentCode(value){
  const raw=str(value,'').trim().toUpperCase();
  if(!raw)return'';
  const compact=raw.replace(/\s+/g,'');
  let m=compact.match(/^([A-Z]\d{6}[A-Z])[1-5]$/);
  if(m)return m[1];
  if(/^[A-Z]\d{6}[A-Z]$/.test(compact)||/^[A-Z]\d{6}$/.test(compact))return compact;
  m=raw.match(/(?:^|[^A-Z0-9])([A-Z]\d{6}[A-Z])[1-5]?(?=$|[^A-Z0-9])/);
  if(m)return m[1];
  m=raw.match(/(?:^|[^A-Z0-9])([A-Z]\d{6})(?=$|[^A-Z0-9])/);
  return m?m[1]:''
}
function firstImageUrl(value){
  if(!value)return'';
  if(typeof value==='string')return /^https?:\/\//i.test(value.trim())?value.trim():'';
  if(Array.isArray(value)){
    for(const item of value){const u=firstImageUrl(item);if(u)return u}
    return''
  }
  if(typeof value==='object'){
    for(const key of ['url','src','source','image_url','original_url','full_url','large_url','medium_url','thumbnail_url']){
      const u=firstImageUrl(value[key]);if(u)return u
    }
  }
  return''
}
function productImage(rawItem){
  const paths=[
    'variation.images','variation_info.images','product.images','images','photos',
    'variation.image_url','variation_info.image_url','product.image_url','image_url',
    'variation.image','variation_info.image','product.image','image',
    'variation.thumbnail','variation_info.thumbnail','product.thumbnail','thumbnail'
  ];
  for(const path of paths){
    const value=path.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,rawItem);
    const u=firstImageUrl(value);if(u)return u
  }
  return''
}
function productLine(rawItem){
  if(!rawItem||typeof rawItem!=='object')return null;
  const returnedRaw=get(rawItem,'returned_quantity|return_quantity|quantity_returned|returned_qty|return_qty');
  const quantity=Math.max(0,num(get(rawItem,'quantity|qty|count|total_quantity|variation.quantity|variation_info.quantity')),num(returnedRaw));
  if(!quantity)return null;

  const explicitCandidates=[
    get(rawItem,'product_code'),
    get(rawItem,'product.code'),
    get(rawItem,'product.display_id'),
    get(rawItem,'product.sku'),
    get(rawItem,'variation.product_code'),
    get(rawItem,'variation_info.product_code')
  ];
  const variantCandidates=[
    get(rawItem,'sku'),
    get(rawItem,'variation.sku'),
    get(rawItem,'variation_info.sku'),
    get(rawItem,'variation.display_id'),
    get(rawItem,'variation_info.display_id'),
    get(rawItem,'code')
  ];
  const nameCandidates=[
    get(rawItem,'product.name'),
    get(rawItem,'product_name'),
    get(rawItem,'name'),
    get(rawItem,'variation.name'),
    get(rawItem,'variation_info.name'),
    get(rawItem,'variation_name'),
    get(rawItem,'display_name')
  ];

  let productCode='';
  for(const v of explicitCandidates){productCode=sevenParentCode(v);if(productCode)break}
  let sku='';
  for(const v of variantCandidates){if(str(v,'').trim()){sku=str(v,'').trim();break}}
  if(!productCode)productCode=sevenParentCode(sku);
  if(!productCode){
    for(const v of nameCandidates){productCode=sevenParentCode(v);if(productCode)break}
  }

  const productId=str(get(rawItem,'product_id|product.id|variation.product_id|variation_info.product_id')).trim();
  const variationId=str(get(rawItem,'variation_id|variation.id|variation_info.id|id')).trim();
  const name=str(nameCandidates.find(v=>str(v,'').trim())||'','').trim()||productCode||'Chưa rõ sản phẩm';
  const returnedQuantity=returnedRaw===undefined?0:Math.max(0,num(returnedRaw));
  const imageUrl=productImage(rawItem);

  return{
    sku,
    productCode,
    displayCode:productCode||'',
    name,
    imageUrl,
    productId,
    variationId,
    quantity,
    returnedQuantity
  }
}
function productAliases(item){
  return[
    item?.sku&&'sku:'+String(item.sku).trim().toLowerCase(),
    item?.displayCode&&'display-code:'+String(item.displayCode).trim().toLowerCase(),
    item?.productCode&&'product-code:'+String(item.productCode).trim().toLowerCase(),
    item?.productId&&'product:'+String(item.productId).trim().toLowerCase(),
    item?.variationId&&'variation:'+String(item.variationId).trim().toLowerCase(),
    item?.name&&'name:'+String(item.name).trim().toLowerCase()
  ].filter(Boolean)
}
function extractProducts(raw,status,partial){
  const base=firstArray(raw,[
    'variations','items','order_items','orderItems','line_items','order_details',
    'bill_full.variations','bill_full.items','bill.variations','bill.items','products'
  ]).map(productLine).filter(Boolean);
  const returned=firstArray(raw,[
    'returned_variations','return_variations','returned_items','return_items',
    'refund_items','returned_products','return_order.items','returns.items'
  ]).map(productLine).filter(Boolean);
  const returnedMap=new Map();
  for(const item of returned){
    const q=Math.max(item.returnedQuantity||0,item.quantity||0);
    for(const key of productAliases(item))returnedMap.set(key,Math.max(q,returnedMap.get(key)||0))
  }
  return base.map(item=>{
    let returnedQuantity=item.returnedQuantity||0;
    for(const key of productAliases(item))returnedQuantity=Math.max(returnedQuantity,returnedMap.get(key)||0);
    if(status==='HOAN'&&!partial&&returnedQuantity<=0)returnedQuantity=item.quantity;
    returnedQuantity=Math.min(item.quantity,Math.max(0,returnedQuantity));
    return{...item,returnedQuantity}
  })
}
function normalize(raw){
  const statusCode=num(get(raw,'status|order_status|status_id'));
  const statusName=str(get(raw,'status_name|order_status_name|shipping_status_name'));
  const status=mapStatus(statusCode,statusName);
  const grossAmount=num(get(raw,'total_price|total_amount|total'));
  const afterDiscountRaw=get(raw,'total_price_after_sub_discount|buyer_total_amount');
  const afterDiscountField=afterDiscountRaw===undefined?null:num(afterDiscountRaw);
  const codRaw=get(raw,'cod|cod_amount|money_to_collect|total_cod');
  const prepaidRaw=get(raw,'prepaid|prepaid_amount');
  const codAmount=codRaw===undefined?0:num(codRaw);
  const prepaidAmount=prepaidRaw===undefined?0:num(prepaidRaw);
  const hasPancakePaymentTotal=codRaw!==undefined||prepaidRaw!==undefined;
  const netAmount=hasPancakePaymentTotal?(codAmount+prepaidAmount):(afterDiscountField!==null?afterDiscountField:grossAmount);
  const discountAmount=Math.max(0,grossAmount-netAmount);
  const sourceName=str(get(raw,'order_sources_name|order_source_name|source_name'));
  const source=get(raw,'order_sources|order_sources_name|source|page_id|conversation_id');
  const dt=parsePancakeDate(get(raw,'inserted_at|created_at|creation_time'));
  const partial=statusCode===15||/part_returned|partial/i.test(statusName)||Boolean(get(raw,'is_partial_return|partial_return'));
  const products=extractProducts(raw,status,partial);
  const partialReturnProductDetailMissing=partial&&products.length>0&&!products.some(x=>Number(x.returnedQuantity)>0);
  const explicitSuccess=num(get(raw,'successful_amount|received_amount|collected_amount|paid_amount'));
  let successfulAmount=0;
  if(status==='THANH_CONG')successfulAmount=explicitSuccess||netAmount;
  else if(partial)successfulAmount=codAmount||explicitSuccess||0;
  const excludedStatus=[6,7].includes(statusCode);
  const excludedExchangeSource=/^\s*(đơn|don)\s+đổi\b/i.test(sourceName);
  return{
    orderCode:str(get(raw,'display_id|order_id|code|id'),'—'),
    createdAt:dt.toISOString(),
    createdDate:dateKey(dt),
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    sourceName,status,statusCode,statusName,
    returnedReasonName:str(get(raw,'returned_reason_name|return_reason_name|refund_reason_name|returned_reason'),'').trim(),
    returnedReasonCode:str(get(raw,'returned_reason|return_reason|refund_reason'),'').trim(),
    products,partialReturnProductDetailMissing,
    grossAmount,netAmount,discountAmount,codAmount,prepaidAmount,
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

  // Pancake pages can shift while orders are inserted or edited.
  // Two complete batched passes close page-boundary gaps without giving up
  // the faster parallel fetch used by the LIVE backend.
  for(let pass=1;pass<=2;pass++){
    let completed=false;
    for(let start=1;start<=200;start+=4){
      const pages=[start,start+1,start+2,start+3];
      const results=await Promise.all(pages.map(page=>fetchOrderPage(from,to,page)));
      for(let i=0;i<results.length;i++){
        const page=pages[i],result=results[i],bounds=pageBounds(result.data);
        result.data.forEach((raw,j)=>rawMap.set(rawOrderKey(raw,j),raw));
        if(!result.data.length || (bounds.max&&bounds.max<from) || (result.totalPages&&page>=result.totalPages)){
          completed=true;
          break;
        }
      }
      if(completed)break;
    }
    if(!completed)throw new Error('Pancake pagination limit reached');
  }

  // Re-read the newest page immediately before publishing the totals.
  const latest=await fetchOrderPage(from,to,1);
  latest.data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));

  const orders=[...rawMap.values()].map(normalize).filter(o=>o.createdDate>=from&&o.createdDate<=to);
  if(orders.some(o=>!Number.isFinite(o.netAmount)||o.netAmount<0))throw new Error('Invalid Pancake amount');
  return orders;
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
    meta:{source:'PANCAKE',transport:'VERCEL_DIRECT',lastUpdated:new Date().toISOString(),from,to,count:orders.length,statusDistribution,channelDistribution,dayReconciliation},
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
  const supplied=req.headers['x-dashboard-password']||req.body?.password||'';
  if(!supplied)return res.status(401).json({error:'Cần mật khẩu dashboard'});

  try{
    const creds=await loadCredentials(supplied);
    API_KEY=creds.apiKey;
    if(creds.shopId)SHOP_ID=creds.shopId;

    const action=String(req.body?.action||'live');
    if(action==='open'){
      // Fast path: use the encrypted snapshot when available. If Pages is
      // unavailable or its encrypted snapshot is stale/incompatible, fall back
      // to a direct month-to-date Pancake read instead of failing login.
      try{
        return res.status(200).json(await loadSnapshot(supplied));
      }catch(snapshotError){
        console.warn('Snapshot open failed; falling back to Pancake direct:',snapshotError?.message||snapshotError);
        await discoverShopId();
        const to=dateKey(),from=to.slice(0,7)+'-01';
        const cacheKey='open-direct|'+from+'|'+to;
        const now=Date.now();
        const hit=responseCache.get(cacheKey);
        if(hit&&now-hit.at<CACHE_MS)return res.status(200).json(hit.payload);
        const orders=await fetchOrders(from,to);
        const payload=buildPayload(orders,from,to);
        responseCache.set(cacheKey,{at:now,payload});
        return res.status(200).json(payload);
      }
    }

    await discoverShopId();
    const to=dateKey();
    let from=to.slice(0,7)+'-01';
    let partial=false;
    if(action==='delta'){
      const base=new Date(to+'T12:00:00+07:00');
      base.setUTCDate(base.getUTCDate()-6);
      from=dateKey(base);
      partial=true;
    }

    const cacheKey=action+'|'+from+'|'+to;
    const now=Date.now();
    const hit=responseCache.get(cacheKey);
    if(hit&&now-hit.at<CACHE_MS)return res.status(200).json(hit.payload);

    const orders=await fetchOrders(from,to);
    const payload=buildPayload(orders,from,to);
    if(partial){
      payload.meta.partial=true;
      payload.meta.partialWindowDays=7;
    }
    responseCache.set(cacheKey,{at:now,payload});
    return res.status(200).json(payload);
  }catch(e){
    if(e?.auth)return res.status(401).json({error:'Sai mật khẩu dashboard'});
    console.error(e);
    return res.status(502).json({error:'Không tải được Pancake lúc này'});
  }
}
