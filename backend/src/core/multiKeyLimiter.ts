type Now = () => number;
const nowMs: Now = () => Date.now();

class TokenBucket {
  private perSec: number; 
  private perMin: number;
  private tokSec: number; 
  private tokMin: number;
  private lastSec: number; 
  private lastMin: number;
  
  constructor(perSec: number, perMin: number, private clock: Now = nowMs) {
    this.perSec = perSec; 
    this.perMin = perMin;
    this.tokSec = perSec; 
    this.tokMin = perMin;
    this.lastSec = this.clock(); 
    this.lastMin = this.clock();
  }
  
  tryTake(): boolean {
    const t = this.clock();
    if ((t - this.lastSec) >= 1000) { 
      this.tokSec = this.perSec; 
      this.lastSec = t; 
    }
    if ((t - this.lastMin) >= 60000) { 
      this.tokMin = this.perMin; 
      this.lastMin = t; 
    }
    if (this.tokSec > 0 && this.tokMin > 0) { 
      this.tokSec--; 
      this.tokMin--; 
      return true; 
    }
    return false;
  }
}

export class MultiKeyLimiter {
  private buckets: { key: string; bucket: TokenBucket }[];
  private i = 0;
  
  constructor(keys: string[], perSec = 5, perMin = 100) {
    this.buckets = keys.map(k => ({ key: k, bucket: new TokenBucket(perSec, perMin) }));
  }
  
  async nextKey(): Promise<string> {
    if (this.buckets.length === 0) throw new Error("No API keys para battle-logs");
    
    for (;;) {
      for (let n = 0; n < this.buckets.length; n++) {
        this.i = (this.i + 1) % this.buckets.length;
        const b = this.buckets[this.i];
        if (b.bucket.tryTake()) return b.key;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }
}
