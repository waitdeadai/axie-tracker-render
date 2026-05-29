import { getUserRankedFighters } from "./originsBattleLogs";

// Cache de verificación periódica
type VerificationCache = {
  lastVerified: number;
  genesHash: string;
  axieID: number;
};

const VERIFICATION_CACHE = new Map<number, VerificationCache>();
const VERIFICATION_INTERVAL = 60 * 60 * 1000; // 1 hora

// Hash simple para detectar cambios de genes
function getGenesHash(genes: string, genes_metamorph?: string): string {
  return `${genes}_${genes_metamorph || 'none'}`;
}

// Verificar si un axie necesita actualización
export function needsVerification(axieID: number): boolean {
  const cached = VERIFICATION_CACHE.get(axieID);
  if (!cached) return true;
  
  const timeSinceLastVerification = Date.now() - cached.lastVerified;
  return timeSinceLastVerification >= VERIFICATION_INTERVAL;
}

// Verificar genes de un jugador y actualizar si es necesario
export async function verifyPlayerGenes(userId: string): Promise<boolean> {
  try {
    const fighters = await getUserRankedFighters(userId);
    let hasChanges = false;
    
    for (const fighter of fighters) {
      if (!fighter.axieID) continue;
      
      const currentHash = getGenesHash(fighter.genes || '', fighter.genes_metamorph || '');
      const cached = VERIFICATION_CACHE.get(fighter.axieID);
      
      if (!cached || cached.genesHash !== currentHash) {
        // Genes cambiaron o es primera vez
        VERIFICATION_CACHE.set(fighter.axieID, {
          lastVerified: Date.now(),
          genesHash: currentHash,
          axieID: fighter.axieID
        });
        
        if (cached) {
          console.log(`🔄 Genes actualizados para axie ${fighter.axieID} (usuario: ${userId})`);
          hasChanges = true;
        }
      } else {
        // Actualizar timestamp de verificación
        cached.lastVerified = Date.now();
      }
    }
    
    return hasChanges;
  } catch (error) {
    console.error(`❌ Error verificando genes para ${userId}:`, error);
    return false;
  }
}

// Limpiar cache de verificación (ejecutar cada 24 horas)
export function cleanupVerificationCache(): void {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas
  
  for (const [axieID, cached] of VERIFICATION_CACHE.entries()) {
    if (now - cached.lastVerified > maxAge) {
      VERIFICATION_CACHE.delete(axieID);
    }
  }
  
  console.log(`🧹 Limpieza de cache de verificación: ${VERIFICATION_CACHE.size} axies activos`);
}

// Obtener estadísticas de verificación
export function getVerificationStats() {
  const now = Date.now();
  const stats = {
    totalAxies: VERIFICATION_CACHE.size,
    recentlyVerified: 0,
    needsVerification: 0
  };
  
  for (const cached of VERIFICATION_CACHE.values()) {
    if (now - cached.lastVerified < VERIFICATION_INTERVAL) {
      stats.recentlyVerified++;
    } else {
      stats.needsVerification++;
    }
  }
  
  return stats;
}
