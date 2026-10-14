const SESSION_COOKIE = "lidire_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100000;
const encoder = new TextEncoder();

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runGmailFollowupSweep(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error("LiDire API error:", error);
        return Response.json(
          {
            error: "internal_error",
            message: "Não foi possível concluir a solicitação."
          },
          { status: 500 }
        );
      }
    }

    // Dedicated share pages keep social crawlers away from the SPA shell.
    // WhatsApp/Facebook receive a small, static HTML document with absolute
    // OG image URLs; normal users can continue into the real invitation flow.
    if (url.pathname === "/convite") {
      return buildSharePage(url, "invite");
    }
    if (url.pathname === "/divulgacao") {
      return buildSharePage(url, "promo");
    }

    // Explicit image routes make social previews reliable on Cloudflare Workers.
    // Some crawlers do not treat an asset served through the generic fallback
    // exactly like a direct image response.
    if (url.pathname === "/lidire-social-preview.png" || url.pathname === "/lidire-invite-preview.png" || url.pathname === "/logo-lidire-oficial.png" || url.pathname === "/lidire-simbolo-coracao.png") {
      const imageResponse = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), request));
      const headers = new Headers(imageResponse.headers);
      headers.set("Content-Type", "image/png");
      headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(imageResponse.body, {
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        headers
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);

    // Keep the root URL usable for the app itself. Social crawlers for
    // invitations should use /convite?token=..., which has a dedicated page.
    const contentType = assetResponse.headers.get("content-type") || "";
    if (url.pathname === "/" && contentType.includes("text/html")) {
      const html = await assetResponse.text();
      const imagePath = "/lidire-social-preview.png";
      const title = "LiDire — Seu Copiloto para a Vida";
      const description = "Organize sua rotina, compartilhe o que importa e viva melhor com a LiDire.";
      const canonicalUrl = `${url.origin}/`;
      const absoluteImage = `${url.origin}${imagePath}`;
      let body = html.replaceAll("__LIDIRE_ORIGIN__", url.origin);
      body = body.replaceAll("__LIDIRE_SOCIAL_TITLE__", escapeHtml(title));
      body = body.replaceAll("__LIDIRE_SOCIAL_DESCRIPTION__", escapeHtml(description));
      body = body.replaceAll("__LIDIRE_SOCIAL_URL__", escapeHtml(canonicalUrl));
      body = body.replaceAll("__LIDIRE_SOCIAL_IMAGE__", escapeHtml(absoluteImage));
      const headers = new Headers(assetResponse.headers);
      headers.delete("content-length");
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      return new Response(body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers
      });
    }

    return assetResponse;
  }
};

function buildSharePage(url, type) {
  const token = type === "invite" ? (url.searchParams.get("token") || "") : "";
  const isInvite = type === "invite";
  const inviteLanguage = "pt-BR";
  const isEnglish = false;
  const title = isInvite
    ? (isEnglish ? "You received an invitation to LiDire 💜" : "Você recebeu um convite para a LiDire 💜")
    : "LiDire — Seu Copiloto para a Vida";
  const description = isInvite
    ? (isEnglish ? "Join my family on LiDire and share what matters." : "Venha fazer parte da minha família na LiDire e compartilhar o que importa.")
    : "Organize sua rotina, compartilhe o que importa e viva melhor com a LiDire.";
  const imagePath = isInvite ? "/lidire-invite-preview.png" : "/lidire-social-preview.png";
  const absoluteImage = `${url.origin}${imagePath}`;
  const destination = isInvite && token
    ? `${url.origin}/?convite=${encodeURIComponent(token)}`
    : `${url.origin}/`;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url.href);
  const safeImage = escapeHtml(absoluteImage);
  const safeDestination = escapeHtml(destination);
  const html = `<!doctype html>
<html lang="${inviteLanguage}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LiDire">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeUrl}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<style>
html,body{margin:0;min-height:100%;background:#070c22;color:#fff;font-family:Arial,Helvetica,sans-serif}
main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;box-sizing:border-box}
.card{width:min(560px,100%);padding:32px;border:1px solid rgba(132,95,255,.28);border-radius:28px;background:linear-gradient(145deg,#11183b,#17133b);box-shadow:0 24px 80px rgba(0,0,0,.35);text-align:center;box-sizing:border-box}
img{display:block;width:100%;max-width:500px;height:auto;aspect-ratio:1200/630;object-fit:cover;margin:0 auto 24px;border-radius:18px;border:1px solid rgba(132,95,255,.28);box-shadow:0 18px 45px rgba(0,0,0,.28)}.eyebrow{font-size:12px;letter-spacing:.18em;color:#9da7d0;font-weight:700}.title{font-size:30px;line-height:1.15;margin:14px 0}.text{font-size:17px;line-height:1.55;color:#b8bfd9}.button{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:14px;text-decoration:none;color:#fff;font-weight:700;background:linear-gradient(90deg,#7652f6,#4e83ff)}
</style>
</head>
<body><main><section class="card">
<img src="${safeImage}" alt="LiDire">
<div class="eyebrow">${isInvite ? (isEnglish ? "FAMILY INVITATION" : "CONVITE FAMILIAR") : "LIDIRE"}</div>
<div class="title">${safeTitle}</div>
<div class="text">${safeDescription}</div>
<a class="button" href="${safeDestination}">${isInvite ? (isEnglish ? "Continue to LiDire" : "Continuar para a LiDire") : (isEnglish ? "Explore LiDire" : "Conhecer a LiDire")}</a>
</section></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}


function decodeInviteLanguage(token) { return "pt-BR"; }

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return Response.json({
      ok: true,
      app: "LiDire TRIGÉSIMO",
      database: !!env.DB
    });
  }

  if (!env.DB) {
    return Response.json(
      { error: "database_unavailable", message: "Banco D1 não configurado." },
      { status: 503 }
    );
  }

  if (url.pathname === "/api/register" && request.method === "POST") {
    return register(request, env, url);
  }

  if (url.pathname === "/api/email/verification/resend" && request.method === "POST") {
    return resendEmailVerification(request, env, url);
  }

  if (url.pathname === "/api/email/verify" && request.method === "GET") {
    return verifyEmail(request, env, url);
  }

  if (url.pathname === "/api/login/challenge" && request.method === "POST") {
    return loginChallenge(request, env);
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    return login(request, env);
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return logout(request, env);
  }

  if (url.pathname === "/api/connections" && request.method === "GET") {
    return listConnections(request, env);
  }

  if (url.pathname === "/api/connections/google" && request.method === "POST") {
    return connectGoogle(request, env);
  }

  if (url.pathname === "/api/connections/gmail/start" && request.method === "GET") return startGmailConnection(request, env, url);
  if (url.pathname === "/api/connections/gmail/callback" && request.method === "GET") return gmailConnectionCallback(request, env, url);
  if (url.pathname === "/api/gmail/messages" && request.method === "GET") return listGmailMessages(request, env, url);
  if (url.pathname === "/api/gmail/important-senders" && request.method === "GET") return listGmailImportantSenders(request, env);
  if (url.pathname === "/api/gmail/important-senders" && request.method === "POST") return saveGmailImportantSender(request, env);
  if (url.pathname.startsWith("/api/gmail/important-senders/") && request.method === "DELETE") return deleteGmailImportantSender(request, env, url);
  if (url.pathname === "/api/gmail/followups" && request.method === "GET") return listGmailFollowups(request, env);
  if (url.pathname === "/api/connections/gmail" && request.method === "DELETE") return disconnectGmail(request, env);

  if (url.pathname === "/api/connections/apple/start" && request.method === "GET") {
    return startAppleConnection(request, env, url);
  }

  if (url.pathname === "/api/connections/apple/callback" && request.method === "POST") {
    return appleConnectionCallback(request, env, url);
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = await getSessionUser(request, env);
    return Response.json({ user, database: true });
  }

  if (url.pathname === "/api/profile" && request.method === "GET") {
    const user = await getSessionUser(request, env);
    return Response.json({ user, database: true });
  }

  if (url.pathname === "/api/family" && request.method === "GET") {
    return listFamily(request, env);
  }

  if (url.pathname === "/api/family/check-email" && request.method === "GET") {
    return checkFamilyEmail(request, env, url);
  }

  if (url.pathname === "/api/family/members" && request.method === "POST") {
    return createFamilyMember(request, env);
  }

  if (url.pathname.startsWith("/api/family/members/") && request.method === "PUT") {
    return updateFamilyMember(request, env, url);
  }

  if (url.pathname.startsWith("/api/family/members/") && request.method === "DELETE") {
    return deleteFamilyMember(request, env, url);
  }

  if (url.pathname === "/api/family/notifications" && request.method === "POST") {
    return sendFamilyNotification(request, env);
  }

  if (url.pathname === "/api/family/invitations" && request.method === "GET") {
    return listFamilyInvitations(request, env);
  }

  if (url.pathname.startsWith("/api/family/invitations/") && request.method === "POST") {
    return respondFamilyInvitation(request, env, url);
  }

  if (url.pathname === "/api/cycle/periods" && request.method === "GET") {
    return listCyclePeriods(request, env);
  }

  if (url.pathname === "/api/cycle/periods" && request.method === "POST") {
    return createCyclePeriod(request, env);
  }

  if (url.pathname.startsWith("/api/cycle/periods/") && request.method === "PUT") {
    return updateCyclePeriod(request, env, url);
  }

  if (url.pathname.startsWith("/api/cycle/periods/") && request.method === "DELETE") {
    return deleteCyclePeriod(request, env, url);
  }

  if (url.pathname === "/api/notes" && request.method === "GET") {
    return listNotes(request, env);
  }

  if (url.pathname === "/api/notes" && request.method === "POST") {
    return createNote(request, env);
  }

  if (url.pathname.startsWith("/api/notes/") && request.method === "PUT") {
    return updateNote(request, env, url);
  }

  if (url.pathname.startsWith("/api/notes/") && request.method === "DELETE") {
    return deleteNote(request, env, url);
  }

  if (url.pathname === "/api/notifications" && request.method === "GET") {
    return listNotifications(request, env, url);
  }

  if (url.pathname === "/api/notifications/trash" && request.method === "DELETE") {
    return emptyFamilyNotificationTrash(request, env);
  }

  if (url.pathname.startsWith("/api/notifications/") && url.pathname.endsWith("/reply") && request.method === "POST") {
    return respondToFamilyNotification(request, env, url);
  }

  if (url.pathname.startsWith("/api/notifications/") && request.method === "DELETE") {
    return deleteFamilyNotification(request, env, url);
  }

  if (url.pathname.startsWith("/api/notifications/") && request.method === "POST") {
    return markNotificationRead(request, env, url);
  }

  if (url.pathname === "/api/places/autocomplete" && request.method === "GET") {
    return autocompletePlaces(request, env, url);
  }

  if (url.pathname === "/api/routes" && request.method === "POST") {
    return calculateRoute(request, env);
  }

  if (url.pathname === "/api/ai/assistant" && request.method === "POST") {
    return assistantAI(request, env);
  }

  if (url.pathname === "/api/profile" && request.method === "PUT") {
    return updateProfile(request, env);
  }

  if (url.pathname === "/api/password-change/challenge" && request.method === "POST") {
    return passwordChangeChallenge(request, env);
  }

  if (url.pathname === "/api/password-change" && request.method === "POST") {
    return passwordChange(request, env);
  }

  if (url.pathname === "/api/security/app-lock" && request.method === "GET") {
    return getAppLockSettings(request, env);
  }

  if (url.pathname === "/api/security/app-lock" && request.method === "PUT") {
    return updateAppLockSettings(request, env);
  }

  if (url.pathname === "/api/security/app-lock/verify" && request.method === "POST") {
    return verifyAppLock(request, env);
  }

  if (url.pathname === "/api/password-reset/request" && request.method === "POST") {
    return requestPasswordReset(request, env);
  }

  if (url.pathname === "/api/password-reset/complete" && request.method === "POST") {
    return completePasswordReset(request, env);
  }

  if (url.pathname === "/api/account/export" && ["GET", "POST"].includes(request.method)) {
    return exportPersonalData(request, env);
  }

  if (url.pathname === "/api/account" && request.method === "DELETE") {
    return deleteAccount(request, env);
  }

  return Response.json(
    {
      error: "not_found",
      message: "Endpoint não implementado.",
      path: url.pathname
    },
    { status: 404 }
  );
}


async function ensureFamilyFeatureTables(db) {
  // Create current tables first; then safely upgrade older D1 schemas in place.
  await db.prepare(`CREATE TABLE IF NOT EXISTS family_groups (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS family_members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT, name TEXT, relation TEXT, email TEXT, address TEXT, role TEXT DEFAULT 'member', status TEXT DEFAULT 'pending', permissions_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();

  const addColumn = async (table, column, definition) => {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all();
    if (!(info.results || []).some(x => x.name === column)) {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  };

  // Older deployments may have created these tables with only a subset of columns.
  // Add every column used by the current family endpoints before querying them.
  for (const [column, definition] of [
    ['id', 'TEXT'], ['owner_user_id', 'TEXT'], ['name', 'TEXT'], ['created_at', 'TEXT']
  ]) await addColumn('family_groups', column, definition);

  for (const [column, definition] of [
    ['id', 'TEXT'], ['group_id', 'TEXT'], ['user_id', 'TEXT'], ['name', 'TEXT'],
    ['relation', 'TEXT'], ['email', 'TEXT'], ['address', 'TEXT'], ['role', "TEXT DEFAULT 'member'"],
    ['status', "TEXT DEFAULT 'pending'"], ['permissions_json', "TEXT DEFAULT '{}'"],
    ['created_at', 'TEXT'], ['updated_at', 'TEXT']
  ]) await addColumn('family_members', column, definition);

  // Older D1 versions declared family_members.user_id NOT NULL. An unregistered
  // family member has no users.id yet, so this column must allow NULL. Rebuild
  // the table only when the existing schema requires it, preserving all rows.
  const familyMemberColumns = await db.prepare(`PRAGMA table_info(family_members)`).all();
  const userIdColumn = (familyMemberColumns.results || []).find(x => x.name === 'user_id');
  if (userIdColumn && Number(userIdColumn.notnull) === 1) {
    await db.prepare(`CREATE TABLE family_members__v34 (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT,
      relation TEXT,
      email TEXT,
      address TEXT,
      role TEXT DEFAULT 'member',
      status TEXT DEFAULT 'pending',
      permissions_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await db.prepare(`INSERT INTO family_members__v34
      (id, group_id, user_id, name, relation, email, address, role, status, permissions_json, created_at, updated_at)
      SELECT id, group_id, user_id, name, relation, email, address, role, status, permissions_json,
             COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM family_members`).run();
    await db.prepare(`DROP TABLE family_members`).run();
    await db.prepare(`ALTER TABLE family_members__v34 RENAME TO family_members`).run();
  }

  await db.prepare(`UPDATE family_groups SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`).run();
  await db.prepare(`UPDATE family_members SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`).run();
  await db.prepare(`UPDATE family_members SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS family_invites (
    id TEXT PRIMARY KEY, family_member_id TEXT, group_id TEXT,
    owner_user_id TEXT, recipient_user_id TEXT, invitee_name TEXT NOT NULL DEFAULT 'Familiar',
    status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP, responded_at TEXT
  )`).run();
  // Upgrade a pre-existing family_invites table before creating indexes that use its columns.
  for (const [column, definition] of [
    ['id', 'TEXT'], ['family_member_id', 'TEXT'], ['group_id', 'TEXT'],
    ['owner_user_id', 'TEXT'], ['recipient_user_id', 'TEXT'], ['invitee_name', "TEXT NOT NULL DEFAULT 'Familiar'"],
    ['status', "TEXT DEFAULT 'pending'"], ['created_at', 'TEXT'], ['responded_at', 'TEXT']
  ]) await addColumn('family_invites', column, definition);
  await db.prepare(`UPDATE family_invites SET status = COALESCE(status, 'pending'), created_at = COALESCE(created_at, CURRENT_TIMESTAMP)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_family_invites_recipient ON family_invites(recipient_user_id, status)`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS family_notifications (id TEXT PRIMARY KEY, sender_user_id TEXT NOT NULL, recipient_user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
  for (const [column, definition] of [
    ['id', 'TEXT'], ['sender_user_id', 'TEXT'], ['recipient_user_id', 'TEXT'],
    ['title', 'TEXT'], ['message', 'TEXT'], ['read_at', 'TEXT'], ['created_at', 'TEXT'],
    ['family_member_id', 'TEXT'], ['resource_type', 'TEXT'], ['action', 'TEXT'],
    ['resource_id', 'TEXT'], ['response_to_id', 'TEXT'], ['response_status', 'TEXT'], ['deleted_at', 'TEXT']
  ]) await addColumn('family_notifications', column, definition);
  await db.prepare(`UPDATE family_notifications SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_family_notifications_recipient ON family_notifications(recipient_user_id, created_at)`).run();
}

async function requireUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return null;
  await ensureFamilyFeatureTables(env.DB);
  return user;
}

async function ensureUserFamilyGroup(db, userId) {
  let group = await db.prepare(`SELECT id, name FROM family_groups WHERE owner_user_id = ? ORDER BY created_at LIMIT 1`).bind(userId).first();
  if (!group) {
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO family_groups (id, owner_user_id, name) VALUES (?, ?, ?)`).bind(id, userId, "Minha família").run();
    group = { id, name: "Minha família" };
  }
  return group;
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

async function listFamily(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const group = await ensureUserFamilyGroup(env.DB, user.id);
  const rows = await env.DB.prepare(`SELECT id, user_id, name, relation, email, address, role, status, permissions_json, created_at, updated_at FROM family_members WHERE group_id = ? ORDER BY created_at`).bind(group.id).all();
  return Response.json({ ok: true, group, members: (rows.results || []).map(x => ({ ...x, permissions: safeJson(x.permissions_json, {}) })) });
}

async function checkFamilyEmail(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });

  const email = normalizeEmail(url.searchParams.get("email") || "");
  if (!isValidEmail(email)) {
    return Response.json({ error: "invalid_email", message: "Informe um e-mail válido." }, { status: 400 });
  }

  const group = await ensureUserFamilyGroup(env.DB, user.id);
  const familyMember = await env.DB.prepare(
    `SELECT id, user_id, name, relation, email, status FROM family_members WHERE group_id = ? AND lower(email) = lower(?) LIMIT 1`
  ).bind(group.id, email).first();

  const account = await env.DB.prepare(
    `SELECT id, name, email FROM users WHERE lower(email) = lower(?) LIMIT 1`
  ).bind(email).first();

  return Response.json({
    ok: true,
    email,
    alreadyFamilyMember: !!familyMember,
    familyMember: familyMember || null,
    accountExists: !!account,
    account: account ? { id: account.id, name: account.name, email: account.email } : null,
    status: familyMember?.status || (account ? "registered" : "not_registered")
  });
}

