import { Client } from "@upstash/qstash";
import { env } from "../env.js";
import { logger } from "../logger.js";

const qstash = env.QSTASH_TOKEN 
  ? new Client({ token: env.QSTASH_TOKEN })
  : null;

export const queueService = {
  async enqueueEmail(type: 'request' | 'confirmation' | 'rejection', params: any) {
    if (!qstash) {
      logger.warn('⚠️ QStash not configured. Executing email job SYNC (blocking).');
      // For fallback, we could import emailService but that might cause circular deps
      // Better to just return a promise that we'll handle elsewhere or just log
      return null;
    }

    try {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

      const res = await qstash.publishJSON({
        url: `${baseUrl}/api/jobs/email`,
        body: { type, params },
        retries: 3,
      });

      logger.info('Email job enqueued', { jobId: res.messageId, type });
      return res.messageId;
    } catch (err) {
      logger.error('Failed to enqueue email job', { type }, err);
      return null;
    }
  }
};
