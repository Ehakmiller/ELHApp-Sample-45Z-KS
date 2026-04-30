

  // ----------------------------
  // SETTINGS
  // ----------------------------
  
  const DATA_URL = "./static_data/LCFS/lcfs_dropdown_v2_epm_subset.json";
    console.log("✅ RUNNING CALC FILE:", window.location.href);
    console.log("✅ BUILD_STAMP:", "2026-04-29 17:07:49");
    console.log("✅ DATA_URL:", DATA_URL);
  


  // CA hubs (UP + BNSF)
  const CA_HUBS = [
    // --- UP ---
    { id: "UP_COLTON",        name: "Colton",              railroad: "UP",   lat: 34.06639, lon: -117.36472, role: "Inland Empire / transload" },
    { id: "UP_CARSON_LOMITA", name: "Carson / Lomita Rail", railroad: "UP",   lat: 33.80100, lon: -118.25500, role: "LA Basin fuel access" },

    // --- BNSF ---
    { id: "BNSF_BARSTOW", name: "Barstow Yard",          railroad: "BNSF", lat: 34.89319, lon: -117.07461, role: "Gateway classification yard" },
    { id: "BNSF_WATSON",  name: "Watson Yard (Carson)",  railroad: "BNSF", lat: 33.79928, lon: -118.25374, role: "LA Basin fuel access" },
    { id: "BNSF_HOBART",  name: "Hobart Yard",           railroad: "BNSF", lat: 34.01300, lon: -118.15300, role: "LA distribution" },
    { id: "BNSF_KAISER",  name: "Kaiser Yard (Fontana)", railroad: "BNSF", lat: 34.10000, lon: -117.43400, role: "Inland Empire" },
    { id: "BNSF_CALWA",   name: "Calwa Yard (Fresno)",   railroad: "BNSF", lat: 36.72200, lon: -119.73200, role: "Central Valley" }
  ];

const OR_PORTLAND_HUB = {
  id: "OR_PORTLAND",
  name: "Portland",
  railroad: "OR",
  lat: 45.5231,
  lon: -122.6765,
  role: "Oregon delivery hub"
};

// ----------------------------
// BOOT / DIAGNOSTICS
// ----------------------------
function bootRender(){
  // Put something visible in the selects even before JSON loads
  const plantSel = document.getElementById("plantSelect");
  if (plantSel && plantSel.options.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Loading plants…";
    plantSel.appendChild(o);
  }

  // Always render CA hubs even if plants/JSON fail
  try {
    renderHubs();
  } catch (e) {
    console.error("bootRender -> renderHubs error:", e);
  }
}

console.log("SCRIPT LOADED OK");

function computePipelineDefault(plant) {
  if (!plant) return { score: 0, applied: false, label: "All else" };

  const direct  = normUpper(plant.co2_pipeline_direct);
  const third   = normUpper(plant.co2_pipeline_3rd_party);
  const sponsor = normUpper(plant.co2_sponsor);
  const railRaw = plant.co2_rail_connect;

  const railNum =
    railRaw === null || railRaw === undefined || railRaw === ""
      ? null
      : Number(String(railRaw).replace(/,/g, "").trim());

  const hasRailConnect = Number.isFinite(railNum);

  const scs = !!plant.scs_positive;
  if (scs) return { score: 0, applied: false, label: "All else" };

  // DIRECT pipeline -> default apply 30
  if (direct.includes("DIRECT")) {
    return { score: 30, applied: true, label: "Direct" };
  }

  // Tallgrass / Trailblazer 3rd-party pipeline -> default apply 31
  const tallgrassMatch =
    (third.includes("TALL") && third.includes("GRASS")) ||
    third.includes("TALLGRASS") ||
    third.includes("TRAILBLAZER") ||
    (sponsor.includes("TALL") && sponsor.includes("GRASS")) ||
    sponsor.includes("TALLGRASS") ||
    sponsor.includes("TRAILBLAZER");

  if (tallgrassMatch) {
    return { score: 31, applied: true, label: "Trailblazer" };
  }

  // Rail-connected CO2 -> default apply 28
  if (hasRailConnect) {
    return { score: 28, applied: true, label: "Rail Connected CO2" };
  }

  return { score: 0, applied: false, label: "All else" };
}



function syncChapter2PipelineUI(){
  const cb  = document.getElementById("ch2_pipeline_apply");
  const inp = document.getElementById("ch2_pipeline_score");
  const note = document.getElementById("ccsAutoNote");
  if (!cb || !inp) return;

  if (!selectedPlant){
    cb.checked = false;
    inp.value = "0";
    inp.disabled = false;
    if (note) note.textContent = "Uses auto-defaults by plant flags";
    syncCcsDatesUI();
    sync45QValueSection();
    return;
  }

  const def = computePipelineDefault(selectedPlant);
  inp.value = String(def.score);
  cb.checked = !!def.applied;

  if (note) {
    note.textContent = def.label
      ? `Uses auto-defaults by plant flags • ${def.label}`
      : "Uses auto-defaults by plant flags";
  }

  inp.disabled = false;

  syncCcsDatesUI();
  sync45QValueSection();
}

function syncElectricityBridgeUI(){
  const cb = document.getElementById("electricity_bridge_apply");
  const inp = document.getElementById("electricity_bridge_score");
  const note = document.getElementById("electricityBridgeNote");
  if (!inp) return;

  if (!selectedPlant){
    if (cb) cb.checked = true;
    inp.value = "0";
    if (note) note.textContent = "No electrical grid designation found";
    return;
  }

  const grid = (selectedPlant.electrical_grid_designation || "").trim();
  const val = getElectricityBridgeAdj(selectedPlant);

  if (cb) cb.checked = true;
  inp.value = String(val);

  if (note){
    note.textContent = grid
      ? `Auto-set from electrical grid designation: ${grid}`
      : "No electrical grid designation found";
  }
}


  // ----------------------------
  // UTILS
  // ----------------------------
  function fmt(n, digits=2){
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toFixed(digits);
  }
  function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
  
 function toFinitePositiveNumberOrNull(x){
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return (Number.isFinite(n) && n > 0) ? n : null;
}

function roundToNearestTenthHalfUp(x){
  if (!Number.isFinite(x)) return NaN;
  return Math.round(x * 10) / 10;
}

function round45zEmissionsFactor(emissionsRate, benchmark){
  if (!Number.isFinite(emissionsRate) || !Number.isFinite(benchmark) || benchmark <= 0) return NaN;

  const rawFactor = (benchmark - emissionsRate) / benchmark;

  // credit cannot be negative
  const flooredFactor = Math.max(0, rawFactor);

  // IRS-style nearest 0.1
  return roundToNearestTenthHalfUp(flooredFactor);
}

function toFiniteNumberOrNull(x){
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
} 
  
function parseLooseNumber(x){
  if (x === null || x === undefined) return null;
  let s = String(x).trim();
  if (!s) return null;

  const low = s.toLowerCase();
  if (low === "nan" || low === "none" || low === "null" || low === "<na>" || low === "—" || low === "-") return null;

  // remove commas and pull the first numeric token (handles "120 MGY", "120.0 (est)", etc.)
  s = s.replace(/,/g, "");
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;

  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}  

