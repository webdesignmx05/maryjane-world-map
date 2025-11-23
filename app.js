// Maryjane World Tour Dashboard
// Data schema expected in data.json:
// [
//   {
//     "country": "Brazil",
//     "continent": "South America",
//     "videos": [
//       {
//         "title": "SOLO in Rio De Janeiro My First Time in Brazil",
//         "url": "https://www.youtube.com/watch?v=i6nK8YHTyVQ",
//         "publishedAt": "2025-08-01T20:56:00Z"
//       }
//     ]
//   }
// ]

const state = {
  data: [],
  countries: [],        // derived list
  selected: new Set(),  // selected country names
  geoLayer: null,
  map: null,
  geojson: null
};

const els = {
  countryList: document.getElementById("countryList"),
  countrySearch: document.getElementById("countrySearch"),
  results: document.getElementById("results"),
  timeline: document.getElementById("timeline"),
  continentSummary: document.getElementById("continentSummary"),
  statCountries: document.getElementById("statCountries"),
  statVideos: document.getElementById("statVideos"),
  statFirst: document.getElementById("statFirst"),
  statLatest: document.getElementById("statLatest"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  clearBtn: document.getElementById("clearBtn"),
};

init();

async function init(){
  state.data = await fetch("./data.json").then(r => r.json());

  normalize();
  renderStats();
  renderContinentSummary();
  renderCountryList();
  await initMap();
  renderAll();

  wireEvents();
}

function normalize(){
  // Sort videos within each country by publish date
  state.data.forEach(c => {
    c.videos.sort((a,b)=> new Date(a.publishedAt) - new Date(b.publishedAt));
  });

  // Build countries list A-Z
  state.countries = state.data
    .map(c => ({
      name: c.country,
      continent: c.continent || "Unknown",
      count: c.videos.length,
      first: c.videos[0]?.publishedAt,
      last: c.videos[c.videos.length-1]?.publishedAt
    }))
    .sort((a,b)=> a.name.localeCompare(b.name));

  // Default select all
  state.countries.forEach(c => state.selected.add(c.name));
}

function renderStats(){
  const totalCountries = state.countries.length;
  const totalVideos = state.countries.reduce((s,c)=> s + c.count, 0);

  const allVideos = state.data.flatMap(c=> c.videos.map(v=>({...v,country:c.country})));
  const sorted = allVideos.sort((a,b)=> new Date(a.publishedAt)-new Date(b.publishedAt));
  const first = sorted[0]?.publishedAt;
  const last = sorted[sorted.length-1]?.publishedAt;

  els.statCountries.textContent = totalCountries;
  els.statVideos.textContent = totalVideos;
  els.statFirst.textContent = first ? fmtDate(first) : "–";
  els.statLatest.textContent = last ? fmtDate(last) : "–";
}

function renderContinentSummary(){
  const counts = {};
  state.countries.forEach(c=>{
    counts[c.continent] = (counts[c.continent]||0)+1;
  });

  const continents = [
    "Africa","Antarctica","Asia","Europe",
    "North America","South America","Oceania","Unknown"
  ].filter(k => counts[k]);

  els.continentSummary.innerHTML = continents.map(k=>`
    <div class="row">
      <div>${k}</div>
      <div><b>${counts[k]}</b></div>
    </div>
  `).join("");
}

function renderCountryList(filterText=""){
  const ft = filterText.trim().toLowerCase();
  const items = state.countries.filter(c => c.name.toLowerCase().includes(ft));

  els.countryList.innerHTML = items.map(c=>{
    const checked = state.selected.has(c.name);
    return `
      <label class="country-item">
        <div class="country-left">
          <input type="checkbox" data-country="${c.name}" ${checked?"checked":""}/>
          <span>${c.name}</span>
        </div>
        <span class="country-count">${c.count}</span>
      </label>
    `;
  }).join("");
}

function renderAll(){
  renderResults();
  renderTimeline();
  updateMapStyles();
}

function getFilteredData(){
  return state.data.filter(c => state.selected.has(c.country));
}

function renderResults(){
  const filtered = getFilteredData()
    .sort((a,b)=> a.country.localeCompare(b.country));

  if(!filtered.length){
    els.results.innerHTML = `<p class="muted">No countries selected.</p>`;
    return;
  }

  els.results.innerHTML = filtered.map(c=>{
    const vids = c.videos.map(v=>`
      <div class="video">
        <a href="${v.url}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a>
        <div class="muted">${fmtDate(v.publishedAt)}</div>
      </div>
    `).join("");

    return `
      <div class="country-block">
        <h3>${c.country} <small>${c.videos.length} video${c.videos.length!==1?"s":""}</small></h3>
        ${vids}
      </div>
    `;
  }).join("");
}

function renderTimeline(){
  const filtered = getFilteredData();
  const all = filtered.flatMap(c => c.videos.map(v=>({
    ...v, country: c.country
  })));

  all.sort((a,b)=> new Date(a.publishedAt) - new Date(b.publishedAt));

  els.timeline.innerHTML = all.map(v=>`
    <div class="tl-item">
      <div class="date">${fmtDate(v.publishedAt)}</div>
      <div><b>${v.country}</b></div>
      <a href="${v.url}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a>
    </div>
  `).join("") || `<p class="muted">No timeline items.</p>`;
}

async function initMap(){
  state.map = L.map("map", { zoomControl: true }).setView([20,0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 6,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);

  // World countries GeoJSON
  // Source: https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json
  state.geojson = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(r=>r.json());

  state.geoLayer = L.geoJSON(state.geojson, {
    style: feature => baseStyle(feature),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.name;
      layer.on({
        click: () => toggleCountry(name, true),
        mouseover: e => e.target.setStyle({ weight: 2 }),
        mouseout: e => state.geoLayer.resetStyle(e.target)
      });
      layer.bindTooltip(name, { sticky:true });
    }
  }).addTo(state.map);
}

function baseStyle(feature){
  const name = feature.properties.name;
  const visited = state.selected.has(name) || isAliasVisited(name);
  return {
    color: "#1f2937",
    weight: 1,
    fillColor: visited ? "#34d399" : "#0b1120",
    fillOpacity: visited ? 0.65 : 0.25
  };
}

function updateMapStyles(){
  if(!state.geoLayer) return;
  state.geoLayer.setStyle(f => baseStyle(f));
}

function toggleCountry(countryName, fromMap=false){
  // If clicked on map, try to match aliases too
  const canonical = findCanonicalName(countryName);
  if(!canonical) return;

  if(state.selected.has(canonical)) state.selected.delete(canonical);
  else state.selected.add(canonical);

  renderCountryList(els.countrySearch.value);
  renderAll();
}

function findCanonicalName(name){
  if(state.countries.some(c=> c.name===name)) return name;

  // very small alias set; you can extend in data.json "aliases"
  const aliasMap = {
    "United States of America": "United States",
    "Russian Federation": "Russia",
    "Czechia": "Czech Republic",
    "Côte d'Ivoire": "Ivory Coast",
    "Democratic Republic of the Congo": "DR Congo",
    "Republic of the Congo": "Congo",
    "Viet Nam": "Vietnam",
    "Lao People's Democratic Republic": "Laos",
    "Bolivia (Plurinational State of)": "Bolivia",
    "Iran (Islamic Republic of)": "Iran",
    "Syrian Arab Republic": "Syria",
    "Türkiye": "Turkey"
  };
  return aliasMap[name] || null;
}

function isAliasVisited(name){
  const canonical = findCanonicalName(name);
  return canonical ? state.selected.has(canonical) : false;
}

function wireEvents(){
  els.countrySearch.addEventListener("input", e=>{
    renderCountryList(e.target.value);
  });

  els.countryList.addEventListener("change", e=>{
    const cb = e.target.closest("input[type=checkbox]");
    if(!cb) return;
    const c = cb.dataset.country;
    if(cb.checked) state.selected.add(c);
    else state.selected.delete(c);
    renderAll();
  });

  els.selectAllBtn.addEventListener("click", ()=>{
    state.countries.forEach(c=> state.selected.add(c.name));
    renderCountryList(els.countrySearch.value);
    renderAll();
  });

  els.clearBtn.addEventListener("click", ()=>{
    state.selected.clear();
    renderCountryList(els.countrySearch.value);
    renderAll();
  });
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"});
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
