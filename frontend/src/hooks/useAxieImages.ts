import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api.config";

const TTL = 15 * 60 * 1000;
const CACHE_VERSION = "v2";
const K = (u:string)=>`axie.images.${CACHE_VERSION}.${u}`;

function getCache(u:string){
  try{ 
    const raw = sessionStorage.getItem(K(u));
    if(!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if(Date.now()-ts>TTL) return null;
    return data;
  }catch{ 
    return null; 
  }
}

function setCache(u:string, data:any){
  try{ 
    sessionStorage.setItem(K(u), JSON.stringify({ ts: Date.now(), data })); 
  }catch{}
}

export function useAxieImages(userId?:string, enabled=true){
  const [data, setData] = useState<{axieID:number;primary?:string;fallback?:string}[]|null>(null);
  
  useEffect(()=>{
    if(!userId || !enabled) return;
    
    const c = getCache(userId);
    if(c){ 
      setData(c.fighters||[]); 
      return; 
    }
    
    let abort=false;
    (async()=>{
      try{
        console.log(`🖼️ Fetching axie images for user: ${userId}`);
        const url = `${API_BASE}/axies/user-data/${encodeURIComponent(userId)}`;
        console.log(`🖼️ URL: ${url}`);
        
        const r = await fetch(url, { cache:"no-store" });
        console.log(`🖼️ Response status: ${r.status}`);
        
        if(!r.ok) throw new Error(String(r.status));
        const json = await r.json();
        console.log(`🖼️ Response data:`, json);
        
        if(!abort){ 
          setData(json.fighters||[]); 
          setCache(userId, json); 
          console.log(`🖼️ Set ${json.fighters?.length || 0} fighters for user ${userId}`);
        }
      }catch(error){
        console.error(`❌ Error fetching axie images for ${userId}:`, error);
      }
    })();
    
    return ()=>{ abort=true; };
  },[userId, enabled]);
  
  return { fighters: data };
}