function cleanKey(v){
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function getDryerText(p){
  const d = p?.dryer_types ?? p?.dryer_used ?? "";
  if (Array.isArray(d)) return d.join(" ");
  return String(d ?? "");
}

function lookupNonThermalBase(p){
  const tech = cleanKey(p?.technology);
  const dryer = cleanKey(getDryerText(p));

  // 1) exact technology + dryer match
  let match = NON_THERMAL_BASE_BY_TECH_DRYER.find(r =>
    cleanKey(r.technology) === tech &&
    r.dryer &&
    dryer.includes(cleanKey(r.dryer))
  );

  if (match) {
    return {
      base: match.base,
      source: `${match.technology} + ${match.dryer}`,
      count: match.count
    };
  }

  // 2) technology-only fallback
  const techRows = NON_THERMAL_BASE_BY_TECH_DRYER.filter(r =>
    cleanKey(r.technology) === tech
  );

  if (techRows.length){
    const totalCount = techRows.reduce((s, r) => s + r.count, 0);
    const weightedBase = techRows.reduce((s, r) => s + r.base * r.count, 0) / totalCount;

    return {
      base: weightedBase,
      source: `${p?.technology || "Technology"} average`,
      count: totalCount
    };
  }

  // 3) global fallback
  return {
    base: GLOBAL_NON_THERMAL_BASE,
    source: "global non-thermal fallback",
    count: null
  };
}

function getThermalBtuPerGal(p){
  const v =
    p?.thermal_btu_per_gal_est ??
    p?.epa_ghg_derived?.thermal_btu_per_gal_est ??
    null;

  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function proxy45zStartFromBtu(p){
  const btu = getThermalBtuPerGal(p);
  if (btu === null) return null;

  const nt = lookupNonThermalBase(p);
  const thermalCi = btu * THERMAL_CI_PER_BTU_GAL;

  return {
    value: nt.base + thermalCi,
    nonThermalBase: nt.base,
    thermalBtu: btu,
    thermalCi,
    source: nt.source,
    count: nt.count
  };
}


  // ----------------------------
// TECH SCORING (NO-LCFS PROXY)
// ----------------------------
// If no LCFS CI, start at 70 and reduce by tech score.
const DEFAULT_NO_LCFS_PROXY = 70.0;

const THERMAL_CI_PER_BTU_GAL = 0.001114; // BTU/gal → gCO2e/MJ

const NON_THERMAL_BASE_BY_TECH_DRYER = [
  { technology: "ICM", dryer: "Rotary Dryer", count: 52, base: 22.244267 },
  { technology: "Poet", dryer: "Ring Dryer", count: 23, base: 18.671043 },
  { technology: "Delta-T", dryer: "Ring Dryer", count: 9, base: 22.066911 },
  { technology: "Vogelbusch", dryer: "", count: 4, base: 22.264423 },
  { technology: "ICM", dryer: "Steam Tube Dryer", count: 2, base: 21.466744 },
  { technology: "Lurgi", dryer: "", count: 1, base: 15.363190 },
  { technology: "Wheat", dryer: "", count: 1, base: 24.841754 },
  { technology: "Lurgi", dryer: "Rotary Dryer", count: 1, base: 29.680744 }
];

const GLOBAL_NON_THERMAL_BASE = 22.0;

// ----------------------------
// UNIT CONVERSION (LCFS -> 45Z)
// ----------------------------
// LCFS uses gCO2e/MJ
// 45Z uses kgCO2e/MMBtu
// 1 MMBtu = 1055.056 MJ  =>  g/MJ * (1055.056/1000) = g/MJ * 1.055056
const MJ_PER_MMBTU = 1055.056;
const G_PER_KG = 1000.0;
const CONV_G_PER_MJ_TO_KG_PER_MMBTU = MJ_PER_MMBTU / G_PER_KG; // 1.055056
const MMBTU_PER_GAL_ETHANOL =  1;
const BASELINE_45Z_FREIGHT_MILES = 300;
const ETHANOL_LB_PER_GAL = 6.58;
const CO2_PER_ETHANOL_MASS_RATIO = 44.01 / 46.07;
const CO2_LB_PER_GAL_ETHANOL = ETHANOL_LB_PER_GAL * CO2_PER_ETHANOL_MASS_RATIO;
const LB_PER_METRIC_TON = 2204.62;
const FORTYFIVEZ_LAST_YEAR = 2029;
const CURRENT_MODEL_YEAR = new Date().getFullYear();
const FORTYFIVEQ_TERM_YEARS = 12;
const DEFAULT_DISCOUNT_RATE = 0.10;


// ✅ SET YOUR REDUCTIONS HERE (gCO2e/MJ)
// Put the exact reductions you told me last night.
const TECH_REDUCTION = {
  high_pro: -1,
  chp: 5,
  white_fox: 3,
  low_ci_corn: 7,
  wind_turbine: 5,
  dco_enhancement: 2,
  icm_p10: 8,
  waste_heat: 3,
  rng: 6
};

const GRID_BRIDGE_ADJ = {
  "CAISO": -1.0,
  "SPP": -1.0,
  "ERCOT": 0.0,
  "PJM": 0.0,
  "MISO/SPP": 0.0,
  "MISO": 1.0,
  "MISO/PJM": 1.0
};

function getElectricityBridgeAdj(plant){
  if (!plant) return 0;

  const raw = (plant.electrical_grid_designation || "").trim().toUpperCase();

  if (!raw) return 0;

  const map = {
    "CAISO": -1.0,
    "SPP": -1.0,
    "ERCOT": 0.0,
    "PJM": 0.0,
    "MISO/SPP": 0.0,
    "MISO": 1.0,
    "MISO/PJM": 1.0
  };

  return map[raw] ?? 0;
}

const TECH_FIELDS = [
  { key: "high_pro",        label: "High Pro",        fields: ["high_pro", "High Pro", "HIGH_PRO"] },
  { key: "chp",             label: "CHP",             fields: ["chp", "CHP"] },
  { key: "white_fox",       label: "White Fox",       fields: ["white_fox", "White Fox", "WHITE_FOX"] },
  { key: "dco_enhancement", label: "DCO Enhancement", fields: ["dco_enhancement", "DCO Enhancement", "DCO Enhancement\n(lb/bu)", "ICM FOT"] },
  { key: "icm_p10",         label: "ICM P10",         fields: ["icm_p10", "ICM\nP10", "ICM P10"] },
  { key: "low_ci_corn",     label: "Low CI Corn",     fields: ["low_ci_corn", "LowCICorn", "Low CI Corn"] },
  { key: "wind_turbine",    label: "Wind Turbine",    fields: ["wind_turbine", "Wind Turbine", "WIND_TURBINE"] },
  { key: "fiber_ethanol",   label: "Fiber Ethanol",   fields: ["fiber_ethanol", "FiberEthanol", "Fiber Ethanol"] },
  { key: "waste_heat",      label: "DEER Waste Heat",      fields: ["waste_heat", "Waste Heat", "WASTE_HEAT"] },
  { key: "rng",             label: "RNG",             fields: ["rng", "RNG", "Renewable Natural Gas"] },
];
   
   

function asBool(v){
  if (v === null || v === undefined) return false;

  // Native booleans
  if (v === true) return true;
  if (v === false) return false;

  // Numbers: any non-zero finite number counts as true
  if (typeof v === "number"){
    return Number.isFinite(v) && v !== 0;
  }

  const s = String(v).trim();
  if (!s) return false;

  // Treat common "empty"/negative tokens as false
  const low = s.toLowerCase();
  if (low === "0" || low === "no" || low === "false" || low === "n" || low === "none" || low === "null" || low === "<na>") {
    return false;
  }

  // Numeric-looking strings: non-zero => true
  const n = Number(low);
  if (Number.isFinite(n)) return n !== 0;

  // ✅ Key change: any other non-empty string counts as true
  // (covers "CHP", "White Fox", "ICM HI PRO", etc.)
  return true;
}

function pickFirstField(p, fields){
  for (const f of fields){
    if (!p || !Object.prototype.hasOwnProperty.call(p, f)) continue;

    const v = p[f];

    if (v === null || v === undefined || v === "") continue;

    const s = String(v).trim().toLowerCase();
    if (s === "nan" || s === "none" || s === "null" || s === "<na>" || s === "—" || s === "-") continue;

    return v;
  }
  return undefined;
}

// Returns a list of enhancements actually present on the plant,
// including their reduction values.
function getEnhancements(p){
  const out = [];
  if (!p) return out;

  // 1) Plant-flag enhancements (your existing logic)
  for (const t of TECH_FIELDS){
    const raw = pickFirstField(p, t.fields);
    if (!asBool(raw)) continue;

    const red = Number(TECH_REDUCTION[t.key] || 0);
    out.push({
      key: t.key,
      label: t.label,
      reduction: (Number.isFinite(red) ? red : 0)
    });
  }

  // 2) Synthetic enhancement: Fiber CI exists in LCFS feedstock CIs
  //    (This is your “plant has corn fiber use already” signal.)
  const fs = getFeedstockCI(p);
  const hasFiberCI = (fs && fs.fiber !== null && Number.isFinite(fs.fiber) && fs.fiber > 0);

  if (hasFiberCI){
    // Avoid duplicates if you later also add a plant flag for fiber
    const already = out.some(e => e.key === "fiber_ci_present" || e.key === "fiber_ethanol");
    if (!already){
      out.push({
        key: "fiber_ci_present",
        label: "Corn Fiber Ethanol",
        reduction: 0 // display-only
      });
    }
  }

  return out;
}

function hasCaliforniaCkf(p){
  if (!p) return false;

  const fs = getFeedstockCI(p);
  return (
    hasCaliforniaCi(p) &&
    Number.isFinite(fs?.corn) &&
    Number.isFinite(fs?.fiber)
  );
}

function getCkfNumbers(p){
  const fs = getFeedstockCI(p);

  const starchCi = Number.isFinite(fs?.corn) ? Number(fs.corn) : NaN;
  const fiberCi  = Number.isFinite(fs?.fiber) ? Number(fs.fiber) : NaN;
  const delta    = (Number.isFinite(starchCi) && Number.isFinite(fiberCi))
    ? (starchCi - fiberCi)
    : NaN;

  return {
    starchCi,
    fiberCi,
    delta
  };
}    
    
    
    
function getFeedstockCI(p){
  const fs = (p && p.ci_by_feedstock) ? p.ci_by_feedstock : null;

  const out = {
    corn:    fs?.ci_corn_g_per_mj ?? null,
    fiber:   fs?.ci_fiber_g_per_mj ?? null,
    sorghum: fs?.ci_sorghum_g_per_mj ?? null,
    wheat:   fs?.ci_wheat_g_per_mj ?? null,
    sugar:   fs?.ci_sugar_g_per_mj ?? null
  };

  for (const k of Object.keys(out)){
    const v = out[k];
    out[k] = (v === null || v === "" || v === undefined) ? null : Number(v);
    if (!Number.isFinite(out[k])) out[k] = null;
  }
  return out;
}

function minCiFromDetailRows(rows){
  if (!Array.isArray(rows) || !rows.length) return null;

  const vals = rows
    .map(r => Number(r?.ci_score))
    .filter(v => Number.isFinite(v) && v > 0);

  return vals.length ? Math.min(...vals) : null;
}

function bestCaliforniaCi(p){
  const fs = getFeedstockCI(p);

  const fromFeedstocks =
    fs.corn ?? fs.fiber ?? fs.sorghum ?? fs.wheat ?? fs.sugar;

  if (fromFeedstocks !== null && Number.isFinite(fromFeedstocks) && fromFeedstocks > 0){
    return fromFeedstocks;
  }

  const topLevel = toFinitePositiveNumberOrNull(p?.ci_lcfs_delivered_g_per_mj);
  if (topLevel !== null) return topLevel;

  return minCiFromDetailRows(p?.ca_detail);
}

function bestOregonCi(p){
  return minCiFromDetailRows(p?.or_detail);
}

function hasCaliforniaCi(p){
  return bestCaliforniaCi(p) !== null;
}

function hasOregonCiOnly(p){
  return !hasCaliforniaCi(p) && (bestOregonCi(p) !== null);
}

function startingCI(p){
  const caCi = bestCaliforniaCi(p);
  if (caCi !== null){
    return {
      mode: "lcfs",
      source: "ca",
      value: caCi,
      note: "Using Lowest Starch California LCFS CI.",
      enhancements: [],
      ilucDefaultChecked: true,
      ilucDefaultValue: 19.9
    };
  }

  const orCi = bestOregonCi(p);
  if (orCi !== null){
    return {
      mode: "lcfs",
      source: "or",
      value: orCi,
      note: "Using Oregon CI fallback (Portland freight anchor).",
      enhancements: [],
      ilucDefaultChecked: false,
      ilucDefaultValue: 0
    };
  }

const btuProxy = proxy45zStartFromBtu(p);

if (btuProxy){
  return {
    mode: "proxy_45z_btu",
    source: "proxy_45z_btu",
    value: btuProxy.value + 19.9,
    note: `LCFS-equivalent display: 45Z BTU proxy ${btuProxy.value.toFixed(2)} + ILUC 19.90`,
    enhancements: [],
    proxyStart: btuProxy.nonThermalBase,
    thermalBtu: btuProxy.thermalBtu,
    thermalCi: btuProxy.thermalCi,
    nonThermalBase: btuProxy.nonThermalBase,
    nonThermalSource: btuProxy.source,
    nonThermalCount: btuProxy.count,

    // 45Z proxy should not include ILUC
    ilucDefaultChecked: true,
    ilucDefaultValue: 19.9
  };
}

const enh = getEnhancements(p);
const totalRed = enh.reduce((s, e) => s + (e.reduction || 0), 0);
const v = DEFAULT_NO_LCFS_PROXY - totalRed;

return {
  mode: "proxy",
  source: "proxy",
  value: v,
  note: `Fallback proxy start ${DEFAULT_NO_LCFS_PROXY.toFixed(1)} − enhancements (${totalRed.toFixed(1)})`,
  enhancements: enh,
  proxyStart: DEFAULT_NO_LCFS_PROXY,
  totalRed: totalRed,

  // 45Z should not include ILUC for fallback proxy either
  ilucDefaultChecked: false,
  ilucDefaultValue: 0
};

} // ✅ closes startingCI()

function renderCkfPanel(){
  const panel = document.getElementById("ckfPanel");
  const title = document.getElementById("ckfSectionTitle");
  const apply = document.getElementById("ckf_apply");
  const share = document.getElementById("ckf_share_pct");
  const status = document.getElementById("ckfStatusLabel");
  const deltaEl = document.getElementById("ckf_delta_display");
  const adjEl = document.getElementById("ckf_adjustment_display");
  const note = document.getElementById("ckfAutoNote");

  if (!panel || !title || !apply || !share || !status || !deltaEl || !adjEl || !note) return;

  if (!selectedPlant || !hasCaliforniaCkf(selectedPlant)){
    panel.style.display = "none";
    title.style.display = "none";
    apply.checked = false;
    share.value = "3.5";
    deltaEl.textContent = "—";
    adjEl.textContent = "—";
    note.textContent = "CA starch and fiber CI required";
    return;
  }

  const ckf = getCkfNumbers(selectedPlant);
  const sharePct = getNumber("ckf_share_pct");
  const shareFrac = Number.isFinite(sharePct) ? (sharePct / 100) : 0;
  const adjustment = Number.isFinite(ckf.delta) ? (shareFrac * ckf.delta) : NaN;

  title.style.display = "";
  panel.style.display = "";

  status.textContent = "✅ CKF identified";
  status.style.color = "var(--accent)";

   if (!apply.dataset.userTouched){
    apply.checked = true;
  }

  deltaEl.textContent = Number.isFinite(ckf.delta) ? fmt(ckf.delta, 2) : "—";
  adjEl.textContent = Number.isFinite(adjustment) ? fmt(adjustment, 2) : "—";
  
}

let ckfChartInstance = null;

function renderCkfChart(){
  const wrap = document.getElementById("ckfChartWrap");
  const canvas = document.getElementById("ckfChart");
  const note = document.getElementById("ckfChartNote");

  if (!wrap || !canvas || !note){
    return;
  }

  if (ckfChartInstance){
    ckfChartInstance.destroy();
    ckfChartInstance = null;
  }

  if (
    !selectedPlant ||
    !hasCaliforniaCkf(selectedPlant) ||
    !Array.isArray(selectedPlant.ckf_distribution) ||
    !selectedPlant.ckf_distribution.length
  ){
    wrap.style.display = "none";
    note.textContent = "No Corn Fiber distribution data available.";
    return;
  }

  const distribution = selectedPlant.ckf_distribution;
  const plantValue = Number(selectedPlant.ckf_ci_score);

  const labels = distribution.map(d => `${Number(d.bin_min).toFixed(1)}–${Number(d.bin_max).toFixed(1)}`);
  const counts = distribution.map(d => Number(d.count) || 0);

  const colors = distribution.map((d, idx) => {
    const binMin = Number(d.bin_min);
    const binMax = Number(d.bin_max);

    if (Number.isFinite(plantValue)){
      const inBin =
        (plantValue >= binMin && plantValue < binMax) ||
        (idx === distribution.length - 1 && plantValue === binMax);

      if (inBin) return "#ff6b6b";
    }

    return "#6fb1ff";
  });

  wrap.style.display = "";

  ckfChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context){
              return `Facilities: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#8ea0b8",
            maxRotation: 45,
            minRotation: 45,
            font: { size: 9 }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#8ea0b8",
            precision: 0,
            font: { size: 9 }
          },
          grid: { color: "rgba(255,255,255,0.08)" }
        }
      }
    }
  });

  if (Number.isFinite(plantValue)){
    note.textContent = `Highlighted bar shows this plant's Corn Fiber (012) CI: ${plantValue.toFixed(2)}`;
  } else {
    note.textContent = "This plant does not have a positive Corn Fiber (012) CI score.";
  }
}


function renderProgramSummary(){
  const panel = document.getElementById("programSummaryPanel");
  if (!panel) return;

  if (!selectedPlant){
    panel.style.display = "none";
    return;
  }

  const hasCA = Array.isArray(selectedPlant?.ca_detail) && selectedPlant.ca_detail.length > 0;
  const hasOR = Array.isArray(selectedPlant?.or_detail) && selectedPlant.or_detail.length > 0;

  panel.style.display = (hasCA || hasOR) ? "block" : "none";
}

function renderLcfsDetail(){
  const panel = document.getElementById("lcfsDetailPanel");

  const caSection = document.getElementById("caDetailSection");
  const orSection = document.getElementById("orDetailSection");

  const caRowsEl = document.getElementById("caDetailRows");
  const orRowsEl = document.getElementById("orDetailRows");

  if (!panel || !caSection || !orSection || !caRowsEl || !orRowsEl) return;

  if (!selectedPlant){
    panel.style.display = "none";
    caSection.style.display = "none";
    orSection.style.display = "none";
    caRowsEl.innerHTML = "";
    orRowsEl.innerHTML = "";
    return;
  }

  const caRows = Array.isArray(selectedPlant.ca_detail) ? selectedPlant.ca_detail : [];
  const orRows = Array.isArray(selectedPlant.or_detail) ? selectedPlant.or_detail : [];

  const buildCards = (rows) => {
    if (!rows.length) return "";

    return (
      `<div class="lcfsDetailGrid">` +
      rows.map(d => {
        const pathway = d?.pathway_type || "—";
        const feedstock = d?.feedstock || "—";
        const coproduct = d?.coproduct_type || "—";
        const score = (d?.ci_score === null || d?.ci_score === undefined || Number.isNaN(Number(d?.ci_score)))
          ? "—"
          : Number(d.ci_score).toFixed(2);

        return `
          <div class="lcfsDetailCard">
            <div><span class="mono">Pathway:</span> ${pathway}</div>
            <div><span class="mono">Feedstock:</span> ${feedstock}</div>
            <div><span class="mono">Co-product:</span> ${coproduct}</div>
            <div><span class="mono">CI score:</span> ${score}</div>
          </div>
        `;
      }).join("") +
      `</div>`
    );
  };

  const hasCA = caRows.length > 0;
  const hasOR = orRows.length > 0;

  if (!hasCA && !hasOR){
    panel.style.display = "none";
    caSection.style.display = "none";
    orSection.style.display = "none";
    caRowsEl.innerHTML = "";
    orRowsEl.innerHTML = "";
    return;
  }

  panel.style.display = "block";

  if (hasCA){
    caSection.style.display = "block";
    caRowsEl.innerHTML = buildCards(caRows);
  } else {
    caSection.style.display = "none";
    caRowsEl.innerHTML = "";
  }

  if (hasOR){
    orSection.style.display = "block";
    orRowsEl.innerHTML = buildCards(orRows);
  } else {
    orSection.style.display = "none";
    orRowsEl.innerHTML = "";
  }
}

function renderEnhancedTechnology(){
  const panel = document.getElementById("enhTechPanel");
  const list  = document.getElementById("enhTechList");
  if (!panel || !list) return;

  if (!selectedPlant){
    panel.style.display = "none";
    list.innerHTML = "";
    return;
  }


  const enh = getEnhancements(selectedPlant) || [];

  if (!enh.length){
    panel.style.display = "none";
    list.innerHTML = "";
    return;
  }

  panel.style.display = "block";
  enh.sort((a,b) => (b.reduction||0) - (a.reduction||0));

  list.innerHTML = enh
    .map(e => `<li><span class="mono">${e.label}</span></li>`)
    .join("");
}



function renderHubs(){
  const sel = document.getElementById("caHub");
  const lab = document.querySelector('label[for="caHub"]');

  if (!sel) {
    console.warn("renderHubs: #caHub not found");
    return;
  }

  // Oregon fallback case: force Portland
  if (selectedPlant && hasOregonCiOnly(selectedPlant)) {
    sel.innerHTML = "";

    const o = document.createElement("option");
    o.value = OR_PORTLAND_HUB.id;
    o.textContent = `${OR_PORTLAND_HUB.name} — ${OR_PORTLAND_HUB.role}`;
    sel.appendChild(o);

    sel.value = OR_PORTLAND_HUB.id;
    sel.disabled = true;

    if (lab) lab.textContent = "Oregon delivery hub";
    return;
  }

  // Otherwise use California hub logic
  let hubs = CA_HUBS;
  try {
    hubs = hubsForSelectedPlant();
    if (!Array.isArray(hubs) || !hubs.length) {
      hubs = CA_HUBS;
    }
  } catch (e) {
    console.warn("renderHubs: hubsForSelectedPlant failed, using all hubs", e);
    hubs = CA_HUBS;
  }

  const prev = sel.value;
  sel.innerHTML = "";

  for (const h of hubs) {
    const o = document.createElement("option");
    o.value = h.id;
    o.textContent = `${h.name} — ${h.railroad} — ${h.role}`;
    sel.appendChild(o);
  }

  if (hubs.some(h => h.id === prev)) {
    sel.value = prev;
  } else if (hubs.length) {
    sel.value = hubs[0].id;
  }

  sel.disabled = false;
  if (lab) lab.textContent = "California delivery hub";

  console.log("CA hubs rendered:", hubs.length);
}

function renderStartingPanel(){
  const vEl = document.getElementById("startCiValue");
  const nEl = document.getElementById("startCiNote");
  const boxEl = document.getElementById("startCiFeedstocks");
  if (!vEl || !nEl || !boxEl) return;

  if (!selectedPlant){
    vEl.textContent = "—";
    nEl.textContent = "—";
    boxEl.innerHTML = "";
    return;
  }

  const s = startingCI(selectedPlant);
  vEl.textContent = Number.isFinite(s.value) ? fmt(s.value, 2) : "—";
  nEl.textContent = s.note || "—";

  // Build the right-side detail content
  if (s.mode === "lcfs"){
    if (s.source === "ca"){
      const fs = getFeedstockCI(selectedPlant);
      const rows = [
        ["Corn (starch)", fs.corn],
        ["Fiber", fs.fiber],
        ["Sorghum", fs.sorghum],
        ["Wheat", fs.wheat],
        ["Sugar", fs.sugar]
      ].filter(([_, v]) => v !== null);

      boxEl.innerHTML = rows.length
        ? `<div class="threeColGrid">` +
            rows.map(([k,v]) =>
              `<div class="gridItem">• <span class="mono">${k}</span>: ${fmt(v,2)}</div>`
            ).join("") +
          `</div>
          <div style="margin-top:8px; color:var(--muted);">• <span class="mono">Source</span>: California LCFS</div>
          <div style="margin-top:4px; color:var(--muted);">• <span class="mono">Freight hub</span>: selected California hub</div>`
        : `<div class="muted">California LCFS CI selected.</div>`;
    } else if (s.source === "or"){
      const orRows = Array.isArray(selectedPlant?.or_detail) ? selectedPlant.or_detail : [];
      const shown = orRows
        .map(r => [`${r.feedstock || "Feedstock"}`, Number(r.ci_score)])
        .filter(([_, v]) => Number.isFinite(v));

      boxEl.innerHTML = shown.length
        ? `<div class="threeColGrid">` +
            shown.map(([k,v]) =>
              `<div class="gridItem">• <span class="mono">${k}</span>: ${fmt(v,2)}</div>`
            ).join("") +
          `</div>
          <div style="margin-top:8px; color:var(--muted);">• <span class="mono">Source</span>: Oregon fallback</div>
          <div style="margin-top:4px; color:var(--muted);">• <span class="mono">Freight hub</span>: Portland</div>`
        : `<div class="muted">Oregon fallback CI selected. Freight anchor = Portland.</div>`;
    } else {
      boxEl.innerHTML = `<div class="muted">LCFS CI selected.</div>`;
    }
    return;
  }

if (s.mode === "proxy_45z_btu") {
  const btuProxyBase = s.value - 19.9;

  boxEl.innerHTML =
    `<div style="margin-bottom:6px;">
      45Z BTU proxy: <span class="mono">
      ${fmt(s.nonThermalBase,2)} non-thermal + ${fmt(s.thermalCi,2)} thermal = ${fmt(btuProxyBase,2)}
      </span>
    </div>
    <div style="margin-bottom:6px;">
      ILUC display add-back: <span class="mono">+19.90</span>
    </div>
    <div style="margin-bottom:6px;">
      BTU/gal: <span class="mono">${Number(s.thermalBtu).toLocaleString("en-US", {maximumFractionDigits:0})}</span>
    </div>`;

  return;
}

const enh = getEnhancements(selectedPlant) || [];
enh.sort((a,b) => (b.reduction||0) - (a.reduction||0));

const lines = enh.map(e => {
  const r = Number.isFinite(e.reduction) ? e.reduction : 0;
  const suffix = (r > 0) ? `: −${fmt(r, 1)} g/MJ` : "";
  return `<div>• <span class="mono">${e.label}</span>${suffix}</div>`;
}).join("");

const math =
  `<div style="margin-bottom:6px;">
    Proxy math: <span class="mono">${s.proxyStart.toFixed(1)} − ${s.totalRed.toFixed(1)} = ${fmt(s.value, 2)}</span>
  </div>`;

boxEl.innerHTML = math + lines;
}
  // Great-circle distance (Haversine) in miles
  function haversineMiles(lat1, lon1, lat2, lon2){
    const R = 3958.7613; // miles
    const toRad = d => d * Math.PI / 180;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

function normStr(v){
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low === "nan" || low === "none" || low === "null" || low === "<na>") return "";
  return s;
}

function firstNonEmpty(...vals){
  for (const v of vals){
    const s = normStr(v);
    if (s) return s;
  }
  return "";
}

  function plantLabel(p){
  const name  = firstNonEmpty(p.plant_name, p.Name, p["Plant"], p["Plant Name"], p["Facility Name"]);
  const owner = firstNonEmpty(p.ownership, p.Ownership, p["Owner"], p["Company"]);
  const city  = firstNonEmpty(p.city, p.City);
  const st    = firstNonEmpty(p.state, p.State);

  const niceName  = name || "Unknown";
  const tail = [city, st].filter(Boolean).join(", ");
  return owner
    ? `${owner} — ${niceName}${tail ? " ("+tail+")" : ""}`
    : `${niceName}${tail ? " ("+tail+")" : ""}`;
}

  function getNumber(id){
  const el = document.getElementById(id);
  if (!el) return NaN;

  const raw = String(el.value ?? "").replace(/[$,%\s,]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}
  
function formatCurrencyInput(id, decimals=2){
  const el = document.getElementById(id);
  if (!el) return;

  const raw = String(el.value ?? "").replace(/[$,\s]/g, "");
  const n = Number(raw);

  if (!Number.isFinite(n)) return;
  el.value = `$${n.toFixed(decimals)}`;
}  
  
  
  
  
  function getChecked(id){
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

function nudgeNumber(id, delta){
  const el = document.getElementById(id);
  if (!el || el.disabled) return;

  const step = Number(el.step || 0.1) || 0.1;
  const cur  = Number(el.value || 0);
  const next = (Number.isFinite(cur) ? cur : 0) + delta;

  // keep to step precision
  const rounded = Math.round(next / step) * step;
  el.value = String(rounded);

  // trigger your existing listeners
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function todayIsoLocal(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yearFromIsoDate(s){
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function remaining45QYearsAfter45Z(inServiceDate){
  const startYear = yearFromIsoDate(inServiceDate);
  if (!startYear) return 0;

  const endYear = startYear + FORTYFIVEQ_TERM_YEARS - 1;

  // 45Q years only after 45Z is gone
  const first45QValueYear = Math.max(CURRENT_MODEL_YEAR, FORTYFIVEZ_LAST_YEAR + 1);

  if (endYear < first45QValueYear) return 0;

  return endYear - first45QValueYear + 1;
}

function remaining45QYearsFromInServicePartial(inServiceDate){
  if (!inServiceDate) return NaN;

  const start = new Date(inServiceDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return NaN;

  const end = new Date(start);
  end.setFullYear(end.getFullYear() + FORTYFIVEQ_TERM_YEARS);

  const now = new Date();

  const msLeft = end.getTime() - now.getTime();
  if (msLeft <= 0) return 0;

  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  return daysLeft / 365.25;
}


function effective45QYearsAfter2029(inServiceDate){
  if (!inServiceDate) return NaN;

  const start = new Date(inServiceDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return NaN;

  const end = new Date(start);
  end.setFullYear(end.getFullYear() + FORTYFIVEQ_TERM_YEARS);

  const cutoff = new Date("2030-01-01T00:00:00");

  const ms = end.getTime() - cutoff.getTime();
  if (ms <= 0) return 0;

  const days = ms / (1000 * 60 * 60 * 24);
  return days / 365.25;
}



function remaining45ZYearsFromToday(){
  const now = new Date();
  const end = new Date("2029-12-31T23:59:59");

  const msLeft = end.getTime() - now.getTime();
  if (msLeft <= 0) return 0;

  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  return daysLeft / 365.25;
}





function syncCcsDatesUI(){
  const applyCb = document.getElementById("ch2_pipeline_apply");
  const inSvc   = document.getElementById("ccs_in_service_date");
  
  const ciEff   = document.getElementById("ccs_ci_effective_date");
  if (!applyCb || !inSvc || !ciEff) return;

  const on = !!applyCb.checked;

  if (!on){
    // Blank both when CCS is not applied
    inSvc.value = "";
    ciEff.value = "";
    return;
  }
  
  
  

  const today = todayIsoLocal();

  // First date: auto-fill today when checkbox turns on
  if (!inSvc.value) inSvc.value = today;

  // Second date: default to same day unless user changes it
  if (!ciEff.value) ciEff.value = inSvc.value || today;
}

function sync45QValueSection(){
  const wrap = document.getElementById("section45qValue");
  const applyCb = document.getElementById("ch2_pipeline_apply");
  if (!wrap || !applyCb) return;

  wrap.style.display = applyCb.checked ? "" : "none";
}


  function carriersFromRail(railStr){
    const s = (railStr || "").toString().toUpperCase();
    return {
      up:   s.includes("UP") || s.includes("UNION PACIFIC"),
      bnsf: s.includes("BNSF")
    };
  }
  // ----------------------------
  // CCS AUTO-LOCK (PIPELINE RULE)
  // ----------------------------
  function normUpper(v){
    return (v === null || v === undefined) ? "" : String(v).trim().toUpperCase();
  }

  // Rule:
  // - If co2_pipeline_direct == "DIRECT"  OR
  // - co2_pipeline_3rd_party contains "TALL GRASS"
  // then CCS UI must be forced to 0 / OFF.
  function plantHasPipeline(p){
    if (!p) return false;
    const direct = normUpper(p.co2_pipeline_direct);
    const third  = normUpper(p.co2_pipeline_3rd_party);
    return (direct === "DIRECT") || third.includes("TALL GRASS");
  }

  function syncCcsUI(){
  const cb  = document.getElementById("applyMisc");
  const inp = document.getElementById("ccsReduction");
  if (!cb || !inp) return;

  // ✅ Always unlocked: user override box
  cb.disabled = false;
  inp.disabled = false;

  // Helpful tooltips (optional)
  cb.title  = "Apply a user-defined misc reduction (override).";
  inp.title = "Misc reduction gCO2e/MJ (user override)";
}

function syncFreightUI(){
  const cb   = document.getElementById("applyFreight");
  const mult = document.getElementById("freightMultiplier");
  const fac  = document.getElementById("gPerMjPerMile");
  const hub  = document.getElementById("caHub");
  if (!cb || !mult || !fac || !hub) return;

  // Determine LCFS vs proxy from Starting CI logic
  const mode = selectedPlant ? (startingCI(selectedPlant).mode || "proxy") : "proxy";
  const lcfsMode = (mode === "lcfs");

  if (!lcfsMode){
    // Proxy mode: force freight OFF and lock inputs
    cb.checked = false;
    cb.disabled = true;
    mult.disabled = true;
    fac.disabled  = true;
    hub.disabled  = true;
    return;
  }

  // LCFS mode: enable checkbox; inputs enabled only if checked
  cb.disabled = false;
  const on = !!cb.checked;
  mult.disabled = !on;
  fac.disabled  = !on;
  hub.disabled  = !on;
}  
      
      
  // ----------------------------
  // STATE
  // ----------------------------
  let allPlants = [];
  let filteredPlants = [];
  let selectedPlant = null;

  // ----------------------------
  // HUB RENDER (FILTERED BY RAIL)
  // ----------------------------
  function hubsForSelectedPlant(){
    if (!selectedPlant) return CA_HUBS;
    const c = carriersFromRail(selectedPlant.rail_lines || "");
    if (c.up && !c.bnsf) return CA_HUBS.filter(h => (h.railroad || "").toUpperCase() === "UP");
    if (c.bnsf && !c.up) return CA_HUBS.filter(h => (h.railroad || "").toUpperCase() === "BNSF");
    if (c.up && c.bnsf)  return CA_HUBS;
    return CA_HUBS;
  }

function renderHubs(){
  const sel = document.getElementById("caHub");
  const lab = document.querySelector('label[for="caHub"]');

  if (!sel) {
    console.warn("renderHubs: #caHub not found");
    return;
  }

  // Oregon fallback case: force Portland
  if (selectedPlant && hasOregonCiOnly(selectedPlant)) {
    sel.innerHTML = "";

    const o = document.createElement("option");
    o.value = OR_PORTLAND_HUB.id;
    o.textContent = `${OR_PORTLAND_HUB.name} — ${OR_PORTLAND_HUB.role}`;
    sel.appendChild(o);

    sel.value = OR_PORTLAND_HUB.id;
    sel.disabled = true;

    if (lab) lab.textContent = "Oregon delivery hub";
    return;
  }

  // Otherwise use California hub logic
  let hubs = CA_HUBS;
  try {
    hubs = hubsForSelectedPlant();
    if (!Array.isArray(hubs) || !hubs.length) {
      hubs = CA_HUBS;
    }
  } catch (e) {
    console.warn("renderHubs: hubsForSelectedPlant failed, using all hubs", e);
    hubs = CA_HUBS;
  }

  const prev = sel.value;
  sel.innerHTML = "";

  for (const h of hubs) {
    const o = document.createElement("option");
    o.value = h.id;
    o.textContent = `${h.name} — ${h.railroad} — ${h.role}`;
    sel.appendChild(o);
  }

  if (hubs.some(h => h.id === prev)) {
    sel.value = prev;
  } else if (hubs.length) {
    sel.value = hubs[0].id;
  }

  sel.disabled = false;
  if (lab) lab.textContent = "California delivery hub";

  console.log("CA hubs rendered:", hubs.length);
}

function currentHub(){
  if (selectedPlant && hasOregonCiOnly(selectedPlant)) {
    return OR_PORTLAND_HUB;
  }

  const sel = document.getElementById("caHub");
  const id = sel ? sel.value : "";
  return CA_HUBS.find(h => h.id === id) || CA_HUBS[0];
}

// ----------------------------
// PLANT LIST FILTERING
// ----------------------------
function applyFilters(){
  const qEl = document.getElementById("searchBox");
  const q = (qEl ? qEl.value : "").toLowerCase().trim();

  filteredPlants = allPlants.filter(p => {
    if (!q) return true;
    const hay = (
      plantLabel(p) + " " + (p.facility_id || "") + " " + (p.ca_facility_id || "")
    ).toLowerCase();
    return hay.includes(q);
  });

  filteredPlants.sort((a, b) => plantLabel(a).localeCompare(plantLabel(b)));
  renderPlantSelect();
}

  function renderPlantSelect(){
    const sel = document.getElementById("plantSelect");
    if (!sel) return;

    sel.innerHTML = "";

    if (!filteredPlants.length){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "No plants match filters";
      sel.appendChild(o);
    
      selectedPlant = null;
      
      
    
      // ✅ deterministic freight reset when no plant
      const freightCb = document.getElementById("applyFreight");
      if (freightCb) freightCb.checked = false;
    
     renderHubs();
     syncFreightUI();
     renderProgramSummary();
     renderLcfsDetail();
     renderPlantDetails();
     renderOutputs();
      return;
    }

    for (let i=0; i<filteredPlants.length; i++){
      const p = filteredPlants[i];
      const o = document.createElement("option");
      o.value = String(p.facility_id ?? p.ca_facility_id ?? p.__id ?? "").trim(); // ✅ key fix
      o.textContent = plantLabel(p);
      sel.appendChild(o);
    }

       // keep current selection if possible; else default to first option
    if (selectedPlant){
      const keepId = String(selectedPlant.facility_id ?? selectedPlant.ca_facility_id ?? selectedPlant.__id ?? "").trim();
      const stillThere = filteredPlants.some(p =>
        String(p.facility_id ?? p.ca_facility_id ?? p.__id ?? "").trim() === keepId
      );
      sel.value = stillThere
        ? keepId
        : String(filteredPlants[0].facility_id ?? filteredPlants[0].ca_facility_id ?? filteredPlants[0].__id ?? "").trim();
    } else {
      sel.value = String(filteredPlants[0].facility_id ?? filteredPlants[0].ca_facility_id ?? filteredPlants[0].__id ?? "").trim();
    }

    const chosenId = String(sel.value || "").trim();
    selectedPlant = filteredPlants.find(p =>
      String(p.facility_id ?? p.ca_facility_id ?? p.__id ?? "").trim() === chosenId
    ) || null;
    
    syncChapter2PipelineUI();
    
    // ✅ Force freight default + sync AFTER selectedPlant is finalized
    const freightCb = document.getElementById("applyFreight");
    if (freightCb){
      const mode = selectedPlant ? (startingCI(selectedPlant).mode || "proxy") : "proxy";
      freightCb.checked = (mode === "lcfs");
    }
    syncFreightUI();
    syncElectricityBridgeUI();
    
    renderHubs();
    renderStartingPanel();
    renderCkfPanel();
    renderCkfChart();
    renderProgramSummary();
    renderLcfsDetail();
    renderEnhancedTechnology();
    renderPlantDetails();
    renderOutputs();
  }  
        
        
        // <-- CLOSE renderPlantSelect()
        
function getNumericDryerValues(){
  return allPlants
    .map(p => {
      const v = p?.implied_dryer_btu_per_gal;
      return (v === null || v === undefined || v === "") ? null : Number(v);
    })
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b);
}

function getTercileCutoffs(values){
  if (!Array.isArray(values) || values.length === 0){
    return { lowCut: null, highCut: null };
  }

  const n = values.length;

  const lowIdx = Math.floor(n / 3) - 1;
  const highIdx = Math.floor((2 * n) / 3) - 1;

  return {
    lowCut: values[Math.max(0, lowIdx)],
    highCut: values[Math.max(0, highIdx)]
  };
}

function classifyImpliedDryerFigure(v){
  if (v === null || v === undefined || v === "") return "—";

  const num = Number(v);
  if (!Number.isFinite(num)) return "—";

  const values = getNumericDryerValues();
  const { lowCut, highCut } = getTercileCutoffs(values);

  if (lowCut === null || highCut === null) return "—";

  if (num <= lowCut) return "Low";
  if (num >= highCut) return "High";
  return "Medium";
}

// ----------------------------
// PLANT DETAILS
// ----------------------------
function renderPlantDetails(){
  const badges = document.getElementById("plantBadges");
  const kv = document.getElementById("plantKv");
  if (!badges || !kv) return;

    badges.innerHTML = "";
    kv.innerHTML = "";

    if (!selectedPlant){
      badges.innerHTML = `<span class="pill warn">No plant selected</span>`;
      return;
    }

    
    const s = startingCI(selectedPlant);
    
    const ilucCheckbox = document.getElementById("subtractIluc");
    const ilucInput = document.getElementById("ilucValue");
    
    if (ilucCheckbox && ilucInput) {
      ilucCheckbox.checked = !!s.ilucDefaultChecked;
      ilucInput.value = String(s.ilucDefaultValue ?? 19.9);
    }
    
    
    
    
    const pill = document.createElement("span");
    
    if (s.mode === "lcfs" && s.source === "ca") {
      pill.className = "pill";
      pill.style.color = "var(--accent)";
      pill.style.borderColor = "var(--accent)";
      pill.textContent = "CA LCFS CI: available";
    } else if (s.mode === "lcfs" && s.source === "or") {
      pill.className = "pill";
      pill.style.color = "#b91c1c";
      pill.style.borderColor = "#b91c1c";
      pill.textContent = "OR LCFS CI: available";
    } else {
      pill.className = "pill warn";
      pill.textContent = "LCFS CI: missing";
    }

badges.appendChild(pill);



   let sourcePillText = "";
if (s.mode === "lcfs" && s.source === "ca") {
  sourcePillText = "Source: California LCFS";
} else if (s.mode === "lcfs" && s.source === "or") {
  sourcePillText = "Source: Oregon CFP";
} else {
  const src = (selectedPlant.source_table || selectedPlant.score_source || "").trim();
  if (src) sourcePillText = `Source: ${src}`;
}

if (sourcePillText){
  const p = document.createElement("span");
  p.className = "pill";
  p.textContent = sourcePillText;
  badges.appendChild(p);
}

  // --- Enhanced Technologies line (plant-level display) ---
const enhList = getEnhancements(selectedPlant) || [];
const enhText = enhList.length
  ? enhList.map(e => e.label).join(", ")
  : "No Enhanced Technologies";

// --- Regulatory Pathways line (plant-level display) ---
// Required order: D6, D3, EP#
const d6Raw = selectedPlant.d6_non_cellulosic ?? "";
const d3Raw = selectedPlant.d3_cellulosic ?? "";
const epRaw =
  selectedPlant.reg_pathway ??
  selectedPlant["Efficient Producer"] ??
  "";

const d6 = String(d6Raw || "").trim();
const d3 = String(d3Raw || "").trim();
const ep = String(epRaw || "").trim();

const clean = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (low === "nan" || low === "none" || low === "null" || low === "<na>" || low === "—" || low === "-") return "";
  return t;
};

const regParts = [clean(d6), clean(d3), clean(ep)].filter(Boolean);
const regText = regParts.length ? regParts.join(", ") : "";

const items = [
  ["Ownership", selectedPlant.ownership],
  ["Plant", selectedPlant.plant_name],

  ["Location", [selectedPlant.city, selectedPlant.state].filter(Boolean).join(", ")],
  ["Dryer type", selectedPlant.dryer_types],
  ["Ethanol capacity",
    Number.isFinite(Number(selectedPlant.ethanol_capacity_mgy))
      ? `${fmt(Number(selectedPlant.ethanol_capacity_mgy), 1)} MGY`
      : "—"
  ],
["Gas supply",
  selectedPlant.epa_ghg_derived?.gas_supply_effective
  || selectedPlant.fuel_summary?.fuel_type_master
  || selectedPlant.tech_flags?.gas_supply
  || "—"
],
  ["Technology", selectedPlant.technology],
 ["Total BTU per Gal (2023)",
  (() => {
    const v = selectedPlant?.thermal_btu_per_gal_est;

    if (v === null || v === undefined || v === "") return "—";

    const num = Number(v);
    if (!Number.isFinite(num)) return "—";

    if (num < 12000) return "Likely Partial Year";

    return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  })()
],

  

 
  
  
  ["Rail lines", selectedPlant.rail_lines],

["Wet:Dry CI Spread",
  (() => {
    const v = selectedPlant?.implied_dryer_btu_per_gal;
    return classifyImpliedDryerFigure(v);
  })()
],
  


   ["Enhanced Technologies", enhText],
   

  ["Electricity type", selectedPlant.electricity_type],
  

  ["Fiber technology", selectedPlant.fiber_technology],
  [
  "Electrical Grid Designation",
  (function(){
    const grid = (selectedPlant.electrical_grid_designation || "").trim();
    const adj = getElectricityBridgeAdj(selectedPlant);

    let label = "Neutral Grid";
    if (adj < 0) label = "Clean Grid";
    if (adj > 0) label = "Dirty Grid";

    return grid ? `${grid} (${label})` : "—";
  })()
],
  
 
  ["Regulatory Pathways", regText],
  ["CA Facility ID", selectedPlant.ca_facility_id || selectedPlant.facility_id || ""],
  ["Year Built", selectedPlant.year_build || ""],
  ["CI date", selectedPlant.ci_date]
];


        for (const [k,v] of items){
      const dk = document.createElement("div");
      dk.className = "k";
      dk.textContent = k;

      const dv = document.createElement("div");
      dv.className = "v";
      dv.textContent = (v === null || v === undefined || v === "") ? "—" : String(v);

      kv.appendChild(dk);
      kv.appendChild(dv);
    }

    // If odd number of items, add 2 blank cells so the grid stays balanced
    if (items.length % 2 !== 0){
      const blankK = document.createElement("div");
      blankK.className = "k";
      blankK.textContent = "";

      const blankV = document.createElement("div");
      blankV.className = "v";
      blankV.textContent = "";

      kv.appendChild(blankK);
      kv.appendChild(blankV);
    }
}

function compute(){
 const res = {
   hasPlant: !!selectedPlant,
  electricityGrid: "",
  electricityBridgeAdj: 0,
  ckf_eligible: false,
  ckf_share_pct: NaN,
  ckf_delta_g_per_mj: NaN,
  ckf_adjustment_g_per_mj: NaN,
  hasCI: false,
  ciDelivered: NaN,
  miles: NaN,
  milesEff: NaN,
  milesNet: NaN,
  freightCi: NaN,
  ciFob: NaN,

  // CCS timeline fields
  ccs_in_service_date: "",
  ccs_ci_effective_date: "",

  // 45Q / CCS value fields
  biogenic_co2_tons_per_year: NaN,
  fortyfiveq_credit_per_ton: NaN,
  fortyfiveq_annual_value: NaN,
  fortyfiveq_remaining_years: NaN,
  fortyfiveq_remaining_years_policy: NaN,
  fortyfiveq_effective_years: NaN,
  fortyfiveq_value_per_gal: NaN,
  fortyfiveq_discounted_value: NaN,


  // 45Z discounted value fields
  fortyfivez_remaining_years: NaN,
  fortyfivez_annual_value: NaN,
  fortyfivez_discounted_value: NaN,
  
  
  discount_rate_pct: NaN,
  discount_rate_decimal: NaN,




  // Final adjusted CI in LCFS units
  ci45z_g_per_mj: NaN,

  // Same value converted to 45Z units
  emissions_kg_per_mmbtu: NaN,
  emissions_factor_raw: NaN,
  emissions_factor_rounded: NaN,

  rate: NaN,
  rateDetail: ""
  };
 
 

  if (!selectedPlant) return res;
  
  const electricityBridgeApply =
  !!document.getElementById("electricity_bridge_apply")?.checked;

const electricityBridgeInput =
  Number(document.getElementById("electricity_bridge_score")?.value || 0);

res.electricityGrid = selectedPlant?.electrical_grid_designation || "";
res.electricityBridgeAdj = electricityBridgeApply ? electricityBridgeInput : 0;

  const lat   = Number(selectedPlant.latitude);
  const lon   = Number(selectedPlant.longitude);
  const ciDel = toFinitePositiveNumberOrNull(selectedPlant?.ci_lcfs_delivered_g_per_mj);

  // LCFS delivered CI available?
  res.hasCI = (ciDel !== null);
  res.ciDelivered = (ciDel !== null) ? ciDel : NaN;   // or null if you prefer
    
    // Starting CI used for calculations (LCFS if available, else proxy)
    const start = startingCI(selectedPlant);
    res.startCi = Number.isFinite(start.value) ? start.value : NaN;
    res.startNote = start.note || "";
    
    const lcfsMode = (start.mode === "lcfs");
    const doFreight = lcfsMode && getChecked("applyFreight");

  // Inputs
  const hub = currentHub();
  const mult = getNumber("freightMultiplier");
  const factor = getNumber("gPerMjPerMile");


  const doIluc = getChecked("subtractIluc");
  const iluc = getNumber("ilucValue");

  const doMisc = getChecked("applyMisc");
  const misc = getNumber("ccsReduction");

  const electricityBridge =
    Number.isFinite(res.electricityBridgeAdj)
      ? res.electricityBridgeAdj
      : 0;
  
  const ckfEligible = hasCaliforniaCkf(selectedPlant);
const ckfApply = ckfEligible && getChecked("ckf_apply");
const ckfSharePct = getNumber("ckf_share_pct");
const ckfShareFrac = Number.isFinite(ckfSharePct) ? (ckfSharePct / 100) : NaN;

const ckfNums = ckfEligible ? getCkfNumbers(selectedPlant) : null;
const ckfDelta = (ckfNums && Number.isFinite(ckfNums.delta)) ? ckfNums.delta : NaN;
const ckfAdjustment = (
  ckfApply &&
  Number.isFinite(ckfDelta) &&
  Number.isFinite(ckfShareFrac)
) ? (ckfShareFrac * ckfDelta) : 0;

res.ckf_eligible = ckfEligible;
res.ckf_share_pct = ckfSharePct;
res.ckf_delta_g_per_mj = ckfDelta;
res.ckf_adjustment_g_per_mj = ckfAdjustment;

  const bench_kg_per_mmbtu = getNumber("ciBenchmark");  // user enters kg/MMBtu
const bench_g_per_mj = Number.isFinite(bench_kg_per_mmbtu)
  ? (bench_kg_per_mmbtu / CONV_G_PER_MJ_TO_KG_PER_MMBTU)
  : NaN;

const maxRate = getNumber("maxRate");


const discountRatePct = getNumber("discountRate");
const discountRate = Number.isFinite(discountRatePct)
  ? discountRatePct / 100
  : DEFAULT_DISCOUNT_RATE;

res.discount_rate_pct = Number.isFinite(discountRatePct)
  ? discountRatePct
  : DEFAULT_DISCOUNT_RATE * 100;

res.discount_rate_decimal = discountRate;

  // ----------------------------
  // Chapter 2: pipeline score counts ONLY if checkbox checked
  // ----------------------------
  const ch2ApplyEl = document.getElementById("ch2_pipeline_apply");
  const ch2ScoreEl = document.getElementById("ch2_pipeline_score");
  const ch2Apply = ch2ApplyEl ? ch2ApplyEl.checked : false;
  const ch2Score = ch2ScoreEl ? parseFloat(ch2ScoreEl.value || "0") : 0;
  const pipelineScore = (ch2Apply && Number.isFinite(ch2Score)) ? ch2Score : 0;
  
  const ccsInServiceEl = document.getElementById("ccs_in_service_date");
  const ccsCiEffEl     = document.getElementById("ccs_ci_effective_date");

  res.ccs_in_service_date  = ch2Apply && ccsInServiceEl ? (ccsInServiceEl.value || "") : "";
  res.ccs_ci_effective_date = ch2Apply && ccsCiEffEl ? (ccsCiEffEl.value || "") : "";
  
const storageTypeEl = document.getElementById("fortyfiveqStorageType");
  const qCreditPerTon = storageTypeEl
    ? Number(storageTypeEl.value)
    : 85;

res.fortyfiveq_credit_per_ton = qCreditPerTon;
res.fortyfiveq_remaining_years_policy = ch2Apply
  ? remaining45QYearsFromInServicePartial(res.ccs_in_service_date)
  : 0;
res.fortyfiveq_effective_years = ch2Apply
  ? effective45QYearsAfter2029(res.ccs_in_service_date)
  : 0;



const capMgy = selectedPlant ? Number(selectedPlant.ethanol_capacity_mgy ?? selectedPlant["ethanol_capacity_mgy"]) : NaN;
const gallonsPerYear = Number.isFinite(capMgy) ? capMgy * 1_000_000 : NaN;

if (ch2Apply && Number.isFinite(gallonsPerYear)){
  res.biogenic_co2_tons_per_year =
    gallonsPerYear * CO2_LB_PER_GAL_ETHANOL / LB_PER_METRIC_TON;
} else {
  res.biogenic_co2_tons_per_year = 0;
}

if (Number.isFinite(res.biogenic_co2_tons_per_year) && Number.isFinite(qCreditPerTon)){
  res.fortyfiveq_annual_value = res.biogenic_co2_tons_per_year * qCreditPerTon;
}

res.fortyfiveq_remaining_years = ch2Apply
  ? remaining45QYearsAfter45Z(res.ccs_in_service_date)
  : 0;

if (Number.isFinite(res.fortyfiveq_annual_value) && Number.isFinite(gallonsPerYear) && gallonsPerYear > 0){
  res.fortyfiveq_value_per_gal = res.fortyfiveq_annual_value / gallonsPerYear;
} else {
  res.fortyfiveq_value_per_gal = NaN;
}

// Discounted 45Q value:
// - no 45Q collection through 2029
// - first eligible 45Q year is 2030
// - discount annual 45Q value back to CURRENT_MODEL_YEAR at 10%
if (ch2Apply && Number.isFinite(res.fortyfiveq_annual_value) && res.fortyfiveq_annual_value > 0){
  const effectiveYears = res.fortyfiveq_effective_years;

  if (Number.isFinite(effectiveYears) && effectiveYears > 0){
    const cutoff = new Date("2030-01-01T00:00:00");
    const now = new Date();

    // years from today to Jan 1, 2030
    const yearsTo2030 = Math.max(0, (cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25));

    const fullYears = Math.floor(effectiveYears);
    const stubYears = effectiveYears - fullYears;

    let pv = 0;

    // first partial 45Q period after Jan 1, 2030
    if (stubYears > 0){
      pv += (res.fortyfiveq_annual_value * stubYears) / Math.pow(1 + discountRate, yearsTo2030 + stubYears);
    }

    // full years after that partial period
    for (let i = 1; i <= fullYears; i++){
      const t = yearsTo2030 + stubYears + i;
      pv += res.fortyfiveq_annual_value / Math.pow(1 + discountRate, t);
    }

    res.fortyfiveq_discounted_value = pv;
  } else {
    res.fortyfiveq_discounted_value = 0;
  }
} else {
  res.fortyfiveq_discounted_value = NaN;
}

  
  
  
  
  // ----------------------------
    // Agricultural reduction: counts ONLY if checkbox checked
    // ----------------------------
    const agApplyEl = document.getElementById("ag_apply");
    const agScoreEl = document.getElementById("ag_score");
    const agApply = agApplyEl ? agApplyEl.checked : false;
    const agScore = agScoreEl ? parseFloat(agScoreEl.value || "0") : 0;
    const agReduction = (agApply && Number.isFinite(agScore)) ? agScore : 0;

  // ----------------------------
  // Chapter 3 status UI (informational only)
  // ----------------------------
  const msg   = document.getElementById("ch3_status_msg");
  const panel = document.getElementById("ch3_tech_panel");

  if (msg) {
    msg.textContent = res.hasCI
      ? "LCFS CI found for this plant."
      : "No LCFS CI found — using technology options (Chapter 3).";
  }
  if (panel) panel.style.display = "block";

// Distance / freight (LCFS-only)
if (doFreight && Number.isFinite(lat) && Number.isFinite(lon) && hub){
  const miles = haversineMiles(lat, lon, hub.lat, hub.lon);
  res.miles = miles;

  // Effective delivered miles after route multiplier
  res.milesEff = miles * (Number.isFinite(mult) ? mult : 1.0);

  // 45Z already includes 300 baseline miles
  res.milesNet = res.milesEff - BASELINE_45Z_FREIGHT_MILES;
} else {
  res.miles = NaN;
  res.milesEff = NaN;
  res.milesNet = NaN;
}

if (doFreight && Number.isFinite(res.milesNet) && Number.isFinite(factor)){
  res.freightCi = res.milesNet * factor;
} else {
  res.freightCi = 0; // forced zero when proxy mode or unchecked
}

  // FOB CI
  // FOB CI (use Starting CI even if no LCFS CI exists)
if (Number.isFinite(res.startCi)){
  res.ciFob = res.startCi - (Number.isFinite(res.freightCi) ? res.freightCi : 0);
}

  // 45Z proxy CI
  if (Number.isFinite(res.ciFob)){
    let ci = res.ciFob;

    if (doIluc && Number.isFinite(iluc)) ci -= iluc;

    // Misc applies to ALL plants when checked
   if (doMisc && Number.isFinite(misc)) ci += misc;

   // ✅ Chapter 2 pipeline reduction
    ci -= pipelineScore;
    // ✅ Agricultural practices reduction
    ci -= agReduction;
    // ✅ Corn Kernel Fiber reduction
    ci -= ckfAdjustment;
    ci += electricityBridge;

    

    res.ci45z_g_per_mj = ci;

// Convert once at the end for 45Z policy unit system
res.emissions_kg_per_mmbtu = Number.isFinite(ci)
  ? (ci * CONV_G_PER_MJ_TO_KG_PER_MMBTU)
  : NaN;
  }

// Rate mapping should use 45Z units (kg/MMBtu)
// Bucketed version: round emissions factor to nearest 0.1, then apply max rate
if (
  Number.isFinite(res.emissions_kg_per_mmbtu) &&
  Number.isFinite(bench_kg_per_mmbtu) &&
  Number.isFinite(maxRate)
){
  const rawFactor = (bench_kg_per_mmbtu - res.emissions_kg_per_mmbtu) / bench_kg_per_mmbtu;
  const roundedFactor = round45zEmissionsFactor(res.emissions_kg_per_mmbtu, bench_kg_per_mmbtu);

  res.emissions_factor_raw = Math.max(0, rawFactor);
  res.emissions_factor_rounded = roundedFactor;

  res.rate = clamp(roundedFactor * maxRate, 0, maxRate);
  
// ----------------------------
// Discounted 45Z value through Dec 2029
// ----------------------------
if (Number.isFinite(res.rate) && Number.isFinite(gallonsPerYear) && gallonsPerYear > 0){
  res.fortyfivez_annual_value = res.rate * gallonsPerYear;
  res.fortyfivez_remaining_years = remaining45ZYearsFromToday();

  if (res.fortyfivez_remaining_years > 0){
    const fullYears = Math.floor(res.fortyfivez_remaining_years);
    const stubYears = res.fortyfivez_remaining_years - fullYears;

    let pv45z = 0;

    // partial first period
    if (stubYears > 0){
      pv45z += (res.fortyfivez_annual_value * stubYears) / Math.pow(1 + discountRate, stubYears);
    }

    // full years after the stub
    for (let i = 1; i <= fullYears; i++){
      const t = stubYears + i;
      pv45z += res.fortyfivez_annual_value / Math.pow(1 + discountRate, t);
    }

    res.fortyfivez_discounted_value = pv45z;
  } else {
    res.fortyfivez_discounted_value = 0;
  }
} else {
  res.fortyfivez_annual_value = NaN;
  res.fortyfivez_remaining_years = 0;
  res.fortyfivez_discounted_value = NaN;
}


 res.rateDetail =
    `Raw factor = (${fmt(bench_kg_per_mmbtu,2)} − ${fmt(res.emissions_kg_per_mmbtu,2)}) ÷ ${fmt(bench_kg_per_mmbtu,2)} = ${fmt(res.emissions_factor_raw,3)}
Rounded factor = ${fmt(res.emissions_factor_rounded,1)}
Rate = ${fmt(res.emissions_factor_rounded,1)} × $${fmt(maxRate,2)} = $${fmt(res.rate,4)}/gal`;
}
  return res;
}

function renderOutputs(){
  const r = compute();

  const out45zCi       = document.getElementById("out45zCi");
  const outRate        = document.getElementById("outRate");
  const proxyCiKgmmbtu = document.getElementById("proxyCiKgmmbtu");
  const proxyCiGmj     = document.getElementById("proxyCiGmj");
  const outRateDetailNote  = document.getElementById("outRateDetailNote");
  const outRateDetail      = document.getElementById("outRateDetail");
  const outMilesHub    = document.getElementById("outMilesHub");
  const outFreightHub  = document.getElementById("outFreightHub");
  const outPayout      = document.getElementById("outPayout");
  const outPayoutDetail= document.getElementById("outPayoutDetail");
  const outTotalDiscountedValue = document.getElementById("outTotalDiscountedValue");
  const outFinalCreditValue = document.getElementById("outFinalCreditValue");
  const outFinalCreditValueDetail = document.getElementById("outFinalCreditValueDetail");
  const outConvLine    = document.getElementById("outConvLine");
  const outBiogenicCo2 = document.getElementById("outBiogenicCo2");
  const out45qAnnualValue = document.getElementById("out45qAnnualValue");
  const out45qRemainingYearsPolicy = document.getElementById("out45qRemainingYearsPolicy");
  const out45qEffectiveYears = document.getElementById("out45qEffectiveYears");
  const out45qValuePerGal = document.getElementById("out45qValuePerGal");
  const out45qCreditPerTonPolicy = document.getElementById("out45qCreditPerTonPolicy");
  const out45zRemainingYears = document.getElementById("out45zRemainingYears");
  const out45qEffectiveYearsTop = document.getElementById("out45qEffectiveYearsTop");
  const outTotalDiscountedValueNote = document.getElementById("outTotalDiscountedValueNote");



  const benchEq = document.getElementById("benchGmjEq");
  if (benchEq){
    const b = getNumber("ciBenchmark"); // kg/MMBtu
    benchEq.textContent = Number.isFinite(b)
      ? fmt(b / CONV_G_PER_MJ_TO_KG_PER_MMBTU, 2)
      : "—";
  }

  if (proxyCiKgmmbtu){
    proxyCiKgmmbtu.textContent = Number.isFinite(r.emissions_kg_per_mmbtu)
      ? fmt(r.emissions_kg_per_mmbtu, 2)
      : "—";
  }
  if (proxyCiGmj){
    proxyCiGmj.textContent = Number.isFinite(r.ci45z_g_per_mj)
      ? fmt(r.ci45z_g_per_mj, 2)
      : "—";
  }

  if (!out45zCi || !outRate) return;

  // ----------------------------
  // No plant selected
  // ----------------------------
  if (!r.hasPlant){
    out45zCi.textContent = "—";
    outRate.textContent  = "—";

    if (outPayout) outPayout.textContent = "—";
    if (outPayoutDetail) outPayoutDetail.textContent = "—";
    if (outTotalDiscountedValue) outTotalDiscountedValue.textContent = "—";
    if (outFinalCreditValue) outFinalCreditValue.textContent = "—";
    if (outFinalCreditValueDetail) outFinalCreditValueDetail.textContent = "—";


    if (outBiogenicCo2) outBiogenicCo2.textContent = "—";
    if (out45qAnnualValue) out45qAnnualValue.textContent = "—";
    if (out45qRemainingYearsPolicy) out45qRemainingYearsPolicy.textContent = "—";
    if (out45qEffectiveYears) out45qEffectiveYears.textContent = "—";
    if (out45qValuePerGal) out45qValuePerGal.textContent = "—";
    if (out45qCreditPerTonPolicy) out45qCreditPerTonPolicy.textContent = "—";



    if (outRateDetail) outRateDetail.textContent = "—";
    if (outRateDetailNote) outRateDetailNote.textContent = "—";
    if (outMilesHub) outMilesHub.textContent = "—";
    if (outFreightHub) outFreightHub.textContent = "—";
    if (outConvLine) outConvLine.textContent = "—";
    if (out45zRemainingYears) out45zRemainingYears.textContent = "—";
    if (out45qEffectiveYearsTop) out45qEffectiveYearsTop.textContent = "—";
    if (outTotalDiscountedValueNote) outTotalDiscountedValueNote.textContent = "45Z + 45Q values discounted at —";
    return;
  }

  // ----------------------------
  // Normal outputs
  // ----------------------------
  if (outMilesHub){
    outMilesHub.textContent = Number.isFinite(r.milesNet) ? `${fmt(r.milesNet, 0)} mi` : "—";
  }
  if (outFreightHub){
    outFreightHub.textContent = Number.isFinite(r.freightCi) ? fmt(r.freightCi, 2) : "—";
  }

  if (outBiogenicCo2){
  outBiogenicCo2.textContent = Number.isFinite(r.biogenic_co2_tons_per_year)
    ? r.biogenic_co2_tons_per_year.toLocaleString(undefined, {
        maximumFractionDigits: 0
      })
    : "—";
}
  

  if (out45qAnnualValue){
    out45qAnnualValue.textContent = Number.isFinite(r.fortyfiveq_annual_value)
      ? r.fortyfiveq_annual_value.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0
        })
      : "—";
  }

if (out45qRemainingYearsPolicy){
  out45qRemainingYearsPolicy.textContent = Number.isFinite(r.fortyfiveq_remaining_years_policy)
    ? fmt(r.fortyfiveq_remaining_years_policy, 1)
    : "—";
}

if (out45qCreditPerTonPolicy){
  out45qCreditPerTonPolicy.textContent = Number.isFinite(r.fortyfiveq_credit_per_ton)
    ? fmt(r.fortyfiveq_credit_per_ton, 2)
    : "—";
}

if (out45qEffectiveYears){
  out45qEffectiveYears.textContent = Number.isFinite(r.fortyfiveq_effective_years)
    ? fmt(r.fortyfiveq_effective_years, 1)
    : "—";
}

if (out45zRemainingYears){
  out45zRemainingYears.textContent = Number.isFinite(r.fortyfivez_remaining_years)
    ? fmt(r.fortyfivez_remaining_years, 1)
    : "—";
}

if (out45qEffectiveYearsTop){
  out45qEffectiveYearsTop.textContent = Number.isFinite(r.fortyfiveq_effective_years)
    ? fmt(r.fortyfiveq_effective_years, 1)
    : "—";
}

if (outTotalDiscountedValueNote){
  outTotalDiscountedValueNote.textContent = Number.isFinite(r.discount_rate_pct)
    ? `45Z + 45Q values discounted at ${fmt(r.discount_rate_pct, 1)}%`
    : "45Z + 45Q values discounted at —";
}


if (out45qValuePerGal){
  out45qValuePerGal.textContent = Number.isFinite(r.fortyfiveq_value_per_gal)
    ? `$${fmt(r.fortyfiveq_value_per_gal, 4)}`
    : "—";
}



  out45zCi.textContent = Number.isFinite(r.emissions_kg_per_mmbtu)
    ? fmt(r.emissions_kg_per_mmbtu, 2)
    : "—";

  outRate.textContent = Number.isFinite(r.rate)
    ? `$${fmt(r.rate, 5)}`
    : "—";

  if (outConvLine){
    if (Number.isFinite(r.ci45z_g_per_mj) && Number.isFinite(r.emissions_kg_per_mmbtu)){
      outConvLine.textContent =
        `Unit Conversion: ${fmt(r.ci45z_g_per_mj, 2)} g/MJ → ${fmt(r.emissions_kg_per_mmbtu, 2)} kg/MMBtu`;
    } else {
      outConvLine.textContent = "—";
    }
  }

  if (outRateDetail){
    outRateDetail.textContent = r.rateDetail ? r.rateDetail : "—";
  }
  if (outRateDetailNote){
    outRateDetailNote.textContent = "—";
  }

  const cap = selectedPlant
    ? Number(selectedPlant.ethanol_capacity_mgy ?? selectedPlant["ethanol_capacity_mgy"])
    : NaN;
  const gallonsPerYear = Number.isFinite(cap) ? cap * 1_000_000 : NaN;

  let payout = NaN;

  if (outPayout){
    if (Number.isFinite(r.rate) && Number.isFinite(gallonsPerYear)){
      payout = r.rate * gallonsPerYear;

      outPayout.textContent = payout.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      });

      if (outPayoutDetail){
  const zYears = Number.isFinite(r.fortyfivez_remaining_years) ? fmt(r.fortyfivez_remaining_years, 1) : "—";
  const qYears = Number.isFinite(r.fortyfiveq_effective_years) ? fmt(r.fortyfiveq_effective_years, 1) : "—";
  const qPerGal = Number.isFinite(r.fortyfiveq_value_per_gal) ? fmt(r.fortyfiveq_value_per_gal, 4) : "—";

  if (
    Number.isFinite(r.rate) &&
    Number.isFinite(cap) &&
    Number.isFinite(r.fortyfivez_remaining_years) &&
    Number.isFinite(r.fortyfiveq_effective_years) &&
    Number.isFinite(r.fortyfiveq_value_per_gal)
  ){
outPayoutDetail.textContent =
  `Total credit = 45Z annual payout: ${fmt(cap,1)} MMgy × $${fmt(r.rate,2)}/gal × ${zYears} years discounted at ${fmt(r.discount_rate_pct,1)}% + ` +
  `45Q annual payout: ${fmt(cap,1)} MMgy × $${qPerGal}/gal × ${qYears} effective years discounted at ${fmt(r.discount_rate_pct,1)}%`;
  } else {
    outPayoutDetail.textContent = "—";
  }
}


    } else {
      outPayout.textContent = "—";
      if (outPayoutDetail) outPayoutDetail.textContent = "Needs capacity + rate";
    }
  }

const discPct = getNumber("creditDiscountCombined");const disc = Number.isFinite(discPct) ? (discPct / 100.0) : NaN;

let totalDiscountedValue = NaN;

if (Number.isFinite(r.fortyfivez_discounted_value) && Number.isFinite(r.fortyfiveq_discounted_value)){
  totalDiscountedValue = r.fortyfivez_discounted_value + r.fortyfiveq_discounted_value;
} else if (Number.isFinite(r.fortyfivez_discounted_value)) {
  totalDiscountedValue = r.fortyfivez_discounted_value;
} else if (Number.isFinite(r.fortyfiveq_discounted_value)) {
  totalDiscountedValue = r.fortyfiveq_discounted_value;
}

if (outTotalDiscountedValue){
  outTotalDiscountedValue.textContent = Number.isFinite(totalDiscountedValue)
    ? totalDiscountedValue.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })
    : "—";
}

if (outFinalCreditValue){
  if (Number.isFinite(totalDiscountedValue) && Number.isFinite(disc)){
    const finalCreditValue = totalDiscountedValue * disc;

    outFinalCreditValue.textContent = finalCreditValue.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });

    if (outFinalCreditValueDetail){
      outFinalCreditValueDetail.textContent =
        `${totalDiscountedValue.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})} × ${fmt(discPct,1)}%`;
    }
  } else {
    outFinalCreditValue.textContent = "—";
    if (outFinalCreditValueDetail) outFinalCreditValueDetail.textContent = "Needs total discounted value + discount";
  }
}

}


