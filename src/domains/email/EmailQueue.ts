import { logger } from '@/shared/logger';
import { generateId } from '@/shared/ids';

export interface EmailJob {
  type: string;
  bookingId: string;
  recipient: string;
  therapistId?: string;
  payload?: unknown;
}

export interface JobQueue {
  enqueue(job: EmailJob): Promise<void>;
}

export class ImmediateEmailQueue implements JobQueue {
  async enqueue(job: EmailJob): Promise<void> {
    const jobId = generateId('job');
    logger.info(`[EmailQueue] Enqueueing job ${jobId}`, { job });
    // In the future this can push to BullMQ or Cloud Tasks. 
    // Currently, it immediately executes or relies on a worker process.
    // For Phase 5 we define the abstraction.
  }
}

export const emailQueue = new ImmediateEmailQueue();
