import { QueueItem } from './types';

export class PriorityQueue {
  private hotQueue: QueueItem[] = [];
  private coldQueue: QueueItem[] = [];
  private hotQueueMap = new Map<string, QueueItem>();
  private coldQueueMap = new Map<string, QueueItem>();

  // Agregar item a la cola correspondiente
  enqueue(item: QueueItem): void {
    const map = item.priority === 'hot' ? this.hotQueueMap : this.coldQueueMap;
    const queue = item.priority === 'hot' ? this.hotQueue : this.coldQueue;

    // Si ya existe, actualizar
    const existing = map.get(item.userId);
    if (existing) {
      existing.nextPollAt = item.nextPollAt;
      return;
    }

    // Agregar nuevo item
    map.set(item.userId, item);
    queue.push(item);
    this.sortQueue(queue);
  }

  // Obtener items listos para procesar
  getReadyItems(now: number): QueueItem[] {
    const ready: QueueItem[] = [];

    // Tomar 3 items de hot queue si están listos
    let hotCount = 0;
    while (hotCount < 3 && this.hotQueue.length > 0 && this.hotQueue[0].nextPollAt <= now) {
      const item = this.hotQueue.shift()!;
      this.hotQueueMap.delete(item.userId);
      ready.push(item);
      hotCount++;
    }

    // Tomar 1 item de cold queue si está listo
    if (this.coldQueue.length > 0 && this.coldQueue[0].nextPollAt <= now) {
      const item = this.coldQueue.shift()!;
      this.coldQueueMap.delete(item.userId);
      ready.push(item);
    }

    return ready;
  }

  // Reinsertar items con nuevo nextPollAt
  reinsertItems(items: QueueItem[], nextPollAt: number): void {
    for (const item of items) {
      item.nextPollAt = nextPollAt;
      this.enqueue(item);
    }
  }

  // Cambiar prioridad de un item
  changePriority(userId: string, newPriority: 'hot' | 'cold'): void {
    const hotItem = this.hotQueueMap.get(userId);
    const coldItem = this.coldQueueMap.get(userId);

    if (hotItem && newPriority === 'cold') {
      this.hotQueueMap.delete(userId);
      this.hotQueue = this.hotQueue.filter(item => item.userId !== userId);
      this.enqueue({ ...hotItem, priority: 'cold' });
    } else if (coldItem && newPriority === 'hot') {
      this.coldQueueMap.delete(userId);
      this.coldQueue = this.coldQueue.filter(item => item.userId !== userId);
      this.enqueue({ ...coldItem, priority: 'hot' });
    }
  }

  // Remover item
  remove(userId: string): void {
    this.hotQueueMap.delete(userId);
    this.coldQueueMap.delete(userId);
    this.hotQueue = this.hotQueue.filter(item => item.userId !== userId);
    this.coldQueue = this.coldQueue.filter(item => item.userId !== userId);
  }

  // Obtener estadísticas
  getStats() {
    return {
      hotQueueSize: this.hotQueue.length,
      coldQueueSize: this.coldQueue.length,
      hotQueueMapSize: this.hotQueueMap.size,
      coldQueueMapSize: this.coldQueueMap.size,
    };
  }

  // Limpiar todas las colas
  clear(): void {
    this.hotQueue = [];
    this.coldQueue = [];
    this.hotQueueMap.clear();
    this.coldQueueMap.clear();
  }

  // Ordenar cola por nextPollAt
  private sortQueue(queue: QueueItem[]): void {
    queue.sort((a, b) => a.nextPollAt - b.nextPollAt);
  }

  // Obtener próximo tiempo de polling
  getNextPollTime(): number | null {
    const hotNext = this.hotQueue[0]?.nextPollAt;
    const coldNext = this.coldQueue[0]?.nextPollAt;

    if (hotNext && coldNext) {
      return Math.min(hotNext, coldNext);
    }
    return hotNext || coldNext || null;
  }
}
