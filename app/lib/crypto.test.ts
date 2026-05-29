// Run: bun test lib/crypto.test.ts   (bun's runner; independent of jest-expo)
import { expect, test } from "bun:test";
import {
    cellId, deriveFromSecret, generateDEK, generateRecoveryCode,
    normalizeRecoveryCode, openEntry, sealEntry, unwrapDEK, wrapDEK,
    dekToHex, dekFromHex, type EntryPayload,
} from "./crypto";

const email = "Filip@Example.com ";
const password = "correct horse battery staple";

test("password derivation is deterministic and splits auth/kek", () => {
    const a = deriveFromSecret(password, email);
    const b = deriveFromSecret(password, "filip@example.com"); // normalized to same salt
    expect(a.authToken).toBe(b.authToken);
    expect(a.authToken.length).toBe(64); // 32 bytes hex
    expect(a.kek.length).toBe(32);
    const wrong = deriveFromSecret("wrong", email);
    expect(wrong.authToken).not.toBe(a.authToken);
});

test("DEK wraps/unwraps under the password KEK", () => {
    const dek = generateDEK();
    const { kek } = deriveFromSecret(password, email);
    const wrapped = wrapDEK(kek, dek);
    expect(unwrapDEK(kek, wrapped)).toEqual(dek);
    // wrong key fails to authenticate
    const { kek: badKek } = deriveFromSecret("nope", email);
    expect(() => unwrapDEK(badKek, wrapped)).toThrow();
});

test("recovery code round-trips and unwraps the same DEK", () => {
    const dek = generateDEK();
    const { code, display } = generateRecoveryCode();
    expect(code.length).toBe(64);
    expect(display).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4})+$/);
    expect(normalizeRecoveryCode(display)).toBe(code); // user re-types the grouped form

    const { kek } = deriveFromSecret(code, email);
    const wrapped = wrapDEK(kek, dek);
    const reKek = deriveFromSecret(normalizeRecoveryCode(display), email).kek;
    expect(unwrapDEK(reKek, wrapped)).toEqual(dek);
});

test("cell ids are stable, opaque, and per (date,hour)", () => {
    const dek = generateDEK();
    expect(cellId(dek, "2026-5-28", 9)).toBe(cellId(dek, "2026-5-28", 9));
    expect(cellId(dek, "2026-5-28", 9)).not.toBe(cellId(dek, "2026-5-28", 10));
    expect(cellId(dek, "2026-5-28", 9)).toMatch(/^[0-9a-f]{64}$/);
    // different DEK -> different id for the same cell
    expect(cellId(generateDEK(), "2026-5-28", 9)).not.toBe(cellId(dek, "2026-5-28", 9));
});

test("entry payload seals and opens", () => {
    const dek = generateDEK();
    const payload: EntryPayload = { date: "2026-5-28", hour: 9, activity: 3, feeling: 4, source: "manual" };
    const sealed = sealEntry(dek, payload);
    expect(sealed.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(openEntry(dek, sealed)).toEqual(payload);
    // another DEK cannot open it
    expect(() => openEntry(generateDEK(), sealed)).toThrow();
});

test("DEK hex persistence round-trips", () => {
    const dek = generateDEK();
    expect(dekFromHex(dekToHex(dek))).toEqual(dek);
});
