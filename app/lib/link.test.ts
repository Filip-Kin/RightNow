// Run: bun test lib/link.test.ts
import { expect, test } from "bun:test";
import { generateLinkKeypair, linkSharedKey, sealWithKey, openWithKey } from "./crypto";

test("device-link ECDH agrees both ways and seals round-trip", () => {
  const a = generateLinkKeypair(); // shower
  const b = generateLinkKeypair(); // scanner
  const ka = linkSharedKey(a.secretKey, b.publicKey);
  const kb = linkSharedKey(b.secretKey, a.publicKey);
  expect(Buffer.from(ka).toString("hex")).toBe(Buffer.from(kb).toString("hex"));

  const bundle = { token: "t0ken", userId: "u1", email: "x@y.z", dek: "deadbeef" };
  const sealed = sealWithKey(ka, bundle);
  expect(openWithKey(kb, sealed)).toEqual(bundle);
});

test("a different key cannot open the bundle", () => {
  const a = generateLinkKeypair();
  const b = generateLinkKeypair();
  const evil = generateLinkKeypair();
  const sealed = sealWithKey(linkSharedKey(a.secretKey, b.publicKey), { dek: "secret" });
  const wrong = linkSharedKey(evil.secretKey, a.publicKey);
  expect(() => openWithKey(wrong, sealed)).toThrow();
});