async function createFamilyMember(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });

  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const relation = String(body.relation || "Membro").trim();
  const email = normalizeEmail(body.email || "");
  const address = String(body.address || "").trim();
  const permissions = body.permissions && typeof body.permissions === "object" ? body.permissions : {};
  if (name.length < 2 || !isValidEmail(email)) return Response.json({ error: "invalid_member", message: "Informe nome e e-mail válidos." }, { status: 400 });
  const group = await ensureUserFamilyGroup(env.DB, user.id);
  const existing = await env.DB.prepare(`SELECT id FROM family_members WHERE group_id = ? AND lower(email) = lower(?) LIMIT 1`).bind(group.id, email).first();
  if (existing) return Response.json({ error: "member_exists", message: "Esse familiar já está cadastrado." }, { status: 409 });
  const account = await env.DB.prepare(`SELECT id, name, email FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(email).first();
  const id = crypto.randomUUID();
  const status = account && account.id !== user.id ? "pending_acceptance" : "pending";
  await env.DB.prepare(`INSERT INTO family_members (id, group_id, user_id, name, relation, email, address, role, status, permissions_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'member', ?, ?, CURRENT_TIMESTAMP)`).bind(id, group.id, account?.id || null, name, relation, email, address, status, JSON.stringify(permissions)).run();
  let inviteId = null;
  if (account && account.id !== user.id) {
    inviteId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO family_invites (id, family_member_id, group_id, owner_user_id, recipient_user_id, status) VALUES (?, ?, ?, ?, ?, 'pending')`).bind(inviteId, id, group.id, user.id, account.id).run();
    await env.DB.prepare(`INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, title, message) VALUES (?, ?, ?, ?, 'family_invitation', 'open_family', ?, ?)`).bind(crypto.randomUUID(), user.id, account.id, id, "Convite familiar pendente", `${user.name || "Uma pessoa"} convidou você para compartilhar a família na LiDire. Entre no aplicativo e aceite ou recuse o convite na área Família.`).run();
  }
  return Response.json({ ok: true, invitationCreated: !!inviteId, member: { id, group_id: group.id, user_id: account?.id || null, name, relation, email, address, status, permissions, inviteId } });
}

