import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { render } from "@react-email/components";
import nodemailer from "nodemailer";
import React, { type ReactElement } from "react";

import type { Cradle } from "@/server/initialization";

type SendEmailArgs = {
  from: string;
  to: string;
  subject: string;
  body: ReactElement | { html: string; text: string };
};
export interface EmailAdapter {
  sendEmail(args: SendEmailArgs): Promise<string>;
}

export class SmtpEmailAdapter implements EmailAdapter {
  /**
   * Built once and reused. A transport parses the connection URL, resolves the
   * host and owns nodemailer's connection handling, and building a fresh one
   * per message threw all of that away on every send.
   *
   * Lazy rather than built in the constructor, so resolving this adapter from
   * the container — which happens on any request that touches the cradle —
   * still costs nothing until an email is actually sent.
   */
  private transporter?: nodemailer.Transporter;

  public constructor(
    private deps: Cradle,
    private options: {
      smtpConnectionUrl: string;
    },
  ) {}

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport(
        this.options.smtpConnectionUrl,
      );
      this.deps.logger.info("Created the SMTP transport");
    }
    return this.transporter;
  }

  public async sendEmail(args: SendEmailArgs): Promise<string> {
    const { html, text } = await renderBody(args.body);

    const result = await this.getTransporter().sendMail({
      ...args,
      from: args.from,
      html,
      text,
    });
    return result.messageId;
  }
}

export class SESEmailAdapter implements EmailAdapter {
  private client: SESClient;

  public constructor() {
    this.client = new SESClient();
  }

  public async sendEmail(args: SendEmailArgs): Promise<string> {
    const { html, text } = await renderBody(args.body);
    const result = await this.client.send(
      new SendEmailCommand({
        Source: args.from,
        Destination: {
          ToAddresses: [args.to],
        },
        Message: {
          Subject: { Data: args.subject },
          Body: {
            Text: { Data: text },
            Html: { Data: html },
          },
        },
      }),
    );
    if (!result.MessageId) {
      throw new Error("Result does not have a message id");
    }
    return result.MessageId;
  }
}

async function renderBody(
  body: SendEmailArgs["body"],
): Promise<{ html: string; text: string }> {
  return React.isValidElement(body)
    ? {
        html: await render(body),
        text: await render(body, { plainText: true }),
      }
    : body;
}