// ----------------------------
// EVENTS
// ----------------------------
function wireEvents(){

  // Helpers
  function onInput(id, fn){
  const el = document.getElementById(id);
  if (!el){
    console.warn(`[wireEvents] Missing element id="${id}"`);
    return;
  }

  el.addEventListener("input", fn);
  el.addEventListener("change", fn);
}

  function resetMiscOverride(){
    const misc = document.getElementById("ccsReduction");
    if (misc) misc.value = "0";
    const miscCb = document.getElementById("applyMisc");
    if (miscCb) miscCb.checked = false;
  }

  function handlePlantSelectChange(){
    const sel = document.getElementById("plantSelect");
    const chosenId = String(sel ? sel.value : "").trim();

    selectedPlant = filteredPlants.find(p =>
      String(p.facility_id ?? p.ca_facility_id ?? p.__id ?? "").trim() === chosenId
    ) || null;

    // Reset misc override when switching plants
    resetMiscOverride();

    // Sync plant-dependent UI
    syncCcsUI();
    syncChapter2PipelineUI();
    


    // Hubs depend on rail lines
    renderHubs();

    // Starting CI + feedstock/enhancement panel
    renderStartingPanel();
    renderCkfPanel();
    renderCkfChart();
    renderProgramSummary();
    renderLcfsDetail();
    
    // Freight: auto-on for LCFS plants, forced off for proxy plants
    const freightCb = document.getElementById("applyFreight");
    if (freightCb){
      const mode = selectedPlant ? (startingCI(selectedPlant).mode || "proxy") : "proxy";
      freightCb.checked = (mode === "lcfs");
    }
    syncFreightUI();
    syncElectricityBridgeUI();
    
    renderPlantDetails();
    renderOutputs();

  // --- Wire inputs ---

  // Search: rebuild plant list
  onInput("searchBox", () => {
    applyFilters();
  });

  // Plant select: full re-sync
  onInput("plantSelect", () => {
    handlePlantSelectChange();
  });

  // Freight checkbox: enable/disable freight controls + recompute
  onInput("applyFreight", () => {
    syncFreightUI();
    renderOutputs();
  });
  
  onInput("ch2_pipeline_apply", () => {
   syncCcsDatesUI();
   sync45QValueSection();
   renderOutputs();
 });

  // All other calc-driving inputs: recompute only
  const calcIds = [
    "caHub",
    "freightMultiplier","gPerMjPerMile",
    "subtractIluc","ilucValue",
    "ckf_apply","ckf_share_pct",
    "applyMisc","ccsReduction",
    "ciBenchmark","maxRate",
    "ch2_pipeline_apply","ch2_pipeline_score",
    "ccs_in_service_date","ccs_ci_effective_date",
    "fortyfiveqStorageType",
    "ag_apply","ag_score",
    "discountRate",
    "creditDiscountCombined"
  ];

  for (const id of calcIds){
    onInput(id, () => {
      renderCkfPanel();
      renderCkfChart();
      renderOutputs();
    });
  }




  // OPTIONAL: wire click buttons (▲/▼)
  const up = document.getElementById("miscUp");
  const dn = document.getElementById("miscDown");
  if (up) up.addEventListener("click", () => nudgeNumber("ccsReduction", +1.0));
  if (dn) dn.addEventListener("click", () => nudgeNumber("ccsReduction", -1.0));
}
          
         
  // ----------------------------
  // INIT
  // ----------------------------
  async function init(){
    console.log("INIT START");
    console.log("window.location.href =", window.location.href);
    console.log("Attempting fetch from =", DATA_URL);

    // Render hubs immediately (plants can fail; hubs must still show)
    bootRender();

    // --- Fetch JSON with good diagnostics ---
    let resp;
    try {
      resp = await fetch(DATA_URL, { cache: "no-store" });
      console.log("FETCH status =", resp.status);
      console.log("FETCH ok =", resp.ok);
      console.log("FETCH url =", resp.url);
      console.log("CONTENT-TYPE =", resp.headers.get("content-type"));
    
      if (!resp.ok){
        const txt = await resp.text().catch(() => "(no body)");
        console.error("FETCH FAILED BODY:", txt);
        alert(`JSON fetch failed: ${resp.status}. See console.`);
        return;
      }
    } catch (e) {
      console.error("FETCH ERROR:", e);
      alert("Fetch failed (network / path). Open console for details.");
      return;
    }

    // --- Parse JSON (guard against bad JSON) ---
    let raw;
    try {
      raw = await resp.json();
    } catch (e) {
      console.error("JSON PARSE ERROR:", e);
      alert("JSON fetched but could not be parsed. See console.");
      return;
    }

    console.log("RAW TYPE =", typeof raw);
    console.log("RAW IS ARRAY =", Array.isArray(raw));
    if (!Array.isArray(raw)) {
      console.log("RAW TOP LEVEL KEYS =", Object.keys(raw || {}));
    }
        
    // 2) Accept multiple JSON shapes
    let rows = null;
    if (Array.isArray(raw)) rows = raw;
    else if (raw && Array.isArray(raw.plants)) rows = raw.plants;
    else if (raw && Array.isArray(raw.rows)) rows = raw.rows;
    else if (raw && Array.isArray(raw.data)) rows = raw.data;

    if (!rows){
      console.error("JSON shape not recognized:", raw);
      alert("JSON loaded but shape is not an array. Expected: [] OR {plants:[]} OR {rows:[]} OR {data:[]}. Check console.");
      return;
    }

    function parseCap(x){
      if (x === null || x === undefined || x === "") return null;
      if (typeof x === "number") return Number.isFinite(x) ? x : null;
    
      const s = String(x).trim();
      if (!s) return null;
    
      // remove commas + common unit text
      const cleaned = s.replace(/,/g, "").replace(/mgy/ig, "").trim();
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }





       // 3) Normalize rows
allPlants = rows.map((p, i) => {
  const fac   = p.fac_info || {};
  const dryer = p.dryer_analysis || {};
  const rin   = p.rin_info || {};
  const ci    = p.ci_summary || {};
  const detail= p.lcfs_detail || {};
  const tech  = p.tech_flags || {};
  const co2   = p.co2_info || {};
  const meta  = p.meta || {};
  

  const out = {
    ...p,

    // ---- fac_info ----
    facility_id: p.facility_id ?? fac.facility_id ?? null,
    ca_facility_id: p.ca_facility_id ?? fac.facility_id ?? null,
    plant_name: p.plant_name ?? fac.plant_name ?? null,
    ownership: p.ownership ?? fac.ownership ?? null,
    state: p.state ?? fac.state ?? null,
    city: p.city ?? fac.city ?? null,
    latitude: p.latitude ?? fac.latitude ?? null,
    longitude: p.longitude ?? fac.longitude ?? null,
    rail_lines: p.rail_lines ?? fac.rail_lines ?? null,
    ethanol_capacity_mgy: p.ethanol_capacity_mgy ?? fac.ethanol_capacity_mgy ?? null,
    year_build: p.year_build ?? fac.year_build ?? null,

    // ---- rin_info ----
    d6_non_cellulosic: p.d6_non_cellulosic ?? rin.d6_non_cellulosic ?? null,
    d3_cellulosic: p.d3_cellulosic ?? rin.d3_cellulosic ?? null,

    // ---- ci_summary ----
    ci_lcfs_delivered_g_per_mj: p.ci_lcfs_delivered_g_per_mj ?? ci.ci_lcfs_delivered_g_per_mj ?? null,
    ci_date: p.ci_date ?? ci.ci_date ?? null,
    ci_by_feedstock: p.ci_by_feedstock ?? ci.ci_by_feedstock ?? {},

    // ---- lcfs_detail ----
    ca_detail: p.ca_detail ?? detail.ca_detail ?? [],
    or_detail: p.or_detail ?? detail.or_detail ?? [],

    // ---- tech_flags ----
    high_pro: p.high_pro ?? tech.high_pro ?? null,
    chp: p.chp ?? tech.chp ?? null,
    white_fox: p.white_fox ?? tech.white_fox ?? null,
    icm_p10: p.icm_p10 ?? tech.icm_p10 ?? null,
    
    dco_enhancement:
      p.dco_enhancement ??
      tech.dco_enhancement ??
      p["DCO Enhancement"] ??
      p["DCO Enhancement\n(lb/bu)"] ??
      p["ICM FOT"] ??
      tech["ICM FOT"] ??
      null,
    
    special_tech: p.special_tech ?? tech.special_tech ?? null,
    wind_turbine: p.wind_turbine ?? tech.wind_turbine ?? null,
    waste_heat: p.waste_heat ?? tech.waste_heat ?? null,
    dryer_types: p.dryer_types ?? tech.dryer_types ?? null,
    technology: p.technology ?? tech.technology ?? null,
    reg_pathway: p.reg_pathway ?? tech.reg_pathway ?? null,
    gas_supply: p.gas_supply ?? tech.gas_supply ?? null,
    electricity_type: p.electricity_type ?? tech.electricity_type ?? null,
    
    electrical_grid_designation: p.electrical_grid_designation ?? tech.electrical_grid_designation ?? null,
    fiber_technology: p.fiber_technology ?? tech.fiber_technology ?? null,
    
     implied_dryer_btu_per_gal:
      p.implied_dryer_btu_per_gal ?? dryer.implied_dryer_btu_per_gal ?? null,

     relative_dryer_efficiency_bucket:
      p.relative_dryer_efficiency_bucket ?? dryer.relative_dryer_efficiency_bucket ?? null,
    
    dryer_used: p.dryer_used ?? tech.dryer_used ?? null,
    
    
    
    dryer_confidence: p.dryer_confidence ?? tech.dryer_confidence ?? null,
    dryer_conflict: p.dryer_conflict ?? tech.dryer_conflict ?? false,
    dryer_tokens: p.dryer_tokens ?? tech.dryer_tokens ?? [],


    // ---- co2_info ----
    co2_pipeline_direct: p.co2_pipeline_direct ?? co2.co2_pipeline_direct ?? null,
    co2_pipeline_3rd_party: p.co2_pipeline_3rd_party ?? co2.co2_pipeline_3rd_party ?? null,
    co2_rail_connect: p.co2_rail_connect ?? co2.co2_rail_connect ?? null,
    co2_sponsor: p.co2_sponsor ?? co2.co2_sponsor ?? null,
    
    // ---- epa_ghg_derived ----
    thermal_btu_per_gal_est:
      p.thermal_btu_per_gal_est ??
      p.epa_ghg_derived?.thermal_btu_per_gal_est ??
      null,

        // ---- meta ----
    source_table: p.source_table ?? meta.source_table ?? null,
    desc_raw: p.desc_raw ?? meta.desc_raw ?? "",

    // ---- CKF chart fields ----
    ckf_ci_score: p.ckf_ci_score ?? null,
    ckf_distribution: Array.isArray(p.ckf_distribution) ? p.ckf_distribution : []
  };
  
  

  // Stable ID
  out.__id = String(out.epm ?? out.EPM ?? out.facility_id ?? out.ca_facility_id ?? i).trim();

  // Numeric cleanup
  out.latitude = (out.latitude === null || out.latitude === "" || out.latitude === undefined) ? null : Number(out.latitude);
  if (!Number.isFinite(out.latitude)) out.latitude = null;

  out.longitude = (out.longitude === null || out.longitude === "" || out.longitude === undefined) ? null : Number(out.longitude);
  if (!Number.isFinite(out.longitude)) out.longitude = null;

  out.ethanol_capacity_mgy =
    (out.ethanol_capacity_mgy === null || out.ethanol_capacity_mgy === "" || out.ethanol_capacity_mgy === undefined)
      ? null
      : Number(out.ethanol_capacity_mgy);
  if (!Number.isFinite(out.ethanol_capacity_mgy)) out.ethanol_capacity_mgy = null;
  
  out.thermal_btu_per_gal_est =
  (out.thermal_btu_per_gal_est === null || out.thermal_btu_per_gal_est === "" || out.thermal_btu_per_gal_est === undefined)
    ? null
    : Number(out.thermal_btu_per_gal_est);
  if (!Number.isFinite(out.thermal_btu_per_gal_est)) out.thermal_btu_per_gal_est = null;

  out.year_build =
    (out.year_build === null || out.year_build === "" || out.year_build === undefined)
      ? null
      : Number(out.year_build);
  if (!Number.isFinite(out.year_build)) out.year_build = null;

   out.year_build =
    (out.year_build === null || out.year_build === "" || out.year_build === undefined)
      ? null
      : Number(out.year_build);
  if (!Number.isFinite(out.year_build)) out.year_build = null;

  out.ckf_ci_score =
    (out.ckf_ci_score === null || out.ckf_ci_score === "" || out.ckf_ci_score === undefined)
      ? null
      : Number(out.ckf_ci_score);
  if (!Number.isFinite(out.ckf_ci_score)) out.ckf_ci_score = null;

  return out;
});


    // ✅ Diagnostics MUST be outside the map
    console.log("Loaded rows:", allPlants.length);
    console.log("Sample keys:", allPlants[0] ? Object.keys(allPlants[0]) : "(none)");

    const capCount = allPlants.filter(p => Number.isFinite(p.ethanol_capacity_mgy)).length;
    console.log("Capacity non-null count:", capCount, "of", allPlants.length);

    const capSamples = allPlants
      .filter(p => Number.isFinite(p.ethanol_capacity_mgy))
      .slice(0, 5)
      .map(p => ({ name: p.plant_name, cap: p.ethanol_capacity_mgy }));
    console.log("Capacity samples:", capSamples);
    
    const ckfEligibleCount = allPlants.filter(p => hasCaliforniaCkf(p)).length;
    console.log("CKF CA-eligible plants:", ckfEligibleCount);

    // 4) Wire + render
    wireEvents();
    applyFilters();
    sync45QValueSection();
    
  }

  // Kick off load after DOM is ready (ONLY ONCE)
  window.addEventListener("DOMContentLoaded", () => {
    init().catch(e => console.error("INIT FAILED:", e));
  });
