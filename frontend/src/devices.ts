// Linked computers — spec 0021.
//
// The Account page makes a one-time code; the Deck Builder, on the
// player's computer, trades it for a device token that can download the
// deck rules and nothing else. This page only ever sees the code and the
// list: the token goes straight to the Deck Builder and never here.

import { apiFetch } from "./auth";

export interface DeviceCode {
  code: string;
  expiresAt: string;
}

export interface LinkedDevice {
  deviceId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A fresh code, or null when the server would not make one. */
export async function makeDeviceCode(fetchFn: typeof fetch = fetch): Promise<DeviceCode | null> {
  const response = await apiFetch("/api/auth/device-codes", { method: "POST" }, fetchFn);
  if (!response.ok) return null;
  return (await response.json()) as DeviceCode;
}

/** Your linked computers, newest first; null when the list could not be read. */
export async function listDevices(fetchFn: typeof fetch = fetch): Promise<LinkedDevice[] | null> {
  const response = await apiFetch("/api/auth/devices", {}, fetchFn);
  if (!response.ok) return null;
  const body = (await response.json()) as { devices: LinkedDevice[] };
  return body.devices;
}

/** Remove one computer; it stops working at once. */
export async function removeDevice(
  deviceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const response = await apiFetch(
    `/api/auth/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
    fetchFn,
  );
  return response.ok;
}

/** "Oct 27" this year, "Oct 27, 2025" otherwise. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  return when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The time a code stops working, as a clock reads it ("7:42 PM"). */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
