import { createHash, randomBytes } from 'crypto';

export const newIntegrationKey = () => `cdr_live_${randomBytes(24).toString('base64url')}`;
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
