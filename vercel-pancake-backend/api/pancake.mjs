import crypto from 'node:crypto';

const TZ='Asia/Ho_Chi_Minh';

let API_KEY=(process.env.PANCAKE_API_KEY||'').trim();
let SHOP_ID=(process.env.PANCAKE_SHOP_ID||'').trim();
const DASHBOARD_PASSWORD=(process.env.DASHBOARD_PASSWORD||'').trim();
const KEY_ARTIFACT='https://zxcvbnm22121.github.io/BaoCao/data/pancake-key.enc';
const LIVE_ARTIFACT='https://zxcvbnm22121.github.io/BaoCao/data/live.enc';
const ALLOWED_ORIGIN=(process.env.ALLOWED_ORIGIN||'https://zxcvbnm22121.github.io').replace(/\/$/,'');
const MONTHLY_TARGET=Number(process.env.MONTHLY_TARGET||2300000000);
const CHANNEL_TARGETS={"Facebook Ads":1350000000,"Livestream":650000000,"Zalo":50000000};
// The dashboard tracks only these channels; orders from any other channel
// (Shopee, Website, POS, unknown, ...) are left out of every total.
const TRACKED_CHANNELS=new Set(['Facebook Ads','Livestream','Zalo']);

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
    // Pancake POS returns naive order timestamps in UTC.
    // Convert them as UTC, then derive Vietnam business dates via dateKey().
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso))iso+='T00:00:00Z';
    else if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso))iso=iso.replace(' ','T')+'Z';
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
  const marketplace=get(rawOrder,'marketplace_id|partner|system_id');
  const utm=get(rawOrder,'p_utm_source|p_utm_medium|p_utm_campaign|ads_source');
  const page=get(rawOrder,'page.name|page.username');
  const v=`${str(raw)} ${str(source)} ${str(marketplace)} ${str(utm)} ${str(page)}`.toLowerCase();
  // A Live order is one whose Pancake order source is Live/Livestream.
  // Page names, UTM tags and live-flag fields do not decide it.
  const orderSource=str(get(rawOrder,'order_sources_name|order_source_name|source_name'));
  if(/(?:^|[^a-z0-9])live/i.test(orderSource))return'Livestream';
  // Zalo = orders from a Zalo page/account connected to Pancake. Pancake
  // prefixes those page ids with zl_ (Zalo OA) or pzl_ (personal Zalo).
  const pageId=str(get(rawOrder,'page_id|page.id|page_info.id|conversation.page.id')).trim().toLowerCase();
  const platform=str(get(rawOrder,'page.platform|page.type|page_info.platform|platform')).toLowerCase();
  if(/^p?zl_|^zalo/.test(pageId)||/zalo/.test(platform)||/zalo/.test(v))return'Zalo';
  if(/shopee/.test(v))return'Shopee';
  if(/tiktok/.test(v))return'TikTok Shop';
  if(/lazada/.test(v))return'Lazada';
  if(/webcake|website|web site|shopify|woocommerce/.test(v))return'Website';
  if(/facebook|messenger|meta|fb|page/.test(v)||/^\d+$/.test(pageId))return'Facebook Ads';
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
  let m=compact.match(/^([A-Z]\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])$/);
  if(m)return m[1];
  if(/^[A-Z]\d{6}[A-Z]{1,3}$/.test(compact)||/^[A-Z]\d{6}$/.test(compact))return compact;
  m=raw.match(/(?:^|[^A-Z0-9])([A-Z]\d{6}[A-Z]{1,3})(?:1[1-5]|[1-5])?(?=$|[^A-Z0-9])/);
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
  // Pancake keeps several per-item return counters (requested, returning,
  // returned). A 0 in one must not hide a positive value in another.
  const returnedValues=['returned_quantity','return_quantity','returned_count','returning_quantity','quantity_returned','returned_qty','return_qty']
    .map(k=>rawItem[k]).filter(v=>v!==undefined&&v!==null&&v!=='');
  const returnedRaw=returnedValues.length?Math.max(...returnedValues.map(num)):undefined;
  const quantity=Math.max(0,num(get(rawItem,'quantity|qty|count|total_quantity|variation.quantity|variation_info.quantity')),num(returnedRaw));
  if(!quantity)return null;

  const explicitCandidates=[
    get(rawItem,'variation_info.product_display_id'),
    get(rawItem,'variation.product_display_id'),
    get(rawItem,'product_display_id'),
    get(rawItem,'product_code'),
    get(rawItem,'product.code'),
    get(rawItem,'product.display_id'),
    get(rawItem,'product.sku'),
    get(rawItem,'variation.product_code'),
    get(rawItem,'variation_info.product_code')
  ];
  const variantCandidates=[
    get(rawItem,'variation_info.display_id'),
    get(rawItem,'variation_info.barcode'),
    get(rawItem,'variation.display_id'),
    get(rawItem,'variation.barcode'),
    get(rawItem,'sku'),
    get(rawItem,'variation.sku'),
    get(rawItem,'variation_info.sku'),
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
  for(const v of explicitCandidates.slice(0,3)){productCode=sevenParentCode(v);if(productCode)break}
  if(!productCode){
    for(const v of explicitCandidates.slice(3)){productCode=sevenParentCode(v);if(productCode)break}
  }
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
  // Value of one unit after its line discount, used to split partial returns.
  const retailPrice=num(get(rawItem,'variation_info.retail_price|variation.retail_price|retail_price|price'));
  const lineDiscountRaw=get(rawItem,'total_discount');
  const eachDiscount=num(get(rawItem,'discount_each_product'));
  const lineDiscount=lineDiscountRaw!==undefined
    ? num(lineDiscountRaw)
    : rawItem.is_discount_percent?retailPrice*quantity*eachDiscount/100:eachDiscount*quantity;
  const unitPrice=rawItem.is_bonus_product||!quantity?0:Math.max(0,retailPrice*quantity-lineDiscount)/quantity;

  return{
    sku,
    productCode,
    displayCode:productCode||'',
    name,
    imageUrl,
    productId,
    variationId,
    quantity,
    returnedQuantity,
    unitPrice
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
  // Canonical Pancake revenue rule:
  // use the order's after-discount total when Pancake provides it.
  // A valid value can be 0, so test for null rather than truthiness.
  // COD + prepaid is only a fallback when the after-discount field is absent.
  const netAmount=afterDiscountField!==null
    ? afterDiscountField
    : ((codAmount+prepaidAmount)||grossAmount);
  const discountAmount=Math.max(0,grossAmount-netAmount);
  const sourceName=str(get(raw,'order_sources_name|order_source_name|source_name'));
  const pageName=str(get(raw,'page.name|page_name|fanpage_name|facebook_page_name|page_info.name|conversation.page.name'),'').trim();
  const pageUsername=str(get(raw,'page.username|page_username|fanpage_username|page_info.username|conversation.page.username'),'').trim();
  const pageId=str(get(raw,'page_id|page.id|facebook_page_id|fb_page_id|page_info.id|conversation.page.id'),'').trim();
  const source=get(raw,'order_sources|order_sources_name|source|page_id|conversation_id');
  const dt=parsePancakeDate(get(raw,'inserted_at|created_at|creation_time'));
  const partial=statusCode===15||/part_returned|partial/i.test(statusName)||Boolean(get(raw,'is_partial_return|partial_return'));
  const products=extractProducts(raw,status,partial);
  const partialReturnProductDetailMissing=partial&&products.length>0&&!products.some(x=>Number(x.returnedQuantity)>0);
  const explicitSuccess=num(get(raw,'successful_amount|received_amount|collected_amount|paid_amount'));
  // Partial return: the customer kept some items and sent the rest back.
  // Returned value = returned units x their after-discount unit price;
  // successful revenue = the rest of the order total (kept items + shipping).
  // Without per-item return detail fall back to Pancake's paid/COD amount.
  let successfulAmount=0,returnedAmount=0;
  if(status==='THANH_CONG')successfulAmount=explicitSuccess||netAmount;
  else if(partial){
    const returnedGoods=products.reduce((a,x)=>a+(Number(x.unitPrice)||0)*(Number(x.returnedQuantity)||0),0);
    if(returnedGoods>0){
      returnedAmount=Math.min(netAmount,Math.round(returnedGoods));
      successfulAmount=netAmount-returnedAmount;
    }else{
      successfulAmount=Math.min(netAmount,explicitSuccess||codAmount||0);
      returnedAmount=netAmount-successfulAmount;
    }
  }else if(status==='HOAN')returnedAmount=netAmount;
  const excludedStatus=[6,7].includes(statusCode);
  const excludedExchangeSource=/^\s*(đơn|don)\s+đổi\b/i.test(sourceName);
  const excludedCskhSource=/^\s*cskh\b/i.test(sourceName);
  return{
    orderCode:str(get(raw,'display_id|order_id|code|id'),'—'),
    createdAt:dt.toISOString(),
    createdDate:dateKey(dt),
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    sourceName,pageName,pageUsername,pageId,status,statusCode,statusName,
    returnedReasonName:str(get(raw,'returned_reason_name|return_reason_name|refund_reason_name|returned_reason'),'').trim(),
    returnedReasonCode:str(get(raw,'returned_reason|return_reason|refund_reason'),'').trim(),
    products,partialReturnProductDetailMissing,
    grossAmount,netAmount,discountAmount,codAmount,prepaidAmount,
    totalAmount:netAmount,successfulAmount,returnedAmount,isPartialReturn:partial,excludedStatus,excludedExchangeSource,excludedCskhSource,
    excludedFromDefaultReport:excludedStatus||excludedExchangeSource||excludedCskhSource
  }
}

// The function has maxDuration 60s. Every Pancake read shares one per-request
// budget so retries and the optional second pass never push past it.
const REQUEST_BUDGET_MS=50000;
const FETCH_TIMEOUT_MS=15000;
const FETCH_ATTEMPTS=3;

async function fetchJson(url,deadline,attempt=1){
  const remaining=deadline-Date.now();
  if(remaining<1000)throw Object.assign(new Error('Pancake time budget exhausted'),{permanent:true});
  try{
    const r=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS,remaining))});
    if(!r.ok){
      if(r.status!==429&&r.status<500)throw Object.assign(new Error('Pancake API '+r.status),{permanent:true});
      throw new Error('Pancake API '+r.status);
    }
    return await r.json();
  }catch(e){
    const backoff=500*2**(attempt-1);
    if(attempt>=FETCH_ATTEMPTS||e.permanent||deadline-Date.now()<backoff+2000)throw e;
    await new Promise(resolve=>setTimeout(resolve,backoff));
    return fetchJson(url,deadline,attempt+1);
  }
}

