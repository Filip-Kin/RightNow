// Authentication + key state. Ties the crypto core to the tRPC API and persists
// the session token + DEK in secure storage so the app reopens already unlocked.
// The server never receives the password, recovery code, or any key.
//
// NOTE: deriveFromSecret runs Argon2id synchronously (pure JS), which briefly
// blocks the JS thread on register/login/recover. Callers should show a busy
// state. Good enough for v1; could move to a worker later.
import { useEffect, useState } from "react";
import { trpc, setAuthToken } from "./trpc";
import {
    deriveFromSecret, deriveFromRecoveryCode, generateDEK, generateRecoveryCode, normalizeRecoveryCode,
    wrapDEK, unwrapDEK, dekToHex, dekFromHex,
    generateLinkKey, randomChannelId, sealWithKey, openWithKey,
    fromHex,
} from "./crypto";
import { secureDelete, secureGet, secureSet } from "./storage";
import { clearStore } from "./entries";
import { clearTaxonomy } from "./activities";

const K = { session: "rn_session", dek: "rn_dek", email: "rn_email", userId: "rn_userId" } as const;

// "expired" = we have local (decrypted) data + a persisted token, but the server
// rejected the token. The app is blocked behind the session-expired gate (so a dead
// session can't silently fail every sync), while the local data stays put so the
// user can still export a backup before signing in again.
export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired";

interface AuthState {
    status: AuthStatus;
    email: string | null;
    userId: string | null;
}

let state: AuthState = { status: "loading", email: null, userId: null };
let dek: Uint8Array | null = null;
const listeners = new Set<() => void>();

// The recovery code is shown exactly once after signup. Stash it in memory (not
// a route param) so it never lands in the web URL or navigation history.
let pendingRecoveryCode: string | null = null;
export function consumeRecoveryCode(): string | null {
    const c = pendingRecoveryCode;
    pendingRecoveryCode = null;
    return c;
}

function emit() {
    for (const l of listeners) l();
}
function setState(patch: Partial<AuthState>) {
    state = { ...state, ...patch };
    emit();
}

/** The decrypted DEK for the current session, or null if locked out. */
export function getDEK(): Uint8Array | null {
    return dek;
}

async function persistSession(token: string, dekBytes: Uint8Array, email: string, userId: string) {
    // Start every sign-in (login, register, recovery, QR link) from a clean local
    // slate, so a previous account's entries/notes/activities can never bleed into
    // the new one. App restart uses restoreSession() (no clear), so this only fires
    // on a real sign-in. The account's own data reloads via the next sync().
    await clearStore();
    await clearTaxonomy();
    setAuthToken(token);
    dek = dekBytes;
    await Promise.all([
        secureSet(K.session, token),
        secureSet(K.dek, dekToHex(dekBytes)),
        secureSet(K.email, email),
        secureSet(K.userId, userId),
    ]);
    setState({ status: "authenticated", email, userId });
}

/** Load any persisted session on app start. */
export async function restoreSession(): Promise<void> {
    const [token, dekHex, email, userId] = await Promise.all([
        secureGet(K.session), secureGet(K.dek), secureGet(K.email), secureGet(K.userId),
    ]);
    if (token && dekHex) {
        setAuthToken(token);
        dek = dekFromHex(dekHex);
        setState({ status: "authenticated", email, userId });
        // Background-validate the persisted token: flip to "expired" if the server
        // rejects it. Optimistically authenticated first so offline launches work.
        void validateSession();
    } else {
        setState({ status: "unauthenticated" });
    }
}

/** True for an actual auth rejection (401/403), as opposed to a network error - so
 *  we never lock the user out just because they're offline. */
export function isAuthError(e: unknown): boolean {
    const s = (e as { data?: { httpStatus?: number } })?.data?.httpStatus;
    return s === 401 || s === 403;
}

/** Check the persisted token is still valid. Only downgrades on a real auth
 *  rejection; a network failure is ignored (stay authenticated for offline use). */
async function validateSession(): Promise<void> {
    try {
        await trpc.auth.me.query();
    } catch (e) {
        if (isAuthError(e)) markSessionExpired();
    }
}

/** The persisted session is no longer valid (token rejected). Keep the local
 *  decrypted data + DEK so the user can still export a backup, but block the app and
 *  force a re-sign-in. No-op unless we're currently authenticated. */
