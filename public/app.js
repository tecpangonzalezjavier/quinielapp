const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "quinielaParticipantId";
const linkAccessCode = new URLSearchParams(location.search).get("code") || "";
let state = null;

const outcomeLabel = {
  home: "Local",
  draw: "Empate",
  away: "Visita"
};

const countryCodes = {
  "Algeria": "dz",
  "Argentina": "ar",
  "Australia": "au",
  "Austria": "at",
  "Belgium": "be",
  "Bosnia-Herzegovina": "ba",
  "Brazil": "br",
  "Canada": "ca",
  "Cape Verde Islands": "cv",
  "Colombia": "co",
  "Congo DR": "cd",
  "Croatia": "hr",
  "CuraÃ§ao": "cw",
  "Curacao": "cw",
  "Czechia": "cz",
  "Ecuador": "ec",
  "Egypt": "eg",
  "England": "gb-eng",
  "France": "fr",
  "Germany": "de",
  "Ghana": "gh",
  "Haiti": "ht",
  "Iran": "ir",
  "Iraq": "iq",
  "Ivory Coast": "ci",
  "Japan": "jp",
  "Jordan": "jo",
  "Mexico": "mx",
  "Morocco": "ma",
  "Netherlands": "nl",
  "New Zealand": "nz",
  "Norway": "no",
  "Panama": "pa",
  "Paraguay": "py",
  "Portugal": "pt",
  "Qatar": "qa",
  "Saudi Arabia": "sa",
  "Scotland": "gb-sct",
  "Senegal": "sn",
  "South Africa": "za",
  "South Korea": "kr",
  "Spain": "es",
  "Sweden": "se",
  "Switzerland": "ch",
  "Tunisia": "tn",
  "Turkey": "tr",
  "United States": "us",
  "Uruguay": "uy",
  "Uzbekistan": "uz"
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Algo salio mal");
  return payload;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function setMessage(text = "") {
  $("#message").textContent = text;
}

async function loadState() {
  const participantId = localStorage.getItem(STORAGE_KEY) || "";
  const query = participantId ? `?participantId=${encodeURIComponent(participantId)}` : "";
  state = await request(`/api/state${query}`);
  render();
}

function render() {
  renderSession();
  renderHeroStats();
  renderPodium();
  renderStandings();
  renderMatches();
  renderAdmin();
}

function renderAfterPrediction(matchId, previousState) {
  renderHeroStats();
  renderPodium();
  renderStandings();
  renderMatchCard(matchId, previousState);
  renderAdmin();
}

function renderHeroStats() {
  const picked = Object.keys(state.predictions || {}).length;
  const total = state.matches.length;
  const finished = Object.keys(state.results || {}).length;
  $("#heroStats").innerHTML = `
    <span><strong>${total}</strong> partidos</span>
    <span><strong>${picked}</strong> picks tuyos</span>
    <span><strong>${finished}</strong> resultados</span>
  `;
}

function renderSession() {
  $("#accessField").hidden = !state.accessCodeRequired || Boolean(linkAccessCode);
  if (linkAccessCode) $("#accessInput").value = linkAccessCode;
  $("#joinPanel").classList.toggle("has-session", Boolean(state.participant));
  $("#sessionBox").innerHTML = state.participant
    ? `<strong>${escapeHtml(state.participant.name)}</strong><br><span>Sesion guardada en este navegador</span>`
    : `<span>Entra con tu nombre para jugar</span>`;
  if (state.participant) $("#nameInput").value = state.participant.name;
}

function renderPodium() {
  const podium = [$("#podium1"), $("#podium2"), $("#podium3")];
  const classes = ["gold", "silver", "bronze"];
  const labels = ["1", "2", "3"];
  const byRank = [1, 2, 3].map((rank) => state.standings.find((row) => row.rank === rank));

  podium.forEach((node, index) => {
    const row = byRank[index];
    node.innerHTML = row
      ? `<span class="podium-badge ${classes[index]}">${labels[index]}</span><strong>${escapeHtml(row.participant.name)}</strong><span>${row.score} pts · ${row.exact} aciertos</span>`
      : `<span class="podium-badge ${classes[index]}">${labels[index]}</span><strong>Sin lugar</strong><span>Esperando picks</span>`;
  });
}

function renderStandings() {
  $("#countText").textContent = `${state.standings.length}/50`;
  $("#standings").innerHTML =
    state.standings
      .map(
        (row) => `
        <article class="standing-row">
          <span class="rank">${row.rank}</span>
          <div>
            <strong>${escapeHtml(row.participant.name)}</strong><br>
            <small>${row.exact} aciertos · ${row.pending} pendientes</small>
          </div>
          <span class="score">${row.score}</span>
        </article>
      `
      )
      .join("") || `<p class="empty">Todavia no hay participantes.</p>`;
}

function renderMatches() {
  $("#matches").innerHTML = state.matches
    .map((match) => matchCardMarkup(match))
    .join("");
}

function renderMatchCard(matchId, previousState) {
  const match = state.matches.find((item) => item.id === matchId);
  const previousPick = previousState?.predictions?.[matchId]?.outcome;
  const currentPick = state.predictions?.[matchId]?.outcome;
  const existing = document.querySelector(`[data-card-match="${CSS.escape(matchId)}"]`);
  if (!match || !existing) {
    renderMatches();
    return;
  }

  existing.outerHTML = matchCardMarkup(match);
  const updated = document.querySelector(`[data-card-match="${CSS.escape(matchId)}"]`);
  updated?.classList.add("just-picked");
  if (previousPick && previousPick !== currentPick) {
    updated?.classList.add(`moved-from-${previousPick}`);
  }
  if (currentPick) {
    updated?.querySelector(`[data-outcome="${CSS.escape(currentPick)}"]`)?.classList.add("pulse-pick");
  }
}

function matchCardMarkup(match) {
  const pick = state.predictions?.[match.id]?.outcome;
  const result = state.results?.[match.id]?.outcome;
  const disabled = !state.participant || match.locked ? "disabled" : "";
  const matchStatus = match.locked ? "Bloqueado" : pick ? "Pick guardado" : "Abierto";
  return `
    <article class="match-card ${pick ? "has-pick" : ""}" data-card-match="${escapeHtml(match.id)}">
      <div class="match-head">
        <span class="group-pill">${escapeHtml(match.group)}</span>
        <span>${formatDate(match.startsAt)}</span>
        <span class="match-status ${match.locked ? "locked" : ""}">${matchStatus}</span>
      </div>
      <div class="teams">
        ${teamMarkup(match.home, "home")}
        <span class="vs">VS</span>
        ${teamMarkup(match.away, "away")}
      </div>
      <div class="venue">${escapeHtml(match.venue)}</div>
      <div class="pick-row">
        ${pickButton(match, "home", match.home, pick, result, disabled)}
        ${pickButton(match, "draw", "Empate", pick, result, disabled)}
        ${pickButton(match, "away", match.away, pick, result, disabled)}
      </div>
    </article>
  `;
}

function pickButton(match, outcome, label, pick, result, disabled) {
  const classes = ["pick"];
  if (pick === outcome) classes.push("selected");
  if (result === outcome) classes.push("result");
  const display = outcome === "draw" ? "Empate" : displayTeamName(label);
  return `<button class="${classes.join(" ")}" data-match="${match.id}" data-outcome="${outcome}" ${disabled}>
    <span>${escapeHtml(display)}</span>
    <small>${escapeHtml(outcomeLabel[outcome])}</small>
  </button>`;
}

function teamMarkup(name, side) {
  const code = countryCodes[name];
  const displayName = displayTeamName(name);
  const flag = code
    ? `<img class="flag" src="https://flagcdn.com/w80/${code}.png" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="flag fallback">${initials(displayName)}</span>`;
  return `
    <span class="team ${side}">
      ${side === "away" ? "" : flag}
      <span>${escapeHtml(displayName)}</span>
      ${side === "away" ? flag : ""}
    </span>
  `;
}

function displayTeamName(name) {
  return String(name).replace("CuraÃ§ao", "Curacao");
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderAdmin() {
  const sync = state.sync || {};
  $("#syncStatus").textContent = sync.enabled
    ? `API activa. Calendario: ${sync.fixturesLastSuccessAt ? formatDate(sync.fixturesLastSuccessAt) : "pendiente"}. Resultados: ${sync.lastSuccessAt ? formatDate(sync.lastSuccessAt) : "pendiente"}. ${sync.fixturesLastError || sync.lastError ? `Error: ${sync.fixturesLastError || sync.lastError}` : ""}`
    : "API automatica desactivada. Configura FOOTBALL_DATA_TOKEN para sincronizar resultados.";

  $("#adminMatch").innerHTML = state.matches
    .map((match) => `<option value="${match.id}">${escapeHtml(match.group)} · ${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</option>`)
    .join("");

  const selectedMatch = state.matches.find((match) => match.id === $("#adminMatch").value) || state.matches[0];
  if (!selectedMatch) return;
  $("#adminOutcome").innerHTML = `
    <option value="">Sin resultado</option>
    <option value="home">${escapeHtml(displayTeamName(selectedMatch.home))}</option>
    <option value="draw">Empate</option>
    <option value="away">${escapeHtml(displayTeamName(selectedMatch.away))}</option>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();
  try {
    state = await request("/api/join", {
      method: "POST",
      body: JSON.stringify({
        name: $("#nameInput").value,
        accessCode: linkAccessCode || $("#accessInput").value,
        participantId: localStorage.getItem(STORAGE_KEY)
      })
    });
    localStorage.setItem(STORAGE_KEY, state.participant.id);
    render();
  } catch (error) {
    setMessage(error.message);
  }
});

$("#matches").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-match]");
  if (!button) return;
  setMessage();
  const previousState = structuredClone(state);
  const card = button.closest(".match-card");
  card?.classList.add("saving-pick");
  try {
    state = await request("/api/predictions", {
      method: "POST",
      body: JSON.stringify({
        participantId: localStorage.getItem(STORAGE_KEY),
        matchId: button.dataset.match,
        outcome: button.dataset.outcome
      })
    });
    renderAfterPrediction(button.dataset.match, previousState);
  } catch (error) {
    card?.classList.remove("saving-pick");
    setMessage(error.message);
  }
});

$("#adminMatch").addEventListener("change", renderAdmin);

$("#adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();
  try {
    state = await request("/api/admin/results", {
      method: "POST",
      body: JSON.stringify({
        adminToken: $("#adminToken").value,
        matchId: $("#adminMatch").value,
        outcome: $("#adminOutcome").value
      })
    });
    render();
  } catch (error) {
    setMessage(error.message);
  }
});

$("#syncForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();
  try {
    const token = $("#syncAdminToken").value || $("#adminToken").value;
    const payload = await request("/api/admin/sync-results", {
      method: "POST",
      body: JSON.stringify({ adminToken: token })
    });
    state = payload;
    setMessage(`Sincronizacion lista: ${payload.syncSummary.updatedMatches} partido(s) actualizado(s).`);
    render();
  } catch (error) {
    setMessage(error.message);
  }
});

$("#fixtureSyncForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();
  try {
    const token = $("#fixtureSyncAdminToken").value || $("#syncAdminToken").value || $("#adminToken").value;
    const payload = await request("/api/admin/sync-fixtures", {
      method: "POST",
      body: JSON.stringify({ adminToken: token })
    });
    state = payload;
    setMessage(`Calendario importado: ${payload.fixtureSyncSummary.importedMatches} partidos.`);
    render();
  } catch (error) {
    setMessage(error.message);
  }
});

loadState().catch((error) => setMessage(error.message));
