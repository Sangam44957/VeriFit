import { Worker } from 'bullmq';
import type { ConnectionOptions, Processor } from 'bullmq';
import type { QueueName } from '../config/queue.js';
import { logger } from '../lib/logger.js';

export type JobProcessor<D = unknown, R = unknown> = Processor<D, R>;

export class WorkerManager {
  private workers: Map<QueueName, Worker> = new Map();

  register<D = unknown, R = unknown>(
    queue: QueueName,
    processor: JobProcessor<D, R>,
    connection: ConnectionOptions,
  ): Worker<D, R> {
    if (this.workers.has(queue)) {
      throw new Error(`Worker already registered for queue: ${queue}`);
    }
    const worker = new Worker<D, R>(queue, processor, { connection });
    worker.on('failed', (job, err) =>
      logger.error(`Job ${job?.id ?? 'unknown'} on ${queue} failed:`, err),
    );
    this.workers.set(queue, worker as unknown as Worker);
    logger.info(`Worker registered for queue: ${queue}`);
    return worker;
  }

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
