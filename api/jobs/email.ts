import { emailService } from '../../lib/services/email.service.js';
import { logger } from '../../lib/logger.js';
import { Receiver } from "@upstash/qstash";

// Strictly verify that the request comes from QStash
const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security check: Verify signature in production
  if (process.env.NODE_ENV === 'production' && receiver) {
    const signature = req.headers['upstash-signature'];
    const isValid = await receiver.verify({
      signature,
      body: JSON.stringify(req.body),
    }).catch(() => false);

    if (!isValid) {
      logger.warn('Unauthorized job execution attempt blocked');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { type, params } = req.body;
  logger.info(`Processing background email job: ${type}`, { params });

  try {
    switch (type) {
      case 'request':
        await emailService.sendBookingRequest(params);
        break;
      case 'confirmation':
        await emailService.sendBookingConfirmation(params);
        break;
      case 'rejection':
        await emailService.sendBookingRejection(params);
        break;
      default:
        logger.error(`Unknown job type: ${type}`);
        return res.status(400).json({ error: 'Invalid job type' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error(`Job execution failed: ${type}`, { params }, err);
    // Return 500 so QStash retries
    return res.status(500).json({ error: 'Internal error' });
  }
}
