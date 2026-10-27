// The Account page's "Deck Builder" panel — specs 0021 and 0022.
//
// Link a computer: a one-time code to type into the Proxic Deck Builder,
// which then checks its exports against this Arena's deck rules and sends
// them to the Deck Depot. Below it, the computers already linked, each
// with Remove.

import { useEffect, useState } from "react";
import {
  clockTime,
  listDevices,
  makeDeviceCode,
  removeDevice,
  shortDate,
  type DeviceCode,
  type LinkedDevice,
} from "./devices";

export function DeckBuilderLink() {
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = async () => {
    const list = await listDevices();
    if (list === null) {
      setProblem("Your linked computers could not be loaded. Reload the page to try again.");
    } else {
      setDevices(list);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const link = async () => {
    setProblem(null);
    const made = await makeDeviceCode();
    if (made === null) {
      setProblem("A code could not be made just now. Try again.");
      return;
    }
    setCode(made);
  };

  const remove = async (device: LinkedDevice) => {
    setProblem(null);
    if (!(await removeDevice(device.deviceId))) {
      setProblem(`${device.name} could not be removed. Try again.`);
    }
    await refresh();
  };

  return (
    <section className="pa-section" aria-labelledby="deck-builder-head">
      <div className="pa-section-head">
        <h2 id="deck-builder-head">Deck Builder</h2>
      </div>
      <div className="pa-form">
        <p className="pa-help pa-device-intro">
          Link the Proxic Deck Builder on your computer. A linked computer sends its decks, card
          pictures and tokens to your Deck Depot, and follows this Arena&apos;s deck rules. It
          can&apos;t play, join rooms, share or delete decks, or change your account.
        </p>
        <button type="button" className="pa-button" onClick={() => void link()}>
          Link a computer
        </button>
        {code && (
          <div className="pa-device-code" role="status" aria-live="polite">
            <span className="pa-device-code-value" aria-label="Link code">
              {code.code}
            </span>
            <span className="pa-help">
              Type it into the Proxic Arena Export window in the Deck Builder. It works once, until{" "}
              {clockTime(code.expiresAt)}.
            </span>
          </div>
        )}
      </div>

      <div className="pa-section-head pa-device-head">
        <h3>Linked computers</h3>
      </div>
      {devices !== null && devices.length === 0 && (
        <div className="pa-row">
          <span className="pa-help">No computers are linked.</span>
        </div>
      )}
      {devices?.map((device) => (
        <div className="pa-row" key={device.deviceId}>
          <span className="pa-row-key" style={{ flexBasis: 240 }}>
            <span className="pa-row-value" style={{ display: "block" }}>
              {device.name}
            </span>
            <span className="pa-help" style={{ display: "block" }}>
              Linked {shortDate(device.createdAt)}
              {device.lastUsedAt
                ? ` · last used ${shortDate(device.lastUsedAt)}`
                : " · not used yet"}
            </span>
          </span>
          <button
            type="button"
            className="pa-button pa-button-warn"
            aria-label={`Remove ${device.name}`}
            onClick={() => void remove(device)}
          >
            Remove
          </button>
        </div>
      ))}
      {problem && (
        <div className="pa-form">
          <div role="alert" className="pa-notice pa-notice-bad">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{problem}</span>
          </div>
        </div>
      )}
    </section>
  );
}
