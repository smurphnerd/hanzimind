import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { render } from "@react-email/components";
import nodemailer from "nodemailer";
import React, { type ReactElement } from "react";

import type { Cradle } from "@/server/initialization";

export type SendEmailArgs = {
  from: string;
  to: string;
  subject: string;
  body: ReactElement | { html: string; text: string };
};
export interface EmailAdapter {
  sendEmail(args: SendEmailArgs): Promise<string>;
}

export class SmtpEmailAdapter implements EmailAdapter {
  public constructor(
    private deps: Cradle,
    private options: {
      smtpConnectionUrl: string;
    },
  ) {}

  public async sendEmail(args: SendEmailArgs): Promise<string> {
    try {
      const emailTransporter = nodemailer.createTransport(
        this.options.smtpConnectionUrl,
      );

      const { html, text } = await renderBody(args.body);

      const result = await emailTransporter.sendMail({
        ...args,
        from: args.from,
        html,
        text,
      });
      return result.messageId;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to send email");
    }
  }
}

export class SESEmailAdapter implements EmailAdapter {
  private client: SESClient;

  public constructor() {
    this.client = new SESClient();
  }

  public async sendEmail(args: SendEmailArgs): Promise<string> {
    try {
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
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to send email");
    }
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

