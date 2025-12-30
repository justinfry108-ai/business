// game.js – Flip Tycoon v2

// ---------- CONSTANTS & HELPERS ----------

const CATEGORIES = ["Mower", "Power Tool", "ATV/Quad", "Generator", "Truck Part"];

const BASE_ITEMS = [
  { name: "Husqvarna Riding Mower", category: "Mower", baseValue: 900 },
  { name: "Craftsman Push Mower", category: "Mower", baseValue: 250 },
  { name: "Honda HRX Mower", category: "Mower", baseValue: 650 },
  { name: "Stihl Chainsaw", category: "Power Tool", baseValue: 400 },
  { name: "Milwaukee M18 Drill Set", category: "Power Tool", baseValue: 380 },
  { name: "DeWalt Impact Driver Set", category: "Power Tool", baseValue: 300 },
  { name: "Yamaha 350 ATV", category: "ATV/Quad", baseValue: 2200 },
  { name: "Chinese Pit Bike", category: "ATV/Quad", baseValue: 450 },
  { name: "Polaris Sportsman 500", category: "ATV/Quad", baseValue: 3200 },
  { name: "Honda EU Generator", category: "Generator", baseValue: 1200 },
  { name: "Harbor Freight Generator", category: "Generator", baseValue: 450 },
  { name: "Diesel Injector Set", category: "Truck Part", baseValue: 900 },
  { name: "Class 8 Truck Tires (Set)", category: "Truck Part", baseValue: 1600 },
  { name: "5th Wheel Plate Assembly", category: "Truck Part", baseValue: 1300 }
];

// Condition levels (can be repaired up toward Mint)
const CONDITIONS = [
  { label: "Blown Up", multiplier: 0.18 },
  { label: "Rough", multiplier: 0.35 },
  { label: "Used", multiplier: 0.6 },
  { label: "Clean", multiplier: 0.9 },
  { label: "Mint", multiplier: 1.1 }
];

const BASE_DAILY_EXPENSE = 25; // garage, listing fees, etc.
const PER_ITEM_EXPENSE = 5;    // storage per unit

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------- GAME STATE ----------

const gameState = {
  day: 1,
  cash: 1000,
  inventory: [],
  currentDeals: [],
  marketTrends: {}, // category -> multiplier
  totalProfit: 0,
  itemsSold: 0,
  log: [],
  nextItemId: 1,
  nextDealId: 1
};

// ---------- MARKET & DEALS ----------

function initMarketTrends() {
  CATEGORIES.forEach(cat => {
    gameState.marketTrends[cat] = randBetween(0.85, 1.15);
  });
}

function updateMarketTrends() {
  CATEGORIES.forEach(cat => {
    const current = gameState.marketTrends[cat] ?? 1;
    const change = randBetween(-0.05, 0.05); // small daily drift
    let next = current + change;
    next = clamp(next, 0.7, 1.5);
    gameState.marketTrends[cat] = next;
  });
}

function generateDeal() {
  const baseItem = choice(BASE_ITEMS);
  const condIndex = Math.floor(Math.random() * CONDITIONS.length);
  const cond = CONDITIONS[condIndex];

  const marketMult = gameState.marketTrends[baseItem.category] ?? 1;
  const trueMarketValue = baseItem.baseValue * cond.multiplier * marketMult;

  // Asking price distribution: 40% good, 40% fair, 20% bad
  const roll = Math.random();
  let askingMult;
  if (roll < 0.4) askingMult = randBetween(0.7, 0.95);
  else if (roll < 0.8) askingMult = randBetween(0.95, 1.1);
  else askingMult = randBetween(1.1, 1.35);

  const askingPrice = Math.round(trueMarketValue * askingMult);

  // What player "thinks" market value is (noisy)
  const estNoise = randBetween(-0.18, 0.18);
  const estMarketValue = Math.round(trueMarketValue * (1 + estNoise));

  return {
    id: gameState.nextDealId++,
    name: baseItem.name,
    category: baseItem.category,
    baseValue: baseItem.baseValue,
    conditionIndex: condIndex,
    condition: cond.label,
    askingPrice,
    trueMarketValue: Math.round(trueMarketValue),
    estMarketValue
  };
}

function generateDailyDeals() {
  const numDeals = Math.floor(randBetween(3, 5)); // 3–4 deals/day
  const deals = [];
  for (let i = 0; i < numDeals; i++) {
    deals.push(generateDeal());
  }
  gameState.currentDeals = deals;
}

// ---------- INVENTORY, REPAIR & SALES ----------

function repairCostForItem(item) {
  // Flat-ish cost per step, scaled by item value
  return Math.round(item.baseValue * 0.2);
}

function canRepairItem(item) {
  return item.conditionIndex < CONDITIONS.length - 1;
}

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
    baseValue: deal.baseValue,
    conditionIndex: deal.conditionIndex,
    condition: deal.condition,
    buyPrice: deal.askingPrice,
    currentValue: deal.trueMarketValue,
    daysHeld: 0,
    repairs: 0
  };

  gameState.inventory.push(invItem);

  addLog(
    `Bought ${invItem.name} (${invItem.condition}) for $${invItem.buyPrice}.`
  );

  gameState.currentDeals = gameState.currentDeals.filter(d => d.id !== dealId);
  renderAll();
}

function updateInventoryForNewDay() {
  for (const item of gameState.inventory) {
    item.daysHeld += 1;

    const marketMult = gameState.marketTrends[item.category] ?? 1;
    const condMult = CONDITIONS[item.conditionIndex].multiplier;

    // Age penalty over time so items slowly soften in value
    const agePenalty = 1 - Math.min(item.daysHeld * 0.004, 0.2);
    const noise = 1 + randBetween(-0.05, 0.05);

    let newVal = item.baseValue * condMult * marketMult * agePenalty * noise;
    item.currentValue = Math.max(20, Math.round(newVal));
  }
}

