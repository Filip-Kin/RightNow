// Run: bun test lib/crypto.test.ts   (bun's runner; independent of jest-expo)
import { expect, test } from "bun:test";
import {
    cellId, configCellId, deriveFromSecret, generateDEK, generateRecoveryCode,
    normalizeRecoveryCode, noteCellId, openCell, openEntry, openJson, openNote,
    sealEntry, sealJson, sealNote, unwrapDEK, wrapDEK,
    dekToHex, dekFromHex, type EntryPayload, type NotePayload,
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

test("sealed entry length is constant across values (padding hides the value)", () => {
    const dek = generateDEK();
    const variants: EntryPayload[] = [
        { date: "2026-1-1", hour: 0, activity: 0, feeling: 0, source: "manual" },
        { date: "2026-12-31", hour: 23, activity: 10, feeling: 5, source: "health" },
        { date: "2026-6-9", hour: 9, activity: null, feeling: null, source: "manual" },
    ];
    const lengths = new Set(variants.map((p) => sealEntry(dek, p).ciphertext.length));
    expect(lengths.size).toBe(1); // every entry encrypts to the same ciphertext length
});

test("config cell id is stable, opaque, and distinct from entry cells", () => {
    const dek = generateDEK();
    expect(configCellId(dek)).toBe(configCellId(dek));
    expect(configCellId(dek)).toMatch(/^[0-9a-f]{64}$/);
    expect(configCellId(dek)).not.toBe(cellId(dek, "2026-5-28", 9));
    expect(configCellId(generateDEK())).not.toBe(configCellId(dek));
});

test("sealJson/openJson round-trips the taxonomy config", () => {
    const dek = generateDEK();
    const config = { version: 1, activities: [{ index: 0, name: "Sleep", color: "#273036", icon: "bed" }] };
    const sealed = sealJson(dek, config);
    expect(openJson<typeof config>(dek, sealed)).toEqual(config);
    expect(() => openJson(generateDEK(), sealed)).toThrow();
});

test("note cell id is stable, opaque, per-date, and distinct from entry/config cells", () => {
    const dek = generateDEK();
    expect(noteCellId(dek, "2026-5-28")).toBe(noteCellId(dek, "2026-5-28"));
    expect(noteCellId(dek, "2026-5-28")).not.toBe(noteCellId(dek, "2026-5-29"));
    expect(noteCellId(dek, "2026-5-28")).not.toBe(cellId(dek, "2026-5-28", 9));
    expect(noteCellId(dek, "2026-5-28")).not.toBe(configCellId(dek));
});

test("note seals/opens and openCell discriminates entry vs note", () => {
    const dek = generateDEK();
    const note: NotePayload = { date: "2026-5-28", note: "FRC district event, long day" };
    const entry: EntryPayload = { date: "2026-5-28", hour: 9, activity: 3, feeling: 4, source: "manual" };
    const sealedNote = sealNote(dek, note);
    const sealedEntry = sealEntry(dek, entry);
    expect(openNote(dek, sealedNote)).toEqual(note);
    // openCell returns the right shape; "hour" present iff it's an entry.
    expect("hour" in openCell(dek, sealedEntry)).toBe(true);
    expect("hour" in openCell(dek, sealedNote)).toBe(false);
    expect("note" in openCell(dek, sealedNote)).toBe(true);
});

test("DEK hex persistence round-trips", () => {
    const dek = generateDEK();
    expect(dekFromHex(dekToHex(dek))).toEqual(dek);
});
