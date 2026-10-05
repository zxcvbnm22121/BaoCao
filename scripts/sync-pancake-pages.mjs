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
  const total=num(get(raw,'total_amount|total|total_price|cod'));
  const cod=num(get(raw,'cod|cod_amount|money_to_collect|total_cod'));
  const source=get(raw,'order_sources|order_sources_name|source|page_id|conversation_id');
  const created=str(get(raw,'inserted_at|created_at|creation_time'),new Date().toISOString());
  let iso;try{iso=new Date(created).toISOString()}catch{iso=new Date().toISOString()}
  const partial=statusCode===15||/part_returned|partial/i.test(statusName)||Boolean(get(raw,'is_partial_return|partial_return'));
  const explicitSuccess=num(get(raw,'successful_amount|received_amount|collected_amount|paid_amount'));
  let successfulAmount=0;
  if(status==='THANH_CONG')successfulAmount=explicitSuccess||total;
  else if(partial)successfulAmount=cod||explicitSuccess||0;
  return{
    createdAt:iso,
    salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),
    channel:mapChannel(get(raw,'order_sources_name|order_sources|ads_source|p_utm_source|page.name'),source,raw),
    status,
    statusCode,
    statusName,
    totalAmount:total,
    successfulAmount,
    isPartialReturn:partial
  }
}

async function discoverShopId(){if(SHOP_ID)return SHOP_ID;const url=new URL('https://pos.pages.fm/api/v1/shops');url.searchParams.set('api_key',API_KEY);const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Pancake shops ${r.status}: ${(await r.text()).slice(0,180)}`);const body=await r.json();const shops=Array.isArray(body.shops)?body.shops:Array.isArray(body.data)?body.data:[];if(!shops.length)throw new Error('API Key hợp lệ nhưng không tìm thấy shop Pancake nào.');if(shops.length>1)console.log(`API Key trả về ${shops.length} shop; dùng shop đầu tiên: ${shops[0].id} - ${shops[0].name||''}`);SHOP_ID=String(shops[0].id);return SHOP_ID}

async function fetchOrderPage(from,to,page){
  const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(SHOP_ID)}/orders`);
  url.searchParams.set('api_key',API_KEY);
  url.searchParams.set('from_date',from);
  url.searchParams.set('to_date',to);
  url.searchParams.set('page_number',String(page));
  url.searchParams.set('page_size','100');
  const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`Pancake ${r.status}: ${(await r.text()).slice(0,180)}`);
  const body=await r.json();
  const data=Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];
  const totalPages=num(get(body,'total_pages|pagination.total_pages|paging.total_pages|meta.total_pages'));
  return {data,totalPages,body}
}

async function fetchOrders(from,to){
  const first=await fetchOrderPage(from,to,1);
  const rows=[...first.data.map(normalize).filter(x=>x.totalAmount>=0)];
  console.log(`Orders page 1: ${first.data.length} rows${first.totalPages?' / '+first.totalPages+' pages':''}`);
  if(first.data[0]){
    const raw=first.data[0];
    const nested=Object.entries(raw).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)).slice(0,20).map(([k,v])=>[k,Object.keys(v).sort().slice(0,40)]);
    console.log('ORDER_SCHEMA_KEYS:',JSON.stringify(Object.keys(raw).sort()));
    console.log('ORDER_NESTED_SCHEMA_KEYS:',JSON.stringify(nested));
    const norm=normalize(raw);
    console.log('ORDER_DATE_DIAGNOSTIC:',JSON.stringify({createdAt:norm.createdAt,statusCode:norm.statusCode,statusName:norm.statusName}));
  }
  if(!first.data.length||first.data.length<100)return rows;

  if(first.totalPages){
    const maxPages=Math.min(200,first.totalPages);
    for(let fromPage=2;fromPage<=maxPages;fromPage+=5){
      const pages=Array.from({length:Math.min(5,maxPages-fromPage+1)},(_,i)=>fromPage+i);
      const batch=await Promise.all(pages.map(p=>fetchOrderPage(from,to,p)));
      for(let i=0;i<batch.length;i++){
        const page=pages[i],data=batch[i].data;
        console.log(`Orders page ${page}: ${data.length} rows / ${maxPages} pages`);
        rows.push(...data.map(normalize).filter(x=>x.totalAmount>=0));
      }
    }
    return rows
  }

  const seenPages=new Set();
  const firstA=first.data[0]||{},firstB=first.data[first.data.length-1]||{};
  seenPages.add(`${first.data.length}:${str(get(firstA,'id|display_id|order_id|code'))}:${str(get(firstB,'id|display_id|order_id|code'))}`);
  for(let page=2;page<=40;page++){
    const res=await fetchOrderPage(from,to,page),data=res.data;
    const a=data[0]||{},b=data[data.length-1]||{};
    const sig=`${data.length}:${str(get(a,'id|display_id|order_id|code'))}:${str(get(b,'id|display_id|order_id|code'))}`;
    if(seenPages.has(sig)){console.log(`Pagination repeated at page ${page}; stopping.`);break}
    seenPages.add(sig);
    console.log(`Orders page ${page}: ${data.length} rows`);
    rows.push(...data.map(normalize).filter(x=>x.totalAmount>=0));
    if(!data.length||data.length<100)break;
  }
  return rows
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
console.log('Seven.AM status distribution:',JSON.stringify(statusDistribution));
console.log('Seven.AM channel distribution:',JSON.stringify(channelDistribution));
const payload={meta:{source:'PANCAKE',lastUpdated:new Date().toISOString(),from,to:today,count:orders.length,statusDistribution,channelDistribution},monthlyTarget:MONTHLY_TARGET,channelTargets:CHANNEL_TARGETS,orders};
await fs.writeFile(OUT,JSON.stringify(encryptJson(payload,PASSWORD)));
await fs.writeFile(STATUS,JSON.stringify({mode:'LIVE',updatedAt:payload.meta.lastUpdated,count:orders.length},null,2));
console.log(`Synced ${orders.length} normalized orders; encrypted artifact written.`);
