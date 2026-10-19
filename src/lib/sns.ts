import "server-only";
import { createVerify, X509Certificate } from "node:crypto";

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: "1" | "2";
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
};

const certCache = new Map<string, string>();

function stringToSign(m: SnsMessage) {
  const keys =
    m.Type === "Notification"
      ? (["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const)
      : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);
  return keys
    .filter((k) => m[k] !== undefined)
    .map((k) => `${k}\n${m[k]}\n`)
    .join("");
}

/** Verify an SNS message really came from AWS. */
export async function verifySns(m: SnsMessage): Promise<boolean> {
  let certUrl: URL;
  try {
    certUrl = new URL(m.SigningCertURL);
  } catch {
    return false;
  }
  if (certUrl.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(certUrl.hostname)) return false;
  if (!certUrl.pathname.endsWith(".pem")) return false;

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN;
  if (expectedTopic && m.TopicArn !== expectedTopic) return false;

  // Reject stale messages (replay protection).
  if (Math.abs(Date.now() - Date.parse(m.Timestamp)) > 60 * 60 * 1000) return false;

  let pem = certCache.get(certUrl.href);
  if (!pem) {
    const res = await fetch(certUrl.href, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    pem = await res.text();
    new X509Certificate(pem); // throws if not a certificate
    certCache.set(certUrl.href, pem);
  }

  const verifier = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(stringToSign(m), "utf8");
  return verifier.verify(pem, m.Signature, "base64");
}
