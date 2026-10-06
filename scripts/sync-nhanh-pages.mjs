import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const APP_ID=(process.env.NHANH_APP_ID||'').trim();
const BUSINESS_ID=(process.env.NHANH_BUSINESS_ID||'').trim();
const ACCESS_TOKEN=(process.env.NHANH_ACCESS_TOKEN||'').trim();
const PASSWORD=process.env.DASHBOARD_PASSWORD||'';
const BASE='https://pos.open.nhanh.vn/v3.0';
const OUT='site/nhanh/data/live.enc';
const STATUS='site/nhanh/data/status.json';
const TZ='Asia/Bangkok';

const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const num=v=>{const n=Number(v??0);return Number.isFinite(n)?n:0};
const str=(v,f='')=>v==null?f:String(v);

async function api(path,body={}){
  const url=new URL(BASE+path);
  url.searchParams.set('appId',APP_ID);
  url.searchParams.set('businessId',BUSINESS_ID);
  const r=await fetch(url,{
    method:'POST',
    headers:{Authorization:ACCESS_TOKEN,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(25000)
  });
  if(!r.ok)throw new Error(`Nhanh ${path} HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);
  const json=await r.json();
  if(Number(json.code)!==1)throw new Error(`Nhanh ${path}: ${JSON.stringify(json).slice(0,300)}`);
  return json
}

async function fetchDepots(){
  const first=await api('/business/depot',{filters:{ids:[]}});
  const rows=[...(Array.isArray(first.data)?first.data:[])];
  let next=first?.paginator?.next;
  let guard=0;
  while(next&&guard++<50){
    const res=await api('/business/depot',{filters:{ids:[]},paginator:{size:100,next}});
    rows.push(...(Array.isArray(res.data)?res.data:[]));
    next=res?.paginator?.next;
  }
  const seen=new Set();
  return rows.filter(x=>x&&x.id!=null&&!seen.has(String(x.id))&&seen.add(String(x.id))).map(x=>({
    id:String(x.id),code:str(x.code),name:str(x.name,'Kho '+x.id),mobile:str(x.mobile),
    location:x.location||{}
  }))
}

function normalizeBill(raw){
  const payment=raw.payment||{},products=Array.isArray(raw.products)?raw.products:[];
  const amount=num(payment.amount);
  const discount=num(payment.discount);
  const productQty=products.reduce((a,p)=>a+num(p.quantity),0);
  return {
    id:String(raw.id),
    depotId:String(raw.depotId??''),
    orderId:raw.orderId??null,
    date:str(raw.date).slice(0,10),
    createdAt:num(raw.createdAt),
    saleId:raw.sale?.id??null,
    saleName:str(raw.sale?.name,'Chưa gán'),
    amount,
    discount,
    grossAmount:amount+discount,
    productQty,
    returnAmount:num(payment.returnAmount),
    cash:num(payment.cash?.amount),
    transfer:num(payment.transfer?.amount),
    credit:num(payment.credit?.amount),
    installment:num(payment.installment?.amount)
  }
}

async function fetchRetailBills(fromDate,toDate){
  const rows=[];
  let next=null,guard=0;
  do{
    const body={filters:{fromDate,toDate},paginator:{size:100},dataOptions:{}};
    if(next)body.paginator.next=next;
    const res=await api('/bill/retail',body);
    const data=Array.isArray(res.data)?res.data:[];
    rows.push(...data.map(normalizeBill));
    console.log(`Nhanh retail page ${guard+1}: ${data.length} bills`);
    next=res?.paginator?.next||null;
    guard++;
  }while(next&&guard<500);
  return rows
}

function encryptJson(payload,password){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(password,salt,210000,32,'sha256');
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const plain=Buffer.from(JSON.stringify(payload));
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
  return {v:1,kdf:'PBKDF2-SHA256',iterations:210000,cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),data:Buffer.concat([ciphertext,tag]).toString('base64')}
}

await fs.mkdir('site/nhanh/data',{recursive:true});

if(!APP_ID||!BUSINESS_ID||!ACCESS_TOKEN||!PASSWORD){
  await fs.rm(OUT,{force:true});
  await fs.writeFile(STATUS,JSON.stringify({mode:'DEMO',updatedAt:new Date().toISOString(),reason:'Missing Nhanh GitHub Secrets'},null,2));
  console.log('Nhanh dashboard DEMO mode: add NHANH_APP_ID, NHANH_BUSINESS_ID, NHANH_ACCESS_TOKEN and DASHBOARD_PASSWORD.');
  process.exit(0)
}

const today=dateKey(),from=today.slice(0,7)+'-01';
console.log(`Sync Nhanh.vn: ${from} -> ${today}`);
const [depots,bills]=await Promise.all([fetchDepots(),fetchRetailBills(from,today)]);

const depotTotals=bills.reduce((m,b)=>{m[b.depotId]=(m[b.depotId]||0)+b.amount;return m},{});
console.log('Nhanh depots:',depots.length,'Retail bills:',bills.length);
console.log('Nhanh depot revenue keys:',Object.keys(depotTotals).length);

const payload={meta:{source:'NHANH',lastUpdated:new Date().toISOString(),from,to:today,depots:depots.length,bills:bills.length},depots,bills};
await fs.writeFile(OUT,JSON.stringify(encryptJson(payload,PASSWORD)));
await fs.writeFile(STATUS,JSON.stringify({mode:'LIVE',updatedAt:payload.meta.lastUpdated,depots:depots.length,bills:bills.length},null,2));
console.log(`Nhanh sync complete: ${depots.length} depots, ${bills.length} retail bills.`);