export function markSessionExpired(): void {
    if (state.status !== "authenticated") return;
    setState({ status: "expired" });
}

/** Create an account: email required, password optional, recovery code always set.
 *  Returns the recovery code to show once. */
export async function register(email: string, password?: string): Promise<{ recoveryCode: string }> {
    const dekBytes = generateDEK();
    const { code, display } = generateRecoveryCode();
    const e = email.trim();
    const rc = deriveFromRecoveryCode(code);
    const wrc = wrapDEK(rc.kek, dekBytes);

    const extra: { authTokenPw?: string; wrappedDekPw?: string; wrappedDekPwNonce?: string } = {};
    if (password) {
        const pw = deriveFromSecret(password, e);
        const wpw = wrapDEK(pw.kek, dekBytes);
        extra.authTokenPw = pw.authToken;
        extra.wrappedDekPw = wpw.ciphertext;
        extra.wrappedDekPwNonce = wpw.nonce;
    }
    const res = await trpc.auth.register.mutate({
        email: e,
        authTokenRc: rc.authToken,
        wrappedDekRc: wrc.ciphertext, wrappedDekRcNonce: wrc.nonce,
        ...extra,
    });
    pendingRecoveryCode = display;
    await persistSession(res.token, dekBytes, e, res.userId);
    return { recoveryCode: display };
}

/** Sign in on any device with the recovery code (unwraps the DEK from the server). */
export async function signInWithCode(recoveryInput: string): Promise<void> {
    const rc = deriveFromRecoveryCode(normalizeRecoveryCode(recoveryInput));
    const res = await trpc.auth.signInWithCode.mutate({ authTokenRc: rc.authToken });
    const dekBytes = unwrapDEK(rc.kek, { ciphertext: res.wrappedDekRc, nonce: res.wrappedDekRcNonce });
    await persistSession(res.token, dekBytes, "", res.userId);
}

/** Sign in with the optional email+password backup (unwraps the DEK from the server). */
export async function login(email: string, password: string): Promise<void> {
    const pw = deriveFromSecret(password, email);
    const res = await trpc.auth.login.mutate({ email, authTokenPw: pw.authToken });
    const dekBytes = unwrapDEK(pw.kek, { ciphertext: res.wrappedDekPw, nonce: res.wrappedDekPwNonce });
    await persistSession(res.token, dekBytes, email, res.userId);
}

/** Add (or replace) the optional email+password backup on the signed-in account. */
export async function addEmailPasswordBackup(email: string, password: string): Promise<void> {
    const d = getDEK();
    if (!d) throw new Error("Sign in first");
    const pw = deriveFromSecret(password, email.trim());
    const wpw = wrapDEK(pw.kek, d);
    await trpc.auth.addBackup.mutate({
        email: email.trim(),
        authTokenPw: pw.authToken,
        wrappedDekPw: wpw.ciphertext, wrappedDekPwNonce: wpw.nonce,
    });
    setState({ email: email.trim() });
    await secureSet(K.email, email.trim());
}

/** Permanently delete the account + all server-side data, then sign out locally.
 *  Irreversible; callers should confirm first. */
export async function deleteAccount(): Promise<void> {
    await trpc.auth.deleteAccount.mutate();
    await logout(); // wipes local store/keys + sets unauthenticated (server token is already gone)
}

export async function logout(): Promise<void> {
    try {
        await trpc.auth.logout.mutate();
    } catch {
        // best-effort; clear locally regardless
    }
    setAuthToken(null);
    dek = null;
    await clearStore(); // don't leave the previous user's decrypted entries on the device
    await clearTaxonomy(); // ...or their custom activities
    await Promise.all([secureDelete(K.session), secureDelete(K.dek), secureDelete(K.email), secureDelete(K.userId)]);
    setState({ status: "unauthenticated", email: null, userId: null });
}

// #region device link (QR cross-device sign-in)
// One device shows a QR carrying a one-time key (OTK) + channel id; the other scans
// it (so the phone can always be the camera). Whichever device is signed in is the
// "giver": it seals a fresh session token + the DEK under the OTK and the server
// relays only that ciphertext. The OTK lives only in the QR (optical, out-of-band),
// so the relay can never read or MITM the handoff - there is no exchanged key for it
// to swap. See server/src/router/link.ts.
interface LinkQr { v: 2; c: string; k: string } // version, channelId, one-time key (hex)
interface LinkBundle { token: string; userId: string; email: string; dek: string }

