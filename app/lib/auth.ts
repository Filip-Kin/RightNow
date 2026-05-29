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
} from "./crypto";
import { secureDelete, secureGet, secureSet } from "./storage";
import { clearStore } from "./entries";

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
    await Promise.all([secureDelete(K.session), secureDelete(K.dek), secureDelete(K.email), secureDelete(K.userId)]);
    setState({ status: "unauthenticated", email: null, userId: null });
}

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
