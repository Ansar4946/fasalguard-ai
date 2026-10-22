import {MarketService} from './market-service';
import {buildAmisSnapshot,type AmisRecord} from './market-data';
import type {MarketIntelligenceRepository} from './types';
export const liveMarketCrops=['Wheat','Cotton','Rice','Maize','Sugarcane'] as const;
export const defaultLiveMarketCrop='Wheat';
export const liveMarketLocations=['Punjab, Pakistan'] as const;
interface ApiResponse {records:AmisRecord[];freshnessPolicy?:{maxAgeDays:number};historyTruncated?:boolean;reason?:string;}
async function getJson(url:string):Promise<ApiResponse>{
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
  const body=await response.json().catch(()=>null) as ApiResponse&{error?:{message?:string}}|null;
  if(!response.ok)throw new Error(body?.error?.message??'AMIS prices are temporarily unavailable.');
  if(!body||!Array.isArray(body.records))throw new Error('AMIS returned invalid price data.');
  return body;
}
export const apiMarketRepository:MarketIntelligenceRepository={
  async getMarketSummary({crop,location}){
    if(location!==liveMarketLocations[0]||!liveMarketCrops.includes(crop as typeof liveMarketCrops[number]))return null;
    const encoded=encodeURIComponent(crop);
    const [current,history]=await Promise.all([
      getJson(`/api/market/prices?crop=${encoded}&province=Punjab&limit=100`),
      getJson(`/api/market/history?crop=${encoded}&days=365&limit=500`),
    ]);
    return buildAmisSnapshot(crop,current.records,history.records,current.freshnessPolicy?.maxAgeDays??1,new Date(),history.historyTruncated??false);
  },
};
export const liveMarketService=new MarketService(apiMarketRepository);
