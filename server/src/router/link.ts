import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { mintToken } from './auth';

// Ephemeral device-link relay for QR cross-device sign-in. One device shows a QR
// (its ephemeral X25519 public key + a random channel id); the other scans it.
// Whichever device is already signed in is the "giver": it derives a shared secret
// (ECDH) and seals {session token, DEK} for the new device. The relay only ever
// carries opaque ciphertext + public keys it cannot turn into the shared secret, so
// the zero-knowledge guarantee holds. Direction-agnostic so the phone can always be
// the scanner and the web the display, whichever one is the signed-in device:
//   - scanner is the giver  -> one deposit {scannerPubKey, ciphertext}, shower reads it
//   - shower is the giver    -> scanner deposits {scannerPubKey}, shower adds {ciphertext}
//
// In memory (single instance, intentionally throwaway): a restart just means "scan
// again". Channel id is a 256-bit capability; records live at most LINK_TTL_MS.
const LINK_TTL_MS = 2 * 60 * 1000;

interface LinkRecord {
    scannerPubKey?: string; // hex
    ciphertext?: string;
    nonce?: string; // hex
    expiresAt: number;
}

const channels = new Map<string, LinkRecord>();

function sweep() {
    const now = Date.now();
    for (const [k, v] of channels) if (v.expiresAt <= now) channels.delete(k);
}

const hex = (max: number) => z.string().regex(/^[0-9a-f]+$/i).max(max);

export const linkRouter = router({
    // Authenticated (giver) device: mint a fresh session token for the device being
    // linked, so each device has its own independently-revocable session.
    newSession: protectedProcedure.mutation(async ({ ctx }) => {
        const token = await mintToken(ctx.session.userId, 'session', '');
        return { token, userId: ctx.session.userId };
    }),

    // Merge fields into a channel (create on first write). Either device may deposit:
    // the scanner posts its public key, the giver posts the sealed bundle.
    deposit: publicProcedure
        .input(z.object({
            channelId: hex(128),
            scannerPubKey: hex(128).optional(),
            ciphertext: z.string().max(4096).optional(),
            nonce: hex(128).optional(),
        }))
        .mutation(async ({ input }) => {
            sweep();
            const rec = channels.get(input.channelId) ?? { expiresAt: 0 };
            if (input.scannerPubKey) rec.scannerPubKey = input.scannerPubKey;
            if (input.ciphertext) { rec.ciphertext = input.ciphertext; rec.nonce = input.nonce; }
            rec.expiresAt = Date.now() + LINK_TTL_MS;
            channels.set(input.channelId, rec);
            return { ok: true };
        }),

    // Non-destructive poll (both devices read it across the exchange's rounds).
    peek: publicProcedure
        .input(z.object({ channelId: hex(128) }))
        .query(async ({ input }) => {
            sweep();
            const rec = channels.get(input.channelId);
            if (!rec) return null;
            return { scannerPubKey: rec.scannerPubKey, ciphertext: rec.ciphertext, nonce: rec.nonce };
        }),
});
