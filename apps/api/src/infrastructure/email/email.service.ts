import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Minimal transport interface so the delivery decision is testable
 * without a real SMTP server: production wires nodemailer's transporter
 * when SMTP_URL is configured.
 */
export interface SmtpTransport {
  send(mail: { to: string; subject: string; text: string }): Promise<void>;
}

/** What `enqueue` did about delivery, honestly reported. */
export interface OutboxResult {
  outboxId: string;
  /** True only when a transport actually accepted the message. */
  delivered: boolean;
  /** Machine-readable reason when not delivered. */
  reason?: 'smtp_not_configured' | 'send_failed';
}

/**
 * Durable email outbox (PRD §9 graceful degradation).
 *
 * Every email the system must send is PERSISTED FIRST, then delivered.
 * With no SMTP_URL configured the row honestly stays `pending` — the
 * same posture as the virus scanner reporting `unsupported` instead of
 * `clean`: ALIMS never claims a send that did not happen. The worker
 * processor drains pending rows when a transport exists.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport: SmtpTransport | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Wire a real transport (called when SMTP_URL is configured). */
  setTransport(transport: SmtpTransport | null): void {
    this.transport = transport;
  }

  get configured(): boolean {
    return this.transport !== null;
  }

  /**
   * Persist an email to the outbox and attempt immediate delivery.
   * Never throws for delivery failures — the row is the source of truth
   * and the worker retries; enqueue itself only fails on write errors.
   */
  async enqueue(input: {
    to: string;
    template: string;
    subject: string;
    bodyText: string;
    tx?: Prisma.TransactionClient;
  }): Promise<OutboxResult> {
    const db = input.tx ?? this.prisma;
    const row = await db.emailOutbox.create({
      data: {
        id: randomUUID(),
        toEmail: input.to,
        template: input.template,
        subject: input.subject,
        bodyText: input.bodyText,
        status: 'pending',
      },
    });

    if (!this.transport) {
      this.logger.warn(
        `SMTP not configured — email to ${input.to} (${input.template}) stored in outbox ${row.id} as pending.`,
      );
      return { outboxId: row.id, delivered: false, reason: 'smtp_not_configured' };
    }

    try {
      await this.transport.send({
        to: input.to,
        subject: input.subject,
        text: input.bodyText,
      });
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'sent', sentAt: new Date(), attempts: 1 },
      });
      return { outboxId: row.id, delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Outbox delivery ${row.id} failed: ${message}`);
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'pending', attempts: 1, lastError: message.slice(0, 500) },
      });
      return { outboxId: row.id, delivered: false, reason: 'send_failed' };
    }
  }
}
