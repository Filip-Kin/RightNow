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
    deriveFromSecret, generateDEK, generateRecoveryCode, normalizeRecoveryCode,
    wrapDEK, unwrapDEK, dekToHex, dekFromHex,
    generateLinkKeypair, linkSharedKey, sealWithKey, openWithKey, randomChannelId,
    toHex, fromHex,
} from "./crypto";
import { secureDelete, secureGet, secureSet } from "./storage";
import { clearStore } from "./entries";
import { clearTaxonomy } from "./activities";

const K = { session: "rn_session", dek: "rn_dek", email: "rn_email", userId: "rn_userId" } as const;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

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
    } else {
        setState({ status: "unauthenticated" });
    }
}

/** Create an account. Returns the recovery code to show once (we can't recover it). */
export async function register(email: string, password: string): Promise<{ recoveryCode: string }> {
    const dekBytes = generateDEK();
    const { code, display } = generateRecoveryCode();
    const pw = deriveFromSecret(password, email);
    const rc = deriveFromSecret(code, email);
    const wpw = wrapDEK(pw.kek, dekBytes);
    const wrc = wrapDEK(rc.kek, dekBytes);

    const res = await trpc.auth.register.mutate({
        email,
        authTokenPw: pw.authToken,
        authTokenRc: rc.authToken,
        wrappedDekPw: wpw.ciphertext, wrappedDekPwNonce: wpw.nonce,
        wrappedDekRc: wrc.ciphertext, wrappedDekRcNonce: wrc.nonce,
    });
    pendingRecoveryCode = display;
    await persistSession(res.token, dekBytes, email, res.userId);
    return { recoveryCode: display };
}

/** Sign in (works on a fresh device: unwraps the DEK from the server blob). */
export async function login(email: string, password: string): Promise<void> {
    const pw = deriveFromSecret(password, email);
    const res = await trpc.auth.login.mutate({ email, authTokenPw: pw.authToken });
    const dekBytes = unwrapDEK(pw.kek, { ciphertext: res.wrappedDekPw, nonce: res.wrappedDekPwNonce });
    await persistSession(res.token, dekBytes, email, res.userId);
}

/** Forgot password: prove ownership with the recovery code, set a new password. */
export async function recoverAndReset(email: string, recoveryInput: string, newPassword: string): Promise<void> {
    const rc = deriveFromSecret(normalizeRecoveryCode(recoveryInput), email);
    const res = await trpc.auth.recover.mutate({ email, authTokenRc: rc.authToken });
    const dekBytes = unwrapDEK(rc.kek, { ciphertext: res.wrappedDekRc, nonce: res.wrappedDekRcNonce });

    const newPw = deriveFromSecret(newPassword, email);
    const nwpw = wrapDEK(newPw.kek, dekBytes);
    setAuthToken(res.recoveryToken); // recovery token only authorizes resetPassword
    await trpc.auth.resetPassword.mutate({
        authTokenPw: newPw.authToken,
        wrappedDekPw: nwpw.ciphertext, wrappedDekPwNonce: nwpw.nonce,
    });
    // The recovery token was consumed; get a clean session with the new password.
    await login(email, newPassword);
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
// Direction-agnostic: one device shows a QR, the other scans it (so the phone can
// always be the camera). Whichever device is signed in is the "giver" and seals a
// fresh session token + the DEK to the new device over an ECDH-derived key; the
// server only relays ciphertext (see server/src/router/link.ts).
interface LinkQr { v: 1; c: string; k: string } // version, channelId, shower pubkey (hex)
interface LinkBundle { token: string; userId: string; email: string; dek: string }

const isGiver = () => state.status === "authenticated";

function makeBundle(shared: Uint8Array, token: string, userId: string) {
    const dek = getDEK();
    if (!dek) throw new Error("Locked: sign in first");
    const bundle: LinkBundle = { token, userId, email: state.email ?? "", dek: dekToHex(dek) };
    return sealWithKey(shared, bundle);
}

async function receiveBundle(shared: Uint8Array, ciphertext: string, nonce: string) {
    const bundle = openWithKey<LinkBundle>(shared, { ciphertext, nonce });
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
    const { secretKey, publicKey } = generateLinkKeypair();
    const channelId = randomChannelId();
    const giver = isGiver();
    const qrValue = JSON.stringify({ v: 1, c: channelId, k: toHex(publicKey) } satisfies LinkQr);

    async function poll(): Promise<"waiting" | "linked" | "delivered"> {
        const rec = await trpc.link.peek.query({ channelId });
        if (!rec) return "waiting";
        if (giver) {
            if (rec.ciphertext) return "delivered"; // already handed off
            if (rec.scannerPubKey) {
                const shared = linkSharedKey(secretKey, fromHex(rec.scannerPubKey));
                const { token, userId } = await trpc.link.newSession.mutate();
                const sealed = makeBundle(shared, token, userId);
                await trpc.link.deposit.mutate({ channelId, ciphertext: sealed.ciphertext, nonce: sealed.nonce });
                return "delivered";
            }
            return "waiting";
        }
        if (rec.ciphertext && rec.nonce && rec.scannerPubKey) {
            const shared = linkSharedKey(secretKey, fromHex(rec.scannerPubKey));
            await receiveBundle(shared, rec.ciphertext, rec.nonce);
            return "linked";
        }
        return "waiting";
    }
    return { qrValue, giver, poll };
}

export interface ScanLink {
    giver: boolean;
    /** "linked" = signed in now (receiver); "delivered" = handed off (giver);
     *  "pending" = our key is posted, keep polling (receiver waiting on the giver). */
    status: "linked" | "delivered" | "pending";
    poll?: () => Promise<"waiting" | "linked">;
}

/** Scan side: handle a scanned QR. Works whether we're the giver or receiver. */
export async function startScanLink(qrValue: string): Promise<ScanLink> {
    let qr: LinkQr;
    try { qr = JSON.parse(qrValue); } catch { throw new Error("That isn't a RightNow link code."); }
    if (qr?.v !== 1 || typeof qr.c !== "string" || typeof qr.k !== "string") {
        throw new Error("Unrecognized link code.");
    }
    const { secretKey, publicKey } = generateLinkKeypair();
    const shared = linkSharedKey(secretKey, fromHex(qr.k));

    if (isGiver()) {
        const { token, userId } = await trpc.link.newSession.mutate();
        const sealed = makeBundle(shared, token, userId);
        await trpc.link.deposit.mutate({ channelId: qr.c, scannerPubKey: toHex(publicKey), ciphertext: sealed.ciphertext, nonce: sealed.nonce });
        return { giver: true, status: "delivered" };
    }

    // Receiver: post our key, then poll for the giver's sealed bundle.
    await trpc.link.deposit.mutate({ channelId: qr.c, scannerPubKey: toHex(publicKey) });
    async function poll(): Promise<"waiting" | "linked"> {
        const rec = await trpc.link.peek.query({ channelId: qr.c });
        if (rec?.ciphertext && rec.nonce) {
            await receiveBundle(shared, rec.ciphertext, rec.nonce);
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
