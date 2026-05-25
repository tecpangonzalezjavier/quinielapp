import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "cambia-este-token";
const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const FOOTBALL_DATA_COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || "WC";
const FOOTBALL_DATA_SEASON = process.env.FOOTBALL_DATA_SEASON || "2026";
const RESULT_SYNC_INTERVAL_MINUTES = Number(process.env.RESULT_SYNC_INTERVAL_MINUTES || 45);
const AUTO_RESULT_SYNC = process.env.AUTO_RESULT_SYNC !== "false";
const AUTO_FIXTURE_SYNC = process.env.AUTO_FIXTURE_SYNC === "true";
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "quiniela.db.json");
const SEED_PATH = join(DATA_DIR, "matches.seed.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();
let syncInProgress = false;

async function ensureDatabase() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await stat(DB_PATH);
  } catch {
    const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
    await writeFile(
      DB_PATH,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          participants: [],
          predictions: {},
          results: {},
          sync: {
            provider: "football-data.org",
            lastRunAt: null,
            lastSuccessAt: null,
            lastError: null,
            updatedMatches: 0,
            fixturesLastSuccessAt: null,
            fixturesLastError: null,
            fixturesUpdatedMatches: 0
          },
          matches: seed.matches
        },
        null,
        2
      )
    );
  }
}

async function readDb() {
  await ensureDatabase();
  return JSON.parse(await readFile(DB_PATH, "utf8"));
}

async function writeDb(db) {
  writeQueue = writeQueue.then(() =>
    writeFile(DB_PATH, JSON.stringify({ ...db, updatedAt: new Date().toISOString() }, null, 2))
  );
  return writeQueue;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("JSON invalido");
    error.status = 400;
    throw error;
  }
}

function publicParticipant(participant) {
  return {
    id: participant.id,
    name: participant.name,
    createdAt: participant.createdAt
  };
}

function isLocked(match) {
  return Date.now() >= new Date(match.startsAt).getTime();
}

function calculateStandings(db) {
  const rows = db.participants.map((participant) => {
    const picks = db.predictions[participant.id] || {};
    let score = 0;
    let exact = 0;
    let pending = 0;

    for (const match of db.matches) {
      const result = db.results[match.id];
      const pick = picks[match.id];
      if (!result) {
        pending += pick ? 1 : 0;
        continue;
      }
      if (pick && pick.outcome === result.outcome) {
        score += 1;
        exact += 1;
      }
    }

    return {
      participant: publicParticipant(participant),
      score,
      exact,
      pending,
      updatedAt: participant.updatedAt || participant.createdAt
    };
  });

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.exact !== a.exact) return b.exact - a.exact;
    return a.participant.name.localeCompare(b.participant.name, "es");
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function appState(db, participantId = null) {
  const participant = db.participants.find((item) => item.id === participantId);
  const predictions = participant ? db.predictions[participant.id] || {} : {};
  return {
    participant: participant ? publicParticipant(participant) : null,
    matches: db.matches.map((match) => ({ ...match, locked: isLocked(match) })),
    predictions,
    results: db.results,
    standings: calculateStandings(db),
    sync: {
      enabled: Boolean(FOOTBALL_DATA_TOKEN),
      provider: "football-data.org",
      lastRunAt: db.sync?.lastRunAt || null,
      lastSuccessAt: db.sync?.lastSuccessAt || null,
      lastError: db.sync?.lastError || null,
      updatedMatches: db.sync?.updatedMatches || 0,
      fixturesLastSuccessAt: db.sync?.fixturesLastSuccessAt || null,
      fixturesLastError: db.sync?.fixturesLastError || null,
      fixturesUpdatedMatches: db.sync?.fixturesUpdatedMatches || 0
    },
    maxParticipants: 50,
    accessCodeRequired: Boolean(ACCESS_CODE)
  };
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(cf|fc|sc|afc|team|equipo)\b/g, "")
    .trim();
}

