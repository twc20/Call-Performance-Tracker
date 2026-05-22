// SendGrid client — used by the v2 daily digest. Kept thin so future digest
// jobs can import { getUncachableSendGridClient } and send mail without rewiring.
import sgMail from "@sendgrid/mail";

interface ConnectionPayload {
  items?: Array<{ settings?: { api_key?: string; from_email?: string } }>;
}

async function getCredentials(): Promise<{ apiKey: string; email: string }> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? `repl ${process.env["REPL_IDENTITY"]}`
    : process.env["WEB_REPL_RENEWAL"]
      ? `depl ${process.env["WEB_REPL_RENEWAL"]}`
      : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  const payload = (await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=sendgrid`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
  ).then((r) => r.json())) as ConnectionPayload;

  const settings = payload.items?.[0]?.settings;
  if (!settings?.api_key || !settings.from_email) {
    throw new Error("SendGrid not connected");
  }
  return { apiKey: settings.api_key, email: settings.from_email };
}

export async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return { client: sgMail, fromEmail: email };
}
