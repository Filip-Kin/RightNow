// Run: bun test lib/link.test.ts
import { expect, test } from "bun:test";
import { generateLinkKey, sealWithKey, openWithKey, fromHex } from "./crypto";

test("device-link OTK seals round-trip and yields a fresh 256-bit key", () => {
  const otk = generateLinkKey(); // carried in the QR
  expect(otk).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
  expect(generateLinkKey()).not.toBe(otk); // fresh each time

  const bundle = { token: "t0ken", userId: "u1", email: "x@y.z", dek: "deadbeef" };
  const sealed = sealWithKey(fromHex(otk), bundle);
  expect(openWithKey(fromHex(otk), sealed)).toEqual(bundle);
});

test("a different one-time key cannot open the bundle", () => {
  const otk = generateLinkKey();
  const evil = generateLinkKey();
  const sealed = sealWithKey(fromHex(otk), { dek: "secret" });
  expect(() => openWithKey(fromHex(evil), sealed)).toThrow();
});