async function listFamilyInvitations(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });


  // Repair invitations that were not created when the family member was first saved,
  // including records added before the recipient had a LiDire account.
  const email = normalizeEmail(user.email || "");
  if (email) {
    const pendingMembers = await env.DB.prepare(`
      SELECT m.id, m.group_id, m.user_id, m.name, m.email, g.owner_user_id,
             u.name AS owner_name
      FROM family_members m
      JOIN family_groups g ON g.id = m.group_id
      LEFT JOIN users u ON u.id = g.owner_user_id
      WHERE lower(m.email) = lower(?)
        AND g.owner_user_id <> ?
        AND (m.user_id IS NULL OR m.user_id = ?)
        AND m.status IN ('pending', 'pending_acceptance', 'invited')
      LIMIT 50
    `).bind(email, user.id, user.id).all();

    for (const member of (pendingMembers.results || [])) {
      await env.DB.prepare(`UPDATE family_members SET user_id = ?, status = 'pending_acceptance', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(user.id, member.id).run();
      const existingInvite = await env.DB.prepare(`
        SELECT id FROM family_invites
        WHERE family_member_id = ? AND recipient_user_id = ? AND status = 'pending' LIMIT 1
      `).bind(member.id, user.id).first();
      if (!existingInvite) {
        const inviteId = crypto.randomUUID();
        const inviteeName = String(member.name || user.name || user.email || 'Familiar').trim() || 'Familiar';
        await env.DB.prepare(`
          INSERT INTO family_invites (id, family_member_id, group_id, owner_user_id, recipient_user_id, invitee_name, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `).bind(inviteId, member.id, member.group_id, member.owner_user_id, user.id, inviteeName).run();
        await env.DB.prepare(`
          INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, title, message)
          VALUES (?, ?, ?, ?, 'family_invitation', 'open_family', ?, ?)
        `).bind(
          crypto.randomUUID(), member.owner_user_id, user.id, member.id, "Convite familiar pendente",
          `${member.owner_name || "Uma pessoa"} convidou você para compartilhar a família na LiDire. Abra a área Família para aceitar ou recusar o convite.`
        ).run();
      }
    }
  }

  const rows = await env.DB.prepare(`
    SELECT i.id, i.family_member_id, i.group_id, i.owner_user_id, i.status, i.created_at,
           m.name AS member_name, m.email AS member_email, m.relation,
           u.name AS inviter_name, u.email AS inviter_email
    FROM family_invites i
    JOIN family_members m ON m.id = i.family_member_id
    LEFT JOIN users u ON u.id = i.owner_user_id
    WHERE i.recipient_user_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC LIMIT 20
  `).bind(user.id).all();
  return Response.json({ ok: true, invitations: rows.results || [] });
}

async function respondFamilyInvitation(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });

  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const body = await readJson(request);
  const decision = String(body.decision || "").toLowerCase();
  if (!["accept", "reject"].includes(decision)) return Response.json({ error: "invalid_decision", message: "Escolha aceitar ou recusar." }, { status: 400 });
  const invite = await env.DB.prepare(`SELECT * FROM family_invites WHERE id = ? AND recipient_user_id = ? AND status = 'pending' LIMIT 1`).bind(id, user.id).first();
  if (!invite) return Response.json({ error: "invite_not_found", message: "Este convite não está mais pendente." }, { status: 404 });
  if (decision === "reject") {
    await env.DB.prepare(`UPDATE family_invites SET status = 'rejected', responded_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
    await env.DB.prepare(`UPDATE family_members SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND group_id = ?`).bind(invite.family_member_id, invite.group_id).run();
    await env.DB.prepare(`INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, title, message) VALUES (?, ?, ?, ?, 'family_invitation', 'open_family', ?, ?)`).bind(crypto.randomUUID(), user.id, invite.owner_user_id, invite.family_member_id, "Convite familiar recusado", `${user.name || "O familiar"} recusou o convite da LiDire.`).run();
    return Response.json({ ok: true, status: "rejected" });
  }
  const owner = await env.DB.prepare(`SELECT id, name, email FROM users WHERE id = ? LIMIT 1`).bind(invite.owner_user_id).first();
  const sourceMember = await env.DB.prepare(`SELECT * FROM family_members WHERE id = ? AND group_id = ? LIMIT 1`).bind(invite.family_member_id, invite.group_id).first();
  if (!sourceMember || !owner) return Response.json({ error: "invite_invalid", message: "Os dados deste convite não estão disponíveis." }, { status: 409 });
  await env.DB.prepare(`UPDATE family_invites SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
  await env.DB.prepare(`UPDATE family_members SET status = 'active', user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(user.id, sourceMember.id).run();
  const recipientGroup = await ensureUserFamilyGroup(env.DB, user.id);
  const reverse = await env.DB.prepare(`SELECT id FROM family_members WHERE group_id = ? AND lower(email) = lower(?) LIMIT 1`).bind(recipientGroup.id, normalizeEmail(owner.email || "")).first();
  if (!reverse && owner.email) {
    await env.DB.prepare(`INSERT INTO family_members (id, group_id, user_id, name, relation, email, address, role, status, permissions_json, updated_at) VALUES (?, ?, ?, ?, 'Familiar', ?, '', 'member', 'active', '{}', CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(), recipientGroup.id, owner.id, owner.name || owner.email, normalizeEmail(owner.email)).run();
  } else if (reverse) {
    await env.DB.prepare(`UPDATE family_members SET user_id = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(owner.id, reverse.id).run();
  }
  await env.DB.prepare(`INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, title, message) VALUES (?, ?, ?, ?, 'family_invitation', 'open_family', ?, ?)`).bind(crypto.randomUUID(), user.id, invite.owner_user_id, invite.family_member_id, "Convite familiar aceito", `${user.name || "O familiar"} aceitou o convite da LiDire.`).run();
  return Response.json({ ok: true, status: "accepted" });
}

async function updateFamilyMember(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const group = await ensureUserFamilyGroup(env.DB, user.id);
  const existing = await env.DB.prepare(`SELECT * FROM family_members WHERE id = ? AND group_id = ? LIMIT 1`).bind(id, group.id).first();
  if (!existing) return Response.json({ error: "not_found", message: "Membro não encontrado." }, { status: 404 });
  const body = await readJson(request);
  const name = String(body.name ?? existing.name ?? "").trim();
  const relation = String(body.relation ?? existing.relation ?? "Membro").trim();
  const email = normalizeEmail(body.email ?? existing.email ?? "");
  const address = String(body.address ?? existing.address ?? "").trim();
  const permissions = body.permissions && typeof body.permissions === "object" ? body.permissions : safeJson(existing.permissions_json, {});
  if (name.length < 2 || !isValidEmail(email)) return Response.json({ error: "invalid_member", message: "Informe nome e e-mail válidos." }, { status: 400 });
  const account = await env.DB.prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(email).first();
  await env.DB.prepare(`UPDATE family_members SET user_id = ?, name = ?, relation = ?, email = ?, address = ?, status = ?, permissions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND group_id = ?`).bind(account?.id || existing.user_id || null, name, relation, email, address, account || existing.status === "active" ? "active" : "pending", JSON.stringify(permissions), id, group.id).run();
  return Response.json({ ok: true, member: { id, user_id: account?.id || existing.user_id || null, name, relation, email, address, status: account || existing.status === "active" ? "active" : "pending", permissions } });
}

async function deleteFamilyMember(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const group = await ensureUserFamilyGroup(env.DB, user.id);
  await env.DB.prepare(`DELETE FROM family_members WHERE id = ? AND group_id = ?`).bind(id, group.id).run();
  return Response.json({ ok: true });
}

async function sendFamilyNotification(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });

  const body = await readJson(request);
  const group = await ensureUserFamilyGroup(env.DB, user.id);
  let member = null;
  if (body.memberId) member = await env.DB.prepare(`SELECT * FROM family_members WHERE id = ? AND group_id = ? LIMIT 1`).bind(String(body.memberId), group.id).first();
  if (!member && body.recipientEmail) member = await env.DB.prepare(`SELECT * FROM family_members WHERE group_id = ? AND lower(email) = lower(?) LIMIT 1`).bind(group.id, normalizeEmail(body.recipientEmail)).first();
  if (!member) return Response.json({ error: "member_not_found", message: "Não encontrei esse membro da família." }, { status: 404 });
  let recipientId = member.user_id;
  if (!recipientId && member.email) {
    const account = await env.DB.prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(normalizeEmail(member.email)).first();
    recipientId = account?.id || null;
    if (recipientId) await env.DB.prepare(`UPDATE family_members SET user_id = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(recipientId, member.id).run();
  }
  if (!recipientId) return Response.json({ error: "recipient_not_registered", message: "Esse familiar ainda não criou uma conta LiDire com esse e-mail." }, { status: 409 });
  const title = String(body.title || "LiDire — Família").trim().slice(0, 120);
  const message = String(body.message || "Você recebeu uma atualização da sua família na LiDire.").trim().slice(0, 1000);
  const resourceType = ["commitment", "commitment_change", "family_message", "family_invitation"].includes(String(body.resourceType || "")) ? String(body.resourceType) : "family_message";
  const action = resourceType === "commitment" || resourceType === "commitment_change" ? "review_commitment" : "open_family";
  const resourceId = body.resourceId ? String(body.resourceId).slice(0, 120) : null;
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, resource_id, title, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, recipientId, member.id, resourceType, action, resourceId, title, message).run();
  return Response.json({ ok: true, notification: { id, recipientId, title, message, resourceType, resourceId } });
}

async function listNotifications(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const trash = url.searchParams.get("trash") === "1";
  const deletedClause = trash ? "n.deleted_at IS NOT NULL" : "n.deleted_at IS NULL";
  const rows = await env.DB.prepare(`SELECT n.id, n.sender_user_id, COALESCE(NULLIF(TRIM(u.name), ''), 'Membro da família') AS sender_name, n.title, n.message, n.read_at, n.created_at, n.resource_type, n.action, n.resource_id, n.response_to_id, n.response_status, n.deleted_at FROM family_notifications n LEFT JOIN users u ON u.id = n.sender_user_id WHERE n.recipient_user_id = ? AND ${deletedClause} ORDER BY COALESCE(n.deleted_at, n.created_at) DESC LIMIT ${limit}`).bind(user.id).all();
  return Response.json({ ok: true, notifications: rows.results || [] });
}

async function deleteFamilyNotification(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const parts = url.pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 1] || "");
  if (url.searchParams.get("permanent") === "1") {
    const result = await env.DB.prepare(`DELETE FROM family_notifications WHERE id = ? AND recipient_user_id = ? AND deleted_at IS NOT NULL`).bind(id, user.id).run();
    if (!result.meta?.changes) return Response.json({ error: "not_found", message: "Item da lixeira não encontrado." }, { status: 404 });
    return Response.json({ ok: true, permanent: true });
  }
  const result = await env.DB.prepare(`UPDATE family_notifications SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND recipient_user_id = ? AND deleted_at IS NULL`).bind(id, user.id).run();
  if (!result.meta?.changes) return Response.json({ error: "not_found", message: "Notificação não encontrada." }, { status: 404 });
  return Response.json({ ok: true, movedToTrash: true });
}

async function emptyFamilyNotificationTrash(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await env.DB.prepare(`DELETE FROM family_notifications WHERE recipient_user_id = ? AND deleted_at IS NOT NULL`).bind(user.id).run();
  return Response.json({ ok: true, emptied: true });
}

async function respondToFamilyNotification(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const parts = url.pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 2] || "");
  const original = await env.DB.prepare(`SELECT id, sender_user_id, recipient_user_id, family_member_id, title, resource_type, resource_id FROM family_notifications WHERE id = ? AND recipient_user_id = ? LIMIT 1`).bind(id, user.id).first();
  if (!original) return Response.json({ error: "not_found", message: "Notificação não encontrada." }, { status: 404 });
  const body = await readJson(request);
  const kind = String(body.kind || "reply");
  if (!["reply", "confirm", "suggest"].includes(kind)) return Response.json({ error: "invalid_kind", message: "Tipo de resposta inválido." }, { status: 400 });
  if ((kind === "confirm" || kind === "suggest") && !["commitment", "commitment_change"].includes(original.resource_type)) return Response.json({ error: "not_commitment", message: "Esta notificação não está vinculada a um compromisso compartilhado." }, { status: 400 });
  const message = String(body.message || (kind === "confirm" ? "Confirmo o compromisso/alteração." : "")).trim().slice(0, 1000);
  if (!message) return Response.json({ error: "message_required", message: "Escreva uma mensagem antes de enviar." }, { status: 400 });
  const title = kind === "confirm" ? "Compromisso confirmado" : kind === "suggest" ? "Sugestão sobre compromisso" : `Resposta: ${String(body.title || original.title || "Notificação").slice(0, 90)}`;
  const replyId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO family_notifications (id, sender_user_id, recipient_user_id, family_member_id, resource_type, action, resource_id, response_to_id, title, message) VALUES (?, ?, ?, ?, ?, 'open_family', ?, ?, ?, ?)`).bind(replyId, user.id, original.sender_user_id, original.family_member_id || null, original.resource_type || "family_message", original.resource_id || null, original.id, title, message).run();
  const status = kind === "confirm" ? "confirmed" : kind === "suggest" ? "suggested" : "replied";
  await env.DB.prepare(`UPDATE family_notifications SET response_status = ?, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND recipient_user_id = ?`).bind(status, original.id, user.id).run();
  return Response.json({ ok: true, responseId: replyId, status });
}

async function markNotificationRead(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  await env.DB.prepare(`UPDATE family_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND recipient_user_id = ?`).bind(id, user.id).run();
  return Response.json({ ok: true });
}

async function ensureCyclePeriodsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS menstrual_cycles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT DEFAULT '',
      flow TEXT DEFAULT 'Moderado',
      duration INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const info = await db.prepare(`PRAGMA table_info(menstrual_cycles)`).all();
  const columns = new Set((info.results || []).map(row => String(row.name)));
  const additions = [
    ["end_date", "TEXT DEFAULT ''"],
    ["flow", "TEXT DEFAULT 'Moderado'"],
    ["duration", "INTEGER"],
    ["notes", "TEXT DEFAULT ''"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      await db.prepare(`ALTER TABLE menstrual_cycles ADD COLUMN ${name} ${definition}`).run();
    }
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_menstrual_cycles_user_start ON menstrual_cycles(user_id, start_date DESC)`).run();
}

function normalizeCyclePeriod(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    start: row.start_date || "",
    end: row.end_date || "",
    flow: row.flow || "Moderado",
    duration: row.duration ?? "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function cycleDuration(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const value = Math.round((b - a) / 86400000) + 1;
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function listCyclePeriods(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureCyclePeriodsTable(env.DB);
  const rows = await env.DB.prepare(`SELECT id, user_id, start_date, end_date, flow, duration, notes, created_at, updated_at FROM menstrual_cycles WHERE user_id = ? ORDER BY start_date DESC, created_at DESC`).bind(user.id).all();
  return Response.json({ ok: true, periods: (rows.results || []).map(normalizeCyclePeriod) });
}

async function createCyclePeriod(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Sua sessão expirou. Entre novamente na LiDire." }, { status: 401 });
  try {
    await ensureCyclePeriodsTable(env.DB);
  } catch (error) {
    console.error("Erro ao preparar menstrual_cycles:", error);
    return Response.json({ error: "cycle_table_error", message: "Não foi possível preparar o armazenamento do ciclo no D1." }, { status: 500 });
  }
  const body = await readJson(request);
  const start = String(body.start || "").trim();
  const end = String(body.end || "").trim();
  const flow = String(body.flow || "Moderado").trim().slice(0, 30) || "Moderado";
  const notes = String(body.notes || "").trim().slice(0, 2000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Response.json({ error: "invalid_start", message: "Informe uma data válida para o início da menstruação." }, { status: 400 });
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return Response.json({ error: "invalid_end", message: "Informe uma data válida para o fim da menstruação." }, { status: 400 });
  if (end && end < start) return Response.json({ error: "invalid_range", message: "A data de fim não pode ser anterior ao início." }, { status: 400 });
  const id = crypto.randomUUID();
  const duration = cycleDuration(start, end);
  await env.DB.prepare(`INSERT INTO menstrual_cycles (id, user_id, start_date, end_date, flow, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, start, end, flow, duration, notes).run();
  const row = await env.DB.prepare(`SELECT id, user_id, start_date, end_date, flow, duration, notes, created_at, updated_at FROM menstrual_cycles WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  return Response.json({ ok: true, period: normalizeCyclePeriod(row) });
}

async function updateCyclePeriod(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureCyclePeriodsTable(env.DB);
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const existing = await env.DB.prepare(`SELECT * FROM menstrual_cycles WHERE id = ? AND user_id = ? LIMIT 1`).bind(id, user.id).first();
  if (!existing) return Response.json({ error: "not_found", message: "Registro de ciclo não encontrado." }, { status: 404 });
  const body = await readJson(request);
  const start = String(body.start ?? existing.start_date ?? "").trim();
  const end = String(body.end ?? existing.end_date ?? "").trim();
  const flow = String(body.flow ?? existing.flow ?? "Moderado").trim().slice(0, 30) || "Moderado";
  const notes = String(body.notes ?? existing.notes ?? "").trim().slice(0, 2000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Response.json({ error: "invalid_start", message: "Informe uma data válida para o início da menstruação." }, { status: 400 });
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return Response.json({ error: "invalid_end", message: "Informe uma data válida para o fim da menstruação." }, { status: 400 });
  if (end && end < start) return Response.json({ error: "invalid_range", message: "A data de fim não pode ser anterior ao início." }, { status: 400 });
  await env.DB.prepare(`UPDATE menstrual_cycles SET start_date = ?, end_date = ?, flow = ?, duration = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).bind(start, end, flow, cycleDuration(start, end), notes, id, user.id).run();
  const row = await env.DB.prepare(`SELECT id, user_id, start_date, end_date, flow, duration, notes, created_at, updated_at FROM menstrual_cycles WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  return Response.json({ ok: true, period: normalizeCyclePeriod(row) });
}

async function deleteCyclePeriod(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureCyclePeriodsTable(env.DB);
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const result = await env.DB.prepare(`DELETE FROM menstrual_cycles WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  if (!result.meta?.changes) return Response.json({ error: "not_found", message: "Registro de ciclo não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

async function ensureNotesTable(db) {
  // A tabela pode já existir em versões anteriores da LiDire com menos
  // colunas. Por isso fazemos uma migração incremental e idempotente aqui,
  // em vez de depender somente de CREATE TABLE IF NOT EXISTS.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'Geral',
      tags TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const info = await db.prepare(`PRAGMA table_info(notes)`).all();
  const columns = new Set((info.results || []).map(row => String(row.name)));
  const addColumn = async (name, definition) => {
    if (!columns.has(name)) {
      await db.prepare(`ALTER TABLE notes ADD COLUMN ${name} ${definition}`).run();
      columns.add(name);
    }
  };

  // Colunas opcionais introduzidas pelo bloco de notas funcional.
  await addColumn("category", "TEXT DEFAULT 'Geral'");
  await addColumn("tags", "TEXT DEFAULT ''");
  await addColumn("is_favorite", "INTEGER DEFAULT 0");
  await addColumn("created_at", "TEXT");
  await addColumn("updated_at", "TEXT");

  // Preenche registros antigos que receberam as colunas sem DEFAULT.
  await db.prepare(`UPDATE notes SET category = COALESCE(category, 'Geral') WHERE category IS NULL OR category = ''`).run();
  await db.prepare(`UPDATE notes SET tags = COALESCE(tags, '') WHERE tags IS NULL`).run();
  await db.prepare(`UPDATE notes SET is_favorite = COALESCE(is_favorite, 0) WHERE is_favorite IS NULL`).run();
  await db.prepare(`UPDATE notes SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`).run();
  await db.prepare(`UPDATE notes SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_id, category)`).run();
}

function normalizeNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || "",
    content: row.content || "",
    category: row.category || "Geral",
    tags: row.tags || "",
    is_favorite: !!row.is_favorite,
    created_at: row.created_at || "",
    updated_at: row.updated_at || row.created_at || ""
  };
}

async function listNotes(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureNotesTable(env.DB);
  const rows = await env.DB.prepare(`SELECT id, user_id, title, content, category, tags, is_favorite, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY is_favorite DESC, updated_at DESC`).bind(user.id).all();
  return Response.json({ ok: true, notes: (rows.results || []).map(normalizeNote) });
}

async function createNote(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureNotesTable(env.DB);
  const body = await readJson(request);
  const title = String(body.title || "").trim().slice(0, 120);
  const content = String(body.content || "").trim().slice(0, 12000);
  const category = String(body.category || "Geral").trim().slice(0, 60) || "Geral";
  const tags = String(body.tags || "").trim().slice(0, 300);
  const favorite = body.is_favorite === true || body.is_favorite === 1 || body.is_favorite === "true";
  if (!title || !content) return Response.json({ error: "invalid_note", message: "Informe título e conteúdo da anotação." }, { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO notes (id, user_id, title, content, category, tags, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, title, content, category, tags, favorite ? 1 : 0).run();
  const row = await env.DB.prepare(`SELECT id, user_id, title, content, category, tags, is_favorite, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  return Response.json({ ok: true, note: normalizeNote(row) });
}

async function updateNote(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureNotesTable(env.DB);
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const existing = await env.DB.prepare(`SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1`).bind(id, user.id).first();
  if (!existing) return Response.json({ error: "not_found", message: "Anotação não encontrada." }, { status: 404 });
  const body = await readJson(request);
  const title = String(body.title ?? existing.title ?? "").trim().slice(0, 120);
  const content = String(body.content ?? existing.content ?? "").trim().slice(0, 12000);
  const category = String(body.category ?? existing.category ?? "Geral").trim().slice(0, 60) || "Geral";
  const tags = String(body.tags ?? existing.tags ?? "").trim().slice(0, 300);
  const favorite = body.is_favorite === undefined ? !!existing.is_favorite : (body.is_favorite === true || body.is_favorite === 1 || body.is_favorite === "true");
  if (!title || !content) return Response.json({ error: "invalid_note", message: "Informe título e conteúdo da anotação." }, { status: 400 });
  await env.DB.prepare(`UPDATE notes SET title = ?, content = ?, category = ?, tags = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).bind(title, content, category, tags, favorite ? 1 : 0, id, user.id).run();
  const row = await env.DB.prepare(`SELECT id, user_id, title, content, category, tags, is_favorite, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  return Response.json({ ok: true, note: normalizeNote(row) });
}

async function deleteNote(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureNotesTable(env.DB);
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const result = await env.DB.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  if (!result.meta?.changes) return Response.json({ error: "not_found", message: "Anotação não encontrada." }, { status: 404 });
  return Response.json({ ok: true });
}

async function autocompletePlaces(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const input = String(url.searchParams.get("input") || "").trim().slice(0, 200);
  if (input.length < 3) return Response.json({ suggestions: [] });
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Response.json({ error: "places_not_configured", message: "O preenchimento automático exige a API Places habilitada na chave GOOGLE_MAPS_API_KEY do Cloudflare." }, { status: 503 });
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat" },
    body: JSON.stringify({ input, languageCode: "pt-BR", regionCode: "BR", includedRegionCodes: ["br"] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return Response.json({ error: "places_autocomplete_failed", message: "Não foi possível buscar sugestões de endereço agora." }, { status: 502 });
  const suggestions = (data.suggestions || []).map(item => item.placePrediction).filter(Boolean).map(p => ({ placeId: p.placeId || String(p.place || "").replace(/^places\//, ""), text: String(p.text?.text || "") })).filter(p => p.text);
  return Response.json({ suggestions });
}

async function calculateRoute(request, env) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  const body = await readJson(request);
  const origin = body.origin && typeof body.origin === "object" ? body.origin : { address: String(body.origin || "") };
  const destination = body.destination && typeof body.destination === "object" ? body.destination : { address: String(body.destination || "") };
  const travelMode = String(body.travelMode || "DRIVE").toUpperCase();
  const departureTime = String(body.departureTime || "").trim();
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Response.json({ error: "routes_not_configured", message: "A API de rotas ainda não foi configurada. Adicione GOOGLE_MAPS_API_KEY no Cloudflare." }, { status: 503 });
  const allowed = new Set(["DRIVE","WALK","BICYCLE","TWO_WHEELER","TRANSIT"]);
  if (!allowed.has(travelMode)) return Response.json({ error: "invalid_travel_mode", message: "Meio de transporte inválido." }, { status: 400 });
  const payload = { origin, destination, travelMode, routingPreference: (travelMode === "DRIVE" || travelMode === "TWO_WHEELER") ? (departureTime ? "TRAFFIC_AWARE_OPTIMAL" : "TRAFFIC_AWARE") : undefined, departureTime: departureTime || undefined, computeAlternativeRoutes: false, languageCode: "pt-BR", units: "METRIC" };
  if (!departureTime) delete payload.departureTime;
  if (!payload.routingPreference) delete payload.routingPreference;
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.routes?.length) return Response.json({ error: "route_failed", message: "Não foi possível calcular a rota agora.", details: data?.error?.message || "" }, { status: response.status || 502 });
  const route = data.routes[0];
  return Response.json({ ok: true, duration: route.duration || "", distanceMeters: route.distanceMeters || 0, polyline: route.polyline?.encodedPolyline || "", legs: route.legs || [] });
}

async function assistantAI(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return Response.json({ error: "unauthorized", message: "Entre na sua conta para usar a IA LiDire." }, { status: 401 });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({
      error: "ai_not_configured",
      message: "A IA LiDire ainda não foi configurada no servidor. Adicione o segredo GEMINI_API_KEY no Cloudflare."
    }, { status: 503 });
  }

  const body = await readJson(request);
  const question = String(body.question || "").trim().slice(0, 4000);
  if (!question) {
    return Response.json({ error: "invalid_question", message: "Digite uma pergunta para a LiDire." }, { status: 400 });
  }

  const language = "pt-BR";
  const useWeb = body.useWeb === true || body.useWeb === "true" || body.useWeb === 1;
  const context = sanitizeAIContext(body.context, language).slice(0, 14000);
  const history = Array.isArray(body.history) ? body.history.slice(-6).map(item => ({
    role: item?.role === "model" ? "model" : "user",
    text: String(item?.text || "").slice(0, 1200)
  })).filter(item => item.text) : [];

  const model = String(env.GEMINI_MODEL || "gemini-3.5-flash-lite").replace(/^models\//, "");
  // Modelos Flash-Lite têm uma cota gratuita muito maior em muitos projetos.
  // O fallback usa outro modelo Lite se o principal atingir 429.
  const modelCandidates = Array.from(new Set([
    model,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
  ])).slice(0, 3);
  const systemText = `Você é a IA LiDire, o copiloto pessoal de organização dentro do aplicativo LiDire. Responda em português do Brasil.

Sua função NÃO é apenas conversar: quando o usuário pedir para criar, incluir, alterar, registrar ou salvar algo que o próprio aplicativo consegue armazenar, você deve identificar a ação e devolvê-la no campo actions para que o aplicativo a execute. Nunca diga que não pode alterar os dados do aplicativo quando uma das ações abaixo for aplicável.

MÓDULO GESTAÇÃO E SEGURANÇA EM SAÚDE:
- Quando a conversa estiver relacionada à gestação, sintomas, dúvidas de saúde ou recomendações médicas, responda com cautela, sem diagnosticar nem afirmar que um sintoma é necessariamente normal. Oriente a usuária a procurar profissional habilitado quando apropriado.
- Em TODA resposta que trate de sintomas ou dúvidas de saúde relacionadas à gestação, inclua integralmente este aviso, sem alterar a redação: “IMPORTANTE: A LiDire te ajuda a registrar e organizar dados sobre sua gestação. As informações aqui compartilhadas não substituem o acompanhamento médico. Fique atenta aos sintomas. Para esclarecimentos de dúvidas e recomendações, procure um profissional habilitado.”
- Não recomende interromper ou alterar medicamentos ou tratamentos prescritos. Se forem relatados sinais potencialmente urgentes, recomende procurar atendimento médico urgente.
- Não afirme que registrou sintomas da gestação se a ação não tiver sido realmente executada pelo aplicativo.

CONTEXTO DA AGENDA E ROTAS:
- Consulte sempre context.agenda quando a pergunta mencionar compromissos, consultas, reuniões, eventos ou horários cadastrados. A agenda enviada pelo aplicativo contém título, data, horário, local e endereço quando disponíveis. Use esses dados nas respostas; não afirme que não consegue ver um compromisso se ele estiver no contexto.
- context.homeAddress é o endereço residencial cadastrado no perfil. Quando o usuário disser “casa”, “minha casa” ou “endereço de casa” ao pedir uma rota, use esse endereço como origem ou destino conforme a frase. Nunca revele o endereço sem relação com a solicitação de rota.
- Se o usuário pedir rota para um compromisso específico, encontre o compromisso correspondente em context.agenda e use o endereço dele como destino. Se houver mais de um compromisso possível ou faltar endereço, peça esclarecimento.

Ações permitidas:
- create_task: preparar uma tarefa. Campos úteis: title, date (YYYY-MM-DD), time (HH:MM), priority (baixa, normal ou alta). IMPORTANTE: tarefas devem pedir confirmação ao usuário antes de serem gravadas.
- create_reminder: preparar um lembrete. Campos úteis: title, date, time, message, repeat. IMPORTANTE: lembretes devem pedir confirmação ao usuário antes de serem gravados.
- create_appointment: registrar um compromisso SOMENTE em Agenda. Campos: title, date, time, location, address.
- create_study: registrar um estudo SOMENTE em Estudos. Campos: subject, topic, date, time, duration, notes, link. NUNCA transforme pedido de estudo em tarefa.
- create_shopping_list: criar uma lista SOMENTE em Compras. Campos: name, items (array de objetos ou strings com name, quantity).
- create_workout: registrar um treino SOMENTE em Treinos. Campos: name, workoutType, date, time, duration, distance, pace, observations.
- log_hydration: registrar água SOMENTE em Hidratação. Campos: amount (ml), date.
- create_meal: registrar uma refeição SOMENTE em Alimentação. Campos: name, time, date, foods (array com name, quantity, unit, calories).
- create_finance: registrar um lançamento SOMENTE em Finanças. Campos: financeType, title, value, category, date, currency.
- create_goal: criar um objetivo SOMENTE em Objetivos. Campos: title, deadline, progress, moneyGoal, moneyCurrency, financeCategory, observations.
- update_goal_savings: adicionar um valor arrecadado a um objetivo financeiro existente. Campos: title ou targetId, amount, currency. Use esta ação quando o usuário disser que arrecadou, guardou, recebeu ou quer incluir um valor no objetivo. NUNCA altere o objetivo diretamente sem confirmação explícita no aplicativo.
- delete_task: excluir uma tarefa existente por targetId ou title. SEMPRE pedir confirmação no aplicativo.
- delete_reminder: excluir um lembrete existente por targetId ou title. SEMPRE pedir confirmação no aplicativo.
- complete_task: marcar uma tarefa como concluída por targetId ou title. SEMPRE pedir confirmação no aplicativo.
- complete_reminder: marcar um lembrete como concluído por targetId ou title. SEMPRE pedir confirmação no aplicativo.
- upsert_place: cadastrar ou atualizar um lugar frequente com name, address, aliases e notes.
- upsert_food: cadastrar ou atualizar um alimento. Para calorias, use totalCalories + forQuantity + quantityUnit quando o usuário informar calorias para uma quantidade específica. O aplicativo converte isso para kcal por 100 g/ml ou por unidade. Também pode usar caloriesPer100 quando o valor já estiver normalizado.
- create_recipe: salvar uma receita. Campos úteis: name, ingredients, instructions, servings, calories.
- update_food: atualizar um alimento existente. Use os mesmos campos de calorias de upsert_food.
- log_cycle_start: registrar o início/fim da menstruação quando o usuário pedir.
- log_cycle_symptom: registrar humor, dor, cólicas, acne, energia e observações quando o usuário pedir.
- add_family_member: preparar o cadastro de um membro da família com name, relation, email e permissions.
- send_family_notification: enviar uma notificação interna a um membro da família. Use memberId quando disponível ou recipientEmail.
- weather_lookup: consultar temperatura e previsão para uma localização informada. Use location.
- route_lookup: calcular rota e tempo estimado. Use origin, destination e travelMode (DRIVE, WALK, BICYCLE, TWO_WHEELER ou TRANSIT). Se o usuário disser “daqui/de onde estou”, use origin="current_location". Se disser “casa/minha casa”, use o endereço context.homeAddress como origem ou destino conforme a frase. Se pedir rota para um compromisso cadastrado, use o endereço do compromisso em context.agenda. Se informar horário de chegada, use arrivalTime (HH:MM) e date (YYYY-MM-DD); o aplicativo calcula a hora estimada de saída. Lugares e familiares cadastrados podem ser referenciados pelo nome.

Exemplos importantes:
1) “Adicione 1300 calorias para os 395 gramas de leite condensado” => action upsert_food, name “leite condensado”, totalCalories 1300, forQuantity 395, quantityUnit “g”.
2) “Adicione 450 calorias para 200 ml de creme de leite” => action upsert_food, name “creme de leite”, totalCalories 450, forQuantity 200, quantityUnit “ml”.
3) “Inclua uma tarefa pintar o cabelo hoje às 15 horas” => action create_task.
4) “Me lembre de ligar para minha mãe às 16:30” => action create_reminder.
5) “Salve a receita do brigadeiro de prestígio” => action create_recipe se houver dados suficientes; se faltarem ingredientes ou preparo, faça uma pergunta objetiva e não crie uma receita incompleta.
6) “Cadastre minha menstruação começou hoje” => action log_cycle_start.
7) “Registre que estou com cólica moderada e humor baixo hoje” => action log_cycle_symptom.
8) “Cadastre minha mãe Edna, email edna@example.com” => action add_family_member.
9) “Avise minha mãe que o jantar mudou para 21h” => action send_family_notification quando houver membro correspondente.
10) “Como está o tempo em Nova Iguaçu?” => action weather_lookup.
11) “Quanto tempo levo daqui até a casa da minha mãe?” => action route_lookup com origin current_location e destination conforme endereço disponível; se faltar endereço, pergunte.
12) “Pra chegar à faculdade às 17h de carro, que horas preciso sair de onde estou?” => action route_lookup com origin current_location, destination “faculdade” ou o lugar correspondente, travelMode DRIVE, arrivalTime “17:00” e date conforme o contexto.

