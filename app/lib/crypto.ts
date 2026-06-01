// End-to-end encryption core. All key material lives and dies on the device;
// the server only ever receives the opaque hex strings produced here.
//
// Pure JS (@noble) so it runs in Expo Go with no native build. Randomness comes
// from globalThis.crypto.getRandomValues, which `react-native-get-random-values`
// (imported once at the app entry) polyfills on native.
//
// Key hierarchy (mirrors the backend contract in src/router/auth.ts):
//   secret (password | recovery code) --Argon2id--> 64B stretched
//     stretched[0..32)  --hex-->  authToken   (sent to server, never the secret)
//     stretched[32..64) =         KEK          (wraps the DEK; never leaves device)
//   DEK (random 32B) encrypts everything. Wrapped under KEK_pw and KEK_rc.
//   DEK --HKDF--> cellKey (HMAC cell ids) + dataKey (AEAD entry payloads)
import { argon2id } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { utf8ToBytes, bytesToUtf8 } from "@noble/ciphers/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";

// Argon2id parameters. Fixed for v1 (baked into the app); changing them later
// requires storing per-user params server-side and a re-derivation path.
// 19 MiB / t=2 is an OWASP-recommended combo, kept modest for pure-JS on phones.
const ARGON2 = { t: 2, m: 19456, p: 1, dkLen: 64 } as const;
const NONCE_BYTES = 24; // XChaCha20-Poly1305