function sellItemById(itemId) {
  const item = gameState.inventory.find(i => i.id === itemId);
  if (!item) return;

  sellItem(item, null, false);
  renderAll();
}

function sellItem(item, overridePrice = null, fromEvent = false) {
  const salePrice = overridePrice ?? item.currentValue;
  const profit = salePrice - item.buyPrice;

  gameState.cash += salePrice;
  gameState.totalProfit += profit;
  gameState.itemsSold += 1;

  addLog(
    `SOLD ${item.name} for $${salePrice} (bought $${item.buyPrice}, profit $${profit})${fromEvent ? " [special buyer]" : ""
    }.`
  );

  gameState.inventory = gameState.inventory.filter(i => i.id !== item.id);
}

function repairItemById(itemId) {
  const item = gameState.inventory.find(i => i.id === itemId);
  if (!item) return;

  if (!canRepairItem(item)) {
    addLog(`${item.name} is already in its best condition.`);
    return;
  }

  const cost = repairCostForItem(item);
  if (gameState.cash < cost) {
    addLog(`Not enough cash to repair ${item.name}. Need $${cost}.`);
    return;
  }

  gameState.cash -= cost;
  item.conditionIndex += 1;
  item.condition = CONDITIONS[item.conditionIndex].label;
  item.repairs += 1;

  // Refresh value immediately after repair
  const marketMult = gameState.marketTrends[item.category] ?? 1;
  const condMult = CONDITIONS[item.conditionIndex].multiplier;
  item.currentValue = Math.round(item.baseValue * condMult * marketMult);

  addLog(
    `Repaired ${item.name} to ${item.condition} for $${cost}.`
  );

  renderAll();
}

// ---------- RANDOM EVENTS ----------

function maybeTriggerRandomEvent() {
  const roll = Math.random();
  if (roll > 0.55) {
    // ~45% of days have an event
    return;
  }

  const eventPool = [eventHotCategory, eventTheft, eventSpecialBuyer];
  const ev = choice(eventPool);
  ev();
}

function eventHotCategory() {
  const cat = choice(CATEGORIES);
  const bump = randBetween(0.12, 0.25);
  gameState.marketTrends[cat] = clamp(
    (gameState.marketTrends[cat] ?? 1) + bump,
    0.8,
    1.7
  );

  addLog(
    `🔥 Hot market! Demand for ${cat}s spikes (+${(bump * 100).toFixed(
      0
    )}% today).`
  );
}

function eventTheft() {
  if (gameState.inventory.length === 0) {
    addLog("Quiet day. Nothing crazy happened.");
    return;
  }

  const item = choice(gameState.inventory);
  gameState.inventory = gameState.inventory.filter(i => i.id !== item.id);

  addLog(
    `💀 Bad luck – ${item.name} was stolen from your yard. You lose the item (paid $${item.buyPrice}).`
  );
}

function eventSpecialBuyer() {
  if (gameState.inventory.length === 0) {
    addLog("A serious buyer called, but you had nothing to sell.");
    return;
  }

  const item = choice(gameState.inventory);
  const offerMult = randBetween(0.9, 1.25);
  const offer = Math.round(item.currentValue * offerMult);

  sellItem(item, offer, true);
}

// ---------- LOGGING ----------

function addLog(message) {
  gameState.log.unshift({
    day: gameState.day,
    message
  });
  if (gameState.log.length > 100) {
    gameState.log.length = 100;
  }
}

// ---------- DAY / TICK ----------

function nextDay() {
  gameState.day += 1;

  // Expense hit
  const expense =
    BASE_DAILY_EXPENSE + PER_ITEM_EXPENSE * gameState.inventory.length;
  gameState.cash -= expense;
  addLog(`Paid $${expense} in storage/fees for the day.`);

  if (gameState.cash < 0) {
    addLog("⚠️ You're in the red. One bad streak and you're cooked.");
  }

  // Market & inventory updates
  updateMarketTrends();
  updateInventoryForNewDay();

  // Random event (hot category, theft, special buyer)
  maybeTriggerRandomEvent();

  // New deals for the day
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
      gameState.currentDeals = gameState.currentDeals.filter(
        d => d.id !== deal.id
      );
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
    td.colSpan = 7;
    td.textContent =
      "You don't own anything yet. Grab some deals and start flipping.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  gameState.inventory.forEach(item => {
    const tr = document.createElement("tr");

    const rowHtml = `
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td>${item.condition}</td>
      <td>$${item.buyPrice.toLocaleString()}</td>
      <td>$${item.currentValue.toLocaleString()}</td>
      <td>${item.daysHeld}</td>
    `;
    tr.innerHTML = rowHtml;

    const actionsTd = document.createElement("td");
    actionsTd.className = "inventory-actions";

    const sellBtn = document.createElement("button");
    sellBtn.textContent = "Sell";
    sellBtn.onclick = () => sellItemById(item.id);
    actionsTd.appendChild(sellBtn);

    const repairBtn = document.createElement("button");
    if (canRepairItem(item)) {
      const cost = repairCostForItem(item);
      repairBtn.textContent = `Repair ($${cost})`;
      repairBtn.classList.add("secondary");
      repairBtn.onclick = () => repairItemById(item.id);
    } else {
      repairBtn.textContent = "Max Cond.";
      repairBtn.disabled = true;
      repairBtn.classList.add("secondary");
    }
    actionsTd.appendChild(repairBtn);

    tr.appendChild(actionsTd);
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
  resetGame();
}

window.addEventListener("DOMContentLoaded", init);