Regras:
- Use sempre o feminino para a nomenclatura da marca: escreva “uma LD” e “as LDs”, nunca “um LD”.
- Nunca invente dados do usuário.
- Se a data for “hoje”, use o campo today do contexto.
- Se a ação for clara, devolva-a em actions. O aplicativo decide se executa imediatamente ou pede confirmação.
- create_task e create_reminder NUNCA devem ser tratados como execução imediata: sempre exigem confirmação explícita do usuário no aplicativo.
- add_family_member só pode ser executado depois que o aplicativo consultar o D1 para verificar se o e-mail já pertence a um membro da família e se já existe uma conta LiDire. Nunca diga que o membro foi cadastrado antes do retorno positivo do servidor.
- log_cycle_start e log_cycle_symptom podem ser executados quando o pedido for explícito e completo.
- send_family_notification só pode ser usada quando houver um membro correspondente; se não houver, peça o nome/e-mail do destinatário.
- weather_lookup e route_lookup devem usar ferramentas/serviços externos do aplicativo, não invente temperatura, previsão, distância ou duração.
- Quando o usuário pedir "estudo", "estudar", "matéria", "prova", "revisão" ou planejamento de estudo, use create_study, nunca create_task.
- Quando o usuário pedir compra/lista de compras, use create_shopping_list, nunca create_task.
- Quando pedir treino, use create_workout; compromisso/consulta/evento vai para create_appointment; água vai para log_hydration; refeição vai para create_meal; gasto/receita vai para create_finance; meta/objetivo vai para create_goal.
- Quando o usuário disser algo como “inclua 200 arrecadados no meu objetivo de comprar notebook”, use update_goal_savings com amount=200 e o objetivo correspondente. Essa ação sempre exige confirmação explícita no aplicativo. Se houver mais de um objetivo possível, peça esclarecimento em vez de escolher arbitrariamente.
- Se useWeb estiver ativado, use a Pesquisa Google para informações atuais quando ela puder melhorar a resposta e considere as fontes retornadas.
- Se faltar um dado essencial, actions deve ser [] e message deve fazer uma única pergunta objetiva.
- Não alegue envio de WhatsApp, SMS ou e-mail. “Enviar notificação para família” significa uma notificação LiDire entre contas, quando o destinatário tiver uma conta identificada.
- Para atualizar calorias, preserve o alimento existente quando houver correspondência por nome; não crie duplicata desnecessária.
- Responda por meio do JSON solicitado, sem Markdown.

Contexto do usuário:
${context}`;
  const contents = [];
  for (const item of history) {
    contents.push({ role: item.role, parts: [{ text: item.text }] });
  }
  contents.push({ role: "user", parts: [{ text: question }] });

  const actionSchema = {
    type: "OBJECT",
    properties: {
      message: { type: "STRING", description: "Resposta curta em português do Brasil para mostrar ao usuário." },
      actions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING", description: "Tipo da ação LiDire" },
            name: { type: "STRING" },
            title: { type: "STRING" },
            date: { type: "STRING" },
            time: { type: "STRING" },
            priority: { type: "STRING" },
            message: { type: "STRING" },
            repeat: { type: "STRING" },
            period: { type: "STRING" },
            topic: { type: "STRING" },
            duration: { type: "NUMBER" },
            notes: { type: "STRING" },
            link: { type: "STRING" },
            location: { type: "STRING" },
            items: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: { type: "STRING" }, unit: { type: "STRING" }, calories: { type: "NUMBER" } } } },
            foods: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: { type: "STRING" }, unit: { type: "STRING" }, calories: { type: "NUMBER" } } } },
            amount: { type: "NUMBER" },
            value: { type: "NUMBER" },
            category: { type: "STRING" },
            currency: { type: "STRING" },
            deadline: { type: "STRING" },
            progress: { type: "NUMBER" },
            moneyGoal: { type: "NUMBER" },
            moneyCurrency: { type: "STRING" },
            financeCategory: { type: "STRING" },
            goalTitle: { type: "STRING" },
            workoutType: { type: "STRING" },
            financeType: { type: "STRING" },
            caloriesPer100: { type: "NUMBER" },
            totalCalories: { type: "NUMBER" },
            forQuantity: { type: "NUMBER" },
            quantityUnit: { type: "STRING" },
            ingredients: { type: "ARRAY", items: { type: "STRING" } },
            instructions: { type: "STRING" },
            servings: { type: "NUMBER" },
            calories: { type: "NUMBER" },
            relation: { type: "STRING" },
            email: { type: "STRING" },
            memberId: { type: "STRING" },
            recipientEmail: { type: "STRING" },
            permissions: { type: "ARRAY", items: { type: "STRING" } },
            mood: { type: "STRING" },
            pain: { type: "STRING" },
            cramps: { type: "STRING" },
            acne: { type: "STRING" },
            physicalEnergy: { type: "STRING" },
            mentalEnergy: { type: "STRING" },
            flow: { type: "STRING" },
            origin: { type: "STRING" },
            destination: { type: "STRING" },
            travelMode: { type: "STRING" },
            arrivalTime: { type: "STRING" },
            targetId: { type: "STRING" },
            aliases: { type: "ARRAY", items: { type: "STRING" } },
            address: { type: "STRING" }
          },
          required: ["type"]
        }
      }
    },
    required: ["message", "actions"]
  };

  let response = null;
  let data = {};
  let usedModel = model;

  for (const candidate of modelCandidates) {
    usedModel = candidate;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          ...(useWeb ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1100,
            responseMimeType: "application/json",
            responseSchema: actionSchema
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
          ]
        }),
        signal: controller.signal
      });
    } catch (error) {
      console.error("Gemini request failed:", error);
      response = new Response(JSON.stringify({ error: { message: error?.name === "AbortError" ? "timeout" : "network error" } }), { status: 504, headers: { "Content-Type": "application/json" } });
    } finally {
      clearTimeout(timeout);
    }

    data = await response.json().catch(() => ({}));
    const providerMessage = String(data?.error?.message || "");
    const isQuota = response.status === 429 || /quota|rate.?limit|resource.?exhausted|too many requests/i.test(providerMessage);
    if (response.ok || !isQuota) break;

    console.warn("Gemini quota reached; trying fallback model:", candidate);
  }

  if (!response?.ok) {
    console.error("Gemini API error:", response?.status, data);
    const providerMessage = String(data?.error?.message || "");
    const status = Number(response?.status || 502);
    let message = "A LiDire IA não conseguiu responder agora. Tente novamente em instantes.";
    let code = "ai_provider_error";

    if (status === 429 || /quota|rate.?limit|resource.?exhausted|too many requests/i.test(providerMessage)) {
      code = "ai_quota_exceeded";
      message = "A LiDire IA atingiu o limite temporário dos modelos gratuitos. Tente novamente mais tarde ou conecte um nível pago no Google AI Studio.";
    } else if (status === 503 || /high demand|overloaded|unavailable/i.test(providerMessage)) {
      code = "ai_temporarily_unavailable";
      message = "A LiDire IA está temporariamente indisponível por alta demanda. Tente novamente em alguns minutos.";
    } else if (status === 401 || status === 403) {
      code = "ai_configuration_error";
      message = "A conexão da LiDire IA precisa ser verificada no servidor.";
    }

    return Response.json({ error: code, message }, { status: status === 429 ? 429 : 502 });
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n").trim();
  if (!rawText) {
    return Response.json({ error: "empty_ai_response", message: "A IA não retornou uma resposta." }, { status: 502 });
  }

  let result;
  try {
    result = JSON.parse(rawText);
  } catch (_) {
    console.error("Gemini returned invalid structured output:", rawText);
    return Response.json({ error: "invalid_ai_response", message: "A IA retornou uma resposta que não pôde ser processada. Tente novamente." }, { status: 502 });
  }

  const cleanText = cleanAIText(result?.message || "");
  const actions = Array.isArray(result?.actions) ? result.actions.slice(0, 8).map(action => sanitizeAIValue(action)).filter(Boolean) : [];
  const grounding = data?.candidates?.[0]?.groundingMetadata || {};
  const sources = Array.isArray(grounding?.groundingChunks)
    ? grounding.groundingChunks
        .map(chunk => chunk?.web ? { title: String(chunk.web.title || "Fonte"), url: String(chunk.web.uri || "") } : null)
        .filter(x => x?.url)
        .slice(0, 8)
    : [];
  const searchQueries = Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries.map(String).slice(0, 8) : [];
  return Response.json({ ok: true, text: cleanText, actions, model: usedModel, web: useWeb, sources, searchQueries });
}

function cleanAIText(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\s*/g, "").replace(/```/g, "");
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/(?<!\w)\*(.*?)\*(?!\w)/g, "$1");
  text = text.replace(/(?<!\w)_(.*?)_(?!\w)/g, "$1");
  text = text.replace(/^\s*[-*+]\s+/gm, "• ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeAIContext(raw, language) {
  const source = raw && typeof raw === "object" ? raw : {};
  const clean = {
    language,
    user: { name: String(source.user?.name || "").slice(0, 80), age: Number(source.user?.age || 0) || "", sex: String(source.user?.sex || "").slice(0, 30), weight: Number(source.user?.weight || 0) || "" },
    homeAddress: String(source.homeAddress || "").trim().slice(0, 500),
    hydrationProfile: source.hydrationProfile && typeof source.hydrationProfile === "object" ? sanitizeAIValue(source.hydrationProfile) : {},
    today: String(source.today || "").slice(0, 20),
    agenda: sanitizeAIAgenda(source.agenda),
    tarefas: limitAIItems(source.tarefas, 60),
    compras: limitAIItems(source.compras, 30),
    estudos: limitAIItems(source.estudos, 40),
    treinos: limitAIItems(source.treinos, 40),
    hidratacao: limitAIItems(source.hidratacao, 30),
    alimentacao: limitAIItems(source.alimentacao, 30),
    financas: limitAIItems(source.financas, 40),
    objetivos: limitAIItems(source.objetivos, 30),
    familia: limitAIItems(source.familia, 20),
    lembretes: limitAIItems(source.lembretes, 30),
    alimentos: limitAIItems(source.alimentos, 80),
    dietas: limitAIItems(source.dietas, 30),
    receitas: limitAIItems(source.receitas, 30)
  };
  // The menstrual-cycle data is deliberately excluded unless the user explicitly
  // enabled its AI context in the LiDire settings.
  if (source.cycleAiContext === true) clean.ciclo = limitAIItems(source.ciclo, 30);
  return JSON.stringify(clean);
}

function limitAIItems(value, max) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(item => sanitizeAIValue(item)).filter(Boolean);
}

function sanitizeAIAgenda(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map(item => {
    if (!item || typeof item !== "object") return null;
    return {
      id: String(item.id || "").slice(0, 100),
      title: String(item.title || item.name || "Compromisso").slice(0, 200),
      date: String(item.date || "").slice(0, 20),
      time: String(item.time || "").slice(0, 20),
      location: String(item.location || "").slice(0, 200),
      address: String(item.address || "").slice(0, 500),
      notes: String(item.notes || "").slice(0, 300),
      status: String(item.status || "").slice(0, 50)
    };
  }).filter(Boolean);
}

function sanitizeAIValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return String(value).slice(0, 300);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (["password", "passwordHash", "token", "session", "photo", "profile_photo", "address", "phone"].includes(key)) continue;
    if (typeof val === "string") out[key] = val.slice(0, 300);
    else if (typeof val === "number" || typeof val === "boolean") out[key] = val;
    else if (Array.isArray(val)) out[key] = val.slice(0, 20).map(sanitizeAIValue);
    else if (val && typeof val === "object") out[key] = sanitizeAIValue(val);
  }
  return out;
}

async function ensureAuthTables(db) {
  // Migration defensiva: versões anteriores do MVP tinham uma tabela users
  // sem password_hash/updated_at e algumas instalações ainda não tinham profiles.
  // Sem esta migração, /api/login pode falhar no D1 e a tela fica presa em “Aguarde…”.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      age INTEGER,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const columns = await db.prepare(`PRAGMA table_info(users)`).all();
  const names = new Set((columns.results || []).map(c => c.name));
  if (!names.has("password_hash")) {
    await db.prepare(`ALTER TABLE users ADD COLUMN password_hash TEXT`).run();
  }
  if (!names.has("updated_at")) {
    await db.prepare(`ALTER TABLE users ADD COLUMN updated_at TEXT`).run();
  }
  // Contas antigas permanecem válidas; a exigência é ativada apenas para novos cadastros.
  if (!names.has("email_verified_at")) {
    await db.prepare(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`).run();
  }
  if (!names.has("email_verification_required")) {
    await db.prepare(`ALTER TABLE users ADD COLUMN email_verification_required INTEGER NOT NULL DEFAULT 0`).run();
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      age INTEGER,
      phone TEXT,
      address TEXT,
      profile_photo TEXT,
      currency TEXT DEFAULT 'BRL',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  const profileColumns = await db.prepare("PRAGMA table_info(profiles)").all();
  if (!(profileColumns.results || []).some(column => column.name === "birth_date")) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN birth_date TEXT").run();
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user
    ON user_sessions(user_id)
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS auth_provider_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email TEXT,
      name TEXT,
      picture_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_subject),
      UNIQUE(user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_provider_user ON auth_provider_accounts(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_provider_lookup ON auth_provider_accounts(provider, provider_subject)`).run();
}

async function listConnections(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Faça login para consultar suas conexões." }, { status: 401 });
  await ensureAuthTables(env.DB);
  const rows = await env.DB.prepare(`SELECT provider FROM auth_provider_accounts WHERE user_id = ?`).bind(user.id).all();
  const connected = new Set((rows.results || []).map(row => String(row.provider)));
  return Response.json({
    google: { configured: !!env.GOOGLE_CLIENT_ID, clientId: env.GOOGLE_CLIENT_ID || "", connected: connected.has("google") },
    gmail: { configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_ENCRYPTION_KEY), connected: await gmailIsConnected(env.DB, user.id) },
    apple: { configured: !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY), clientId: env.APPLE_CLIENT_ID || "", connected: connected.has("apple") }
  }, { headers: { "Cache-Control": "no-store, private" } });
}

