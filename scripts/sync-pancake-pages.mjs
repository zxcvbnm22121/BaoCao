import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const API_KEY=(process.env.PANCAKE_API_KEY||'').trim();
const SHOP_ID=(process.env.PANCAKE_SHOP_ID||'').trim();
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
function mapStatus(v){v=str(v).toLowerCase();if(/hủy|huy|cancel/.test(v))return'HUY';if(/hoàn|hoan|return|refund/.test(v))return'HOAN';if(/thành công|thanh cong|đã nhận|da nhan|delivered|completed|success/.test(v))return'THANH_CONG';if(/đang giao|dang giao|shipping|delivery|in transit/.test(v))return'DANG_GIAO';return'TREO'}
function mapChannel(raw,source=''){const v=`${str(raw)} ${str(source)}`.toLowerCase();if(/live/.test(v))return'Livestream';if(/shopee/.test(v))return'Shopee';if(/web|website|storecake/.test(v))return'Website';if(/zalo|cskh|crm/.test(v))return'Zalo/CSKH';if(/facebook|ads|meta|mess/.test(v))return'Facebook Ads';return'Khác'}
function normalize(raw){const status=mapStatus(get(raw,'status_name|status|shipping_status_name|order_status_name'));const total=num(get(raw,'total_amount|total|cod|total_price'));const source=get(raw,'order_source|source|page_id|conversation_type');const created=str(get(raw,'inserted_at|created_at|creation_time'),new Date().toISOString());let iso;try{iso=new Date(created).toISOString()}catch{iso=new Date().toISOString()}const partial=Boolean(get(raw,'is_partial_return|partial_return'));const partialAmount=num(get(raw,'successful_amount|received_amount'));return{createdAt:iso,salesStaff:str(get(raw,'assigning_seller.name|seller.name|creator.name|assigned_user.name|user_name'),'Chưa gán'),channel:mapChannel(get(raw,'order_source_name|channel|source_name|page_name'),source),status,totalAmount:total,successfulAmount:status==='THANH_CONG'?(partialAmount||total):(partial?partialAmount:0),isPartialReturn:partial}}

async function fetchOrders(from,to){const rows=[];for(let page=1;page<=120;page++){const url=new URL(`https://pos.pages.fm/api/v1/shops/${encodeURIComponent(SHOP_ID)}/orders`);url.searchParams.set('api_key',API_KEY);url.searchParams.set('from_date',from);url.searchParams.set('to_date',to);url.searchParams.set('page_number',String(page));url.searchParams.set('page_size','100');const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Pancake ${r.status}: ${(await r.text()).slice(0,180)}`);const body=await r.json();const data=Array.isArray(body.data)?body.data:Array.isArray(body.orders)?body.orders:Array.isArray(body)?body:[];rows.push(...data.map(normalize).filter(x=>x.totalAmount>=0));if(data.length<100)break}return rows}
function encryptJson(payload,password){const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(password,salt,210000,32,'sha256'),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const plain=Buffer.from(JSON.stringify(payload)),ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag(),combined=Buffer.concat([ciphertext,tag]);return{v:1,kdf:'PBKDF2-SHA256',iterations:210000,cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),data:combined.toString('base64')}}

await fs.mkdir('site/data',{recursive:true});
if(!API_KEY||!SHOP_ID||!PASSWORD){await fs.rm(OUT,{force:true});await fs.writeFile(STATUS,JSON.stringify({mode:'DEMO',updatedAt:new Date().toISOString(),reason:'Missing GitHub Secrets'},null,2));console.log('DEMO mode: set PANCAKE_API_KEY, PANCAKE_SHOP_ID and DASHBOARD_PASSWORD in GitHub Actions secrets.');process.exit(0)}
const today=dateKey(),from=today.slice(0,7)+'-01';
console.log(`Sync Pancake shop ${SHOP_ID}: ${from} -> ${today}`);
const orders=await fetchOrders(from,today);
const payload={meta:{source:'PANCAKE',lastUpdated:new Date().toISOString(),from,to:today,count:orders.length},monthlyTarget:MONTHLY_TARGET,channelTargets:CHANNEL_TARGETS,orders};
await fs.writeFile(OUT,JSON.stringify(encryptJson(payload,PASSWORD)));
await fs.writeFile(STATUS,JSON.stringify({mode:'LIVE',updatedAt:payload.meta.lastUpdated,count:orders.length},null,2));
console.log(`Synced ${orders.length} normalized orders; encrypted artifact written.`);
