import "server-only";
import {
  SESv2Client,
  SendEmailCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";
import { env } from "@/lib/env";

let client: SESv2Client | null = null;
const ses = () => (client ??= new SESv2Client({ region: env.awsRegion }));

export type OutboundEmail = {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export async function sendEmail(msg: OutboundEmail): Promise<string> {
  const res = await ses().send(
    new SendEmailCommand({
      FromEmailAddress: msg.from,
      Destination: { ToAddresses: [msg.to] },
      ReplyToAddresses: msg.replyTo ? [msg.replyTo] : undefined,
      ConfigurationSetName: env.sesConfigurationSet,
      EmailTags: Object.entries(msg.tags ?? {}).map(([Name, Value]) => ({
        Name,
        Value: Value.replace(/[^\w-]/g, "_").slice(0, 256),
      })),
      Content: {
        Simple: {
          Subject: { Data: msg.subject, Charset: "UTF-8" },
          Body: {
            ...(msg.html ? { Html: { Data: msg.html, Charset: "UTF-8" } } : {}),
            ...(msg.text ? { Text: { Data: msg.text, Charset: "UTF-8" } } : {}),
          },
          Headers: Object.entries(msg.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
        },
      },
    }),
  );
  if (!res.MessageId) throw new Error("SES returned no MessageId");
  return res.MessageId;
}

/** Throttling / transient errors worth retrying. */
export function isTransient(err: unknown) {
  const e = err as { name?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };
  const code = e?.$metadata?.httpStatusCode ?? 0;
  return Boolean(e?.$retryable) || e?.name === "TooManyRequestsException" || e?.name === "ThrottlingException" || code >= 500;
}

/** Register a domain with SES (Easy DKIM) and return the DNS records the customer must add. */
export async function createDomainIdentity(domain: string) {
  try {
    await ses().send(new CreateEmailIdentityCommand({ EmailIdentity: domain }));
  } catch (err) {
    if ((err as { name?: string }).name !== "AlreadyExistsException") throw err;
  }
  return domainStatus(domain);
}

export async function domainStatus(domain: string) {
  const id = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
  const tokens = id.DkimAttributes?.Tokens ?? [];
  const records = [
    ...tokens.map((t) => ({ type: "CNAME", name: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
    { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" },
  ];
  return {
    verified: id.VerifiedForSendingStatus === true && id.DkimAttributes?.Status === "SUCCESS",
    dkimStatus: id.DkimAttributes?.Status ?? "NOT_STARTED",
    records,
  };
}