async function ensureGmailTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS gmail_connections (
    user_id TEXT PRIMARY KEY, email TEXT NOT NULL, encrypted_tokens TEXT NOT NULL,
    token_expiry INTEGER, scope TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gmail_oauth_states (
    state TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}
async function ensureGmailFollowupTables(db) {
  await ensureGmailTables(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS gmail_important_senders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Pessoal', notify_new INTEGER NOT NULL DEFAULT 1, reminder_hours INTEGER NOT NULL DEFAULT 6, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,email), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gmail_followups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, message_id TEXT NOT NULL, thread_id TEXT, sender_email TEXT, subject TEXT, message_date INTEGER NOT NULL, reminder_hours INTEGER NOT NULL, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', last_checked_at INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,message_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gmail_followups_due ON gmail_followups(status,due_at)`).run();
}
async function listGmailImportantSenders(request, env) {
  const user = await getSessionUser(request, env); if (!user) return Response.json({error:'unauthorized'},{status:401});
  await ensureGmailFollowupTables(env.DB);
  const rows = await env.DB.prepare(`SELECT id,email,category,notify_new,reminder_hours,created_at FROM gmail_important_senders WHERE user_id=? ORDER BY created_at DESC`).bind(user.id).all();
  return Response.json({senders:rows.results||[]},{headers:{'Cache-Control':'no-store, private'}});
}
async function saveGmailImportantSender(request, env) {
  const user = await getSessionUser(request, env); if (!user) return Response.json({error:'unauthorized'},{status:401});
  await ensureGmailFollowupTables(env.DB);
  const body = await request.json(); const email=String(body.email||'').trim().toLowerCase(); const category=String(body.category||'Pessoal'); const hours=Number(body.reminderHours||6); const notify=body.notifyNew===false?0:1;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({error:'invalid_email',message:'Informe um endereço de e-mail válido.'},{status:400});
  if (![3,6,12,24].includes(hours)) return Response.json({error:'invalid_hours',message:'Escolha 3, 6, 12 ou 24 horas.'},{status:400});
  if (!['Trabalho','Estudos','Pessoal','Financeiro'].includes(category)) return Response.json({error:'invalid_category'},{status:400});
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO gmail_important_senders (id,user_id,email,category,notify_new,reminder_hours) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,email) DO UPDATE SET category=excluded.category,notify_new=excluded.notify_new,reminder_hours=excluded.reminder_hours`).bind(id,user.id,email,category,notify,hours).run();
  return Response.json({ok:true,message:'Remetente importante salvo.'});
}
async function deleteGmailImportantSender(request, env, url) {
  const user=await getSessionUser(request,env); if(!user) return Response.json({error:'unauthorized'},{status:401});
  await ensureGmailFollowupTables(env.DB); const id=decodeURIComponent(url.pathname.split('/').pop()||'');
  await env.DB.prepare(`DELETE FROM gmail_important_senders WHERE id=? AND user_id=?`).bind(id,user.id).run();
  return Response.json({ok:true});
}
async function listGmailFollowups(request, env) {
  const user=await getSessionUser(request,env); if(!user) return Response.json({error:'unauthorized'},{status:401});
  await ensureGmailFollowupTables(env.DB);
  const rows=await env.DB.prepare(`SELECT id,sender_email,subject,message_date,reminder_hours,due_at,status FROM gmail_followups WHERE user_id=? AND status='pending' AND due_at<=? ORDER BY due_at ASC LIMIT 20`).bind(user.id,Date.now()).all();
  return Response.json({followups:rows.results||[]},{headers:{'Cache-Control':'no-store, private'}});
}
async function runGmailFollowupSweep(env) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) return;
  await ensureGmailFollowupTables(env.DB);
  const senders=(await env.DB.prepare(`SELECT user_id,email,category,notify_new,reminder_hours FROM gmail_important_senders`).all()).results||[];
  const byUser=new Map(); for (const sender of senders) { if(!byUser.has(sender.user_id)) byUser.set(sender.user_id,[]); byUser.get(sender.user_id).push(sender); }
  for (const [userId, rules] of byUser) {
    try {
      const token=await getGmailAccessToken(env.DB,env,userId); if(!token) continue;
      const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent('in:inbox newer_than:3d')}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok) { console.error('Gmail sweep list failed',response.status); continue; }
      const listed=await response.json();
      for(const msg of (listed.messages||[])) {
        const exists=await env.DB.prepare(`SELECT id FROM gmail_followups WHERE user_id=? AND message_id=?`).bind(userId,msg.id).first(); if(exists) continue;
        const mr=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msg.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,{headers:{Authorization:`Bearer ${token}`}}); if(!mr.ok) continue;
        const d=await mr.json(); const headers=d.payload?.headers||[]; const get=n=>(headers.find(h=>String(h.name).toLowerCase()===n.toLowerCase())||{}).value||'';
        const from=get('From'); const sender=(from.match(/<([^>]+)>/)||[,from])[1].trim().toLowerCase(); const rule=rules.find(r=>r.email===sender); if(!rule || (d.labelIds||[]).includes('SENT')) continue;
        const date=Date.parse(get('Date'))||Date.now();
        // Only track messages still lacking a later sent message in the same thread.
        const tr=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(d.threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,{headers:{Authorization:`Bearer ${token}`}}); if(!tr.ok) continue;
        const thread=await tr.json(); const messages=thread.messages||[]; const hasLaterReply=messages.some(x=>(x.labelIds||[]).includes('SENT') && Number(x.internalDate||0)>Number(d.internalDate||0)); if(hasLaterReply) continue;
        await env.DB.prepare(`INSERT OR IGNORE INTO gmail_followups (id,user_id,message_id,thread_id,sender_email,subject,message_date,reminder_hours,due_at,status) VALUES (?,?,?,?,?,?,?,?,?,'pending')`).bind(crypto.randomUUID(),userId,msg.id,d.threadId,sender,String(get('Subject')||'(sem assunto)').slice(0,250),date,Number(rule.reminder_hours),date+Number(rule.reminder_hours)*3600000).run();
      }
      // Resolve pending follow-ups when the thread now contains a sent message later than the tracked message.
      const pending=(await env.DB.prepare(`SELECT id,thread_id,message_date FROM gmail_followups WHERE user_id=? AND status='pending'`).bind(userId).all()).results||[];
      for(const f of pending) { if(!f.thread_id) continue; const tr=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(f.thread_id)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,{headers:{Authorization:`Bearer ${token}`}}); if(!tr.ok) continue; const t=await tr.json(); if((t.messages||[]).some(x=>(x.labelIds||[]).includes('SENT') && Number(x.internalDate||0)>Number(f.message_date||0))) await env.DB.prepare(`UPDATE gmail_followups SET status='answered',last_checked_at=? WHERE id=?`).bind(Date.now(),f.id).run(); else await env.DB.prepare(`UPDATE gmail_followups SET last_checked_at=? WHERE id=?`).bind(Date.now(),f.id).run(); }
    } catch(e) { console.error('Gmail follow-up sweep failed for user',String(e?.message||e)); }
  }
}

async function gmailIsConnected(db, userId) {
  await ensureGmailTables(db);
  const row = await db.prepare(`SELECT user_id FROM gmail_connections WHERE user_id = ?`).bind(userId).first();
  return !!row;
}
function bytesToBase64(bytes) { let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function gmailCryptoKey(env) {
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error("gmail_encryption_key_missing");
  const raw = new TextEncoder().encode(String(env.GOOGLE_TOKEN_ENCRYPTION_KEY));
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
}
async function encryptGmailTokens(tokens, env) {
  const key = await gmailCryptoKey(env); const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(tokens));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, data);
  return bytesToBase64(iv) + "." + bytesToBase64(new Uint8Array(encrypted));
}
async function decryptGmailTokens(value, env) {
  const [ivPart, dataPart] = String(value || "").split("."); if (!ivPart || !dataPart) throw new Error("gmail_token_invalid");
  const key = await gmailCryptoKey(env); const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:base64ToBytes(ivPart)}, key, base64ToBytes(dataPart));
  return JSON.parse(new TextDecoder().decode(plain));
}
function gmailResultHtml(ok, message) {
  const payload = JSON.stringify({type:"lidire-gmail-connect", ok:!!ok, message:String(message||"")});
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LiDire — Gmail</title><body style="font-family:Arial,sans-serif;background:#080d24;color:white;display:grid;place-items:center;min-height:100vh;text-align:center"><main><h2>${ok?"Gmail conectado":"Não foi possível conectar o Gmail"}</h2><p>${escapeHtml(message)}</p><button onclick="window.close()">Voltar à LiDire</button></main><script>try{window.opener&&window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(()=>window.close(),900)</script></body></html>`;
}
async function startGmailConnection(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Faça login na LiDire antes de conectar o Gmail.", {status:401});
  if (!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_ENCRYPTION_KEY)) return new Response("Configuração Gmail incompleta no servidor.", {status:503});
  await ensureGmailTables(env.DB);
  const bytes = crypto.getRandomValues(new Uint8Array(32)); const state = bytesToBase64Url(bytes);
  await env.DB.prepare(`INSERT INTO gmail_oauth_states (state,user_id,expires_at) VALUES (?,?,?)`).bind(state,user.id,Date.now()+10*60*1000).run();
  const redirectUri = `${url.origin}/api/connections/gmail/callback`;
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email https://www.googleapis.com/auth/gmail.readonly");
  authorize.searchParams.set("access_type", "offline"); authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("include_granted_scopes", "true"); authorize.searchParams.set("state", state);
  return Response.redirect(authorize.toString(), 302);
}
async function gmailConnectionCallback(request, env, url) {
  const origin = url.origin;
  try {
    await ensureGmailTables(env.DB);
    const state = url.searchParams.get("state") || ""; const code = url.searchParams.get("code") || "";
    if (!state || !code || url.searchParams.get("error")) throw new Error("O Google cancelou ou não concluiu a autorização.");
    const pending = await env.DB.prepare(`SELECT user_id,expires_at FROM gmail_oauth_states WHERE state = ?`).bind(state).first();
    await env.DB.prepare(`DELETE FROM gmail_oauth_states WHERE state = ?`).bind(state).run();
    if (!pending || Number(pending.expires_at) < Date.now()) throw new Error("A autorização expirou. Tente novamente.");
    const redirectUri = `${origin}/api/connections/gmail/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:"authorization_code"})});
    const tokens = await tokenResponse.json(); if (!tokenResponse.ok || !tokens.access_token) throw new Error("O Google não forneceu os tokens de acesso.");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email) throw new Error("Não foi possível confirmar o e-mail Google.");
    const existing = await env.DB.prepare(`SELECT encrypted_tokens FROM gmail_connections WHERE user_id = ?`).bind(pending.user_id).first();
    if (!tokens.refresh_token && existing) { const old = await decryptGmailTokens(existing.encrypted_tokens,env); tokens.refresh_token = old.refresh_token; }
    if (!tokens.refresh_token) throw new Error("O Google não retornou permissão de acesso duradouro. Revogue a conexão anterior na Conta Google e tente novamente.");
    const encrypted = await encryptGmailTokens(tokens,env);
    await env.DB.prepare(`INSERT INTO gmail_connections (user_id,email,encrypted_tokens,token_expiry,scope,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,encrypted_tokens=excluded.encrypted_tokens,token_expiry=excluded.token_expiry,scope=excluded.scope,updated_at=CURRENT_TIMESTAMP`).bind(pending.user_id,String(profile.email).slice(0,254),encrypted,Date.now()+Number(tokens.expires_in||3600)*1000,String(tokens.scope||"").slice(0,1000)).run();
    return new Response(gmailResultHtml(true,`Conta ${profile.email} conectada. Você já pode revisar e-mails na LiDire.`),{headers:{"Content-Type":"text/html;charset=UTF-8","Cache-Control":"no-store"}});
  } catch (error) {
    console.error("Gmail OAuth callback error:",error);
    return new Response(gmailResultHtml(false,String(error?.message||"Não foi possível conectar o Gmail.")),{status:400,headers:{"Content-Type":"text/html;charset=UTF-8","Cache-Control":"no-store"}});
  }
}
async function getGmailAccessToken(db, env, userId) {
  await ensureGmailTables(db); const row = await db.prepare(`SELECT encrypted_tokens FROM gmail_connections WHERE user_id = ?`).bind(userId).first();
  if (!row) return null; const tokens = await decryptGmailTokens(row.encrypted_tokens,env);
  if (tokens.access_token && Number(tokens.expiry_date||0)>Date.now()+60000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("gmail_reauthorization_required");
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:tokens.refresh_token,grant_type:"refresh_token"})});
  const renewed = await response.json(); if (!response.ok || !renewed.access_token) throw new Error("gmail_token_refresh_failed");
  const updated={...tokens,...renewed,refresh_token:tokens.refresh_token,expiry_date:Date.now()+Number(renewed.expires_in||3600)*1000};
  await db.prepare(`UPDATE gmail_connections SET encrypted_tokens=?,token_expiry=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(await encryptGmailTokens(updated,env),updated.expiry_date,userId).run();
  return updated.access_token;
}
async function listGmailMessages(request, env, url) {
  const user=await getSessionUser(request,env); if(!user) return Response.json({error:"unauthorized",message:"Faça login na LiDire."},{status:401});
  try {
    const token=await getGmailAccessToken(env.DB,env,user.id); if(!token) return Response.json({error:"gmail_not_connected",message:"Conecte sua conta Gmail primeiro."},{status:404});
    const max=Math.min(25,Math.max(1,Number(url.searchParams.get("max")||15)));
    const listResponse=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent("in:inbox newer_than:30d")}`,{headers:{Authorization:`Bearer ${token}`}});
    const listed=await listResponse.json(); if(!listResponse.ok) throw new Error("gmail_messages_unavailable");
    const messages=await Promise.all((listed.messages||[]).slice(0,max).map(async m=>{
      const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Reply-To`,{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok) return null; const d=await r.json(); const headers=d.payload?.headers||[]; const get=n=>(headers.find(h=>String(h.name).toLowerCase()===n.toLowerCase())||{}).value||"";
      const from=get("From"); const subject=get("Subject")||"(sem assunto)"; const snippet=String(d.snippet||"").slice(0,500); const labels=d.labelIds||[];
      const ownEmail=String(user.email||"").toLowerCase(); const senderEmail=(from.match(/<([^>]+)>/)||[,from])[1].toLowerCase();
      const replyNeeded=!labels.includes("SENT") && !labels.includes("SPAM") && !labels.includes("TRASH") && senderEmail!==ownEmail && !/no.?reply|noreply|do.?not.?reply/i.test(from) && !labels.includes("IMPORTANT") ? true : (!labels.includes("SENT") && senderEmail!==ownEmail && !/no.?reply|noreply|do.?not.?reply/i.test(from));
      return {id:d.id,threadId:d.threadId,from:from.slice(0,300),subject:subject.slice(0,300),date:get("Date").slice(0,100),snippet,unread:labels.includes("UNREAD"),replySuggested:replyNeeded};
    }));
    const row=await env.DB.prepare(`SELECT email FROM gmail_connections WHERE user_id=?`).bind(user.id).first();
    return Response.json({connected:true,email:row?.email||"",messages:messages.filter(Boolean)},{headers:{"Cache-Control":"no-store, private"}});
  } catch(error) { console.error("Gmail list error:",error); return Response.json({error:"gmail_read_failed",message:"Não foi possível consultar os e-mails. Tente reconectar a conta Google."},{status:502}); }
}
async function disconnectGmail(request,env) {
  const user=await getSessionUser(request,env); if(!user) return Response.json({error:"unauthorized"},{status:401});
  await ensureGmailTables(env.DB); await env.DB.prepare(`DELETE FROM gmail_connections WHERE user_id=?`).bind(user.id).run();
  return Response.json({ok:true,message:"Gmail desconectado da LiDire."});
}

function parseJwtPart(token, index) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const bytes = base64UrlToBytes(parts[index]);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) { return null; }
}

async function fetchJwks(url) {
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error(`jwks_http_${response.status}`);
  return response.json();
}

async function verifyGoogleIdToken(idToken, env) {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("google_not_configured");
  const header = parseJwtPart(idToken, 0);
  const payload = parseJwtPart(idToken, 1);
  const parts = String(idToken || "").split(".");
  if (!header || !payload || parts.length !== 3 || !header.kid || header.alg !== "RS256") throw new Error("invalid_google_token");
  const now = Math.floor(Date.now() / 1000);
  const issuerOk = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
  const audienceOk = payload.aud === env.GOOGLE_CLIENT_ID;
  if (!issuerOk || !audienceOk || !payload.sub || Number(payload.exp || 0) <= now || payload.email_verified !== true) throw new Error("invalid_google_claims");
  const keys = await fetchJwks("https://www.googleapis.com/oauth2/v3/certs");
  const jwk = (keys.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("google_key_not_found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
  if (!valid) throw new Error("invalid_google_signature");
  return { subject: String(payload.sub), email: normalizeEmail(payload.email), name: String(payload.name || payload.given_name || ""), picture: String(payload.picture || "") };
}

async function linkProviderAccount(db, user, provider, identity) {
  await ensureAuthTables(db);
  const existingProvider = await db.prepare(`SELECT id, user_id FROM auth_provider_accounts WHERE provider = ? AND provider_subject = ? LIMIT 1`).bind(provider, identity.subject).first();
  if (existingProvider && String(existingProvider.user_id) !== String(user.id)) {
    return { ok: false, status: 409, error: "provider_already_linked", message: `Esta conta ${provider === "google" ? "do Google" : "da Apple"} já está vinculada a outra conta LiDire.` };
  }
  const existingForUser = await db.prepare(`SELECT id, provider_subject FROM auth_provider_accounts WHERE user_id = ? AND provider = ? LIMIT 1`).bind(user.id, provider).first();
  const now = new Date().toISOString();
  if (existingForUser) {
    await db.prepare(`UPDATE auth_provider_accounts SET provider_subject = ?, email = ?, name = ?, picture_url = ?, updated_at = ? WHERE id = ?`)
      .bind(identity.subject, identity.email || null, identity.name || null, identity.picture || null, now, existingForUser.id).run();
  } else {
    await db.prepare(`INSERT INTO auth_provider_accounts (id, user_id, provider, provider_subject, email, name, picture_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), user.id, provider, identity.subject, identity.email || null, identity.name || null, identity.picture || null, now, now).run();
  }
  return { ok: true };
}

