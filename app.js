const ENVIRONMENTS = {
  development: {
    name: "Development",
    badge: "DEV",
    refreshMs: 90000,
    metalsProvider: "https://api.gold-api.com/price",
    fxProvider: "https://open.er-api.com/v6/latest/USD",
    channels: [
      { name: "Local preview", url: "http://127.0.0.1:4173/?env=development", status: "active" },
      { name: "Staging", url: "/?env=staging", status: "candidate" },
      { name: "Production", url: "/?env=production", status: "locked" }
    ]
  },
  staging: {
    name: "Staging",
    badge: "STAGE",
    refreshMs: 60000,
    metalsProvider: "https://api.gold-api.com/price",
    fxProvider: "https://open.er-api.com/v6/latest/USD",
    channels: [
      { name: "Staging", url: "/?env=staging", status: "active" },
      { name: "Production", url: "/?env=production", status: "approval" },
      { name: "Rollback", url: "/?env=development", status: "ready" }
    ]
  },
  production: {
    name: "Production",
    badge: "PROD",
    refreshMs: 30000,
    metalsProvider: "https://api.gold-api.com/price",
    fxProvider: "https://open.er-api.com/v6/latest/USD",
    channels: [
      { name: "Production", url: "/?env=production", status: "active" },
      { name: "Staging", url: "/?env=staging", status: "next" },
      { name: "Development", url: "/?env=development", status: "internal" }
    ]
  }
};

const FALLBACK_MARKET = {
  silverUsd: 31.28,
  goldUsd: 2364.4,
  usdRub: 87.92,
  usdCny: 7.26,
  source: "Fallback snapshot"
};

const state = { environment: resolveEnvironment(), timer: null, history: [] };

const els = {
  environmentSelect: document.getElementById("environmentSelect"), refreshButton: document.getElementById("refreshButton"), sourceStatus: document.getElementById("sourceStatus"), updatedAt: document.getElementById("updatedAt"), envName: document.getElementById("envName"), refreshInterval: document.getElementById("refreshInterval"), livePill: document.getElementById("livePill"), silverUsd: document.getElementById("silverUsd"), silverRub: document.getElementById("silverRub"), silverCny: document.getElementById("silverCny"), goldSilverRatio: document.getElementById("goldSilverRatio"), ratioNarrative: document.getElementById("ratioNarrative"), metricUsd: document.getElementById("metricUsd"), metricGold: document.getElementById("metricGold"), metricRub: document.getElementById("metricRub"), metricCny: document.getElementById("metricCny"), rowUsd: document.getElementById("rowUsd"), rowGold: document.getElementById("rowGold"), rowRatio: document.getElementById("rowRatio"), rowUsdRub: document.getElementById("rowUsdRub"), rowUsdCny: document.getElementById("rowUsdCny"), channelList: document.getElementById("channelList"), chart: document.getElementById("sparklineChart")
};

const ctx = els.chart.getContext("2d");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cny = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function resolveEnvironment() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("env");
  if (requested && ENVIRONMENTS[requested]) return requested;
  if (window.location.hostname.includes("staging")) return "staging";
  if (window.location.hostname && !["localhost", "127.0.0.1"].includes(window.location.hostname)) return "production";
  return "development";
}
function getConfig() { return ENVIRONMENTS[state.environment]; }

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function readMetal(payload) {
  return Number(payload?.price ?? payload?.rate ?? payload?.value);
}

async function loadMetals(config) {
  const [silverPayload, goldPayload] = await Promise.all([
    fetchJson(`${config.metalsProvider}/XAG`),
    fetchJson(`${config.metalsProvider}/XAU`)
  ]);
  const silverUsd = readMetal(silverPayload);
  const goldUsd = readMetal(goldPayload);
  if (!Number.isFinite(silverUsd) || !Number.isFinite(goldUsd)) throw new Error("Metal payload shape is unsupported");
  return {
    silverUsd,
    goldUsd,
    metalUpdatedAt: silverPayload?.updatedAt ?? goldPayload?.updatedAt
  };
}

async function loadFx(config) {
  const payload = await fetchJson(config.fxProvider);
  const usdRub = Number(payload?.rates?.RUB);
  const usdCny = Number(payload?.rates?.CNY);
  if (!Number.isFinite(usdRub) || !Number.isFinite(usdCny)) throw new Error("FX payload shape is unsupported");
  return { usdRub, usdCny };
}

async function loadMarket() {
  const config = getConfig();
  els.sourceStatus.textContent = "Загрузка...";
  els.livePill.textContent = config.badge;
  els.sourceStatus.classList.remove("is-error");
  try {
    const [metals, fx] = await Promise.all([loadMetals(config), loadFx(config)]);
    return { ...metals, ...fx, source: "Live APIs" };
  } catch (error) {
    console.warn("Live market data unavailable, using fallback snapshot", error);
    els.sourceStatus.classList.add("is-error");
    return FALLBACK_MARKET;
  }
}

