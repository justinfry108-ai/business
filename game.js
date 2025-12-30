// game.js

// ---------- GAME STATE ----------

const gameState = {
  day: 1,
  cash: 1000,
  inventory: [],
  currentDeals: [],
  marketTrends: {}, // category -> multiplier (0.7 - 1.4 range)
  totalProfit: 0,
  itemsSold: 0,
  log: [],
  nextItemId: 1,
  nextDealId: 1
};

const CATEGORIES = ["Mower", "Power Tool", "ATV/Quad", "Generator", "Truck Part"];

const BASE_ITEMS = [
  { name: "Husqvarna Riding Mower", category: "Mower", baseValue: 900 },
  { name: "Craftsman Push Mower", category: "Mower", baseValue: 250 },
  { name: "Stihl Chainsaw", category: "Power Tool", baseValue: 400 },
  { name: "DeWalt Impact Driver Set", category: "Power Tool", baseValue: 300 },
  { name: "Yamaha 350 ATV", category: "ATV/Quad", baseValue: 2200 },
  { name: "Chinese Pit Bike", category: "ATV/Quad", baseValue: 450 },
  { name: "Honda EU Generator", category: "Generator", baseValue: 1200 },
  { name: "Harbor Freight Generator", category: "Generator", baseValue: 450 },
  { name: "Diesel Injector Set", category: "Truck Part", baseValue: 900 },
  { name: "Class 8 Truck Tires (Set)", category: "Truck Part", baseValue: 1600 }
];

const CONDITIONS = [
  { label: "Blown Up", multiplier: 0.15 },
  { label: "Rough", multiplier: 0.35 },
  { label: "Used", multiplier: 0.6 },
  { label: "Clean", multiplier: 0.9 },
  { label: "Mint", multiplier: 1.1 }
];

// RNG helpers
function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ---------- MARKET & DEAL GENERATION ----------

function initMarketTrends() {
  CATEGORIES.forEach(cat => {
    gameState.marketTrends[cat] = randBetween(0.85, 1.15);
  });
}

function updateMarketTrends() {
  CATEGORIES.forEach(cat => {
    const current = gameState.marketTrends[cat] ?? 1;
    // small daily random walk
    const change = randBetween(-0.05, 0.05);
    let next = current + change;
    next = clamp(next, 0.7, 1.4);
    gameState.marketTrends[cat] = next;
  });
}

function generateDeal() {
  const baseItem = choice(BASE_ITEMS);
  const cond = choice(CONDITIONS);
  const rawMarketValue = baseItem.baseValue * cond.multiplier;
  const marketMultiplier = gameState.marketTrends[baseItem.category] ?? 1;
  const trueMarketValue = rawMarketValue * marketMultiplier;

  // Asking price: may be good, neutral, or bad
  // 40% good (below value), 40% neutral, 20% overpriced
  const roll = Math.random();
  let askingMultiplier;
  if (roll < 0.4) askingMultiplier = randBetween(0.7, 0.95);
  else if (roll < 0.8) askingMultiplier = randBetween(0.95, 1.1);
  else askingMultiplier = randBetween(1.1, 1.35);

  const askingPrice = Math.round(trueMarketValue * askingMultiplier);

  // What the player sees as "estimated market value" (noisy)
  const estNoise = randBetween(-0.18, 0.18);
  const estMarketValue = Math.round(trueMarketValue * (1 + estNoise));

  return {
    id: gameState.nextDealId++,
    name: baseItem.name,
    category: baseItem.category,
    condition: cond.label,
    baseValue: baseItem.baseValue,
    askingPrice,
    estMarketValue,
    trueMarketValue: Math.round(trueMarketValue)
  };
}

function generateDailyDeals() {
  const numDeals = Math.floor(randBetween(2, 4)); // 2 or 3 deals/day
  const deals = [];
  for (let i = 0; i < numDeals; i++) {
    deals.push(generateDeal());
  }
  gameState.currentDeals = deals;
}

// ---------- INVENTORY & SALES ----------