async function connectGoogle(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Faça login na LiDire antes de conectar o Google." }, { status: 401 });
  try {
    const body = await readJson(request);
    const identity = await verifyGoogleIdToken(String(body.credential || ""), env);
    const result = await linkProviderAccount(env.DB, user, "google", identity);
    if (!result.ok) return Response.json({ error: result.error, message: result.message }, { status: result.status });
    return Response.json({ ok: true, provider: "google", message: "Google Account conectado à LiDire." });
  } catch (error) {
    console.error("LiDire Google connection error:", error);
    const message = String(error?.message || "").includes("not_configured") ? "A integração com o Google ainda não foi configurada no servidor." : "Não foi possível validar a Conta do Google.";
    return Response.json({ error: "google_connection_failed", message }, { status: 400 });
  }
}

function appleCallbackHtml(origin, ok, message) {
  const safeOrigin = JSON.stringify(origin);
  const payload = JSON.stringify({ type: "lidire-apple-connect", ok: !!ok, message: String(message || "") });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LiDire — Apple ID</title></head><body style="font-family:Arial,sans-serif;background:#070c22;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><h2>${ok ? "Apple ID conectado" : "Não foi possível conectar"}</h2><p>${escapeHtml(message || "")}</p></div><script>try{window.opener&&window.opener.postMessage(${payload},${safeOrigin});}catch(e){}setTimeout(()=>window.close(),300);</script></body></html>`;
}

async function startAppleConnection(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return new Response("Faça login na LiDire antes de conectar o Apple ID.", { status: 401, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
  if (!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)) {
    return new Response("Integração com Apple ID não configurada.", { status: 503, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
  }
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = bytesToBase64Url(stateBytes);
  const redirectUri = `${url.origin}/api/connections/apple/callback`;
  const authorize = new URL("https://appleid.apple.com/auth/authorize");
  authorize.searchParams.set("client_id", env.APPLE_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code id_token");
  authorize.searchParams.set("response_mode", "form_post");
  authorize.searchParams.set("scope", "name email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", state);
  return new Response(null, { status: 302, headers: { "Location": authorize.toString(), "Set-Cookie": `lidire_apple_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` } });
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return base64UrlToBytes(base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
}

async function createAppleClientSecret(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" })));
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 86400 * 180, aud: "https://appleid.apple.com", sub: env.APPLE_CLIENT_ID })));
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(env.APPLE_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyAppleIdToken(idToken, env) {
  const header = parseJwtPart(idToken, 0);
  const payload = parseJwtPart(idToken, 1);
  const parts = String(idToken || "").split(".");
  if (!header || !payload || parts.length !== 3 || !header.kid || header.alg !== "ES256") throw new Error("invalid_apple_token");
  const now = Math.floor(Date.now() / 1000);
  const issuerOk = payload.iss === "https://appleid.apple.com";
  const audienceOk = payload.aud === env.APPLE_CLIENT_ID;
  if (!issuerOk || !audienceOk || !payload.sub || Number(payload.exp || 0) <= now) throw new Error("invalid_apple_claims");
  const keys = await fetchJwks("https://appleid.apple.com/auth/keys");
  const jwk = (keys.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("apple_key_not_found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("invalid_apple_signature");
  return { subject: String(payload.sub), email: normalizeEmail(payload.email || ""), name: String(payload.name || "") };
}

async function appleConnectionCallback(request, env, url) {
  const origin = url.origin;
  try {
    const form = await request.formData();
    const state = String(form.get("state") || "");
    const expectedState = getCookie(request, "lidire_apple_state");
    if (!state || !expectedState || state !== expectedState) return new Response(appleCallbackHtml(origin, false, "A validação de segurança do Apple ID expirou. Tente novamente."), { status: 400, headers: { "Content-Type": "text/html;charset=UTF-8", "Set-Cookie": "lidire_apple_state=; Max-Age=0; Path=/; Secure; SameSite=Lax" } });
    const user = await getSessionUser(request, env);
    if (!user) return new Response(appleCallbackHtml(origin, false, "Sua sessão LiDire expirou. Entre novamente e tente conectar o Apple ID."), { status: 401, headers: { "Content-Type": "text/html;charset=UTF-8" } });
    const code = String(form.get("code") || "");
    if (!code) throw new Error("apple_authorization_code_missing");
    const redirectUri = `${origin}/api/connections/apple/callback`;
    const clientSecret = await createAppleClientSecret(env);
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.APPLE_CLIENT_ID, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error("apple_token_exchange_failed");
    const identity = await verifyAppleIdToken(tokenData.id_token, env);
    let firstTimeUser = {};
    try { firstTimeUser = JSON.parse(String(form.get("user") || "{}")); } catch (_) {}
    const appleUser = { ...identity, name: identity.name || [firstTimeUser?.name?.firstName, firstTimeUser?.name?.lastName].filter(Boolean).join(" ") };
    const result = await linkProviderAccount(env.DB, user, "apple", appleUser);
    if (!result.ok) return new Response(appleCallbackHtml(origin, false, result.message), { status: result.status, headers: { "Content-Type": "text/html;charset=UTF-8" } });
    return new Response(appleCallbackHtml(origin, true, "Apple ID conectado à LiDire."), { status: 200, headers: { "Content-Type": "text/html;charset=UTF-8", "Set-Cookie": "lidire_apple_state=; Max-Age=0; Path=/; Secure; SameSite=Lax" } });
  } catch (error) {
    console.error("LiDire Apple connection error:", error);
    return new Response(appleCallbackHtml(origin, false, "Não foi possível conectar o Apple ID. Verifique a configuração da integração e tente novamente."), { status: 400, headers: { "Content-Type": "text/html;charset=UTF-8", "Set-Cookie": "lidire_apple_state=; Max-Age=0; Path=/; Secure; SameSite=Lax" } });
  }
}

async function register(request, env, requestUrl) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (name.length < 2) {
    return Response.json(
      { error: "invalid_name", message: "Informe seu nome." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return Response.json(
      { error: "invalid_email", message: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json(
      { error: "weak_password", message: "A senha precisa ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  if (!body.legalAccepted) {
    return Response.json(
      { error: "legal_required", message: "O aceite dos documentos legais é necessário para criar a conta." },
      { status: 400 }
    );
  }

  await ensureAuthTables(env.DB);

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();

  if (existing) {
    return Response.json(
      { error: "email_exists", message: "Já existe uma conta com este e-mail." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // O D1 atual usa users + profiles com o perfil separado do usuário.
    // Mantemos o cadastro mínimo e seguro aqui; configurações adicionais
    // serão inicializadas quando seus módulos forem conectados.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO users (id, email, password_hash, name, created_at, updated_at, email_verified_at, email_verification_required)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 1)
      `).bind(userId, email, passwordHash, name, now, now),

      env.DB.prepare(`
        INSERT INTO profiles (
          user_id, name, email, age, phone, address, profile_photo, currency, created_at, updated_at
        )
        VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'BRL', ?, ?)
      `).bind(userId, name, email, now, now)
    ]);

    // Se a tabela de aceite jurídico existir, registra o aceite.
    // O cadastro não é bloqueado por tabelas opcionais de módulos ainda não conectados.
    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO legal_acceptances (id, user_id, document_type, document_version, accepted_at)
          VALUES (?, ?, 'terms_of_use', '1.0', ?)
        `).bind(crypto.randomUUID(), userId, now),
        env.DB.prepare(`
          INSERT INTO legal_acceptances (id, user_id, document_type, document_version, accepted_at)
          VALUES (?, ?, 'privacy_policy', '1.0', ?)
        `).bind(crypto.randomUUID(), userId, now)
      ]);
    } catch (legalError) {
      console.warn("Registro de aceite jurídico não disponível nesta versão:", legalError);
    }
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return Response.json(
        { error: "email_exists", message: "Já existe uma conta com este e-mail." },
        { status: 409 }
      );
    }
    throw error;
  }

  let emailSent = false;
  try {
    await sendEmailVerification(env, {
      db: env.DB,
      userId,
      to: email,
      name,
      origin: requestUrl.origin
    });
    emailSent = true;
  } catch (error) {
    // A conta permanece pendente; o usuário pode solicitar novo envio na tela.
    console.error("LiDire email verification send failed:", String(error?.message || error));
  }

  return Response.json({
    ok: true,
    requiresEmailVerification: true,
    emailSent,
    email,
    message: emailSent
      ? "Enviamos um link de confirmação para seu e-mail. Confirme o endereço antes de entrar na LiDire."
      : "Sua conta foi criada, mas não conseguimos enviar o e-mail agora. Use a opção de reenviar a confirmação."
  }, { status: 202, headers: { "Cache-Control": "no-store, private" } });
}

async function ensureLoginSessionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Bancos de versões antigas podem ter criado a tabela com menos colunas.
  // Adicionamos somente as colunas necessárias, sem apagar sessões existentes.
  const columns = await db.prepare(`PRAGMA table_info(user_sessions)`).all();
  const names = new Set((columns.results || []).map(c => c.name));
  if (!names.has("token_hash")) await db.prepare(`ALTER TABLE user_sessions ADD COLUMN token_hash TEXT`).run();
  if (!names.has("expires_at")) await db.prepare(`ALTER TABLE user_sessions ADD COLUMN expires_at TEXT`).run();
  if (!names.has("created_at")) await db.prepare(`ALTER TABLE user_sessions ADD COLUMN created_at TEXT`).run();
  if (!names.has("last_seen_at")) await db.prepare(`ALTER TABLE user_sessions ADD COLUMN last_seen_at TEXT`).run();
}

function decodeLoginChallenge(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    return null;
  }
}

function encodeLoginChallenge(payload) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function loginChallenge(request, env) {
  try {
    await ensureAuthTables(env.DB);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const user = await env.DB
      .prepare("SELECT id, password_hash, email_verification_required, email_verified_at FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .bind(email)
      .first();

    if (!user?.password_hash) {
      return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
    }
    if (Number(user.email_verification_required || 0) === 1 && !user.email_verified_at) {
      return Response.json({ error: "email_not_verified", message: "Confirme seu e-mail pelo link que enviamos antes de entrar." }, { status: 403 });
    }

    const parts = String(user.password_hash).split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return Response.json({ error: "password_not_configured", message: "Esta conta precisa configurar novamente a senha." }, { status: 409 });
    }

    const iterations = Number(parts[1]);
    const salt = parts[2];
    if (!Number.isFinite(iterations) || iterations < 1 || !salt) {
      return Response.json({ error: "password_not_configured", message: "Esta conta precisa configurar novamente a senha." }, { status: 409 });
    }

    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const payload = {
      email,
      nonce: bytesToBase64Url(nonceBytes),
      issuedAt: Date.now()
    };
    const challenge = encodeLoginChallenge(payload);

    return Response.json(
      { ok: true, challenge, salt, iterations },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("LiDire login challenge error:", error);
    return Response.json({ error: "login_unavailable", message: "Não foi possível iniciar o login agora." }, { status: 503 });
  }
}

async function login(request, env) {
  try {
    await ensureAuthTables(env.DB);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);

    // Novo fluxo: a senha é derivada no aparelho e o Worker verifica apenas
    // uma prova HMAC do desafio. Isso evita o custo de PBKDF2 no CPU do Worker.
    if (body.challenge && body.proof) {
      if (!isValidEmail(email)) {
        return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
      }

      const challenge = decodeLoginChallenge(body.challenge);
      const issuedAt = Number(challenge?.issuedAt || 0);
      const challengeEmail = normalizeEmail(challenge?.email || "");
      if (!challenge || challengeEmail !== email || !issuedAt || Math.abs(Date.now() - issuedAt) > 120000) {
        return Response.json({ error: "login_challenge_expired", message: "A tentativa de login expirou. Tente novamente." }, { status: 401 });
      }

      const user = await env.DB
        .prepare("SELECT id, email, name, password_hash, email_verification_required, email_verified_at FROM users WHERE lower(email) = lower(?) LIMIT 1")
        .bind(email)
        .first();

      if (!user?.password_hash) {
        return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
      }
      if (Number(user.email_verification_required || 0) === 1 && !user.email_verified_at) {
        return Response.json({ error: "email_not_verified", message: "Confirme seu e-mail pelo link que enviamos antes de entrar." }, { status: 403 });
      }

      const parts = String(user.password_hash).split("$");
      if (parts.length !== 4 || parts[0] !== "pbkdf2") {
        return Response.json({ error: "password_not_configured", message: "Esta conta precisa configurar novamente a senha." }, { status: 409 });
      }

      const expectedDerived = base64UrlToBytes(parts[3]);
      const expectedProof = await hmacSha256(expectedDerived, body.challenge);
      const suppliedProof = base64UrlToBytes(body.proof);
      if (!constantTimeEqual(expectedProof, suppliedProof)) {
        return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
      }

      const session = await createSession(env.DB, user.id);
      return Response.json(
        { ok: true, user: { id: user.id, name: user.name || "", email: user.email || "" } },
        { headers: { "Set-Cookie": session.cookie, "Cache-Control": "no-store, private" } }
      );
    }

    // Compatibilidade para clientes antigos que ainda enviem senha diretamente.
    const password = String(body.password || "");
    if (!isValidEmail(email) || password.length < 8) {
      return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const user = await env.DB
      .prepare("SELECT id, email, password_hash, name, email_verification_required, email_verified_at FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .bind(email)
      .first();

    if (!user) return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });
    if (Number(user.email_verification_required || 0) === 1 && !user.email_verified_at) {
      return Response.json({ error: "email_not_verified", message: "Confirme seu e-mail pelo link que enviamos antes de entrar." }, { status: 403 });
    }
    if (!user.password_hash) return Response.json({ error: "password_not_configured", message: "Esta conta ainda não possui uma senha de acesso." }, { status: 409 });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return Response.json({ error: "invalid_credentials", message: "E-mail ou senha inválidos." }, { status: 401 });

    const session = await createSession(env.DB, user.id);
    return Response.json(
      { ok: true, user: { id: user.id, name: user.name || "", email: user.email || "" } },
      { headers: { "Set-Cookie": session.cookie, "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("LiDire login error:", error);
    return Response.json({ error: "login_unavailable", message: "Não foi possível concluir o login agora. Tente novamente." }, { status: 503 });
  }
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);

  if (token) {
    await ensureAuthTables(env.DB);
    const tokenHash = await sha256(token);
    await env.DB
      .prepare("DELETE FROM user_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
      }
    }
  );
}


async function ensureEmailVerificationTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at)`).run();
}

async function sendEmailVerification(env, { db, userId, to, name, origin }) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("email_provider_not_configured");
  const recipient = normalizeEmail(to);
  if (!isValidEmail(recipient) || /[^\x00-\x7F]/.test(recipient)) {
    throw new Error("email_recipient_invalid");
  }
  const from = String(env.RESEND_FROM_EMAIL || "LiDire <recuperacao@lidire.com>").trim();
  if (/[^\x00-\x7F]/.test(from)) throw new Error("email_sender_non_ascii");
  await ensureAuthTables(db);
  await ensureEmailVerificationTable(db);

  // Um reenvio invalida links antigos que ainda não foram usados.
  await db.prepare(`DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL`).bind(userId).run();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(`INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt).run();

  const verifyUrl = `${origin}/api/email/verify?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name || "");
  const safeUrl = escapeHtml(verifyUrl);
  const greeting = safeName ? `Olá, ${safeName}!` : "Olá!";
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f5fb;padding:28px 14px;color:#202641">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:30px">
        <div style="text-align:center;margin-bottom:24px"><img src="${escapeHtml(`${origin}/logo-lidire-oficial.png`)}" alt="LiDire" width="150" style="display:block;width:150px;max-width:70%;height:auto;margin:0 auto 10px;border:0;outline:none;text-decoration:none"><div style="color:#68708a;font-size:16px">Seu Copiloto para a Vida</div></div>
        <p style="font-size:16px;line-height:1.6">${greeting}</p>
        <p style="font-size:16px;line-height:1.6">Confirme seu endereço de e-mail para ativar seu cadastro na LiDire.</p>
        <p style="text-align:center;margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#6d4aff;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Confirmar meu e-mail</a></p>
        <p style="font-size:13px;line-height:1.6;color:#697188">Este link expira em 24 horas e pode ser usado uma única vez.</p>
        <p style="font-size:13px;line-height:1.6;color:#697188">Se você não criou uma conta na LiDire, ignore esta mensagem.</p>
        <div style="margin-top:20px;padding:14px;background:#f5f6fb;border-radius:10px"><p style="font-size:12px;color:#697188">Se o botão não funcionar, copie este endereço para o navegador:</p><p style="font-size:12px;word-break:break-all">${safeUrl}</p></div>
      </div>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [recipient], subject: "Confirme seu e-mail — LiDire", html })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("LiDire verification email failed:", response.status, data?.message || data?.name || "unknown_error");
    throw new Error("email_send_failed");
  }
  return data;
}

async function resendEmailVerification(request, env, requestUrl) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return Response.json({ error: "invalid_email", message: "Informe um e-mail válido." }, { status: 400 });
  await ensureAuthTables(env.DB);
  await ensureEmailVerificationTable(env.DB);
  const user = await env.DB.prepare(`SELECT id, name, email, email_verified_at, email_verification_required FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(email).first();
  // Resposta genérica para não revelar se o e-mail está cadastrado.
  if (user && Number(user.email_verification_required || 0) === 1 && !user.email_verified_at) {
    try {
      await sendEmailVerification(env, { db: env.DB, userId: user.id, to: user.email, name: user.name, origin: requestUrl.origin });
    } catch (error) {
      console.error("LiDire resend verification failed:", String(error?.message || error));
      return Response.json({ error: "email_send_failed", message: "Não foi possível enviar o e-mail agora. Tente novamente mais tarde." }, { status: 503 });
    }
  }
  return Response.json({ ok: true, message: "Se houver um cadastro pendente para esse endereço, enviaremos um novo link de confirmação." }, { headers: { "Cache-Control": "no-store" } });
}

async function verifyEmail(request, env, url) {
  await ensureAuthTables(env.DB);
  await ensureEmailVerificationTable(env.DB);
  const token = String(url.searchParams.get("token") || "");
  const origin = url.origin;
  const page = (title, message, success = false) => new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — LiDire</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#080d25;font-family:Arial,sans-serif;color:#202641;padding:20px;box-sizing:border-box"><main style="max-width:480px;width:100%;box-sizing:border-box;background:white;border-radius:20px;padding:30px;text-align:center"><div style="font-size:30px;font-weight:800;color:#6d4aff">LiDire</div><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(message)}</p><a href="${origin}/" style="display:inline-block;margin-top:12px;padding:13px 20px;border-radius:12px;background:#6d4aff;color:white;text-decoration:none;font-weight:bold">Ir para a LiDire</a></main></body></html>`, { status: success ? 200 : 400, headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });
  if (!token || token.length > 500) return page("Link inválido", "Solicite um novo e-mail de confirmação.");
  const tokenHash = await sha256(token);
  const record = await env.DB.prepare(`SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ? LIMIT 1`).bind(tokenHash).first();
  if (!record || record.used_at || !record.expires_at || new Date(record.expires_at).getTime() <= Date.now()) {
    return page("Link expirado ou inválido", "Volte à LiDire e solicite um novo link de confirmação.");
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET email_verified_at = ?, email_verification_required = 0, updated_at = ? WHERE id = ?`).bind(now, now, record.user_id),
    env.DB.prepare(`UPDATE email_verification_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`).bind(now, record.id)
  ]);
  return page("E-mail confirmado!", "Seu endereço foi confirmado. Agora você já pode entrar na sua conta LiDire.", true);
}

async function ensurePasswordResetTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at)`).run();
}


async function sendPasswordResetEmail(env, { to, name, resetUrl }) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("email_provider_not_configured");

  const from = String(env.RESEND_FROM_EMAIL || "LiDire <onboarding@resend.dev>").trim();
  const safeName = escapeHtml(name || "");
  const safeUrl = escapeHtml(resetUrl);
  const publicBase = new URL(resetUrl).origin;
  const greeting = safeName ? `Olá, ${safeName}!` : "Olá!";
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070C22;color:#172033;padding:32px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;">
        <div style="text-align:center;margin:0 0 24px;">
          <a href="${escapeHtml(publicBase)}" style="display:inline-block;text-decoration:none;">
            <img src="${escapeHtml(publicBase)}/logo-lidire-oficial.png" alt="LiDire" width="72" height="72" style="display:block;width:72px;height:72px;margin:0 auto 10px;border:0;outline:none;text-decoration:none;">
          </a>
          <div style="font-size:28px;line-height:1;font-weight:800;color:#171d3d;">LiDire</div>
        </div>
        <p style="font-size:16px;line-height:1.6;">${greeting}</p>
        <p style="font-size:16px;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta LiDire.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${safeUrl}" style="display:inline-block;background:#6d4aff;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Criar nova senha</a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#5d6678;">Este link é válido por 30 minutos e pode ser usado uma única vez.</p>
        <p style="font-size:13px;line-height:1.6;color:#5d6678;">Se você não solicitou a alteração, ignore este e-mail.</p>
        <div style="margin-top:24px;padding:16px;background:#f5f6fb;border-radius:12px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#7a8497;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#536078;word-break:break-all;">${safeUrl}</p>
        </div>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Redefinição de senha — LiDire",
      html
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("LiDire password reset email failed:", response.status, data?.message || data?.name || "unknown_error");
    throw new Error("email_send_failed");
  }
  return data;
}

