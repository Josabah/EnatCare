/**
 * Outbound SMS Gateway — adapter pattern for sending SMS.
 *
 * Currently supports:
 *   - sms-gateway: SMS Gateway for Android (capcom6) — send + receive
 *   - noop: No-op for testing / web chat
 */

import {
  SmsGatewayTransport,
  NoopTransport,
  type MessageTransport,
  type OutboundResult,
} from "./smsTransport";

export type SmsProvider = "sms-gateway" | "noop";

let _transport: MessageTransport | null = null;

function getTransport(): MessageTransport {
  if (_transport) return _transport;

  const provider = (process.env.SMS_PROVIDER ?? "noop") as SmsProvider;

  switch (provider) {
    case "sms-gateway":
      _transport = new SmsGatewayTransport();
      break;
    case "noop":
    default:
      _transport = new NoopTransport();
      break;
  }

  console.log(`[SMS Gateway] Using provider: ${_transport.name}`);
  return _transport;
}

export async function sendSMS(
  phone: string,
  text: string
): Promise<OutboundResult> {
  const transport = getTransport();
  return transport.sendMessage(phone, text);
}

export function getActiveTransport(): MessageTransport {
  return getTransport();
}

export function setTransport(transport: MessageTransport): void {
  _transport = transport;
}