async function discoverShopId(deadline){
  if(SHOP_ID)return SHOP_ID;
  const url=new URL('https://pos.pages.fm/api/v1/shops');
  url.searchParams.set('api_key',API_KEY);
  const body=await fetchJson(url,deadline);
  const shops=Array.isArray(body.shops)?body.shops:Array.isArray(body.data)?body.data:[];
  if(!shops.length)throw new Error('No Pancake shop found');
  SHOP_ID=String(shops[0].id);
  return SHOP_ID;
}

async function fetchOrderPage(from,to,page,deadline,useTime=true){
  const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(SHOP_ID)}/orders`);
  url.searchParams.set('api_key',API_KEY);
  url.searchParams.set('from_date',from);
  url.searchParams.set('to_date',to);
  // Pancake POS filters the order list by creation time with unix-second
  // startDateTime/endDateTime (+ updateStatus); from_date/to_date are ignored,
  // which made every read page back from the newest order.
  if(useTime){
    url.searchParams.set('updateStatus','inserted_at');
    url.searchParams.set('startDateTime',String(Math.floor(Date.parse(from+'T00:00:00+07:00')/1000)));
    url.searchParams.set('endDateTime',String(Math.floor(Date.parse(to+'T23:59:59+07:00')/1000)));
  }
  url.searchParams.set('page_number',String(page));
  url.searchParams.set('page_size','500');
  [0,17,1,11,20,12,13,8,9,2,3,16,4,15,5,6,7].forEach(s=>url.searchParams.append('filter_status[]',String(s)));
  const body=await fetchJson(url,deadline);
  const data=Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];
  const totalPages=num(get(body,'total_pages|pagination.total_pages|paging.total_pages|meta.total_pages'));
  return {data,totalPages}
}

function keepTrackedChannels(orders){
  const counts={},dropped={};
  for(const o of orders){
    counts[o.channel]=(counts[o.channel]||0)+1;
    if(!TRACKED_CHANNELS.has(o.channel)){
      const k=`${o.channel}|nguồn=${o.sourceName||'-'}|page=${o.pageId||'-'}`;
      dropped[k]=(dropped[k]||0)+1
    }
  }
  const top=Object.entries(dropped).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>k+'×'+n).join('; ');
  console.log('[pancake] channels',JSON.stringify(counts),top?'| dropped: '+top:'');
  return orders.filter(o=>TRACKED_CHANNELS.has(o.channel))
}
// Per-day bridge to the Pancake POS order list, built BEFORE channels are
// dropped. POS "Tất cả" with CSKH / Đơn đổi sources excluded still counts
// cancelled orders and every channel; the dashboard total removes cancelled
// orders and anything outside Ads / Live / Zalo. Shipping both parts lets the
// UI prove: POS total - cancelled - other channels = dashboard total.
function posReconciliationOf(orders){
  const days={};
  for(const o of orders){
    if(o.excludedExchangeSource||o.excludedCskhSource)continue;
    const d=days[o.createdDate]??={posOrders:0,posNet:0,cancelledOrders:0,cancelledNet:0,untrackedOrders:0,untrackedNet:0};
    d.posOrders++;d.posNet+=o.netAmount;
    if(o.excludedStatus){d.cancelledOrders++;d.cancelledNet+=o.netAmount}
    else if(!TRACKED_CHANNELS.has(o.channel)){d.untrackedOrders++;d.untrackedNet+=o.netAmount}
  }
  return days
}
function rawOrderKey(raw,index=0){return str(get(raw,'id|display_id|order_id|code'))||`${str(get(raw,'inserted_at|created_at|creation_time'))}:${index}`}
// One malformed Pancake order (missing timestamp, negative amount) must not
// fail the whole dashboard: skip it, log it and report the count in meta.
const normalizedCache=new WeakMap();
function safeNormalize(raw){
  if(normalizedCache.has(raw))return normalizedCache.get(raw);
  let order=null;
  try{
    order=normalize(raw);
    if(!Number.isFinite(order.netAmount)||order.netAmount<0)throw new Error('Invalid Pancake amount');
  }catch{
    order=null;
  }
  normalizedCache.set(raw,order);
  return order;
}
function pageBounds(data){
  const dates=data.map(safeNormalize).filter(Boolean).map(o=>o.createdDate).sort();
  return {min:dates[0]||null,max:dates[dates.length-1]||null}
}

async function scanOrders(from,to,deadline,useTime){
  // Vietnam is UTC+7. Pancake's naive timestamps are UTC, so the first
  // seven hours of a Vietnam business day sit on the previous UTC date.
  // Read one extra API date at the beginning, then filter by createdDate.
  const apiFromDate=new Date(from+'T00:00:00Z');
  apiFromDate.setUTCDate(apiFromDate.getUTCDate()-1);
  const apiFrom=apiFromDate.toISOString().slice(0,10);

  // Pancake pages can shift while orders are inserted or edited.
  // A second batched pass closes page-boundary gaps, but only when the
  // range spans more than one page and the first pass left enough of the
  // time budget to repeat it safely. A single page has no boundary to slip
  // through, so short ranges (e.g. one day) finish after one round.
  let passes=0;const rawMap=new Map();
  for(let pass=1;pass<=2;pass++){
    const passStart=Date.now();
    let completed=false,lastPage=0;
    for(let start=1;start<=200;start+=4){
      const pages=[start,start+1,start+2,start+3];
      const results=await Promise.all(pages.map(page=>fetchOrderPage(apiFrom,to,page,deadline,useTime)));
      for(let i=0;i<results.length;i++){
        const page=pages[i],result=results[i],bounds=pageBounds(result.data);
        result.data.forEach((raw,j)=>rawMap.set(rawOrderKey(raw,j),raw));
        lastPage=page;
        if(!result.data.length || (bounds.max&&bounds.max<from) || (result.totalPages&&page>=result.totalPages)){
          completed=true;
          break;
        }
      }
      if(completed)break;
    }
    if(!completed)throw new Error('Pancake pagination limit reached');
    passes=pass;
    if(lastPage===1)break;
    const passMs=Date.now()-passStart;
    if(deadline-Date.now()<passMs*1.5+5000)break;
  }

  // Re-read the newest page immediately before publishing the totals,
  // unless only one pass fit (that pass already read page 1 recently).
  if(passes===2&&deadline-Date.now()>FETCH_TIMEOUT_MS){
    const latest=await fetchOrderPage(apiFrom,to,1,deadline,useTime);
    latest.data.forEach((raw,i)=>rawMap.set(rawOrderKey(raw,i),raw));
  }

  return {rawMap,passes};
}

async function fetchOrders(from,to,deadline){
  const first=await scanOrders(from,to,deadline,true);
  // Safety net: if the time filter ever returns nothing, read the old way.
  const scan=first.rawMap.size||deadline-Date.now()<FETCH_TIMEOUT_MS?first:(console.warn('[pancake] time-filtered read returned no orders; retrying without it'),await scanOrders(from,to,deadline,false));
  const rawMap=scan.rawMap,passes=scan.passes;

  const raws=[...rawMap.values()];
  const normalized=raws.map(safeNormalize);
  const skippedIds=raws.filter((raw,i)=>!normalized[i]).map(raw=>str(get(raw,'display_id|id|order_id|code'),'?'));
  const skippedOrders=skippedIds.length;
  if(skippedOrders)console.warn(`Skipped ${skippedOrders} malformed Pancake order(s):`,skippedIds.slice(0,20).join(', '));
  const inRange=normalized.filter(o=>o&&o.createdDate>=from&&o.createdDate<=to);
  const posReconciliation=posReconciliationOf(inRange);
  const orders=keepTrackedChannels(inRange);
  return {orders,stats:{passes,skippedOrders,posReconciliation}};
}

function buildPayload({orders,stats},from,to){
  const statusDistribution=orders.reduce((m,o)=>{const k=`${o.statusCode}:${o.status}`;m[k]=(m[k]||0)+1;return m},{});
  const channelDistribution=orders.reduce((m,o)=>{const k=o.channel||'Khác';m[k]=(m[k]||0)+1;return m},{});
  const reportOrders=orders.filter(o=>!o.excludedFromDefaultReport);
  const pageRelevant=reportOrders.filter(o=>o.channel==='Facebook Ads'||o.channel==='Livestream'||o.pageName||o.pageUsername||o.pageId);
  const pageIdentified=pageRelevant.filter(o=>o.pageName||o.pageUsername||o.pageId);
  const pageCoverage={
    relevantOrders:pageRelevant.length,
    identifiedOrders:pageIdentified.length,
    unidentifiedOrders:pageRelevant.length-pageIdentified.length,
    distinctPages:new Set(pageIdentified.map(o=>String(o.pageId||o.pageName||o.pageUsername).trim().toLowerCase()).filter(Boolean)).size
  };
  const productLines=reportOrders.flatMap(o=>Array.isArray(o.products)?o.products:[]);
  const codedProductLines=productLines.filter(x=>String(x.productCode||x.displayCode||'').trim());
  const productCoverage={
    lineItems:productLines.length,
    codedLineItems:codedProductLines.length,
    missingCodeLineItems:productLines.length-codedProductLines.length,
    distinctCodes:new Set(codedProductLines.map(x=>String(x.productCode||x.displayCode).trim().toUpperCase())).size
  };
  const dayReconciliation={};
  for(const o of reportOrders){
    const d=dayReconciliation[o.createdDate]??={orders:0,net:0,cod:0,prepaid:0,gross:0};
    d.orders++;d.net+=o.netAmount;d.cod+=o.codAmount;d.prepaid+=o.prepaidAmount;d.gross+=o.grossAmount;
  }
  return {
    meta:{source:'PANCAKE',transport:'VERCEL_DIRECT',lastUpdated:new Date().toISOString(),from,to,count:orders.length,fetchPasses:stats.passes,skippedOrders:stats.skippedOrders,statusDistribution,channelDistribution,dayReconciliation,posReconciliation:stats.posReconciliation||{},pageCoverage,productCoverage},
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

// ---------- Sale daily report: numbers the Sales type in ----------
// Stored in a private Vercel Blob store, one JSON document per month:
//   sale-report/v1/2026-11.json → {version,month,updatedAt,
//     entries:{[staff]:{[date]:{data,at}}},            Ads: Data Ads per Sale
//     live:{[date]:{data,orders,revenue,qty,at}},       Live: typed, one row per day
//     zalo:{[date]:{staff,posts,interested,at}},        Zalo: one row per day
//     web:{[date]:{staff,orders,revenue,qty,note,at}}}  Website: one row per day
// Reads skip the CDN cache (useCache:false) so every device sees the newest
// numbers, and each write is conditional on the ETag read just before it
// (ifMatch). Two Sales saving at the same moment retry instead of one
// silently overwriting the other.
const SALE_REPORT_PREFIX='sale-report/v1/';
const SALE_NAME_MAX=60,SALE_DATA_MAX=1000000,SALE_STAFF_MAX=40,SALE_NOTE_MAX=200;
const SALE_CACHE_MS=8000;
// Typed fields of the one-row-per-day reports: [min,max] for integers.
const SALE_ROW_FIELDS={
  live:{data:[0,1000000,'Data Live'],orders:[0,10000,'Đơn Live'],revenue:[0,100000000000,'Doanh số Live'],qty:[0,100000,'SP']},
  zalo:{staff:'staff',posts:[0,10000,'Bài đăng'],interested:[0,1000000,'KH quan tâm']},
  web:{staff:'staff',orders:[0,10000,'Đơn Web'],revenue:[0,100000000000,'Doanh số Web'],qty:[0,100000,'SP'],note:'text'}
};
const saleMonthCache=new Map();
let blobModulePromise=null;
function blobApi(){
  // Loaded on demand: a missing or broken Blob package must only affect the
  // Sale report, never the Pancake revenue actions.
  if(!blobModulePromise)blobModulePromise=import('@vercel/blob').catch(e=>{blobModulePromise=null;throw e});
  return blobModulePromise
}
function saleError(status,message){return Object.assign(new Error(message),{saleStatus:status})}
function validMonth(v){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''))}
function validDay(v){
  const s=String(v||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s
}
function cleanStaffName(v){
  const s=String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim();
  return s.length&&s.length<=SALE_NAME_MAX?s:''
}
// "Thu - SOL" and "Thu SOL" are the same Sale; accents still count (Thu ≠ Thư).
function staffKey(v){return String(v??'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}
// One day of the Live / Zalo / Website report. strict=true rejects bad numbers
// (a save); strict=false drops them (reading what is already stored).
function cleanSaleRow(kind,row,strict){
  const spec=SALE_ROW_FIELDS[kind],out={};
  for(const [field,rule] of Object.entries(spec)){
    const v=row?.[field];
    if(rule==='staff'){const s=cleanStaffName(v);if(s)out[field]=s;continue}
    if(rule==='text'){const s=String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,SALE_NOTE_MAX);if(s)out[field]=s;continue}
    if(v===null||v===undefined||String(v).trim()==='')continue;
    const n=Number(v);
    if(Number.isInteger(n)&&n>=rule[0]&&n<=rule[1])out[field]=n;
    else if(strict)throw saleError(400,`${rule[2]} phải là số nguyên từ ${rule[0]} đến ${rule[1]}`);
  }
  return out
}
function emptySaleDoc(month){return {version:1,month,updatedAt:null,entries:{},live:{},zalo:{},web:{}}}
// Keep only well-formed entries of this month, whatever the stored file holds.
function cleanSaleDoc(doc,month){
  const out=emptySaleDoc(month);
  if(!doc||typeof doc!=='object')return out;
  out.updatedAt=typeof doc.updatedAt==='string'?doc.updatedAt:null;
  for(const [rawStaff,days] of Object.entries(doc.entries||{})){
    const staff=cleanStaffName(rawStaff);
    if(!staff||!days||typeof days!=='object')continue;
    for(const [day,v] of Object.entries(days)){
      const n=Number(v?.data);
      if(!validDay(day)||!day.startsWith(month)||!Number.isInteger(n)||n<0||n>SALE_DATA_MAX)continue;
      (out.entries[staff]??={})[day]={data:n,at:typeof v.at==='string'?v.at:null};
    }
  }
  for(const kind of Object.keys(SALE_ROW_FIELDS)){
    for(const [day,row] of Object.entries(doc[kind]||{})){
      if(!validDay(day)||!day.startsWith(month))continue;
      const clean=cleanSaleRow(kind,row,false);
      if(Object.keys(clean).length)out[kind][day]={...clean,at:typeof row?.at==='string'?row.at:null};
    }
  }
  return out
}
function salePath(month){return SALE_REPORT_PREFIX+month+'.json'}
// The ETag a read returns must be the exact one the write API compares
// against. Once a month file grows past ~1 KB the CDN compresses it for
// clients that accept gzip/br and sends a weak ETag (W/"…") that never
// matches, so every save failed with "ETag mismatch". Asking for the plain
// bytes keeps the strong ETag; stripping W/ covers any proxy that still
// weakens it.
function strongEtag(v){
  const s=String(v??'').trim().replace(/^W\//i,'');
  return s||null
}
async function readSaleMonth(month){
  const {get}=await blobApi();
  let res=null;
  try{
    res=await get(salePath(month),{access:'private',useCache:false,headers:{'accept-encoding':'identity'},abortSignal:AbortSignal.timeout(10000)});
  }catch(e){
    if(e?.constructor?.name==='BlobNotFoundError')res=null;else throw e
  }
  if(!res||res.statusCode!==200||!res.stream)return {doc:emptySaleDoc(month),etag:null};
  const text=await new Response(res.stream).text();
  let parsed=null;
  try{parsed=JSON.parse(text)}catch{console.warn('[sale-report] stored month is not valid JSON:',month)}
  return {doc:cleanSaleDoc(parsed,month),etag:strongEtag(res.blob?.etag),rawEtag:res.blob?.etag||null}
}
async function loadSaleMonth(month,{fresh=false}={}){
  const hit=saleMonthCache.get(month);
  if(!fresh&&hit&&Date.now()-hit.at<SALE_CACHE_MS)return hit.doc;
  const {doc}=await readSaleMonth(month);
  saleMonthCache.set(month,{at:Date.now(),doc});
  return doc
}
function isWriteConflict(e){
  return e?.constructor?.name==='BlobPreconditionFailedError'||/precondition|already exists/i.test(String(e?.message||''))
}
// Read → change → write, retried when someone else wrote in between.
async function updateSaleMonth(month,change){
  const {put}=await blobApi();
  for(let attempt=1;attempt<=5;attempt++){
    const {doc,etag,rawEtag}=await readSaleMonth(month);
    change(doc);
    if(Object.keys(doc.entries).length>SALE_STAFF_MAX)throw saleError(400,'Quá nhiều tên Sale trong tháng này');
    doc.updatedAt=new Date().toISOString();
    try{
      await put(salePath(month),JSON.stringify(doc),{
        access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,
        // New file: refuse to replace one created a moment ago by someone else.
        // Existing file: only replace the exact version read above.
        ...(etag?{ifMatch:etag}:{allowOverwrite:false}),
        abortSignal:AbortSignal.timeout(10000)
      });
      saleMonthCache.set(month,{at:Date.now(),doc});
      return doc
    }catch(e){
      if(isWriteConflict(e))console.warn(`[sale-report] write conflict ${month} attempt=${attempt} etag=${JSON.stringify(rawEtag)}`);
      if(!isWriteConflict(e)||attempt===5)throw e;
      await new Promise(r=>setTimeout(r,120*attempt+Math.floor(Math.random()*120)))
    }
  }
}
function setAdsEntry(doc,staff,date,value){
  // One number per Sale per day, whichever spelling of the name it was saved under.
  const key=staffKey(staff);
  for(const name of Object.keys(doc.entries)){
    if(staffKey(name)!==key)continue;
    delete doc.entries[name][date];
    if(!Object.keys(doc.entries[name]).length)delete doc.entries[name]
  }
  if(value!==null)(doc.entries[staff]??={})[date]={data:value,at:new Date().toISOString()}
}
function setDayRow(doc,kind,date,row){
  if(Object.keys(row).length)doc[kind][date]={...row,at:new Date().toISOString()};
  else delete doc[kind][date]
}
function parseSaleValue(v){
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const n=Number(v);
  if(!Number.isInteger(n)||n<0||n>SALE_DATA_MAX)throw saleError(400,'Data phải là số nguyên từ 0 đến '+SALE_DATA_MAX);
  return n
}
async function handleSaleReport(action,body,res,startedAt){
  try{
    if(action==='saleReport'){
      const month=String(body?.month||'').trim();
      if(!validMonth(month))return res.status(400).json({error:'Tháng không hợp lệ'});
      const doc=await loadSaleMonth(month,{fresh:Boolean(body?.fresh)});
      console.log(`[sale-report] read ${month} staff=${Object.keys(doc.entries).length} live=${Object.keys(doc.live).length} zalo=${Object.keys(doc.zalo).length} web=${Object.keys(doc.web).length} ${Date.now()-startedAt}ms`);
      return res.status(200).json(doc)
    }
    const kind=String(body?.kind||'ads');
    const date=String(body?.date||'').trim();
    if(!validDay(date))return res.status(400).json({error:'Ngày không hợp lệ'});
    let doc;
    if(kind==='ads'){
      const staff=cleanStaffName(body?.staff);
      if(!staff)return res.status(400).json({error:'Chưa chọn tên Sale'});
      const value=parseSaleValue(body?.value);
      doc=await updateSaleMonth(date.slice(0,7),d=>setAdsEntry(d,staff,date,value));
      console.log(`[sale-report] save ads ${date} staff=${JSON.stringify(staff)} value=${value??'(xoá)'} ${Date.now()-startedAt}ms`);
    }else if(Object.hasOwn(SALE_ROW_FIELDS,kind)){
      const row=cleanSaleRow(kind,body?.row,true);
      doc=await updateSaleMonth(date.slice(0,7),d=>setDayRow(d,kind,date,row));
      console.log(`[sale-report] save ${kind} ${date} ${JSON.stringify(row)} ${Date.now()-startedAt}ms`);
    }else return res.status(400).json({error:'Loại báo cáo không hợp lệ'});
    return res.status(200).json(doc)
  }catch(e){
    if(e?.saleStatus)return res.status(e.saleStatus).json({error:e.message});
    const msg=String(e?.message||e);
    console.error(`[sale-report] ${action} failed after ${Date.now()-startedAt}ms:`,e);
    if(/No blob credentials|No read-write token|Cannot find (module|package) '@vercel\/blob'|ERR_MODULE_NOT_FOUND|store_not_found|BlobStoreNotFound/i.test(msg+' '+(e?.code||'')+' '+(e?.constructor?.name||''))){
      return res.status(503).json({error:'Chưa cấu hình kho lưu Data trên Vercel (Blob store)'})
    }
    if(isWriteConflict(e))return res.status(409).json({error:'Có người vừa lưu cùng lúc, hãy bấm lưu lại'});
    return res.status(502).json({error:action==='saleReport'?'Không đọc được Data đã lưu':'Không lưu được Data lúc này'})
  }
}

function logServed(action,payload,startedAt,cached=false){
  const m=payload?.meta||{};
  console.log(`[pancake] ${action} ${m.from||'?'}→${m.to||'?'} orders=${m.count??payload?.orders?.length??0} passes=${m.fetchPasses??'-'} skipped=${m.skippedOrders??0} ${cached?'cache ':''}${Date.now()-startedAt}ms`);
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
  const startedAt=Date.now(),deadline=startedAt+REQUEST_BUDGET_MS;

  try{
    const creds=await loadCredentials(supplied);
    API_KEY=creds.apiKey;
    if(creds.shopId)SHOP_ID=creds.shopId;

    const action=String(req.body?.action||'live');
    if(action==='saleReport'||action==='saleReportSave')return handleSaleReport(action,req.body,res,startedAt);
    if(action==='open'){
      // Fast path: use the encrypted snapshot when available. If Pages is
      // unavailable or its encrypted snapshot is stale/incompatible, fall back
      // to a direct month-to-date Pancake read instead of failing login.
      try{
        const snapshot=await loadSnapshot(supplied);
        logServed('open-snapshot',snapshot,startedAt);
        return res.status(200).json(snapshot);
      }catch(snapshotError){
        console.warn('Snapshot open failed; falling back to Pancake direct:',snapshotError?.message||snapshotError);
        await discoverShopId(deadline);
        const to=dateKey(),from=to.slice(0,7)+'-01';
        const cacheKey='open-direct|'+from+'|'+to;
        const now=Date.now();
        const hit=responseCache.get(cacheKey);
        if(hit&&now-hit.at<CACHE_MS){logServed('open-direct',hit.payload,startedAt,true);return res.status(200).json(hit.payload)}
        const result=await fetchOrders(from,to,deadline);
        const payload=buildPayload(result,from,to);
        responseCache.set(cacheKey,{at:now,payload});
        logServed('open-direct',payload,startedAt);
        return res.status(200).json(payload);
      }
    }

    await discoverShopId(deadline);

    if(action==='products'||action==='range'){
      const from=String(req.body?.from||'').trim();
      const to=String(req.body?.to||'').trim();
      const valid=/^\d{4}-\d{2}-\d{2}$/;
      if(!valid.test(from)||!valid.test(to)||from>to){
        return res.status(400).json({error:'Khoảng ngày không hợp lệ'})
      }
      const cacheKey='range|'+from+'|'+to;
      const now=Date.now();
      const hit=responseCache.get(cacheKey);
      if(hit&&now-hit.at<CACHE_MS){logServed(action,hit.payload,startedAt,true);return res.status(200).json(hit.payload)}
      const result=await fetchOrders(from,to,deadline);
      const payload=buildPayload(result,from,to);
      if(action==='products')payload.meta.productRange=true;
      responseCache.set(cacheKey,{at:now,payload});
      logServed(action,payload,startedAt);
      return res.status(200).json(payload)
    }

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
    if(hit&&now-hit.at<CACHE_MS){logServed(action,hit.payload,startedAt,true);return res.status(200).json(hit.payload)}

    const result=await fetchOrders(from,to,deadline);
    const payload=buildPayload(result,from,to);
    if(partial){
      payload.meta.partial=true;
      payload.meta.partialWindowDays=7;
    }
    responseCache.set(cacheKey,{at:now,payload});
    logServed(action,payload,startedAt);
    return res.status(200).json(payload);
  }catch(e){
    if(e?.auth)return res.status(401).json({error:'Sai mật khẩu dashboard'});
    console.error(`[pancake] ${String(req.body?.action||'live')} failed after ${Date.now()-startedAt}ms:`,e);
    return res.status(502).json({error:'Không tải được Pancake lúc này'});
  }
}