function deriveMetrics(market) {
  const silverRub = market.silverUsd * market.usdRub;
  const silverCny = market.silverUsd * market.usdCny;
  const goldSilverRatio = market.goldUsd / market.silverUsd;
  const silverInGold = market.silverUsd / market.goldUsd;
  return { ...market, silverRub, silverCny, goldSilverRatio, silverInGold };
}

function updateHistory(value) {
  state.history.push({ at: Date.now(), value });
  state.history = state.history.slice(-36);
}

function renderChannels() {
  const config = getConfig();
  els.channelList.innerHTML = "";
  config.channels.forEach((channel) => {
    const item = document.createElement("article");
    item.className = "channel";
    item.innerHTML = `<div><strong>${channel.name}</strong><span>${channel.url}</span></div><span class="badge">${channel.status}</span><code>${config.name.toLowerCase()}</code>`;
    els.channelList.append(item);
  });
}

function renderMarket(metrics) {
  els.sourceStatus.textContent = metrics.source;
  els.updatedAt.textContent = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(metrics.metalUpdatedAt ? new Date(metrics.metalUpdatedAt) : new Date());
  els.envName.textContent = getConfig().name;
  els.refreshInterval.textContent = `${Math.round(getConfig().refreshMs / 1000)} сек.`;
  els.silverUsd.textContent = usd.format(metrics.silverUsd);
  els.silverRub.textContent = rub.format(metrics.silverRub);
  els.silverCny.textContent = cny.format(metrics.silverCny);
  els.goldSilverRatio.textContent = decimal.format(metrics.goldSilverRatio);
  els.ratioNarrative.textContent = buildNarrative(metrics.goldSilverRatio);
  els.metricUsd.textContent = usd.format(metrics.silverUsd);
  els.metricGold.textContent = `${decimal.format(metrics.silverInGold)} oz`;
  els.metricRub.textContent = rub.format(metrics.silverRub);
  els.metricCny.textContent = cny.format(metrics.silverCny);
  els.rowUsd.textContent = usd.format(metrics.silverUsd);
  els.rowGold.textContent = usd.format(metrics.goldUsd);
  els.rowRatio.textContent = decimal.format(metrics.goldSilverRatio);
  els.rowUsdRub.textContent = decimal.format(metrics.usdRub);
  els.rowUsdCny.textContent = decimal.format(metrics.usdCny);
  updateHistory(metrics.silverUsd);
  drawSparkline();
}

function buildNarrative(ratio) {
  if (ratio >= 85) return "Серебро выглядит исторически дешевым относительно золота: рынок закладывает высокий разрыв между XAU и XAG.";
  if (ratio <= 60) return "Серебро торгуется ближе к золоту: относительная сила XAG выше обычного диапазона.";
  return "Соотношение находится в рабочем макро-диапазоне: следите за пробоем границ и динамикой USD.";
}

function drawSparkline() {
  const canvas = els.chart;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = 28;
  const values = state.history.length > 1 ? state.history.map((point) => point.value) : seedHistory();
  const min = Math.min(...values) * 0.996;
  const max = Math.max(...values) * 1.004;
  const range = Math.max(max - min, 1);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09101c";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#263449";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = padding + ((height - padding * 2) / 3) * i;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
  }
  const points = values.map((value, index) => ({ x: padding + ((width - padding * 2) / Math.max(values.length - 1, 1)) * index, y: height - padding - ((value - min) / range) * (height - padding * 2) }));
  const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
  gradient.addColorStop(0, "rgba(84, 214, 198, 0.24)");
  gradient.addColorStop(1, "rgba(84, 214, 198, 0.02)");
  ctx.beginPath();
  points.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
  ctx.lineTo(points.at(-1).x, height - padding);
  ctx.lineTo(points[0].x, height - padding);
  ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
  ctx.strokeStyle = "#54d6c6"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#8ab4ff";
  const last = points.at(-1);
  ctx.beginPath(); ctx.arc(last.x, last.y, 4.5, 0, Math.PI * 2); ctx.fill();
}

function seedHistory() {
  const latest = state.history.at(-1)?.value ?? FALLBACK_MARKET.silverUsd;
  return Array.from({ length: 18 }, (_, index) => latest + Math.sin(index / 2) * 0.18 + (index - 17) * 0.015);
}

async function refreshMarket() {
  els.refreshButton.disabled = true;
  try { renderMarket(deriveMetrics(await loadMarket())); }
  finally { els.refreshButton.disabled = false; }
}

function scheduleRefresh() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = window.setInterval(refreshMarket, getConfig().refreshMs);
}

function switchEnvironment(environment) {
  state.environment = environment;
  state.history = [];
  els.environmentSelect.value = environment;
  renderChannels();
  scheduleRefresh();
  refreshMarket();
}

els.environmentSelect.addEventListener("change", (event) => {
  const environment = event.target.value;
  const url = new URL(window.location.href);
  url.searchParams.set("env", environment);
  window.history.replaceState({}, "", url);
  switchEnvironment(environment);
});
els.refreshButton.addEventListener("click", refreshMarket);
window.addEventListener("resize", drawSparkline);
els.environmentSelect.value = state.environment;
renderChannels();
scheduleRefresh();
refreshMarket();