export interface Sealed {
    ciphertext: string; // hex
    nonce: string; // hex
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/** Per-account salt = SHA-256(normalized email). No salt round-trip needed (Bitwarden model). */
function emailSalt(email: string): Uint8Array {
    return sha256(utf8ToBytes(normalizeEmail(email)));
}

/** Stretch a secret and split into the server-facing auth token and the device-only KEK. */
export function deriveFromSecret(secret: string, email: string): { authToken: string; kek: Uint8Array } {
    const stretched = argon2id(utf8ToBytes(secret.normalize("NFKC")), emailSalt(email), ARGON2);
    return {
        authToken: bytesToHex(stretched.subarray(0, 32)),
        kek: stretched.subarray(32, 64),
    };
}

// Anonymous accounts have no email, so the recovery code is stretched with a fixed
// app salt instead. The code is already 256-bit random, so a per-account salt buys
// nothing; the constant salt just domain-separates this derivation. The server
// finds the account by SHA-256(authToken) (a queryable lookup key), never the code.
const RECOVERY_SALT = sha256(utf8ToBytes("rightnow/recovery-code/v1"));

/** Stretch a recovery code (no email) into the server-facing auth token + device KEK. */
export function deriveFromRecoveryCode(code: string): { authToken: string; kek: Uint8Array } {
    const stretched = argon2id(utf8ToBytes(code.normalize("NFKC")), RECOVERY_SALT, ARGON2);
    return {
        authToken: bytesToHex(stretched.subarray(0, 32)),
        kek: stretched.subarray(32, 64),
    };
}

export function generateDEK(): Uint8Array {
    return randomBytes(32);
}

/**
 * A 256-bit recovery code, shown once at signup. Canonical form (for derivation)
 * is 64 lowercase hex chars; `display` groups it for humans. High entropy means
 * the server can't brute-force it even if fully compromised (no enclave needed).
 */
export function generateRecoveryCode(): { code: string; display: string } {
    const code = bytesToHex(randomBytes(32));
    const display = (code.toUpperCase().match(/.{1,4}/g) ?? []).join("-");
    return { code, display };
}

/** Accept a recovery code the user typed back (grouped/spaced/upper) -> canonical hex. */
export function normalizeRecoveryCode(input: string): string {
    return input.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

function seal(key: Uint8Array, plaintext: Uint8Array): Sealed {
    const nonce = randomBytes(NONCE_BYTES);
    const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
    return { ciphertext: bytesToHex(ct), nonce: bytesToHex(nonce) };
}

function open(key: Uint8Array, sealed: Sealed): Uint8Array {
    return xchacha20poly1305(key, hexToBytes(sealed.nonce)).decrypt(hexToBytes(sealed.ciphertext));
}

export function wrapDEK(kek: Uint8Array, dek: Uint8Array): Sealed {
    return seal(kek, dek);
}

export function unwrapDEK(kek: Uint8Array, wrapped: Sealed): Uint8Array {
    return open(kek, wrapped);
}

/** Sub-keys derived from the DEK: one for cell ids, one for entry payloads. */
function dekSubkeys(dek: Uint8Array): { cellKey: Uint8Array; dataKey: Uint8Array } {
    const empty = new Uint8Array(0);
    return {
        cellKey: hkdf(sha256, dek, empty, utf8ToBytes("rightnow/cell-id"), 32),
        dataKey: hkdf(sha256, dek, empty, utf8ToBytes("rightnow/cell-data"), 32),
    };
}

/** Opaque, stable id for a (date, hour) cell. date is "YYYY-M-D". Leaks neither date nor hour. */
export function cellId(dek: Uint8Array, date: string, hour: number): string {
    const { cellKey } = dekSubkeys(dek);
    return bytesToHex(hmac(sha256, cellKey, utf8ToBytes(`${date}|${hour}`)));
}

/**
 * Stable id for the single per-user taxonomy (custom activities) cell. It rides
 * the same opaque entries table, so syncing custom activities needs no backend
 * change. The HMAC input can't be produced by cellId() (whose input is
 * "YYYY-M-D|<number>"), so it never collides with a real (date, hour) cell.
 */
export function configCellId(dek: Uint8Array): string {
    const { cellKey } = dekSubkeys(dek);
    return bytesToHex(hmac(sha256, cellKey, utf8ToBytes("config|activities")));
}

/**
 * Stable id for a per-day note cell. Like configCellId, the HMAC input
 * ("note|YYYY-M-D") can't be produced by cellId() ("YYYY-M-D|<number>"), so note
 * cells never collide with hour cells but ride the same opaque entries table.
 */
export function noteCellId(dek: Uint8Array, date: string): string {
    const { cellKey } = dekSubkeys(dek);
    return bytesToHex(hmac(sha256, cellKey, utf8ToBytes(`note|${date}`)));
}

export interface EntryPayload {
    // date ("YYYY-M-D") + hour are encrypted in the payload too, so a fresh device
    // can place a pulled cell (the cell_id HMAC is opaque and can't be reversed).
    date: string;
    hour: number;
    activity: number | null;
    feeling: number | null;
    source: "manual" | "health";
}

export interface NotePayload {
    // Free-text "what I did today" note for a day. `date` lets a fresh device place
    // the pulled cell (its HMAC id is opaque). No `hour` field - that's how a pulled
    // cell is told apart from an EntryPayload (see openCell).
    date: string;
    note: string;
}

/** A decrypted opaque cell is either an hour entry or a day note. */
export type CellPayload = EntryPayload | NotePayload;

// AEAD reveals plaintext length, and an EntryPayload's JSON length varies slightly
// with its values (activity "10" vs "3", 1- vs 2-digit hour, null vs a number).
// PKCS#7-pad to a fixed block so every entry cell is the same ciphertext length
// regardless of content, closing that side channel. 128 comfortably exceeds any
// realistic payload, so each entry pads to exactly one block.
const ENTRY_BLOCK = 128;

function padPKCS7(data: Uint8Array, block: number): Uint8Array {
    const padLen = block - (data.length % block); // 1..block (full block when aligned)
    const out = new Uint8Array(data.length + padLen);
    out.set(data);
    out.fill(padLen, data.length);
    return out;
}

function unpadPKCS7(data: Uint8Array): Uint8Array {
    const padLen = data[data.length - 1];
    if (padLen < 1 || padLen > data.length) throw new Error("Invalid padding");
    return data.subarray(0, data.length - padLen);
}

// Entries and notes share one padded JSON format so a pulled cell can be decrypted
// without knowing its kind up front (then discriminated by shape in openCell). A
// long note just pads to the next 128B multiple; both stay length-bucketed.
function sealPadded(dek: Uint8Array, obj: unknown): Sealed {
    const { dataKey } = dekSubkeys(dek);
    return seal(dataKey, padPKCS7(utf8ToBytes(JSON.stringify(obj)), ENTRY_BLOCK));
}

function openPadded<T>(dek: Uint8Array, sealed: Sealed): T {
    const { dataKey } = dekSubkeys(dek);
    return JSON.parse(bytesToUtf8(unpadPKCS7(open(dataKey, sealed)))) as T;
}

export function sealEntry(dek: Uint8Array, payload: EntryPayload): Sealed {
    return sealPadded(dek, payload);
}

export function openEntry(dek: Uint8Array, sealed: Sealed): EntryPayload {
    return openPadded<EntryPayload>(dek, sealed);
}

export function sealNote(dek: Uint8Array, payload: NotePayload): Sealed {
    return sealPadded(dek, payload);
}

export function openNote(dek: Uint8Array, sealed: Sealed): NotePayload {
    return openPadded<NotePayload>(dek, sealed);
}

/** Decrypt a pulled cell of unknown kind; discriminate with `"hour" in p` (entry) vs note. */
export function openCell(dek: Uint8Array, sealed: Sealed): CellPayload {
    return openPadded<CellPayload>(dek, sealed);
}

/**
 * Generic encrypted-JSON helpers over the same dataKey, for the taxonomy config
 * cell. Not length-padded: it's a single per-user cell, so its size (roughly the
 * activity count) isn't a meaningful leak, unlike the per-hour entry cells.
 */
export function sealJson(dek: Uint8Array, obj: unknown): Sealed {
    const { dataKey } = dekSubkeys(dek);
    return seal(dataKey, utf8ToBytes(JSON.stringify(obj)));
}

export function openJson<T>(dek: Uint8Array, sealed: Sealed): T {
    const { dataKey } = dekSubkeys(dek);
    return JSON.parse(bytesToUtf8(open(dataKey, sealed))) as T;
}

// Persisted as hex strings (e.g. the cached DEK in secure storage).
export const dekToHex = bytesToHex;
export const dekFromHex = hexToBytes;
export const toHex = bytesToHex;
export const fromHex = hexToBytes;

// #region device link (QR cross-device sign-in)
// Ephemeral X25519 key agreement so an already-signed-in device can hand the DEK
// (+ a fresh session token) to a new device out-of-band. The new device shows its
// public key in a QR; the approver does ECDH, seals the bundle, and relays the
// ciphertext through the server, which can never derive the shared secret.
export interface LinkKeypair {
    secretKey: Uint8Array;
    publicKey: Uint8Array;
}

export function generateLinkKeypair(): LinkKeypair {
    const { secretKey, publicKey } = x25519.keygen();
    return { secretKey, publicKey };
}

/** A fresh 256-bit channel id (hex) - the unguessable capability in the QR. */
export function randomChannelId(): string {
    return bytesToHex(randomBytes(32));
}

/** Derive the symmetric link key from our secret + the peer's public key (ECDH + HKDF). */
export function linkSharedKey(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
    const shared = x25519.getSharedSecret(secretKey, peerPublicKey);
    return hkdf(sha256, shared, new Uint8Array(0), utf8ToBytes("rightnow/device-link"), 32);
}

export function sealWithKey(key: Uint8Array, obj: unknown): Sealed {
    return seal(key, utf8ToBytes(JSON.stringify(obj)));
}

export function openWithKey<T>(key: Uint8Array, sealed: Sealed): T {
    return JSON.parse(bytesToUtf8(open(key, sealed))) as T;
}
// #endregion