function buyDeal(dealId) {
  const deal = gameState.currentDeals.find(d => d.id === dealId);
  if (!deal) return;
  if (gameState.cash < deal.askingPrice) {
    addLog("You don't have enough cash for that deal.");
    return;
  }

  gameState.cash -= deal.askingPrice;

  const invItem = {
    id: gameState.nextItemId++,
    name: deal.name,
    category: deal.category,
    condition: deal.condition,
    buyPrice: deal.askingPrice,
    currentValue: deal.trueMarketValue,
    baseValue: deal.baseValue,
    daysHeld: 0
  };

  gameState.inventory.push(invItem);
  addLog(
    `Bought ${deal.name} (${deal.condition}) for $${deal.askingPrice}.`
  );

  // Remove deal from offers
  gameState.currentDeals = gameState.currentDeals.filter(d => d.id !== dealId);
  renderAll();
}

function simulateInventoryDay() {
  const soldToday = [];

  for (const item of gameState.inventory) {
    item.daysHeld += 1;

    // Adjust current value based on market & condition aging
    const marketMult = gameState.marketTrends[item.category] ?? 1;
    const agePenaltyFactor = 1 - Math.min(item.daysHeld * 0.005, 0.25); // up to -25%
    const noise = randBetween(-0.06, 0.06);

    const newVal =
      item.baseValue *
      agePenaltyFactor *
      marketMult *
      (item.condition === "Blown Up" ? 0.3 :
        item.condition === "Rough" ? 0.45 :
          item.condition === "Used" ? 0.7 :
            item.condition === "Clean" ? 1 :
              1.1) *
      (1 + noise);

    item.currentValue = Math.max(20, Math.round(newVal));

    // Chance of sale: more profit margin = easier sale
    const margin = item.currentValue - item.buyPrice;
    const baseChance = 0.1;
    const marginBoost = clamp(margin / 800, -0.12, 0.35);
    const daysBoost = clamp(item.daysHeld * 0.01, 0, 0.25);
    const saleChance = clamp(baseChance + marginBoost + daysBoost, 0.06, 0.7);

    if (Math.random() < saleChance) {
      soldToday.push(item);
    }
  }

  for (const sold of soldToday) {
    sellInventoryItem(sold);
  }
}

function sellInventoryItem(item) {
  const profit = item.currentValue - item.buyPrice;
  gameState.cash += item.currentValue;
  gameState.totalProfit += profit;
  gameState.itemsSold += 1;
  addLog(
    `SOLD ${item.name} for $${item.currentValue} (bought $${item.buyPrice}, profit $${profit}).`
  );
  gameState.inventory = gameState.inventory.filter(i => i.id !== item.id);
}

// ---------- LOGGING ----------

function addLog(message) {
  gameState.log.unshift({
    day: gameState.day,
    message
  });
  if (gameState.log.length > 80) {
    gameState.log.length = 80;
  }
}

// ---------- DAY / TICK ----------

function nextDay() {
  gameState.day += 1;

  // First, update market
  updateMarketTrends();

  // Then, simulate inventory value & possible sales
  simulateInventoryDay();

  // Generate new deals
  generateDailyDeals();

  addLog("A new day begins. Fresh deals have appeared.");
  renderAll();
}

function resetGame() {
  gameState.day = 1;
  gameState.cash = 1000;
  gameState.inventory = [];
  gameState.currentDeals = [];
  gameState.marketTrends = {};
  gameState.totalProfit = 0;
  gameState.itemsSold = 0;
  gameState.log = [];
  gameState.nextItemId = 1;
  gameState.nextDealId = 1;

  initMarketTrends();
  generateDailyDeals();
  addLog("New game started. You begin with $1000 to flip your way up.");
  renderAll();
}

// ---------- UI RENDERING ----------

let dom = {};

function cacheDom() {
  dom.day = document.getElementById("day");
  dom.cash = document.getElementById("cash");
  dom.dealsContainer = document.getElementById("deals-container");
  dom.inventoryBody = document.getElementById("inventory-body");
  dom.logList = document.getElementById("log-list");
  dom.marketTrends = document.getElementById("market-trends");
  dom.statsTotalProfit = document.getElementById("stats-total-profit");
  dom.statsItemsSold = document.getElementById("stats-items-sold");
  dom.statsAvgProfit = document.getElementById("stats-avg-profit");
  dom.nextDayBtn = document.getElementById("next-day-btn");
  dom.resetBtn = document.getElementById("reset-btn");
}

function renderAll() {
  renderTopStats();
  renderDeals();
  renderInventory();
  renderMarketTrends();
  renderStats();
  renderLog();
}

function renderTopStats() {
  dom.day.textContent = gameState.day;
  dom.cash.textContent = gameState.cash.toLocaleString();
}

