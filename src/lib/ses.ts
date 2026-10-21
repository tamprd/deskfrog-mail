import "server-only";
import {
  SESv2Client,
  SendEmailCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand,
  DeleteEmailIdentityCommand,
  SendCustomVerificationEmailCommand,
  CreateCustomVerificationEmailTemplateCommand,
  UpdateCustomVerificationEmailTemplateCommand,
  PutEmailIdentityFeedbackAttributesCommand,
} from "@aws-sdk/client-sesv2";
import { verifyTemplate } from "@/lib/email/verify-template";
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

/**
 * Stop Amazon emailing bounce/complaint notices to the sender's own inbox.
 * We already get every bounce and complaint through SNS and handle them in the app.
 * Best-effort: needs ses:PutEmailIdentityFeedbackAttributes.
 */
export async function stopFeedbackForwarding(identity: string) {
  try {
    await ses().send(new PutEmailIdentityFeedbackAttributesCommand({ EmailIdentity: identity, EmailForwardingEnabled: false }));
    return true;
  } catch (err) {
    console.warn("feedback forwarding not disabled for", identity, (err as Error).name, (err as Error).message);
    return false;
  }
}

/** Register a domain with SES (Easy DKIM + custom MAIL FROM) and return the DNS records the customer must add. */
export async function createDomainIdentity(domain: string) {
  try {
    await ses().send(new CreateEmailIdentityCommand({ EmailIdentity: domain }));
  } catch (err) {
    if ((err as { name?: string }).name !== "AlreadyExistsException") throw err;
  }
  // Custom MAIL FROM (bounce.<domain>) makes SPF align too, which Microsoft 365 / Outlook weigh heavily.
  try {
    await ses().send(
      new PutEmailIdentityMailFromAttributesCommand({ EmailIdentity: domain, MailFromDomain: `bounce.${domain}`, BehaviorOnMxFailure: "USE_DEFAULT_VALUE" }),
    );
  } catch {
    /* needs ses:PutEmailIdentityMailFromAttributes; DKIM alone still works */
  }
  await stopFeedbackForwarding(domain);
  return domainStatus(domain);
}

export async function domainStatus(domain: string) {
  const id = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
  const tokens = id.DkimAttributes?.Tokens ?? [];
  const mailFrom = id.MailFromAttributes?.MailFromDomain;
  const records = [
    ...tokens.map((t) => ({ type: "CNAME", name: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
    ...(mailFrom
      ? [
          { type: "MX", name: mailFrom, value: `10 feedback-smtp.${env.awsRegion}.amazonses.com` },
          { type: "TXT", name: mailFrom, value: "v=spf1 include:amazonses.com ~all" },
        ]
      : []),
    { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" },
  ];
  return {
    verified: id.VerifiedForSendingStatus === true && id.DkimAttributes?.Status === "SUCCESS",
    dkimStatus: id.DkimAttributes?.Status ?? "NOT_STARTED",
    records,
  };
}

/** Ask SES to verify a single email address. AWS emails the address a confirmation link from its own (well-trusted) sender. */
export const VERIFY_TEMPLATE = "deskfrog-verify-sender";

/** Create or update our branded "confirm your sending address" email in SES. */
export async function syncVerifyTemplate() {
  const t = verifyTemplate();
  const input = {
    TemplateName: VERIFY_TEMPLATE,
    FromEmailAddress: `hello@${env.sharedSendingDomain}`,
    TemplateSubject: t.subject,
    TemplateContent: t.html,
    SuccessRedirectionURL: `${env.appUrl}/sender-confirmed`,
    FailureRedirectionURL: `${env.appUrl}/sender-confirmed?failed=1`,
  };
  try {
    await ses().send(new UpdateCustomVerificationEmailTemplateCommand(input));
    return "updated";
  } catch (err) {
    if ((err as { name?: string }).name !== "NotFoundException") throw err;
    await ses().send(new CreateCustomVerificationEmailTemplateCommand(input));
    return "created";
  }
}

/**
 * Email the address a confirmation link. Uses our branded Desk Frog Mail email;
 * falls back to Amazon's plain one if the template or permission isn't there yet.
 * Returns which one was sent.
 */
export async function requestEmailVerification(email: string, { resend = false } = {}): Promise<"branded" | "amazon"> {
  try {
    await ses().send(new SendCustomVerificationEmailCommand({ EmailAddress: email, TemplateName: VERIFY_TEMPLATE }));
    return "branded";
  } catch (err) {
    console.warn("custom verification failed, using Amazon's", (err as Error).name, (err as Error).message);
  }
  if (resend) {
    try {
      await ses().send(new DeleteEmailIdentityCommand({ EmailIdentity: email }));
    } catch {
      /* not there yet, or no delete permission: creating below still works for new addresses */
    }
  }
  try {
    await ses().send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
  } catch (err) {
    if ((err as { name?: string }).name !== "AlreadyExistsException") throw err;
  }
  return "amazon";
}

export async function isEmailVerified(email: string) {
  try {
    const id = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: email }));
    const ok = id.VerifiedForSendingStatus === true;
    if (ok && id.FeedbackForwardingStatus !== false) await stopFeedbackForwarding(email);
    return ok;
  } catch {
    return false;
  }
}

export async function deleteIdentity(identity: string) {
  try {
    await ses().send(new DeleteEmailIdentityCommand({ EmailIdentity: identity }));
  } catch {
    /* already gone or no permission */
  }
}