async function passwordChangeChallenge(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error:"unauthorized", message:"Sua sessão expirou. Entre novamente." }, {status:401});
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1").bind(user.id).first();
  const parts = String(row?.password_hash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return Response.json({error:"password_not_configured",message:"A senha desta conta precisa ser configurada novamente."},{status:409});
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1 || !parts[2]) return Response.json({error:"password_not_configured",message:"A senha desta conta precisa ser configurada novamente."},{status:409});
  const nonceBytes = new Uint8Array(32); crypto.getRandomValues(nonceBytes);
  const challenge = encodeLoginChallenge({userId:user.id, nonce:bytesToBase64Url(nonceBytes), issuedAt:Date.now()});
  return Response.json({ok:true, challenge, salt:parts[2], iterations},{headers:{"Cache-Control":"no-store, private"}});
}

async function passwordChange(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({error:"unauthorized",message:"Sua sessão expirou. Entre novamente."},{status:401});
  const body = await readJson(request);
  const challenge = decodeLoginChallenge(body.challenge);
  const issuedAt = Number(challenge?.issuedAt || 0);
  if (!challenge || challenge.userId !== user.id || !issuedAt || Math.abs(Date.now()-issuedAt)>120000) return Response.json({error:"invalid_challenge",message:"A solicitação expirou. Tente novamente."},{status:401});
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1").bind(user.id).first();
  const parts = String(row?.password_hash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return Response.json({error:"password_not_configured",message:"A senha desta conta precisa ser configurada novamente."},{status:409});
  const expectedDerived = base64UrlToBytes(parts[3]);
  const expectedProof = await hmacSha256(expectedDerived, body.challenge);
  const suppliedProof = base64UrlToBytes(body.proof);
  if (!constantTimeEqual(expectedProof, suppliedProof)) return Response.json({error:"invalid_credentials",message:"A senha atual está incorreta."},{status:401});
  const newPasswordHash = String(body.newPasswordHash || "");
  const newParts = newPasswordHash.split("$");
  if (newParts.length !== 4 || newParts[0] !== "pbkdf2" || Number(newParts[1]) !== PASSWORD_ITERATIONS || !/^[A-Za-z0-9_-]+$/.test(newParts[2]) || !/^[A-Za-z0-9_-]+$/.test(newParts[3])) return Response.json({error:"invalid_password",message:"A nova senha é inválida."},{status:400});
  if (newParts[3].length < 20) return Response.json({error:"invalid_password",message:"A nova senha é inválida."},{status:400});
  await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(newPasswordHash,new Date().toISOString(),user.id).run();
  return Response.json({ok:true,message:"Senha de cadastro alterada com sucesso."});
}

async function requestPasswordReset(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const genericMessage = "Se houver uma conta com esse e-mail, as instruções de recuperação serão enviadas.";
  if (!isValidEmail(email)) return Response.json({ ok: true, message: genericMessage });

  await ensurePasswordResetTable(env.DB);
  const user = await env.DB.prepare("SELECT id, email, name FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (!user) return Response.json({ ok: true, message: genericMessage });

  // Evita disparos repetidos muito rápidos para a mesma conta.
  const recent = await env.DB.prepare(`
    SELECT id, created_at
    FROM password_reset_tokens
    WHERE user_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first();
  if (recent?.created_at) {
    const createdMs = new Date(String(recent.created_at).replace(" ", "T") + (String(recent.created_at).endsWith("Z") ? "" : "Z")).getTime();
    if (Number.isFinite(createdMs) && Date.now() - createdMs < 60 * 1000) {
      return Response.json({ ok: true, message: genericMessage });
    }
  }

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const publicBase = String(env.LIDIRE_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "");
  const resetUrl = `${publicBase}/?redefinir=${encodeURIComponent(token)}`;

  await env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP").bind(user.id).run();
  await env.DB.prepare(`INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(id, user.id, tokenHash, expiresAt).run();

  try {
    await sendPasswordResetEmail(env, { to: user.email, name: user.name, resetUrl });
  } catch (error) {
    // O token permanece inutilizável sem o e-mail; remova-o para permitir nova tentativa.
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE id = ?").bind(id).run();
    if (error?.message === "email_provider_not_configured") {
      return Response.json({ error: "email_provider_not_configured", message: "A recuperação por e-mail ainda não foi configurada no servidor." }, { status: 503 });
    }
    return Response.json({ error: "email_send_failed", message: "Não foi possível enviar o e-mail de recuperação agora. Tente novamente em instantes." }, { status: 503 });
  }

  return Response.json({ ok: true, message: genericMessage });
}

async function completePasswordReset(request, env) {
  const body = await readJson(request);
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!token || password.length < 8) {
    return Response.json({ error: "invalid_reset", message: "Token ou senha inválidos." }, { status: 400 });
  }

  await ensurePasswordResetTable(env.DB);
  const tokenHash = await sha256(token);
  const reset = await env.DB.prepare(`
    SELECT id, user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ? LIMIT 1
  `).bind(tokenHash).first();

  if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "invalid_reset", message: "O link de recuperação é inválido ou expirou." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(passwordHash, now, reset.user_id),
    env.DB.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").bind(now, reset.id),
    env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(reset.user_id)
  ]);

  return Response.json({ ok: true, message: "Senha redefinida com sucesso. Entre novamente na sua conta." });
}

async function ensureAppLockTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_lock_settings (
      user_id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
}

async function getAppLockSettings(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureAppLockTable(env.DB);
  const row = await env.DB.prepare(`SELECT enabled FROM app_lock_settings WHERE user_id = ? LIMIT 1`).bind(user.id).first();
  return Response.json({
    ok: true,
    configured: !!row,
    enabled: !!Number(row?.enabled || 0)
  }, { headers: { "Cache-Control": "no-store, private" } });
}

