/**
 * End-to-end check of the E2EE contract. Simulates everything the real app
 * client will do with crypto (the server does none), driving the actual tRPC
 * API. Uses node:crypto here; the app will use libsodium, but the wire contract
 * is identical: the server only ever sees opaque base64/hex strings.
 *
 * Run against a live server:  API_URL=http://localhost:3939 bun run scripts/e2e.ts
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import {
    randomBytes, createHash, createHmac, hkdfSync,
    createCipheriv, createDecipheriv, scryptSync,
} from 'node:crypto';
import type { AppRouter } from '../src/index';

const API_URL = process.env.API_URL ?? 'http://localhost:3939';

// #region client-side crypto (mirrors the planned app)
const enc = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64');
const dec = (s: string) => Buffer.from(s, 'base64');

/** Derive a 64-byte stretched secret from a low/high-entropy secret, salted by email. */
function stretch(secret: string, email: string): Buffer {
    const salt = createHash('sha256').update(email.trim().toLowerCase()).digest();
    return scryptSync(secret, salt, 64); // [0..32) auth, [32..64) KEK
}
/** Recovery codes have no email, so they stretch with a fixed app salt (matches lib/crypto). */
function stretchRecovery(code: string): Buffer {
    const salt = createHash('sha256').update('rightnow/recovery-code/v1').digest();
    return scryptSync(code, salt, 64);
}
function splitAuth(stretched: Buffer) {
    return {
        authToken: stretched.subarray(0, 32).toString('hex'),
        kek: stretched.subarray(32, 64),
    };
}
function aeadSeal(key: Buffer, plaintext: Buffer) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return { ciphertext: enc(ct), nonce: enc(nonce) };
}
function aeadOpen(key: Buffer, ciphertextB64: string, nonceB64: string) {
    const buf = dec(ciphertextB64);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(0, buf.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, dec(nonceB64));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
}
/** Sub-keys derived from the DEK for cell-id HMAC and payload AEAD. */
function dekKeys(dek: Buffer) {
    return {
        cellKey: Buffer.from(hkdfSync('sha256', dek, Buffer.alloc(0), Buffer.from('cell-id'), 32)),
        dataKey: Buffer.from(hkdfSync('sha256', dek, Buffer.alloc(0), Buffer.from('cell-data'), 32)),
    };
}
function cellId(cellKey: Buffer, date: string, hour: number) {
    return createHmac('sha256', cellKey).update(`${date}|${hour}`).digest('hex');
}
// #endregion