const isGiver = () => state.status === "authenticated";

function makeBundle(otk: string, token: string, userId: string) {
    const dek = getDEK();
    if (!dek) throw new Error("Locked: sign in first");
    const bundle: LinkBundle = { token, userId, email: state.email ?? "", dek: dekToHex(dek) };
    return sealWithKey(fromHex(otk), bundle);
}

async function receiveBundle(otk: string, ciphertext: string, nonce: string) {
    const bundle = openWithKey<LinkBundle>(fromHex(otk), { ciphertext, nonce });
    await persistSession(bundle.token, dekFromHex(bundle.dek), bundle.email, bundle.userId);
}

export interface ShowLink {
    qrValue: string;
    giver: boolean;
    /** Poll once. "waiting" until the other device acts; "linked" = we just signed
     *  in (receiver); "delivered" = we handed off our session (giver). */
    poll: () => Promise<"waiting" | "linked" | "delivered">;
}

/** Show side: become the QR displayer. Works whether we're the giver or receiver. */
export function startShowLink(): ShowLink {
    const channelId = randomChannelId();
    const otk = generateLinkKey();
    const giver = isGiver();
    const qrValue = JSON.stringify({ v: 2, c: channelId, k: otk } satisfies LinkQr);

    async function poll(): Promise<"waiting" | "linked" | "delivered"> {
        const rec = await trpc.link.peek.query({ channelId });
        if (!rec) return "waiting";
        if (giver) {
            if (rec.ciphertext) return "delivered"; // already handed off
            if (rec.scannerReady) {
                // The new device has scanned: seal under the OTK we generated and deposit.
                const { token, userId } = await trpc.link.newSession.mutate();
                const sealed = makeBundle(otk, token, userId);
                await trpc.link.deposit.mutate({ channelId, ciphertext: sealed.ciphertext, nonce: sealed.nonce });
                return "delivered";
            }
            return "waiting";
        }
        // Receiver showing the QR: wait for the giver (scanner) to deposit the bundle.
        if (rec.ciphertext && rec.nonce) {
            await receiveBundle(otk, rec.ciphertext, rec.nonce);
            return "linked";
        }
        return "waiting";
    }
    return { qrValue, giver, poll };
}

export interface ScanLink {
    giver: boolean;
    /** "linked" = signed in now (receiver); "delivered" = handed off (giver);
     *  "pending" = presence posted, keep polling (receiver waiting on the giver). */
    status: "linked" | "delivered" | "pending";
    poll?: () => Promise<"waiting" | "linked">;
}

/** Scan side: handle a scanned QR. Works whether we're the giver or receiver. */
export async function startScanLink(qrValue: string): Promise<ScanLink> {
    let qr: LinkQr;
    try { qr = JSON.parse(qrValue); } catch { throw new Error("That isn't a RightNow link code."); }
    if (qr?.v !== 2 || typeof qr.c !== "string" || typeof qr.k !== "string") {
        throw new Error("Unrecognized link code.");
    }

    if (isGiver()) {
        // We're signed in: seal the bundle under the scanned OTK and deposit it.
        const { token, userId } = await trpc.link.newSession.mutate();
        const sealed = makeBundle(qr.k, token, userId);
        await trpc.link.deposit.mutate({ channelId: qr.c, ciphertext: sealed.ciphertext, nonce: sealed.nonce });
        return { giver: true, status: "delivered" };
    }

    // Receiver: signal presence so the giver (shower) knows to deposit, then poll
    // for the bundle and open it with the OTK from the QR.
    await trpc.link.deposit.mutate({ channelId: qr.c, scannerReady: true });
    async function poll(): Promise<"waiting" | "linked"> {
        const rec = await trpc.link.peek.query({ channelId: qr.c });
        if (rec?.ciphertext && rec.nonce) {
            await receiveBundle(qr.k, rec.ciphertext, rec.nonce);
            return "linked";
        }
        return "waiting";
    }
    return { giver: false, status: "pending", poll };
}
// #endregion

/** Subscribe to auth state in a component. */
export function useAuth(): AuthState {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force((n) => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return state;
}
