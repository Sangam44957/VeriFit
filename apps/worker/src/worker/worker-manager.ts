import { Worker } from 'bullmq';
import type { QueueName } from '../config/queue.js';
import { logger } from '../lib/logger.js';

export class WorkerManager {
  private workers: Map<QueueName, Worker> = new Map();

  constructor(_redis: unknown) {}

  getWorkers(): Map<QueueName, Worker> {
    return this.workers;
  }

  async shutdown(): Promise<void> {
    logger.info(`Shutting down ${this.workers.size} worker(s)...`);

    await Promise.all(
      Array.from(this.workers.values()).map(async (worker) => {
        try {
          await worker.close();
        } catch (error) {
          logger.error('Error closing worker:', error);
        }
      }),
    );

    this.workers.clear();
    logger.info('All workers shut down');
  }
}