async function updateAppLockSettings(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureAppLockTable(env.DB);

  const body = await readJson(request);
  const enabled = body.enabled !== false;
  const newSecret = String(body.secret || "").trim();
  const currentSecret = String(body.currentSecret || "").trim();
  const existing = await env.DB.prepare(`SELECT secret_hash, enabled FROM app_lock_settings WHERE user_id = ? LIMIT 1`).bind(user.id).first();

  if (existing && currentSecret) {
    const valid = await verifyPassword(currentSecret, existing.secret_hash);
    if (!valid) return Response.json({ error: "invalid_pin", message: "PIN ou senha atual incorreto." }, { status: 401 });
  }

  if (!enabled) {
    if (existing && !currentSecret) {
      return Response.json({ error: "current_pin_required", message: "Informe o PIN ou senha atual para desativar o bloqueio." }, { status: 400 });
    }
    if (existing) {
      await env.DB.prepare(`UPDATE app_lock_settings SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).bind(user.id).run();
    }
    return Response.json({ ok: true, configured: !!existing, enabled: false });
  }

  if (!existing && !newSecret) {
    return Response.json({ error: "secret_required", message: "Informe um PIN ou senha para ativar o bloqueio." }, { status: 400 });
  }
  if (newSecret && (newSecret.length < 4 || newSecret.length > 64)) {
    return Response.json({ error: "invalid_pin", message: "Use um PIN ou senha com 4 a 64 caracteres." }, { status: 400 });
  }

  if (existing && !currentSecret && newSecret) {
    return Response.json({ error: "current_pin_required", message: "Informe o PIN ou senha atual para alterar o bloqueio." }, { status: 400 });
  }

  const secretHash = newSecret ? await hashPassword(newSecret) : existing.secret_hash;
  if (existing) {
    await env.DB.prepare(`UPDATE app_lock_settings SET secret_hash = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).bind(secretHash, user.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO app_lock_settings (user_id, secret_hash, enabled) VALUES (?, ?, 1)`).bind(user.id, secretHash).run();
  }

  return Response.json({ ok: true, configured: true, enabled: true });
}

async function verifyAppLock(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
  await ensureAppLockTable(env.DB);
  const body = await readJson(request);
  const secret = String(body.secret || "").trim();
  const row = await env.DB.prepare(`SELECT secret_hash, enabled FROM app_lock_settings WHERE user_id = ? LIMIT 1`).bind(user.id).first();
  if (!row || !Number(row.enabled)) return Response.json({ ok: true, unlocked: true });
  if (!secret) return Response.json({ error: "invalid_pin", message: "Informe seu PIN ou senha." }, { status: 400 });
  const valid = await verifyPassword(secret, row.secret_hash);
  if (!valid) return Response.json({ error: "invalid_pin", message: "PIN ou senha incorreto." }, { status: 401 });
  return Response.json({ ok: true, unlocked: true });
}

async function updateProfile(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return Response.json(
      { error: "unauthorized", message: "Sua sessão expirou. Entre novamente." },
      { status: 401 }
    );
  }

  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email || user.email);
  const age = body.age == null || body.age === "" ? null : Number(body.age);
  const birthDate = body.birth_date == null || body.birth_date === "" ? null : String(body.birth_date).trim();
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)) || birthDate > new Date().toISOString().slice(0,10))) {
    return Response.json({ error: "invalid_birth_date", message: "Informe uma data de nascimento válida." }, { status: 400 });
  }
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const profilePhoto = body.profile_photo == null ? null : String(body.profile_photo || "");

  if (name.length < 2) {
    return Response.json(
      { error: "invalid_name", message: "Informe seu nome." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return Response.json(
      { error: "invalid_email", message: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  if (age !== null && (!Number.isFinite(age) || age < 0 || age > 150)) {
    return Response.json(
      { error: "invalid_age", message: "Informe uma idade válida." },
      { status: 400 }
    );
  }

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1")
    .bind(email, user.id)
    .first();

  if (existing) {
    return Response.json(
      { error: "email_exists", message: "Já existe uma conta com este e-mail." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?")
      .bind(name, email, now, user.id),
    env.DB.prepare(`
      UPDATE profiles
      SET name = ?, email = ?, age = ?, birth_date = COALESCE(?, birth_date), phone = ?, address = ?, profile_photo = COALESCE(?, profile_photo), updated_at = ?
      WHERE user_id = ?
    `).bind(name, email, age, birthDate, phone, address, profilePhoto, now, user.id)
  ]);

  return Response.json({ ok: true, user: await getUserById(env.DB, user.id), database: true });
}



async function exportPersonalData(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return Response.json({ error: "unauthorized", message: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const userId = String(user.id);
  let clientPayload = {};
  if (request.method === "POST") {
    try { clientPayload = await request.json(); } catch (_) { clientPayload = {}; }
  }

  // Lista explícita para evitar introspecção de sqlite_master/PRAGMA, que pode
  // ser recusada pelo D1 em algumas configurações. Cada tabela é consultada
  // somente por user_id e falhas em tabelas opcionais não interrompem a exportação.
  const personalTables = [
    "profiles", "appointments", "tasks", "shopping_lists", "foods", "diets",
    "meals", "nutrition_settings", "hydration_settings", "hydration_records",
    "financial_transactions", "spending_limits", "financial_months", "studies",
    "study_plans", "study_performance", "workouts", "workout_performance",
    "goals", "menstrual_cycles", "menstrual_daily_records", "menstrual_phases",
    "appointment_travel", "travel_suggestions", "ai_actions", "ai_context",
    "ai_confirmations", "ai_conversations", "ai_settings", "app_settings",
    "recipes", "notes", "note_tags", "note_exports", "ai_imports",
    "data_exports", "shopping_items", "commitments", "hydration",
    "study_activities", "fixed_expenses", "objectives", "transactions"
  ];

  const excludedColumns = /password|pass_hash|secret|token|session|credential|api_key|private_key|authorization|cookie/i;
  const exportData = {
    format: "LiDire-personal-data-export",
    version: 1,
    exported_at: new Date().toISOString(),
    account: { email: user.email || null },
    notice: "Inclui apenas registros associados diretamente à conta autenticada. Dados compartilhados ou pertencentes a outros membros da família, credenciais, tokens e sessões são excluídos.",
    data: {},
    skipped_tables: []
  };

  const ownershipColumns = ["user_id", "owner_user_id", "created_by_user_id", "account_id", "profile_id"];
  const tablesWithRows = new Set();
  for (const table of personalTables) {
    // Tentar as colunas de titularidade conhecidas, pois versões antigas e novas
    // do banco não usam necessariamente o mesmo nome. Nunca exportar uma tabela
    // pessoal sem conseguir filtrar pelo titular autenticado.
    let foundOwnershipColumn = false;
    for (const ownerColumn of ownershipColumns) {
      try {
        const result = await env.DB.prepare(
          `SELECT * FROM "${table}" WHERE "${ownerColumn}" = ?`
        ).bind(userId).all();
        foundOwnershipColumn = true;
        const rows = (result.results || []).map(item => {
          const safe = {};
          for (const [key, value] of Object.entries(item)) {
            if (excludedColumns.test(key)) continue;
            safe[key] = value;
          }
          return safe;
        });
        if (rows.length) {
          exportData.data[table] = rows;
          tablesWithRows.add(table);
        }
        break;
      } catch (error) {
        // Erro de coluna inexistente: tenta o próximo nome de titularidade.
        // Se a tabela não existir, todas as tentativas falharão e ela será marcada.
      }
    }
    if (!foundOwnershipColumn) {
      exportData.skipped_tables.push(table);
      console.warn("Exportação: tabela indisponível ou sem coluna de titularidade", table);
    }
  }

  // Perfil pode usar id como chave em instalações antigas em vez de user_id.
  if (!exportData.data.profiles) {
    try {
      const result = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(userId).all();
      const rows = (result.results || []).map(item => {
        const safe = {};
        for (const [key, value] of Object.entries(item)) {
          if (!excludedColumns.test(key)) safe[key] = value;
        }
        return safe;
      });
      if (rows.length) exportData.data.profiles = rows;
    } catch (error) {
      console.warn("Exportação: perfil alternativo indisponível", error?.message || error);
    }
  }

  // A maior parte dos módulos do MVP mantém os registros no estado local do navegador,
  // não em tabelas D1. Recebemos esses registros da sessão autenticada para que a cópia
  // inclua os dados que a interface realmente usa. Dados de família e notificações
  // familiares ficam deliberadamente fora da exportação.
  const localData = clientPayload && clientPayload.data && typeof clientPayload.data === "object" ? clientPayload.data : {};
  const localCategories = [
    ["compromissos", "appointments"], ["tarefas", "tasks"], ["compras", "shopping_items"],
    ["estudos", "study_activities"], ["studyPlans", "study_plans"], ["treinos", "workouts"],
    ["hidratacao", "hydration"], ["alimentacao", "meals"], ["alimentos", "foods"],
    ["objetivos", "objectives"], ["dietas", "diets"], ["receitas", "recipes"],
    ["lembretes", "reminders"], ["financas", "transactions"], ["anotacoes", "notes"]
  ];
  for (const [localKey, exportKey] of localCategories) {
    const records = localData[localKey];
    if (!Array.isArray(records) || !records.length) continue;
    const normalized = records.filter(item => item && typeof item === "object").map(item => {
      const safe = {};
      for (const [key, value] of Object.entries(item)) {
        if (excludedColumns.test(key)) continue;
        if (["family", "familia", "familyMembers", "sharedWith", "permissions"].includes(key)) continue;
        safe[key] = value;
      }
      return safe;
    });
    if (!normalized.length) continue;
    // Os dados locais são a fonte principal desses módulos; evita duplicar a mesma
    // categoria somando registros locais com tabelas legadas do servidor.
    exportData.data[exportKey] = normalized;
    exportData.skipped_tables = exportData.skipped_tables.filter(table => table !== exportKey);
  }
  const localCycle = localData.cicloMenstrual;
  if (localCycle && typeof localCycle === "object") {
    const periods = Array.isArray(localCycle.periodos) ? localCycle.periodos : [];
    const symptoms = Array.isArray(localCycle.sintomas) ? localCycle.sintomas : [];
    if (periods.length) exportData.data.menstrual_cycles = periods.filter(x => x && typeof x === "object");
    if (symptoms.length) exportData.data.menstrual_daily_records = symptoms.filter(x => x && typeof x === "object");
  }
  const localProfile = clientPayload && clientPayload.profile && typeof clientPayload.profile === "object" ? clientPayload.profile : {};
  const authenticatedEmail = String(user.email || "").trim().toLowerCase();
  const submittedEmail = String(localProfile.email || "").trim().toLowerCase();
  if (submittedEmail && authenticatedEmail && submittedEmail === authenticatedEmail) {
    const existing = (exportData.data.profiles || [])[0] || {};
    const profile = { ...localProfile, ...existing };
    for (const key of Object.keys(profile)) if (excludedColumns.test(key)) delete profile[key];
    exportData.data.profiles = [profile];
  }

  const escHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const tableLabels = {
    profiles:"Perfil pessoal", appointments:"Compromissos", tasks:"Tarefas",
    shopping_lists:"Listas de compras", shopping_items:"Itens de compras", reminders:"Lembretes",
    foods:"Alimentos", diets:"Planos alimentares", meals:"Alimentação", study_plans:"Planos de estudo",
    nutrition_settings:"Preferências de alimentação", hydration_settings:"Preferências de hidratação",
    hydration_records:"Registros de hidratação", hydration:"Registros de hidratação",
    financial_transactions:"Movimentações financeiras", transactions:"Movimentações financeiras",
    spending_limits:"Limites de gastos", financial_months:"Resumo financeiro",
    fixed_expenses:"Despesas fixas", studies:"Estudos", study_plans:"Planos de estudo",
    study_performance:"Desempenho nos estudos", study_activities:"Atividades de estudo",
    workouts:"Treinos", workout_performance:"Desempenho nos treinos", goals:"Objetivos",
    objectives:"Objetivos", menstrual_cycles:"Ciclos menstruais",
    menstrual_daily_records:"Registros diários do ciclo", menstrual_phases:"Fases do ciclo",
    appointment_travel:"Informações de deslocamento", travel_suggestions:"Sugestões de deslocamento",
    ai_actions:"Ações da assistente", ai_context:"Contexto pessoal da assistente",
    ai_confirmations:"Confirmações da assistente", ai_conversations:"Conversas com a assistente",
    ai_settings:"Configurações da assistente", app_settings:"Preferências do aplicativo",
    recipes:"Receitas", notes:"Notas pessoais", note_tags:"Etiquetas das notas",
    note_exports:"Exportações de notas", ai_imports:"Importações da assistente",
    data_exports:"Histórico de exportações", commitments:"Compromissos"
  };
  const fieldLabels = {
    user_id:"Usuário", id:"Código interno", name:"Nome", email:"E-mail", age:"Idade", birth_date:"Data de nascimento",
    phone:"Telefone", address:"Endereço", profile_photo:"Foto de perfil", currency:"Moeda",
    created_at:"Criado em", updated_at:"Atualizado em", start_date:"Data de início", createdAt:"Criado em", updatedAt:"Atualizado em", dueDate:"Prazo", startDate:"Data de início", endDate:"Data de término",
    end_date:"Data de término", date:"Data", time:"Horário", title:"Título", description:"Descrição",
    notes:"Observações", status:"Situação", done:"Concluído", completed:"Concluído",
    amount:"Valor", type:"Tipo", category:"Categoria", quantity:"Quantidade", unit:"Unidade",
    item:"Item", average_cycle_days:"Duração média do ciclo", average_menstruation_days:"Duração média da menstruação",
    flow:"Fluxo", duration:"Duração", duration_minutes:"Duração (minutos)", calories:"Calorias", water_ml:"Quantidade de água (ml)", distance:"Distância", average_pace:"Ritmo médio", pace:"Ritmo", heart_rate:"Frequência cardíaca", notes_text:"Observações", birth_date:"Data de nascimento",
    goal:"Meta", target:"Objetivo", subject:"Matéria", topic:"Assunto", duration_minutes:"Duração (minutos)",
    due_date:"Prazo", location:"Local", travel_mode:"Meio de transporte", start_time:"Horário de início",
    end_time:"Horário de término", frequency:"Frequência", value:"Valor", month:"Mês",
    year:"Ano", description_text:"Descrição"
  };
  const humanize = key => fieldLabels[key] || key.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/_/g," ").replace(/\b\w/g, c=>c.toUpperCase());
  const prettyValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "não consta";
    if (typeof value === "boolean" || key === "done" || key === "completed") {
      return value === true || value === 1 || value === "1" ? "Sim" : "Não";
    }
    if (typeof value === "object") return escHtml(JSON.stringify(value));
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && /date|data|birth|nascimento|start|end|due|prazo|created|updated/i.test(key)) {
      const [yy,mm,dd] = raw.split("-"); return `${dd}/${mm}/${yy}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || /^\d{4}-\d{2}-\d{2} \d{2}:/.test(raw)) {
      const d = new Date(raw.replace(" ", "T"));
      if (!Number.isNaN(d.getTime())) return escHtml(d.toLocaleString("pt-BR", { timeZone:"America/Sao_Paulo" }));
    }
    const translations = {Moderado:"Moderado",Moderate:"Moderado",Light:"Leve",Heavy:"Intenso",Completed:"Concluído",Pending:"Pendente",Active:"Ativo",Inactive:"Inativo",Running:"Corrida",Walking:"Caminhada",Cycling:"Ciclismo"};
    return escHtml(translations[raw] || raw);
  };
  const sections = Object.entries(exportData.data).map(([table, rows]) => {
    const label = tableLabels[table] || humanize(table);
    const cards = rows.map((row, index) => {
      const fields = Object.entries(row).filter(([key]) =>
        !excludedColumns.test(key) && !["id","user_id","owner_user_id","group_id","family_group_id"].includes(key)
      );
      return `<article class="record"><h3>${escHtml(label)}${rows.length > 1 ? ` · ${index+1}` : ""}</h3><dl>${fields.map(([key,value])=>`<div class="field"><dt>${escHtml(humanize(key))}</dt><dd>${prettyValue(key,value)}</dd></div>`).join("") || `<p>Não há detalhes adicionais para exibir.</p>`}</dl></article>`;
    }).join("");
    return `<section><h2>${escHtml(label)} <span>${rows.length} ${rows.length===1?"registro":"registros"}</span></h2>${cards}</section>`;
  }).join("");
  const exportedAt = new Date(exportData.exported_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const email = escHtml(user.email || exportData.data.profiles?.[0]?.email || "Não informado");
  const partialNotice = exportData.skipped_tables.length
    ? `<aside class="notice warning"><strong>Atenção:</strong> algumas categorias não puderam ser incluídas nesta exportação. Revise a configuração do aplicativo antes de considerar esta cópia completa.</aside>`
    : "";
  const htmlReport = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meus dados pessoais — LiDire</title><style>
  :root{color-scheme:light;--ink:#202236;--muted:#666b80;--line:#e7e8ef;--accent:#6652c7;--soft:#f6f5fc}
  *{box-sizing:border-box}body{margin:0;background:#f5f6fa;color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
  main{max-width:900px;margin:0 auto;padding:28px 18px 50px}.hero{background:linear-gradient(135deg,#29264a,#6652c7);color:white;padding:28px;border-radius:22px;margin-bottom:20px}
  .brand{display:flex;align-items:center;gap:12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.95}.brand img{width:54px;height:54px;object-fit:contain;background:#fff;border-radius:12px;padding:5px}.hero h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:10px 0}.hero p{margin:6px 0;color:#f0edff}
  .summary,.record,section{background:white;border:1px solid var(--line);border-radius:16px}.summary{padding:18px 20px;margin-bottom:22px;display:grid;gap:7px}.summary span{color:var(--muted)}
  section{padding:18px;margin:18px 0}section h2{font-size:20px;margin:0 0 14px;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}section h2 span{font-size:12px;font-weight:600;color:var(--accent);background:var(--soft);padding:5px 9px;border-radius:999px}
  .record{padding:15px;margin:10px 0}.record h3{font-size:15px;margin:0 0 12px;color:var(--accent)}dl{margin:0}.field{display:grid;grid-template-columns:minmax(120px, .8fr) minmax(0,1.5fr);gap:12px;padding:8px 0;border-top:1px solid #f0f0f5;overflow-wrap:anywhere}.field dt{color:var(--muted)}.field dd{margin:0;font-weight:500}
  .notice{padding:14px 16px;border-radius:12px;margin:14px 0}.warning{background:#fff7e8;border:1px solid #f4d9a3;color:#674a16}footer{text-align:center;color:var(--muted);font-size:12px;padding:20px}
  @media(max-width:560px){main{padding:14px 10px 30px}.hero{padding:22px}.field{grid-template-columns:1fr;gap:2px}.record{padding:12px}}
  .toolbar{display:flex;justify-content:flex-end;margin:0 0 14px}.print-button{border:0;border-radius:10px;background:var(--accent);color:white;font-weight:700;padding:12px 16px;cursor:pointer;font-size:14px}
  @page{size:A4;margin:14mm}
  @media print{body{background:white}main{padding:0;max-width:none}.hero{background:#eee;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}.hero p{color:#333}.toolbar{display:none}section,.summary,.record{break-inside:avoid;box-shadow:none}section{break-inside:auto}}
  </style></head><body><main><div class="toolbar"><button class="print-button" onclick="window.print()">Salvar / Exportar como PDF</button></div><header class="hero"><div class="brand"><img src="https://app.lidire.com/logo-lidire-oficial.png" alt="Logo oficial LiDire"><span>LiDire · Seu Copiloto para a Vida</span></div><h1>Meus dados pessoais</h1><p>Uma cópia organizada das informações pessoais encontradas na sua conta.</p></header>
  <div class="summary"><strong>Conta: ${email}</strong><span>Arquivo gerado em ${escHtml(exportedAt)}</span><span>Esta cópia exclui identificadores técnicos internos, credenciais, tokens e sessões.</span></div>
  ${partialNotice}${sections || "<section><h2>Nenhum registro pessoal encontrado</h2><p>Não foram encontrados registros disponíveis para exportação.</p></section>"}
  <footer>Documento pessoal gerado pela LiDire. Guarde-o em local seguro.</footer></main></body></html>`;
  const filename = `lidire-meus-dados-${new Date().toISOString().slice(0, 10)}.html`;
  return new Response(htmlReport, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function deleteAccount(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return Response.json({ error: "unauthorized", message: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  }

  const userId = user.id;
  const tables = await env.DB.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      AND (sql LIKE '%user_id%' OR sql LIKE '%owner_user_id%')
  `).all();

  const statements = [];

  // Child records that reference family_groups through group_id.
  try {
    const family = await env.DB.prepare(`SELECT id FROM family_groups WHERE owner_user_id = ?`).bind(userId).all();
    for (const row of (family.results || [])) {
      statements.push(env.DB.prepare(`DELETE FROM family_members WHERE group_id = ?`).bind(row.id));
    }
    if ((family.results || []).length) {
      statements.push(env.DB.prepare(`DELETE FROM family_groups WHERE owner_user_id = ?`).bind(userId));
    }
  } catch (_) {}

  for (const table of (tables.results || [])) {
    const name = String(table.name || "");
    if (!name || ["users", "user_sessions"].includes(name) || name === "family_groups" || name === "family_members") continue;
    const sql = String(table.sql || "");
    if (/\buser_id\b/i.test(sql)) {
      statements.push(env.DB.prepare(`DELETE FROM "${name.replaceAll('"','""')}" WHERE user_id = ?`).bind(userId));
    } else if (/\bowner_user_id\b/i.test(sql)) {
      statements.push(env.DB.prepare(`DELETE FROM "${name.replaceAll('"','""')}" WHERE owner_user_id = ?`).bind(userId));
    }
  }

  statements.push(env.DB.prepare("DELETE FROM profiles WHERE user_id = ?").bind(userId));
  statements.push(env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(userId));
  statements.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId));

  await env.DB.batch(statements);

  return new Response(JSON.stringify({ ok: true, message: "Conta e dados excluídos." }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
    }
  });
}

async function getSessionUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  await ensureAuthTables(env.DB);

  const tokenHash = await sha256(token);
  const session = await env.DB
    .prepare(`
      SELECT
        s.user_id,
        s.expires_at,
        u.id,
        u.name,
        u.email
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `)
    .bind(tokenHash)
    .first();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB
      .prepare("DELETE FROM user_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
    return null;
  }

  await env.DB
    .prepare("UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
    .bind(tokenHash)
    .run();

  return getUserById(env.DB, session.user_id);
}

async function getUserById(db, userId) {
  return db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      p.age,
      p.birth_date,
      p.phone,
      p.address,
      p.profile_photo AS profile_photo
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `).bind(userId).first();
}

async function createSession(db, userId) {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256(token);

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await db.prepare(`
    INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, tokenHash, expiresAt).run();

  return {
    token,
    cookie: `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`
  };
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return [
    "pbkdf2",
    PASSWORD_ITERATIONS,
    bytesToBase64Url(salt),
    bytesToBase64Url(new Uint8Array(bits))
  ].join("$");
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  const salt = base64UrlToBytes(parts[2]);
  const expected = base64UrlToBytes(parts[3]);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    expected.length * 8
  );

  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) {
      return parts.join("=");
    }
  }

  return null;
}
