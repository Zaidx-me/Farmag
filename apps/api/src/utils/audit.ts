import pino from 'pino';

const auditLogger = pino({ name: 'audit' });

export interface AuditEvent {
  actorId?: string;
  action: string;
  farmId?: string;
  details?: unknown;
}

export function audit(event: AuditEvent): void {
  auditLogger.info({ audit: true, ts: new Date().toISOString(), ...event });
}