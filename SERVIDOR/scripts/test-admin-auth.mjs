// Pruebas del acceso al administrador con Google, con claves de prueba generadas aquí.
import assert from "node:assert/strict";
import {
    verifyGoogleCredential,
    isAuthorized,
    createSession,
    readSession,
    SESSION_COOKIE,
} from "../lib/admin-auth.mjs";

const CLIENT = "test-client.apps.googleusercontent.com";
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
);
const other = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
const fetchKeys = async () => [jwk];
const now = Date.now();
async function token(claims, key = pair.privateKey) {
    const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
    const body = b64({
        iss: "https://accounts.google.com",
        aud: CLIENT,
        exp: Math.floor(now / 1000) + 3600,
        email_verified: true,
        ...claims,
    });
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
    return head + "." + body + "." + Buffer.from(sig).toString("base64url");
}
const opts = { fetchKeys, now };

// Cuenta autorizada.
const ok = await verifyGoogleCredential(await token({ email: "MatuDaddona@gmail.com", name: "Martín" }), CLIENT, opts);
assert.equal(ok.email, "matudaddona@gmail.com");
assert.equal(isAuthorized(ok.email), true);

// Cuenta válida de Google pero no autorizada.
const stranger = await verifyGoogleCredential(await token({ email: "otra.persona@gmail.com" }), CLIENT, opts);
assert.equal(isAuthorized(stranger.email), false);

// Tokens rechazados.
const rejects = async (cred, why) =>
    assert.rejects(() => verifyGoogleCredential(cred, CLIENT, opts), undefined, why);
await rejects(await token({ email: "matudaddona@gmail.com" }, other.privateKey), "firma de otra clave");
await rejects(await token({ email: "matudaddona@gmail.com", aud: "otra-app" }), "otro destinatario");
await rejects(await token({ email: "matudaddona@gmail.com", iss: "https://evil.example" }), "otro emisor");
await rejects(await token({ email: "matudaddona@gmail.com", exp: Math.floor(now / 1000) - 600 }), "vencido");
await rejects(await token({ email: "matudaddona@gmail.com", email_verified: false }), "correo sin verificar");
const good = await token({ email: "matudaddona@gmail.com" });
const [h, , s] = good.split(".");
await rejects(h + "." + b64({ iss: "https://accounts.google.com", aud: CLIENT, exp: 9e9, email_verified: true, email: "otra@gmail.com" }) + "." + s, "contenido adulterado");
await rejects("basura", "formato inválido");
await assert.rejects(() => verifyGoogleCredential(good, "", opts), undefined, "sin ID de cliente");
await assert.rejects(
    () => verifyGoogleCredential(good, "697283134798-otra.apps.googleusercontent.com", opts),
    undefined,
    "token emitido para otro ID de cliente",
);

// Sesiones.
const secret = "clave-de-prueba";
const session = await createSession(ok, secret, now);
const cookie = `otra=1; ${SESSION_COOKIE}=${session}`;
assert.equal((await readSession(cookie, secret, now)).email, "matudaddona@gmail.com");
assert.equal(await readSession(cookie, "otra-clave", now), null, "firma de sesión con otra clave");
assert.equal(await readSession(cookie, secret, now + 8 * 864e5), null, "sesión vencida");
const [payload, sig] = session.split(".");
const forged = b64({ email: "matudaddona@gmail.com", exp: now + 1e9 });
assert.equal(await readSession(`${SESSION_COOKIE}=${forged}.${sig}`, secret, now), null, "sesión adulterada");
assert.equal(await readSession(`${SESSION_COOKIE}=${payload}.${sig}`, "", now), null, "sin clave de sesión");
const strangerSession = await createSession(stranger, secret, now);
assert.equal(await readSession(`${SESSION_COOKIE}=${strangerSession}`, secret, now), null, "correo no autorizado");
assert.equal(await readSession("", secret, now), null);

console.log(
    JSON.stringify({
        authorizedGmailEnters: true,
        otherAccountsBlocked: true,
        forgedOrExpiredTokensRejected: true,
        sessionsSignedAndExpire: true,
    }),
);