function renderDeals() {
  const container = dom.dealsContainer;
  container.innerHTML = "";

  if (gameState.currentDeals.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No more deals available today. Advance to the next day.";
    container.appendChild(p);
    return;
  }

  gameState.currentDeals.forEach(deal => {
    const card = document.createElement("div");
    card.className = "deal-card";

    const mainDiv = document.createElement("div");
    mainDiv.className = "deal-main";
    mainDiv.innerHTML = `
      <strong>${deal.name}</strong><br />
      <span>${deal.category} • ${deal.condition}</span>
    `;

    const pricesDiv = document.createElement("div");
    pricesDiv.className = "deal-prices";

    const diff = deal.estMarketValue - deal.askingPrice;
    let diffClass = "price-neutral";
    if (diff > deal.estMarketValue * 0.15) diffClass = "price-good";
    else if (diff < -deal.estMarketValue * 0.1) diffClass = "price-bad";

    pricesDiv.innerHTML = `
      Asking: $${deal.askingPrice.toLocaleString()}<br />
      Est. Market: $${deal.estMarketValue.toLocaleString()}<br />
      <span class="${diffClass}">
        Est. margin: ${diff >= 0 ? "+" : ""}$${diff.toLocaleString()}
      </span>
    `;

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "deal-actions";

    const buyBtn = document.createElement("button");
    buyBtn.textContent = "Buy";
    buyBtn.onclick = () => buyDeal(deal.id);
    if (deal.askingPrice > gameState.cash) {
      buyBtn.disabled = true;
      buyBtn.title = "Not enough cash";
    }

    const passBtn = document.createElement("button");
    passBtn.textContent = "Pass";
    passBtn.classList.add("secondary");
    passBtn.onclick = () => {
      gameState.currentDeals = gameState.currentDeals.filter(d => d.id !== deal.id);
      addLog(`You passed on ${deal.name}.`);
      renderAll();
    };

    actionsDiv.appendChild(buyBtn);
    actionsDiv.appendChild(passBtn);

    card.appendChild(mainDiv);
    card.appendChild(pricesDiv);
    card.appendChild(actionsDiv);

    container.appendChild(card);
  });
}

function renderInventory() {
  const tbody = dom.inventoryBody;
  tbody.innerHTML = "";

  if (gameState.inventory.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "You don't own anything yet. Grab some deals.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  gameState.inventory.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td>${item.condition}</td>
      <td>$${item.buyPrice.toLocaleString()}</td>
      <td>$${item.currentValue.toLocaleString()}</td>
      <td>${item.daysHeld}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderMarketTrends() {
  const container = dom.marketTrends;
  container.innerHTML = "";

  CATEGORIES.forEach(cat => {
    const mult = gameState.marketTrends[cat] ?? 1;
    const chip = document.createElement("div");
    chip.className = "market-chip";

    if (mult > 1.05) chip.classList.add("market-up");
    else if (mult < 0.95) chip.classList.add("market-down");

    const pct = ((mult - 1) * 100).toFixed(1);
    chip.textContent = `${cat}: ${pct > 0 ? "+" : ""}${pct}% vs baseline`;
    container.appendChild(chip);
  });
}

function renderStats() {
  dom.statsTotalProfit.textContent = gameState.totalProfit.toLocaleString();
  dom.statsItemsSold.textContent = gameState.itemsSold.toString();
  const avg =
    gameState.itemsSold === 0
      ? 0
      : Math.round(gameState.totalProfit / gameState.itemsSold);
  dom.statsAvgProfit.textContent = avg.toLocaleString();
}

function renderLog() {
  const ul = dom.logList;
  ul.innerHTML = "";

  if (gameState.log.length === 0) return;

  gameState.log.forEach(entry => {
    const li = document.createElement("li");
    const daySpan = document.createElement("span");
    daySpan.className = "log-day";
    daySpan.textContent = `D${entry.day}:`;
    li.appendChild(daySpan);
    li.appendChild(document.createTextNode(" " + entry.message));
    ul.appendChild(li);
  });
}

// ---------- INIT ----------

function attachEvents() {
  dom.nextDayBtn.addEventListener("click", nextDay);
  dom.resetBtn.addEventListener("click", resetGame);
}

function init() {
  cacheDom();
  attachEvents();
  resetGame(); // also sets up market & deals
}

window.addEventListener("DOMContentLoaded", init);
