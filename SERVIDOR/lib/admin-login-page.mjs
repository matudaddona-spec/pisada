// Pantalla de ingreso al administrador con el botón oficial de Google.
import { escapeHtml as e } from "./catalog-domain.mjs";

export function adminLoginPage({ clientId, message = "" }) {
    const configured = Boolean(clientId);
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Ingresar · Administración de Pisada</title>
<link rel="icon" href="/IMG/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;900&family=Inter:wght@400;500;600&display=swap" />
<style>
:root{--bg:#0d0d0f;--surface:#16161a;--line:#2b2b33;--ink:#f2f2ee;--muted:#9b9ba5;--accent:#c6ff3d;--danger:#ff6b5e}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:radial-gradient(60% 60% at 80% 10%,rgba(198,255,61,.12),transparent 70%),var(--bg);color:var(--ink);font-family:Inter,"Segoe UI",Arial,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.card{width:100%;max-width:420px;background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:36px 30px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.logo{display:inline-flex;align-items:center;gap:10px;color:var(--accent);text-decoration:none;margin-bottom:26px}
.logo span{font-family:Archivo,sans-serif;font-weight:900;font-size:24px;letter-spacing:.04em;color:var(--ink)}
h1{font-family:Archivo,sans-serif;font-weight:900;font-size:28px;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 10px}
p{color:var(--muted);line-height:1.6;margin:0 0 24px;font-size:15px}
#google-button{display:flex;justify-content:center;min-height:44px}
.alert{display:none;margin-top:22px;padding:14px 16px;border-radius:14px;text-align:left;font-size:14px;line-height:1.5}
.alert.is-visible{display:block}
.alert--error{background:rgba(255,107,94,.1);border:1px solid rgba(255,107,94,.45);color:#ffd0cb}
.alert--error strong{display:block;color:var(--danger);font-family:Archivo,sans-serif;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.alert--info{background:rgba(198,255,61,.08);border:1px solid rgba(198,255,61,.35);color:var(--ink)}
.back{display:inline-block;margin-top:26px;color:var(--muted);font-size:13px}
.back:hover{color:var(--accent)}
code{background:#0d0d0f;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:12px}
</style>
</head>
<body>
<main>
<section class="card" aria-labelledby="titulo">
<a class="logo" href="/" aria-label="Pisada"><svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M7 21.5c3.2 0 4.6-1.6 6.4-4.6l2-3.3c1.3-2.2 2.6-3.1 4.6-3.1H25v3.4h-4.4c-.9 0-1.5.4-2.2 1.6l-2 3.4c-2.4 4-4.6 6-9.4 6z" fill="#0d0d0f"/></svg><span>PISADA</span></a>
<h1 id="titulo">Administración</h1>
<p>Ingresá con tu cuenta de Google. Solo las cuentas autorizadas pueden entrar al tablero.</p>
${configured ? '<div id="google-button"></div>' : ""}
<div id="alert" class="alert ${message ? "alert--error is-visible" : ""}" role="alert">${message ? `<strong>Sin acceso</strong>${e(message)}` : ""}</div>
${configured ? "" : '<div class="alert alert--info is-visible"><strong>Falta un paso de configuración.</strong><br>Pegá el ID de cliente de Google en <code>GOOGLE_CLIENT_ID</code> dentro de <code>SERVIDOR/lib/admin-auth.mjs</code> y reiniciá el servidor.</div>'}
<a class="back" href="/">← Volver a la tienda</a>
</section>
</main>
${
    configured
        ? `<script>
function mostrar(titulo, texto) {
    const box = document.getElementById("alert");
    box.className = "alert alert--error is-visible";
    box.innerHTML = "";
    const t = document.createElement("strong");
    t.textContent = titulo;
    box.append(t, document.createTextNode(texto));
}
async function alIngresar(respuesta) {
    try {
        const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Pisada-Admin": "1" },
            body: JSON.stringify({ credential: respuesta.credential }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) return location.replace("/admin");
        if (r.status === 403)
            return mostrar("No tenés autorización", (data.email ? "La cuenta " + data.email + " no" : "Esta cuenta no") + " tiene permiso para entrar al administrador.");
        mostrar("No se pudo ingresar", data.error || "Volvé a intentar en unos segundos.");
    } catch {
        mostrar("No se pudo ingresar", "Revisá tu conexión y volvé a intentar.");
    }
}
function iniciarGoogle() {
    google.accounts.id.initialize({ client_id: ${JSON.stringify(clientId)}, callback: alIngresar, ux_mode: "popup" });
    google.accounts.id.renderButton(document.getElementById("google-button"), { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "es" });
}
</script>
<script src="https://accounts.google.com/gsi/client" async defer onload="iniciarGoogle()"></script>`
        : ""
}
</body>
</html>`;
}