function client(token?: string) {
    return createTRPCClient<AppRouter>({
        links: [httpBatchLink({
            url: API_URL,
            headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
        })],
    });
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}`); }
}

async function main() {
    const email = `e2e+${randomBytes(4).toString('hex')}@example.com`;
    const password = 'correct horse battery staple';
    const recoveryCode = randomBytes(32).toString('hex'); // 256-bit, high entropy

    // --- anonymous signup: recovery code only, server stores opaque blobs ---
    const dek = randomBytes(32);
    const { cellKey, dataKey } = dekKeys(dek);

    const rc = splitAuth(stretchRecovery(recoveryCode));
    const wrapRc = aeadSeal(rc.kek, dek);

    console.log('register (email + recovery code)');
    const reg = await client().auth.register.mutate({
        email,
        authTokenRc: rc.authToken,
        wrappedDekRc: wrapRc.ciphertext, wrappedDekRcNonce: wrapRc.nonce,
    });
    check('register returns a session token', !!reg.token);

    // --- push two encrypted cells ---
    console.log('push');
    const mk = (date: string, hour: number, activity: number, feeling: number, t: number) => {
        const seal = aeadSeal(dataKey, Buffer.from(JSON.stringify({ activity, feeling, source: 'manual' })));
        return { cellId: cellId(cellKey, date, hour), ...seal, deleted: false, updatedAt: t };
    };
    const t0 = 1_700_000_000_000;
    await client(reg.token).entries.push.mutate({
        records: [mk('2026-05-28', 9, 3, 4, t0), mk('2026-05-28', 10, 6, 5, t0)],
    });

    // --- sign in with the recovery code on a "new device": unwrap DEK from rc blob ---
    console.log('signInWithCode (fresh device)');
    const signin = await client().auth.signInWithCode.mutate({ authTokenRc: rc.authToken });
    const dekFromRc = aeadOpen(rc.kek, signin.wrappedDekRc, signin.wrappedDekRcNonce);
    check('DEK unwrapped via recovery code equals original', dekFromRc.equals(dek));

    // --- pull + decrypt with the recovered DEK ---
    console.log('pull');
    const k2 = dekKeys(dekFromRc);
    const login = signin; // alias: subsequent calls use this session token
    const pulled = await client(login.token).entries.pull.query({});
    check('pull returns both cells', pulled.records.length === 2);
    const decoded = pulled.records.map((r) => JSON.parse(aeadOpen(k2.dataKey, r.ciphertext, r.nonce).toString()));
    check('decrypted activity/feeling round-trips', decoded.some((d) => d.activity === 3 && d.feeling === 4));

    // --- last-write-wins: stale update ignored, newer wins ---
    console.log('LWW');
    await client(login.token).entries.push.mutate({ records: [mk('2026-05-28', 9, 0, 0, t0 - 1000)] });
    const afterStale = await client(login.token).entries.pull.query({});
    const cell9 = afterStale.records.find((r) => r.cellId === cellId(k2.cellKey, '2026-05-28', 9))!;
    check('stale write ignored', JSON.parse(aeadOpen(k2.dataKey, cell9.ciphertext, cell9.nonce).toString()).activity === 3);
    await client(login.token).entries.push.mutate({ records: [mk('2026-05-28', 9, 7, 1, t0 + 1000)] });
    const afterNew = await client(login.token).entries.pull.query({});
    const cell9b = afterNew.records.find((r) => r.cellId === cellId(k2.cellKey, '2026-05-28', 9))!;
    check('newer write wins', JSON.parse(aeadOpen(k2.dataKey, cell9b.ciphertext, cell9b.nonce).toString()).activity === 7);

    // --- incremental pull cursor ---
    const since = await client(login.token).entries.pull.query({ since: afterNew.cursor });
    check('pull(since=cursor) returns nothing new', since.records.length === 0);

    // --- add the optional email+password backup, then sign in with it on a fresh device ---
    console.log('addBackup + email/password login');
    const pw = splitAuth(stretch(password, email));
    const wrapPw = aeadSeal(pw.kek, dek);
    await client(reg.token).auth.addBackup.mutate({
        email,
        authTokenPw: pw.authToken,
        wrappedDekPw: wrapPw.ciphertext, wrappedDekPwNonce: wrapPw.nonce,
    });
    const status = await client(reg.token).auth.backupStatus.query();
    check('backupStatus reports the backup email', status.email === email);

    const pwLogin = await client().auth.login.mutate({ email, authTokenPw: pw.authToken });
    const dekFromPw = aeadOpen(pw.kek, pwLogin.wrappedDekPw, pwLogin.wrappedDekPwNonce);
    check('DEK unwrapped via email+password equals original', dekFromPw.equals(dek));

    const wrongLoginFails = await client().auth.login.mutate({ email, authTokenPw: 'deadbeef'.repeat(8) })
        .then(() => false).catch(() => true);
    check('wrong password rejected', wrongLoginFails);

    const wrongCodeFails = await client().auth.signInWithCode.mutate({ authTokenRc: 'deadbeef'.repeat(8) })
        .then(() => false).catch(() => true);
    check('wrong recovery code rejected', wrongCodeFails);

    // --- auth enforcement ---
    console.log('auth enforcement');
    const noToken = await client().entries.pull.query({}).then(() => false).catch(() => true);
    check('entries.pull rejected without token', noToken);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
