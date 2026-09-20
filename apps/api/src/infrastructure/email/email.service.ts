import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma, EmailOutbox } from '@prisma/client';
import type { Env } from '../../config/env';
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
 * `clean`: ALIMS never claims a send that did not happen. The worker's
 * OutboxProcessor drains due rows when a transport exists.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transport: SmtpTransport | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Wire the real transport when SMTP_URL is configured (both processes). */
  async onModuleInit(): Promise<void> {
    const url = this.config.get('SMTP_URL', { infer: true });
    if (!url) {
      this.logger.log('SMTP not configured — outbox emails will stay pending until a transport exists.');
      return;
    }
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport(url);
    this.transport = {
      send: (mail) =>
        new Promise<void>((resolve, reject) => {
          void transporter.sendMail(
            { from: this.config.get('SMTP_FROM', { infer: true }), ...mail },
            (error) => (error ? reject(error) : resolve()),
          );
        }),
    };
    this.logger.log(`SMTP transport configured (${new URL(url).protocol}//${new URL(url).host}).`);
  }

  /** Test/worker seam: inject or clear the transport. */
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

    return this.deliver(row);
  }

  /**
   * One honest delivery attempt against an existing outbox row.
   * Sends through the transport, then records exactly what happened:
   *   success  → status 'sent', sentAt set;
   *   failure  → attempts++, exponential backoff on next_attempt_at,
   *              and 'failed' (dead-letter) once OUTBOX_MAX_ATTEMPTS
   *              is reached — a row that will never silently vanish.
   * With no transport configured this is a no-op (the row stays
   * pending, attempts untouched): an unconfigured system must not burn
   * its retry budget.
   */
  async deliver(row: Pick<EmailOutbox, 'id' | 'toEmail' | 'subject' | 'bodyText' | 'attempts'>): Promise<OutboxResult> {
    if (!this.transport) {
      return { outboxId: row.id, delivered: false, reason: 'smtp_not_configured' };
    }

    try {
      await this.transport.send({ to: row.toEmail, subject: row.subject, text: row.bodyText });
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      return { outboxId: row.id, delivered: true };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const attempts = row.attempts + 1;
      const max = this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true });
      // Exponential backoff: 1m, 2m, 4m … capped at 15m.
      const delayMs = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: attempts >= max ? 'failed' : 'pending',
          attempts,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delayMs),
        },
      });
      this.logger.warn(`Outbox delivery ${row.id} failed (attempt ${attempts}/${max}): ${message}`);
      return { outboxId: row.id, delivered: false, reason: 'send_failed' };
    }
  }
}
