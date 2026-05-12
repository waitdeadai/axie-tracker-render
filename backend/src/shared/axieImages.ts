import { crc32 } from "./axieCrc";

const AXIE_STATIC = "https://static.axie.top/axie/";
const AXIE_CDN = "https://axiecdn.axieinfinity.com/axies";
const GENES_HEX = /^0x[0-9a-fA-F]+$/;

export function buildAxieUrl(genes: string, morph: boolean, secretKey: string) {
  if (!GENES_HEX.test(genes)) throw new Error("genes inválidos (se espera hex con 0x)");
  const secret = crc32(secretKey + genes) >>> 0;
  return `${AXIE_STATIC}?g=${genes}${morph ? "&m=true" : ""}&s=${secret}`;
}

export function buildAxieCdnUrl(axieID: number | string) {
  return `${AXIE_CDN}/${axieID}/axie/axie-full-transparent.png`;
}

// Toma el battle log más reciente con gameMode=ranked y devuelve fighters del usuario específico
export function pickRankedFighters(battleLogs: any[], userId?: string) {
  // Filtrar solo battle logs ranked
  const rankedLogs = battleLogs.filter(b => b?.gameData?.gameMode === "ranked");
  if (rankedLogs.length === 0) return [];
  
  // Obtener el más reciente
  const latestRanked = rankedLogs.reduce((latest, current) => 
    current.gameData.endedAt > latest.gameData.endedAt ? current : latest
  );
  
  // Si no se especifica userId, tomar el primer player (comportamiento anterior)
  if (!userId) {
    const fighters = (latestRanked.gameData?.players || []).flatMap((p: any) => p?.team?.fighters || []);
    return fighters.map((f: any) => ({
      axieID: f.axieID,
      genes: f.genes ?? null,
      genes_metamorph: f.genes_metamorph ?? null,
    }));
  }
  
  // Buscar el player específico
  const player = latestRanked.gameData?.players?.find((p: any) => p.userID === userId);
  if (!player?.team?.fighters) return [];
  
  return player.team.fighters.map((f: any) => ({
    axieID: f.axieID,
    genes: f.genes ?? null,
    genes_metamorph: f.genes_metamorph ?? null,
  }));
}
