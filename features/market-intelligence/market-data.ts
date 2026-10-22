import type {MarketIntelligenceSnapshot,MarketPrice,PricePoint} from './types';

export interface AmisRecord {
  id:string;cropName:string;marketName:string;district:string|null;province:string;
  minimumPrice:number;maximumPrice:number;averagePrice:number;quantity:number;unit:string;currency:string;
  source:string;sourceUrl:string;sourceIdentifier:string;sourceCommodity:string|null;priceDate:string;
  observedAt:string;ingestedAt?:string;
}
export function pakistanDate(now=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dateValue(value:string):number {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('AMIS observation date is missing or invalid.');
  const parsed=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value)throw new Error('AMIS observation date is invalid.');
  return parsed;
}
export function safeAmisUrl(value:string):string|undefined {
  try{const u=new URL(value);if(['http:','https:'].includes(u.protocol)&&['amis.pk','www.amis.pk'].includes(u.hostname)&&!u.username&&!u.password&&!u.hash&&(!u.port||['80','443'].includes(u.port)))return u.href;}catch{}
  return undefined;
}
function commodity(record:AmisRecord):string {
  return (record.sourceCommodity??/^AMIS:([^:]+):/.exec(record.sourceIdentifier)?.[1]??'').trim().toLowerCase();
}
function validate(records:AmisRecord[],crop:string,today:string):AmisRecord[] {
  if(!Array.isArray(records))throw new Error('AMIS data is unavailable.');
  const unique=new Map<string,AmisRecord>();
  for(const r of records){
    if(!r||r.cropName!==crop||r.source!=='AMIS'||r.currency!=='PKR'||r.unit!=='KG'||r.quantity!==100||
       r.province!=='Punjab'||!Number.isFinite(Date.parse(r.ingestedAt??r.observedAt))||typeof r.marketName!=='string'||!r.marketName||!commodity(r)||!safeAmisUrl(r.sourceUrl)||
       ![r.minimumPrice,r.averagePrice,r.maximumPrice].every(v=>Number.isFinite(v)&&v>0)||
       r.minimumPrice>r.averagePrice||r.averagePrice>r.maximumPrice)throw new Error('AMIS prices have missing provenance, incompatible units or invalid values.');
    if(dateValue(r.priceDate)>dateValue(today))throw new Error('AMIS prices contain a future observation date.');
    const key=JSON.stringify([r.priceDate,r.marketName.toLowerCase(),commodity(r)]),old=unique.get(key);
    if(old&&[old.minimumPrice,old.averagePrice,old.maximumPrice].some((v,i)=>v!==[r.minimumPrice,r.averagePrice,r.maximumPrice][i]))throw new Error('Conflicting AMIS observations cannot be averaged.');
    unique.set(key,r);
  }
  return [...unique.values()];
}
function display(r:AmisRecord,today:string,maxAgeDays:number):MarketPrice {
  const age=(dateValue(today)-dateValue(r.priceDate))/86400000;
  return {commodity:r.cropName,variety:r.sourceCommodity??commodity(r),market:r.marketName,district:r.district??'District not verified',province:r.province,
    currency:'PKR',minimumPrice:Math.round(r.minimumPrice*.4),price:Math.round(r.averagePrice*.4),maximumPrice:Math.round(r.maximumPrice*.4),
    quantity:40,unit:'KG',observedAt:r.priceDate,priceDate:r.priceDate,ingestedAt:r.ingestedAt??r.observedAt,
    source:'AMIS',sourceUrl:safeAmisUrl(r.sourceUrl),sourceIdentifier:r.sourceIdentifier,sourceQuantityKg:100,ageDays:age,
    freshness:age>maxAgeDays?'STALE':'LIVE'};
}
export function calendarRange(points:PricePoint[],days:number,today:string):PricePoint[]{
  const end=dateValue(today),start=end-(days-1)*86400000;
  return points.filter(p=>{const t=dateValue(p.observedAt);return t>=start&&t<=end;});
}
export function buildAmisSnapshot(crop:string,current:AmisRecord[],history:AmisRecord[],maxAgeDays=1,now=new Date(),historyTruncated=false):MarketIntelligenceSnapshot|null {
  if(!Number.isInteger(maxAgeDays)||maxAgeDays<0||maxAgeDays>30)throw new Error('AMIS freshness policy is invalid.');
  const today=pakistanDate(now),all=validate([...current,...history],crop,today);
  if(!all.length)return null;
  const latestDate=all.reduce((date,r)=>r.priceDate>date?r.priceDate:date,'');
  const latest=all.filter(r=>r.priceDate===latestDate);
  if(new Set(latest.map(commodity)).size!==1)throw new Error('Different AMIS commodity variants cannot be combined.');
  const variant=commodity(latest[0]),series=all.filter(r=>commodity(r)===variant),comparisons=latest.map(r=>({...display(r,today,maxAgeDays),distanceKm:null}));
  const average=Math.round(latest.reduce((sum,r)=>sum+r.averagePrice*.4,0)/latest.length);
  const lowest=Math.min(...comparisons.map(r=>r.minimumPrice)),highest=Math.max(...comparisons.map(r=>r.maximumPrice));
  const byDate=new Map<string,AmisRecord[]>();
  for(const r of series){const rows=byDate.get(r.priceDate)??[];rows.push(r);byDate.set(r.priceDate,rows);}
  const points=[...byDate.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({observedAt:date,price:Math.round(rows.reduce((sum,r)=>sum+r.averagePrice*.4,0)/rows.length)}));
  const weekDate=new Date(dateValue(latestDate)-7*86400000).toISOString().slice(0,10);
  const before=new Map((byDate.get(weekDate)??[]).map(r=>[r.marketName.toLowerCase(),r]));
  const matched=latest.filter(r=>before.has(r.marketName.toLowerCase()));
  const previous=matched.reduce((sum,r)=>sum+before.get(r.marketName.toLowerCase())!.averagePrice,0);
  const change=matched.length&&previous>0?(matched.reduce((sum,r)=>sum+r.averagePrice,0)-previous)/previous*100:null;
  const freshness=comparisons[0].freshness;
  return {current:{...comparisons[0],market:'Reporting-market average',district:`${latest.length} reporting markets`,sourceIdentifier:undefined,
    price:average,minimumPrice:lowest,maximumPrice:highest},weeklyChangePercent:change,weeklyComparisonMarkets:matched.length,historyTruncated,
    history:{'7D':calendarRange(points,7,today),'30D':calendarRange(points,30,today),SEASON:points},nearbyMarkets:comparisons,
    insight:{summary:change===null?'A same-market comparison exactly seven days earlier is unavailable. No price movement is inferred.':
      `${crop} prices changed ${change>=0?'up':'down'} ${Math.abs(change).toFixed(1)}% across ${matched.length} matching markets between ${weekDate} and ${latestDate}.`,
      evidence:[`${latest.length} AMIS markets dated ${latestDate}`,`${points.length} available observation dates`,'Source PKR/100 kg; displayed PKR/40 kg'],
      uncertainty:'Daily means weight reporting markets equally; market coverage, variety, grade, moisture, commission and transport affect comparisons. This is not a price forecast.',
      missingEvidence:['Validated forecasting model and chronological backtests',...(historyTruncated?['Some older history exceeds the response limit']:[]),...(change===null?['Matching market observations seven days apart']:[])],status:freshness},
    availableCrops:['Wheat','Cotton','Rice','Maize','Sugarcane'],availableLocations:['Punjab, Pakistan'],
    marketSummary:{reportingMarkets:latest.length,lowestPrice:lowest,averagePrice:average,highestPrice:highest,spread:highest-lowest,displayQuantityKg:40}};
}