function apiOutcome(match) {
  const home = match.score?.fullTime?.home;
  const away = match.score?.fullTime?.away;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function sameCalendarDay(a, b) {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function findLocalMatch(localMatches, apiMatch) {
  const externalId = String(apiMatch.id);
  const direct = localMatches.find((match) => String(match.externalId || "") === externalId);
  if (direct) return direct;

  const apiHome = normalizeTeamName(apiMatch.homeTeam?.name || apiMatch.homeTeam?.shortName);
  const apiAway = normalizeTeamName(apiMatch.awayTeam?.name || apiMatch.awayTeam?.shortName);
  if (!apiHome || !apiAway) return null;

  return localMatches.find((match) => {
    const localHome = normalizeTeamName(match.home);
    const localAway = normalizeTeamName(match.away);
    return localHome === apiHome && localAway === apiAway && sameCalendarDay(match.startsAt, apiMatch.utcDate);
  });
}

async function fetchFootballDataMatches() {
  if (!FOOTBALL_DATA_TOKEN) {
    throw new Error("Falta configurar FOOTBALL_DATA_TOKEN.");
  }

  const url = new URL(`https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION}/matches`);
  url.searchParams.set("season", FOOTBALL_DATA_SEASON);
  url.searchParams.set("stage", "GROUP_STAGE");

  const response = await fetch(url, {
    headers: { "X-Auth-Token": FOOTBALL_DATA_TOKEN }
  });

  if (!response.ok) {
    throw new Error(`football-data.org respondio ${response.status}.`);
  }

  return response.json();
}

function formatProviderGroup(value) {
  return String(value || "GROUP_STAGE")
    .replace(/^GROUP_/, "Grupo ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerMatchToLocalMatch(apiMatch, existingMatch = null) {
  return {
    id: existingMatch?.id || `fd-${apiMatch.id}`,
    externalId: String(apiMatch.id),
    group: formatProviderGroup(apiMatch.group),
    home: apiMatch.homeTeam?.name || apiMatch.homeTeam?.shortName || "Por definir",
    away: apiMatch.awayTeam?.name || apiMatch.awayTeam?.shortName || "Por definir",
    startsAt: apiMatch.utcDate,
    venue: apiMatch.venue || "Por definir"
  };
}

async function syncFixturesFromProvider() {
  const db = await readDb();
  db.sync ||= { provider: "football-data.org" };

  try {
    const payload = await fetchFootballDataMatches();
    const apiMatches = (payload.matches || []).filter((match) => match.stage === "GROUP_STAGE");
    const importedMatches = apiMatches
      .map((apiMatch) => {
        const existing = findLocalMatch(db.matches, apiMatch);
        return providerMatchToLocalMatch(apiMatch, existing);
      })
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

    if (importedMatches.length !== 72) {
      throw new Error(`La API devolvio ${importedMatches.length} partidos de fase de grupos; esperaba 72.`);
    }

    db.matches = importedMatches;
    db.sync.fixturesLastSuccessAt = new Date().toISOString();
    db.sync.fixturesLastError = null;
    db.sync.fixturesUpdatedMatches = importedMatches.length;
    await writeDb(db);
    return { importedMatches: importedMatches.length };
  } catch (error) {
    db.sync.fixturesLastError = error.message;
    await writeDb(db);
    throw error;
  }
}

async function syncResultsFromProvider() {
  if (syncInProgress) return { skipped: true, reason: "Ya hay una sincronizacion corriendo." };
  syncInProgress = true;

  try {
    const db = await readDb();
    db.sync ||= { provider: "football-data.org" };
    db.sync.lastRunAt = new Date().toISOString();
    db.sync.lastError = null;

    const payload = await fetchFootballDataMatches();
    const finishedMatches = (payload.matches || []).filter((match) => match.status === "FINISHED");
    let updatedMatches = 0;

    for (const apiMatch of finishedMatches) {
      const localMatch = findLocalMatch(db.matches, apiMatch);
      const outcome = apiOutcome(apiMatch);
      if (!localMatch || !outcome) continue;

      const previous = db.results[localMatch.id];
      const next = {
        outcome,
        homeScore: apiMatch.score.fullTime.home,
        awayScore: apiMatch.score.fullTime.away,
        provider: "football-data.org",
        providerMatchId: apiMatch.id,
        updatedAt: new Date().toISOString()
      };

      if (
        !previous ||
        previous.outcome !== next.outcome ||
        previous.homeScore !== next.homeScore ||
        previous.awayScore !== next.awayScore
      ) {
        db.results[localMatch.id] = next;
        updatedMatches += 1;
      }
    }

    db.sync.lastSuccessAt = new Date().toISOString();
    db.sync.updatedMatches = updatedMatches;
    await writeDb(db);
    return { updatedMatches, checkedMatches: finishedMatches.length };
  } catch (error) {
    const db = await readDb();
    db.sync ||= { provider: "football-data.org" };
    db.sync.lastRunAt = new Date().toISOString();
    db.sync.lastError = error.message;
    await writeDb(db);
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function api(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/state") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const participantId = url.searchParams.get("participantId");
    const db = await readDb();
    return json(res, 200, appState(db, participantId));
  }

  if (req.method === "POST" && pathname === "/api/join") {
    const input = await bodyJson(req);
    const name = normalizeName(input.name);
    const savedId = String(input.participantId || "");
    const accessCode = String(input.accessCode || "");

    if (ACCESS_CODE && accessCode !== ACCESS_CODE) {
      return json(res, 403, { error: "Link o codigo de acceso invalido." });
    }
    if (name.length < 2) {
      return json(res, 400, { error: "Escribe un nombre de al menos 2 caracteres." });
    }

    const db = await readDb();
    let participant = db.participants.find((item) => item.id === savedId);
    if (participant) {
      participant.name = name;
      participant.updatedAt = new Date().toISOString();
    } else {
      const duplicate = db.participants.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        participant = duplicate;
      } else {
        if (db.participants.length >= 50) {
          return json(res, 409, { error: "La quiniela ya llego al limite de 50 participantes." });
        }
        participant = { id: randomUUID(), name, createdAt: new Date().toISOString() };
        db.participants.push(participant);
        db.predictions[participant.id] = {};
      }
    }

    await writeDb(db);
    return json(res, 200, appState(db, participant.id));
  }

  if (req.method === "POST" && pathname === "/api/predictions") {
    const input = await bodyJson(req);
    const participantId = String(input.participantId || "");
    const matchId = String(input.matchId || "");
    const outcome = String(input.outcome || "");

    if (!["home", "draw", "away"].includes(outcome)) {
      return json(res, 400, { error: "Prediccion invalida." });
    }

    const db = await readDb();
    const participant = db.participants.find((item) => item.id === participantId);
    const match = db.matches.find((item) => item.id === matchId);

    if (!participant) return json(res, 404, { error: "Participante no encontrado." });
    if (!match) return json(res, 404, { error: "Partido no encontrado." });
    if (isLocked(match)) return json(res, 423, { error: "Este partido ya inicio y esta bloqueado." });

    db.predictions[participant.id] ||= {};
    db.predictions[participant.id][match.id] = {
      outcome,
      updatedAt: new Date().toISOString()
    };
    participant.updatedAt = new Date().toISOString();

    await writeDb(db);
    return json(res, 200, appState(db, participant.id));
  }

  if (req.method === "POST" && pathname === "/api/admin/results") {
    const input = await bodyJson(req);
    if (String(input.adminToken || "") !== ADMIN_TOKEN) {
      return json(res, 403, { error: "Token admin invalido." });
    }
    if (!["home", "draw", "away", ""].includes(String(input.outcome ?? ""))) {
      return json(res, 400, { error: "Resultado invalido." });
    }

    const db = await readDb();
    const match = db.matches.find((item) => item.id === String(input.matchId || ""));
    if (!match) return json(res, 404, { error: "Partido no encontrado." });

    if (input.outcome === "") {
      delete db.results[match.id];
    } else {
      db.results[match.id] = {
        outcome: input.outcome,
        provider: "manual",
        updatedAt: new Date().toISOString()
      };
    }

    await writeDb(db);
    return json(res, 200, appState(db));
  }

  if (req.method === "POST" && pathname === "/api/admin/sync-results") {
    const input = await bodyJson(req);
    if (String(input.adminToken || "") !== ADMIN_TOKEN) {
      return json(res, 403, { error: "Token admin invalido." });
    }

    const summary = await syncResultsFromProvider();
    const db = await readDb();
    return json(res, 200, { ...appState(db), syncSummary: summary });
  }

  if (req.method === "POST" && pathname === "/api/admin/sync-fixtures") {
    const input = await bodyJson(req);
    if (String(input.adminToken || "") !== ADMIN_TOKEN) {
      return json(res, 403, { error: "Token admin invalido." });
    }

    const summary = await syncFixturesFromProvider();
    const db = await readDb();
    return json(res, 200, { ...appState(db), fixtureSyncSummary: summary });
  }

  return json(res, 404, { error: "Ruta no encontrada." });
}

async function staticFile(req, res, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    await stat(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return api(req, res, url.pathname);
    return staticFile(req, res, url.pathname);
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Error inesperado" });
  }
});

await ensureDatabase();
if (AUTO_FIXTURE_SYNC && FOOTBALL_DATA_TOKEN) {
  syncFixturesFromProvider().catch((error) => {
    console.error(`Error importando calendario: ${error.message}`);
  });
}
if (AUTO_RESULT_SYNC && FOOTBALL_DATA_TOKEN) {
  const intervalMs = Math.max(5, RESULT_SYNC_INTERVAL_MINUTES) * 60 * 1000;
  setInterval(() => {
    syncResultsFromProvider().catch((error) => {
      console.error(`Error sincronizando resultados: ${error.message}`);
    });
  }, intervalMs);
}
server.listen(PORT, () => {
  console.log(`Quiniela Mundial lista en http://localhost:${PORT}`);
  if (FOOTBALL_DATA_TOKEN) {
    console.log(`Sincronizacion automatica activa cada ${RESULT_SYNC_INTERVAL_MINUTES} minutos.`);
  }
});
