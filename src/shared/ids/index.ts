import crypto from 'crypto';

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export const IdGenerator = {
  request: () => generateId('req'),
  event: () => generateId('evt'),
  booking: () => generateId('bk'),
  payment: () => generateId('pay'),
  email: () => generateId('email'),
  lock: () => generateId('lock'),
  audit: () => generateId('audit'),
  user: () => generateId('usr'),
};
