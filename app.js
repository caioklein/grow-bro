/* ================================================================
   DIÁRIO DE CULTIVO — lógica da aplicação
   Tudo é persistido em localStorage, sem dependências externas.
   ================================================================ */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONSTANTES / CATÁLOGOS PADRÃO
     --------------------------------------------------------- */
  const STORAGE_KEY = "diario-cultivo:v2";

  const ESTAGIOS = [
    "Germinação", "Muda", "Vegetativo", "Pré-floração",
    "Floração", "Flush", "Colhida"
  ];

  const ATIVIDADES_PADRAO = [
    "Daily Check", "Rega", "Flush", "Rega & Poda", "Rega & LST"
  ];

  // Cores pastel fixas para as atividades padrão; atividades personalizadas
  // recebem uma cor determinística de uma paleta auxiliar.
  const ATIVIDADE_CORES = {
    "Daily Check": { bg: "#DCEAF5", fg: "#3E6E91", dot: "#6FB3D9" },
    "Rega":        { bg: "#E1F0E3", fg: "#3E7A4C", dot: "#7BC47F" },
    "Flush":       { bg: "#DEF3F1", fg: "#2E7D75", dot: "#5FC2B6" },
    "Rega & Poda": { bg: "#F5E9D8", fg: "#8C5A2B", dot: "#E2A25E" },
    "Rega & LST":  { bg: "#EDE3F5", fg: "#6B4C91", dot: "#B79CE0" },
  };
  const ATIVIDADE_FALLBACK_PALETTE = [
    { bg: "#FBEAE6", fg: "#B05A47", dot: "#E79683" },
    { bg: "#F5EFD8", fg: "#8C7A2B", dot: "#D9C25E" },
    { bg: "#E3EFF5", fg: "#3E6B8C", dot: "#7FB3D9" },
    { bg: "#EEE3F5", fg: "#7B4C91", dot: "#C79CE0" },
  ];
  function activityColor(name) {
    if (ATIVIDADE_CORES[name]) return ATIVIDADE_CORES[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return ATIVIDADE_FALLBACK_PALETTE[hash % ATIVIDADE_FALLBACK_PALETTE.length];
  }

  // Categorias de nutrientes, na ordem correta de adição na água
  // (referência geral: sílica e cálcio/magnésio primeiro, bases isoladas
  // uma de cada vez, potencializadores e carboidratos depois, pH sempre
  // ajustado por último). O usuário pode reordenar manualmente se usar
  // outra rotina.
  const NUTRIENT_CATEGORIES_PADRAO = [
    { id: "silica",     nome: "Silício",                                    ordem: 1 },
    { id: "calmag",     nome: "Cálcio e Magnésio",                          ordem: 2 },
    { id: "raiz",       nome: "Enraizadores & Bioestimulantes",             ordem: 3 },
    { id: "base-veg",   nome: "Base — Crescimento (A/B)",                   ordem: 4 },
    { id: "base-bloom", nome: "Base — Floração (A/B)",                      ordem: 5 },
    { id: "unico",      nome: "Solução Única",                              ordem: 6 },
    { id: "complexos",  nome: "Complexos Vitamínicos & Enzimáticos",        ordem: 7 },
    { id: "boost",      nome: "Indutores & Potencializadores de Floração",  ordem: 8 },
    { id: "carbo",      nome: "Carboidratos",                               ordem: 9 },
    { id: "final",      nome: "Finalização",                                ordem: 10 },
    { id: "outros",     nome: "Outros",                                     ordem: 11 },
  ];

  // Linha de nutrientes Smart Grow (produtos reais da marca), já
  // categorizados. O usuário pode adicionar outros livremente.
  const NUTRIENTES_PADRAO = [
    { nome: "Super Shell",    categoriaId: "silica" },
    { nome: "Dank Mag",       categoriaId: "calmag" },
    { nome: "CalBor Mag",     categoriaId: "calmag" },
    { nome: "Smart Roots",    categoriaId: "raiz" },
    { nome: "Master Grow A",  categoriaId: "base-veg" },
    { nome: "Master Grow B",  categoriaId: "base-veg" },
    { nome: "Master Bloom A", categoriaId: "base-bloom" },
    { nome: "Master Bloom B", categoriaId: "base-bloom" },
    { nome: "Smart One",      categoriaId: "unico" },
    { nome: "Complex B+",     categoriaId: "complexos" },
    { nome: "Complex Zym",    categoriaId: "complexos" },
    { nome: "Speed Bud",      categoriaId: "boost" },
    { nome: "Fat Nug",        categoriaId: "boost" },
    { nome: "Zen",            categoriaId: "boost" },
    { nome: "Candy Carb",     categoriaId: "carbo" },
    { nome: "Last Mile",      categoriaId: "final" },
  ];

  const PLANT_PALETTE = ["#6FAE7C", "#D9A64E", "#5FA8BF", "#D98A63", "#9B84C9", "#D97FA8", "#8AB94F", "#C9A63A"];
  function growAvatarColor(index) { return PLANT_PALETTE[index % PLANT_PALETTE.length]; }
  function growInitial(nome) {
    const trimmed = (nome || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "?";
  }

  // Tipos de cultivo suportados.
  const TIPOS_CULTIVO = { fotoperiodo: "Fotoperíodo", automatica: "Automática" };

  // Faixas de referência de pH da solução, por tipo de cultivo. São valores
  // gerais de referência (fotoperíodo tende a tolerar uma faixa um pouco
  // mais ampla; automáticas costumam pedir uma faixa mais estreita e um
  // pouco mais baixa) — ajustáveis conforme o substrato/rotina do cultivo.
  const PH_RANGES = {
    fotoperiodo: { min: 6.0, max: 7.0 },
    automatica:  { min: 5.8, max: 6.5 },
  };
  const PH_TOLERANCE = 0.3; // além da faixa ideal +/- isso ainda é "atenção"; mais que isso é "fora da faixa"

  // Faixas de referência de VPD (kPa) por estágio da planta — a mesma para
  // os dois tipos de cultivo, já que depende do estágio de desenvolvimento
  // da folhagem, não da genética fotoperíodo/automática.
  const VPD_RANGES = {
    "Germinação":   { min: 0.4, max: 0.8 },
    "Muda":         { min: 0.4, max: 0.8 },
    "Vegetativo":   { min: 0.8, max: 1.2 },
    "Pré-floração": { min: 0.9, max: 1.2 },
    "Floração":     { min: 1.0, max: 1.5 },
    "Flush":        { min: 1.0, max: 1.5 },
    "Colhida":      null,
  };
  const VPD_TOLERANCE = 0.25;

  // Faixas de referência de luz — PPFD (µmol/m²/s), DLI (mol/m²/dia) e
  // fotoperíodo padrão (horas de luz/dia) — por tipo de cultivo e estágio.
  // Fotoperíodo muda o ciclo de luz para induzir a floração (18h → 12h);
  // automáticas costumam manter um ciclo longo e constante do início ao fim.
  const LIGHT_RANGES = {
    fotoperiodo: {
      "Germinação":   { ppfd: [100, 300],  dli: [6, 12],   horas: 18 },
      "Muda":         { ppfd: [200, 400],  dli: [10, 16],  horas: 18 },
      "Vegetativo":   { ppfd: [400, 600],  dli: [25, 35],  horas: 18 },
      "Pré-floração": { ppfd: [500, 700],  dli: [28, 38],  horas: 12 },
      "Floração":     { ppfd: [700, 1000], dli: [35, 45],  horas: 12 },
      "Flush":        { ppfd: [600, 900],  dli: [30, 40],  horas: 12 },
      "Colhida":      null,
    },
    automatica: {
      "Germinação":   { ppfd: [100, 300], dli: [8, 14],  horas: 20 },
      "Muda":         { ppfd: [200, 400], dli: [12, 18], horas: 20 },
      "Vegetativo":   { ppfd: [400, 600], dli: [28, 38], horas: 20 },
      "Pré-floração": { ppfd: [600, 900], dli: [30, 40], horas: 20 },
      "Floração":     { ppfd: [600, 900], dli: [30, 40], horas: 20 },
      "Flush":        { ppfd: [500, 800], dli: [25, 35], horas: 20 },
      "Colhida":      null,
    },
  };

  function phStatus(value, tipo) {
    if (value === "" || value === null || value === undefined || isNaN(value)) return null;
    const r = PH_RANGES[tipo] || PH_RANGES.fotoperiodo;
    return rangeStatus(Number(value), r.min, r.max, PH_TOLERANCE);
  }
  function vpdStatus(value, estagio) {
    if (value === "" || value === null || value === undefined || isNaN(value)) return null;
    const r = VPD_RANGES[estagio];
    if (!r) return null;
    return rangeStatus(Number(value), r.min, r.max, VPD_TOLERANCE);
  }
  function rangeStatus(v, min, max, tolerance) {
    if (v >= min && v <= max) return "ideal";
    if (v >= min - tolerance && v <= max + tolerance) return "warning";
    return "alert";
  }
  function statusLabel(status) {
    return { ideal: "Ideal", warning: "Atenção", alert: "Fora da faixa" }[status] || "—";
  }
  function rangeDotHtml(status) {
    const cls = status ? "range-" + status : "range-none";
    return `<span class="range-dot ${cls}" title="${status ? statusLabel(status) : "sem dados"}"></span>`;
  }
  function rangeTextClass(status) {
    return status ? "range-text range-" + status : "";
  }

  /* ---------------------------------------------------------
     ESTADO
     --------------------------------------------------------- */
  let state = null;
  let ui = {
    activeTab: "visaoGeral",
    expandedEntryId: null,
    editingRegistroId: null,
    editingCultivoId: null,
    editingPlantaId: null,
    editingProgramId: null,
    confirmAction: null,
    cancelAction: null,
    _confirmResolved: false,
    _confirmWasOpen: false,
    nutrienteTarget: null, // { list, rerender } — para onde vai o próximo nutriente adicionado
    tendenciasFiltro: { inicio: null, fim: null }, // null/null = mostrar todo o histórico
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }

  /* ---------------------------------------------------------
     PERSISTÊNCIA
     --------------------------------------------------------- */
  function defaultState() {
    return {
      version: 2,
      updatedAt: 0,
      nutrientCategories: NUTRIENT_CATEGORIES_PADRAO.map(c => ({ ...c })),
      nutrients: NUTRIENTES_PADRAO.map(n => ({ ...n })),
      activityCatalog: ATIVIDADES_PADRAO.slice(),
      nutritionPrograms: [],
      selectedGrowId: null,
      grows: []
    };
  }

  function migrate(parsed) {
    if (typeof parsed.updatedAt !== "number") parsed.updatedAt = 0;
    if (!Array.isArray(parsed.nutrientCategories)) {
      parsed.nutrientCategories = NUTRIENT_CATEGORIES_PADRAO.map(c => ({ ...c }));
    }
    if (!Array.isArray(parsed.nutrients)) {
      // migração de um formato antigo (lista simples de nomes)
      const nameToCat = {};
      NUTRIENTES_PADRAO.forEach(n => { nameToCat[n.nome] = n.categoriaId; });
      if (Array.isArray(parsed.nutrientCatalog)) {
        parsed.nutrients = parsed.nutrientCatalog.map(nome => ({
          nome, categoriaId: nameToCat[nome] || "outros"
        }));
      } else {
        parsed.nutrients = NUTRIENTES_PADRAO.map(n => ({ ...n }));
      }
    }
    delete parsed.nutrientCatalog;
    if (!Array.isArray(parsed.activityCatalog)) parsed.activityCatalog = ATIVIDADES_PADRAO.slice();
    if (!Array.isArray(parsed.nutritionPrograms)) parsed.nutritionPrograms = [];
    parsed.nutritionPrograms.forEach(p => {
      if (!Array.isArray(p.semanas)) p.semanas = [];
      p.semanas.forEach(s => {
        if (!Array.isArray(s.numeros)) {
          s.numeros = (typeof s.numero === "number") ? [s.numero] : [];
          delete s.numero;
        }
        if (!s.id) s.id = uid();
        if (!Array.isArray(s.itens)) s.itens = [];
      });
    });
    if (!Array.isArray(parsed.grows)) parsed.grows = [];
    parsed.grows.forEach(g => {
      if (!("programaId" in g)) g.programaId = null;
      if (!TIPOS_CULTIVO[g.tipo]) g.tipo = "fotoperiodo";
      if (typeof g.finalizado !== "boolean") g.finalizado = false;
      if (!Array.isArray(g.plants)) g.plants = [];
      if (!Array.isArray(g.entries)) g.entries = [];
    });
    return parsed;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state = migrate(parsed);
          return;
        }
      }
    } catch (e) { /* fall through to default */ }
    state = defaultState();
  }

  function save() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showToast("Não foi possível salvar (armazenamento indisponível).");
    }
    schedulePush();
  }

  /* ---------------------------------------------------------
     HELPERS DE DADOS
     --------------------------------------------------------- */
  function getGrow(id) { return state.grows.find(g => g.id === id) || null; }
  function getSelectedGrow() { return getGrow(state.selectedGrowId); }
  function activePlants(grow) { return grow ? grow.plants.filter(p => !p.colhida) : []; }
  function sortedEntries(grow) {
    if (!grow) return [];
    return grow.entries.slice().sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm);
  }
  function plantColor(grow, plantId) {
    const idx = grow.plants.findIndex(p => p.id === plantId);
    return PLANT_PALETTE[idx % PLANT_PALETTE.length];
  }
  function sortedCategories() {
    return state.nutrientCategories.slice().sort((a, b) => a.ordem - b.ordem);
  }
  function getProgram(id) { return state.nutritionPrograms.find(p => p.id === id) || null; }
  function allWeekNumbers(program) {
    const set = new Set();
    program.semanas.forEach(s => (s.numeros || []).forEach(n => set.add(n)));
    return Array.from(set).sort((a, b) => a - b);
  }
  function findBlockForWeek(program, numero) {
    return program.semanas.find(s => (s.numeros || []).includes(numero));
  }
  function parseWeekNumbers(str) {
    const result = new Set();
    String(str || "").split(",").forEach(part => {
      part = part.trim();
      if (!part) return;
      const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        let a = parseInt(rangeMatch[1], 10), b = parseInt(rangeMatch[2], 10);
        if (a > b) { const t = a; a = b; b = t; }
        for (let i = a; i <= b && i - a < 200; i++) result.add(i);
      } else if (/^\d+$/.test(part)) {
        result.add(parseInt(part, 10));
      }
    });
    return Array.from(result).sort((a, b) => a - b);
  }
  function daysBetween(iso1, iso2) {
    const d1 = new Date(iso1 + "T00:00:00");
    const d2 = new Date(iso2 + "T00:00:00");
    return Math.round((d2 - d1) / 86400000);
  }
  function formatDateBR(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  function relativeDay(iso) {
    const diff = daysBetween(iso, todayISO());
    if (diff === 0) return "hoje";
    if (diff === 1) return "ontem";
    if (diff > 1) return `há ${diff} dias`;
    if (diff === -1) return "amanhã";
    return `em ${-diff} dias`;
  }
  function fmtNum(v, decimals) {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "—";
    return Number(v).toFixed(decimals !== undefined ? decimals : 1);
  }

  /* ---------------------------------------------------------
     VPD / DLI helpers
     --------------------------------------------------------- */
  // Diferença padrão entre a temperatura da folha e a temperatura do ar
  // (a folha costuma ficar mais fria por causa da transpiração).
  const VPD_LEAF_TEMP_OFFSET = 2;

  function svpKPa(tempC) {
    return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  }
  function calcVPD(tempC, rhPct) {
    const leafTempC = tempC - VPD_LEAF_TEMP_OFFSET;
    const svpAr = svpKPa(tempC);
    const svpFolha = svpKPa(leafTempC);
    const vpd = svpFolha - (rhPct / 100) * svpAr;
    return Math.round(vpd * 100) / 100;
  }
  function calcDLI(ppfd, hours) {
    const dli = (ppfd * hours * 3600) / 1000000;
    return Math.round(dli * 10) / 10;
  }

  /* ---------------------------------------------------------
     TOAST
     --------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ---------------------------------------------------------
     MODAL HELPERS
     --------------------------------------------------------- */
  let topModalZIndex = 50;
  function openModal(id) {
    const el = document.getElementById(id);
    topModalZIndex += 1;
    el.style.zIndex = topModalZIndex;
    el.classList.add("open");
  }
  function closeModal(id) { document.getElementById(id).classList.remove("open"); }
  function closeAllModals() { document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open")); }
  function closeTopmostModal() {
    const openModals = Array.from(document.querySelectorAll(".modal-overlay.open"));
    if (!openModals.length) return;
    let top = openModals[0];
    let topZ = parseInt(top.style.zIndex || "0", 10);
    openModals.forEach(m => {
      const z = parseInt(m.style.zIndex || "0", 10);
      if (z >= topZ) { top = m; topZ = z; }
    });
    top.classList.remove("open");
  }

  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-close-modal]")) {
      // Fecha só a janela a que este botão pertence — não as janelas por
      // trás dela (ex: fechar "Novo nutriente" não deve fechar o
      // "Programas de nutrição" que estava aberto atrás).
      const overlay = e.target.closest(".modal-overlay");
      if (overlay) overlay.classList.remove("open");
    }
    if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopmostModal(); });

  // Os botões "Salvar" ficam fora da tag <form> (no rodapé do modal), então
  // sem isto o Enter dispararia o envio nativo do formulário (recarregando
  // a página) em vez de executar a ação de salvar.
  function preventNativeSubmit(formId, saveButtonId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = document.getElementById(saveButtonId);
      if (btn) btn.click();
    });
  }
  preventNativeSubmit("formCultivo", "btnSalvarCultivo");
  preventNativeSubmit("formPlanta", "btnSalvarPlanta");
  preventNativeSubmit("formNutriente", "btnSalvarNutriente");
  preventNativeSubmit("formRegistro", "btnSalvarRegistro");

  function askConfirm(title, text, onConfirm, onCancel) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = text;
    ui.confirmAction = onConfirm;
    ui.cancelAction = onCancel || null;
    ui._confirmResolved = false;
    ui._confirmWasOpen = true;
    openModal("modalConfirm");
  }
  document.getElementById("btnConfirmAction").addEventListener("click", () => {
    ui._confirmResolved = true;
    if (typeof ui.confirmAction === "function") ui.confirmAction();
    closeModal("modalConfirm");
  });
  // Observa o próprio modalConfirm fechar por QUALQUER via (botão Cancelar,
  // X, clique no fundo, Esc) para poder disparar onCancel de forma
  // confiável, sem duplicar essa lógica em cada caminho de fechamento.
  (function watchConfirmModalClose() {
    const el = document.getElementById("modalConfirm");
    const observer = new MutationObserver(() => {
      if (!el.classList.contains("open") && ui._confirmWasOpen) {
        ui._confirmWasOpen = false;
        if (!ui._confirmResolved && typeof ui.cancelAction === "function") ui.cancelAction();
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  })();

  /* ===========================================================
     RENDER: SIDEBAR
     =========================================================== */
  function renderSidebar() {
    document.getElementById("btnVisaoGeral").classList.toggle("active", ui.activeTab === "visaoGeral");

    const growList = document.getElementById("growList");
    growList.innerHTML = "";
    if (state.grows.length === 0) {
      growList.innerHTML = `<div style="padding:10px 8px; font-size:12.5px; color:var(--text-faint);">Nenhum cultivo ainda.</div>`;
    }
    state.grows.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "grow-item" + (g.id === state.selectedGrowId ? " active" : "");
      div.title = g.nome;
      div.innerHTML = `<span class="gi-avatar" style="background:${growAvatarColor(idx)}">${escapeHtml(growInitial(g.nome))}</span><span class="gi-name">${escapeHtml(g.nome)}</span>`;
      div.addEventListener("click", () => {
        state.selectedGrowId = g.id;
        ui.expandedEntryId = null;
        save();
        renderAll();
      });
      growList.appendChild(div);
    });

    const grow = getSelectedGrow();
    const plantsSection = document.getElementById("sidebarPlantsSection");
    const plantsLabel = document.getElementById("plantsSectionLabel");
    const plantList = document.getElementById("sidebarPlantList");
    plantList.innerHTML = "";
    if (!grow) {
      plantsSection.style.display = "none";
    } else {
      plantsSection.style.display = "flex";
      plantsLabel.textContent = `Plantas · ${grow.plants.length}`;
      if (grow.plants.length === 0) {
        plantList.innerHTML = `<div style="padding:6px 10px; font-size:12px; color:var(--text-faint);">Nenhuma planta cadastrada.</div>`;
      }
      grow.plants.forEach(p => {
        const row = document.createElement("div");
        row.className = "plant-chip-row" + (p.colhida ? " harvested" : "");
        row.innerHTML = `
          <span class="pc-name">
            <span class="pc-swatch" style="background:${plantColor(grow, p.id)}"></span>
            ${escapeHtml(p.nome)}
          </span>
          <span class="pc-status">${p.colhida ? "colhida" : ""}</span>`;
        row.title = "Editar planta";
        row.addEventListener("click", () => openPlantaModal(p.id));
        plantList.appendChild(row);
      });
    }
  }

  document.getElementById("btnNovoCultivo").addEventListener("click", () => openCultivoModal(null));
  document.getElementById("btnNovaPlantaSidebar").addEventListener("click", () => {
    if (!getSelectedGrow()) { showToast("Crie um cultivo primeiro."); return; }
    openPlantaModal(null);
  });
  document.getElementById("btnAbrirProgramas").addEventListener("click", () => openProgramasModal());
  document.getElementById("btnVisaoGeral").addEventListener("click", () => {
    ui.activeTab = "visaoGeral";
    renderAll();
  });

  /* ===========================================================
     RENDER: MAIN
     =========================================================== */
  function renderAll() {
    renderSidebar();
    renderMain();
  }

  function renderMain() {
    const main = document.getElementById("mainContent");
    const grow = getSelectedGrow();
    document.getElementById("btnFabNovoRegistro").classList.toggle("fab-hidden", !grow);

    if (!grow) {
      main.innerHTML = `
        <div class="empty-state" style="margin-top:60px;">
          <h3>Comece um novo cultivo</h3>
          <p style="max-width:420px;">Crie um cultivo para começar a registrar rega, nutrientes, ambiente e o desenvolvimento de cada planta, dia após dia.</p>
          <button class="btn btn-primary" id="emptyNovoCultivo" style="margin-top:6px;">+ Novo cultivo</button>
        </div>`;
      document.getElementById("emptyNovoCultivo").addEventListener("click", () => openCultivoModal(null));
      return;
    }

    const entries = sortedEntries(grow);
    const latest = entries[0] || null;
    const day = daysBetween(grow.dataInicio, todayISO()) + 1;
    const program = grow.programaId ? getProgram(grow.programaId) : null;

    main.innerHTML = `
      <div class="topbar">
        <div>
          <div class="topbar-title-row">
            <h2 id="growTitle" title="Clique para editar" style="cursor:pointer;">${escapeHtml(grow.nome)}</h2>
            <span class="stage-badge">${latest ? escapeHtml(latest.estagio) : "sem registros"}</span>
            ${grow.finalizado ? '<span class="badge-finalizado">Finalizado</span>' : ""}
          </div>
          <div class="topbar-meta">
            <span>Dia ${day > 0 ? day : 0} de cultivo</span>
            <span>·</span>
            <span>${activePlants(grow).length} planta${activePlants(grow).length === 1 ? "" : "s"} ativa${activePlants(grow).length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>desde ${formatDateBR(grow.dataInicio)}</span>
            <span>·</span>
            <span>${escapeHtml(TIPOS_CULTIVO[grow.tipo] || "Fotoperíodo")}</span>
            ${program ? `<span>·</span><span>programa: ${escapeHtml(program.nome)}</span>` : ""}
          </div>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-danger" id="btnExcluirCultivo">Excluir cultivo</button>
          <button class="btn btn-primary" id="btnNovoRegistro">+ Novo registro</button>
        </div>
      </div>

      ${renderHeroStrip(grow, latest)}

      <div class="tabs">
        <button class="tab-btn ${ui.activeTab === "visaoGeral" ? "active" : ""}" data-tab="visaoGeral">Visão Geral</button>
        <button class="tab-btn ${ui.activeTab === "registros" ? "active" : ""}" data-tab="registros">Registros</button>
        <button class="tab-btn ${ui.activeTab === "plantas" ? "active" : ""}" data-tab="plantas">Plantas</button>
        <button class="tab-btn ${ui.activeTab === "tendencias" ? "active" : ""}" data-tab="tendencias">Tendências</button>
      </div>

      <div class="panel ${ui.activeTab === "visaoGeral" ? "active" : ""}" id="panelVisaoGeral"></div>
      <div class="panel ${ui.activeTab === "registros" ? "active" : ""}" id="panelRegistros"></div>
      <div class="panel ${ui.activeTab === "plantas" ? "active" : ""}" id="panelPlantas"></div>
      <div class="panel ${ui.activeTab === "tendencias" ? "active" : ""}" id="panelTendencias"></div>
    `;

    document.getElementById("growTitle").addEventListener("click", () => openCultivoModal(grow.id));
    document.getElementById("btnNovoRegistro").addEventListener("click", () => openRegistroModal(null));
    document.getElementById("btnExcluirCultivo").addEventListener("click", () => {
      askConfirm(
        "Excluir cultivo",
        `Tem certeza que deseja excluir "${grow.nome}"? Todos os registros e plantas associados serão apagados permanentemente.`,
        () => {
          state.grows = state.grows.filter(g => g.id !== grow.id);
          state.selectedGrowId = state.grows.length ? state.grows[0].id : null;
          save();
          renderAll();
          showToast("Cultivo excluído.");
        }
      );
    });

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        ui.activeTab = btn.dataset.tab;
        renderAll();
      });
    });

    renderVisaoGeralPanel(grow, entries);
    renderRegistrosPanel(grow, entries);
    renderPlantasPanel(grow, entries);
    renderTendenciasPanel(grow, entries);
  }

  function heroCell(label, value, unit, swatchColor, isEmpty, status) {
    const dotHtml = status ? rangeDotHtml(status) : (swatchColor ? `<span class="hc-swatch" style="background:${swatchColor}"></span>` : "");
    const valueClass = (!isEmpty && status) ? rangeTextClass(status) : "";
    return `
      <div class="hero-cell ${isEmpty ? "empty" : ""}">
        <div class="hc-label">${dotHtml}${label}</div>
        <div class="hc-value ${valueClass}">${isEmpty ? "—" : value}${!isEmpty && unit ? `<span class="hc-unit">${unit}</span>` : ""}</div>
      </div>`;
  }

  function renderHeroStrip(grow, latest) {
    if (!latest) {
      return `<div class="hero-strip">${[
        "Estágio", "Temp.", "Umidade", "VPD", "PPFD", "DLI", "pH entrada", "PPM entrada", "EC entrada"
      ].map(l => heroCell(l, null, null, null, true)).join("")}</div>`;
    }
    const vpdSt = vpdStatus(latest.vpd, latest.estagio);
    const phSt = phStatus(latest.phEntrada, grow.tipo);
    return `<div class="hero-strip">
      ${heroCell("Estágio", escapeHtml(latest.estagio), "", "#6FAE7C", false)}
      ${heroCell("Temperatura", fmtNum(latest.temperatura, 1), "°C", "#D98A63", latest.temperatura === "" || latest.temperatura == null)}
      ${heroCell("Umidade", fmtNum(latest.umidade, 0), "%", "#5FA8BF", latest.umidade === "" || latest.umidade == null)}
      ${heroCell("VPD", fmtNum(latest.vpd, 2), "kPa", "#9B84C9", latest.vpd === "" || latest.vpd == null, vpdSt)}
      ${heroCell("PPFD", fmtNum(latest.ppfd, 0), "µmol", "#D9A64E", latest.ppfd === "" || latest.ppfd == null)}
      ${heroCell("DLI", fmtNum(latest.dli, 1), "mol/d", "#D97FA8", latest.dli === "" || latest.dli == null)}
      ${heroCell("pH entrada", fmtNum(latest.phEntrada, 2), "", "#8AB94F", latest.phEntrada === "" || latest.phEntrada == null, phSt)}
      ${heroCell("PPM entrada", fmtNum(latest.ppmEntrada, 0), "ppm", "#6FAE7C", latest.ppmEntrada === "" || latest.ppmEntrada == null)}
      ${heroCell("EC entrada", fmtNum(latest.ecEntrada, 2), "mS/cm", "#4F8C5E", latest.ecEntrada === "" || latest.ecEntrada == null)}
    </div>`;
  }

  /* ===========================================================
     PANEL: VISÃO GERAL
     =========================================================== */
  function addDaysISO(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function estimateHarvestWindow(grow, chrono) {
    if (!chrono.length) return null;
    if (grow.tipo === "automatica") {
      const minDay = 70, maxDay = 100;
      return {
        minDate: addDaysISO(grow.dataInicio, minDay),
        maxDate: addDaysISO(grow.dataInicio, maxDay),
        basis: `Estimativa geral para automáticas (${minDay}–${maxDay} dias do início ao ponto de colheita) — varia bastante por genética.`
      };
    }
    const floracaoEntry = chrono.find(e => e.estagio === "Floração");
    if (!floracaoEntry) return null;
    const minDay = 56, maxDay = 63;
    return {
      minDate: addDaysISO(floracaoEntry.data, minDay),
      maxDate: addDaysISO(floracaoEntry.data, maxDay),
      basis: `Com base na duração típica de floração (8–9 semanas), a partir do início da floração registrado em ${formatDateBR(floracaoEntry.data)}.`
    };
  }

  function renderStageStepper(latest) {
    const idx = latest ? ESTAGIOS.indexOf(latest.estagio) : -1;
    return `<div class="stage-stepper">
      ${ESTAGIOS.map((est, i) => `
        <div class="stage-step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}">
          <div class="stage-dot"></div>
          <div class="stage-name">${escapeHtml(est)}</div>
        </div>
        ${i < ESTAGIOS.length - 1 ? `<div class="stage-line ${i < idx ? "done" : ""}"></div>` : ""}
      `).join("")}
    </div>`;
  }

  function renderVisaoGeralPanel(grow, entries) {
    const panel = document.getElementById("panelVisaoGeral");
    if (!panel) return;

    const chrono = entries.slice().sort((a, b) => a.data.localeCompare(b.data));
    const latest = chrono[chrono.length - 1] || null;
    const day = daysBetween(grow.dataInicio, todayISO()) + 1;
    const program = grow.programaId ? getProgram(grow.programaId) : null;

    let harvestBlock = "";
    if (grow.finalizado) {
      const lastDate = latest ? latest.data : grow.dataInicio;
      const totalDias = daysBetween(grow.dataInicio, lastDate) + 1;
      harvestBlock = `
        <div class="harvest-estimate">
          <div class="he-label">Cultivo finalizado</div>
          <div class="he-value">${totalDias} dias de ciclo</div>
          <div class="he-basis">De ${formatDateBR(grow.dataInicio)} a ${formatDateBR(lastDate)}.</div>
        </div>`;
    } else {
      const estimate = estimateHarvestWindow(grow, chrono);
      if (estimate) {
        harvestBlock = `
          <div class="harvest-estimate">
            <div class="he-label">Estimativa de colheita</div>
            <div class="he-value">${formatDateBR(estimate.minDate)} — ${formatDateBR(estimate.maxDate)}</div>
            <div class="he-basis">${estimate.basis}</div>
          </div>`;
      } else if (grow.tipo === "fotoperiodo") {
        harvestBlock = `
          <div class="harvest-estimate">
            <div class="he-label">Estimativa de colheita</div>
            <div class="he-basis">Aparece assim que o cultivo entrar em Floração.</div>
          </div>`;
      }
    }

    // Os últimos 7 dias *registrados* (não os últimos 7 dias do calendário)
    // — assim o gráfico continua útil mesmo para um cultivo importado ou
    // com registros de datas passadas.
    const last7 = chrono.slice(-7);

    panel.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card">
          <h3>Progresso do cultivo</h3>
          ${renderStageStepper(latest)}
          ${harvestBlock}
        </div>
        <div class="overview-card">
          <h3>Resumo</h3>
          <div class="overview-stats">
            <div class="overview-stat"><div class="os-label">Dia de cultivo</div><div class="os-value">${day > 0 ? day : 0}</div></div>
            <div class="overview-stat"><div class="os-label">Plantas ativas</div><div class="os-value">${activePlants(grow).length}</div></div>
            <div class="overview-stat"><div class="os-label">Total de registros</div><div class="os-value">${entries.length}</div></div>
            <div class="overview-stat"><div class="os-label">Programa</div><div class="os-value" style="font-size:13px;">${program ? escapeHtml(program.nome) : "—"}</div></div>
          </div>
        </div>
        <div class="overview-card full">
          <div class="chart-card-head">
            <h3>Temperatura &amp; Umidade — últimos 7 dias registrados</h3>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-swatch" style="background:#D98A63"></span>Temp. (°C)</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#5FA8BF"></span>Umidade (%)</span>
            </div>
          </div>
          <div id="chartOverview7d"></div>
        </div>
      </div>
    `;

    if (last7.length >= 2) {
      drawLineChart("chartOverview7d", last7.map(e => e.data), [
        { color: "#D98A63", values: last7.map(e => e.temperatura), axis: "left", label: "Temp.", unit: "°C", decimals: 1 },
        { color: "#5FA8BF", values: last7.map(e => e.umidade), axis: "right", label: "Umidade", unit: "%", decimals: 0 }
      ], { wide: true });
    } else {
      document.getElementById("chartOverview7d").innerHTML = `<div class="chart-empty">Adicione ao menos 2 registros para montar o gráfico.</div>`;
    }
  }

  /* ===========================================================
     PANEL: REGISTROS
     =========================================================== */
  function renderRegistrosPanel(grow, entries) {
    const panel = document.getElementById("panelRegistros");
    if (!panel) return;

    if (entries.length === 0) {
      panel.innerHTML = `
        <div class="empty-state">
          <h3>Nenhum registro ainda</h3>
          <p>Adicione o primeiro registro diário deste cultivo — rega, nutrientes, ambiente e leituras.</p>
          <button class="btn btn-primary" id="emptyNovoRegistro" style="margin-top:6px;">+ Novo registro</button>
        </div>`;
      document.getElementById("emptyNovoRegistro").addEventListener("click", () => openRegistroModal(null));
      return;
    }

    const rows = entries.map(entry => {
      const tags = (entry.nutrientes || []);
      const shownTags = tags.slice(0, 3).map(n => `<span class="ntag">${escapeHtml(n.nome)}${n.dose ? ` · ${escapeHtml(n.dose)}ml/L` : ""}</span>`).join("");
      const moreTag = tags.length > 3 ? `<span class="ntag more">+${tags.length - 3}</span>` : "";
      const expanded = ui.expandedEntryId === entry.id;
      const ac = activityColor(entry.atividade);
      const phSt = phStatus(entry.phEntrada, grow.tipo);
      return `
        <tr class="row-main ${expanded ? "expanded" : ""}" data-entry-id="${entry.id}">
          <td>
            <span class="reg-date ${expanded ? "expanded" : ""}">
              <span class="chevron">▸</span>
              <span class="rd-text">${formatDateBR(entry.data)}<span class="rd-rel">${relativeDay(entry.data)}</span></span>
            </span>
          </td>
          <td>${escapeHtml(entry.estagio)}</td>
          <td><span class="activity-pill" style="background:${ac.bg}; color:${ac.fg};"><span class="ap-dot" style="background:${ac.dot}"></span>${escapeHtml(entry.atividade)}</span></td>
          <td><div class="nutrient-tags">${shownTags || "<span style='color:var(--text-faint); font-size:11.5px;'>—</span>"}${moreTag}</div></td>
          <td class="num-cell">${fmtNum(entry.litros, 1)} L</td>
          <td class="num-cell ${rangeTextClass(phSt)}">${fmtNum(entry.phEntrada, 2)}</td>
          <td class="num-cell">${fmtNum(entry.ecEntrada, 2)}</td>
          <td class="num-cell">${fmtNum(entry.temperatura, 1)}° / ${fmtNum(entry.umidade, 0)}%</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-edit="${entry.id}" title="Editar">✎</button>
              <button class="icon-btn" data-del="${entry.id}" title="Excluir">🗑</button>
            </div>
          </td>
        </tr>
        ${expanded ? renderEntryDetailRow(grow, entry) : ""}
      `;
    }).join("");

    panel.innerHTML = `
      <div class="table-wrap">
        <table class="reg-table">
          <thead>
            <tr>
              <th>Data</th><th>Estágio</th><th>Atividade</th><th>Nutrientes</th>
              <th>Litros</th><th>pH ent.</th><th>EC ent.</th><th>Temp / Umid.</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    panel.querySelectorAll("tr.row-main").forEach(tr => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return;
        const id = tr.dataset.entryId;
        ui.expandedEntryId = ui.expandedEntryId === id ? null : id;
        renderMain();
      });
    });
    panel.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); openRegistroModal(btn.dataset.edit); });
    });
    panel.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        askConfirm("Excluir registro", "Deseja excluir este registro? Essa ação não pode ser desfeita.", () => {
          grow.entries = grow.entries.filter(en => en.id !== btn.dataset.del);
          save();
          renderAll();
          showToast("Registro excluído.");
        });
      });
    });
  }

  function renderEntryDetailRow(grow, entry) {
    const nutrientsFull = (entry.nutrientes || []).map(n =>
      `<span class="ntag">${escapeHtml(n.nome)}${n.dose ? ` · ${escapeHtml(n.dose)} ml/L` : ""}</span>`
    ).join("") || "<span style='color:var(--text-faint); font-size:12px;'>Nenhum nutriente registrado.</span>";

    const saidaRows = grow.plants.map(p => {
      const r = (entry.leituras && entry.leituras[p.id]) || {};
      const phSt = phStatus(r.phSaida, grow.tipo);
      return `
        <tr>
          <td><span class="plant-name-cell"><span class="pc-swatch" style="width:8px;height:8px;border-radius:50%;background:${plantColor(grow, p.id)}"></span>${escapeHtml(p.nome)}</span></td>
          <td class="num ${rangeTextClass(phSt)}">${fmtNum(r.phSaida, 2)}</td>
          <td class="num">${fmtNum(r.ppmSaida, 0)}</td>
          <td class="num">${fmtNum(r.ecSaida, 2)}</td>
        </tr>`;
    }).join("");

    const vpdSt = vpdStatus(entry.vpd, entry.estagio);
    const phEntradaSt = phStatus(entry.phEntrada, grow.tipo);

    return `
      <tr class="detail-row"><td colspan="9">
        <div class="detail-inner">
          <div class="detail-block">
            <h4>Nutrientes</h4>
            <div class="nutrient-tags" style="margin-bottom:16px;">${nutrientsFull}</div>
            <h4>Ambiente registrado</h4>
            <div class="kv-grid">
              <div class="kv"><span class="kv-label">Estágio</span><span class="kv-value">${escapeHtml(entry.estagio)}</span></div>
              <div class="kv"><span class="kv-label">Litros</span><span class="kv-value">${fmtNum(entry.litros,1)} L</span></div>
              <div class="kv"><span class="kv-label">pH entrada</span><span class="kv-value ${rangeTextClass(phEntradaSt)}">${fmtNum(entry.phEntrada,2)}</span></div>
              <div class="kv"><span class="kv-label">PPM entrada</span><span class="kv-value">${fmtNum(entry.ppmEntrada,0)} ppm</span></div>
              <div class="kv"><span class="kv-label">EC entrada</span><span class="kv-value">${fmtNum(entry.ecEntrada,2)} mS/cm</span></div>
              <div class="kv"><span class="kv-label">Temperatura</span><span class="kv-value">${fmtNum(entry.temperatura,1)} °C</span></div>
              <div class="kv"><span class="kv-label">Umidade</span><span class="kv-value">${fmtNum(entry.umidade,0)} %</span></div>
              <div class="kv"><span class="kv-label">VPD</span><span class="kv-value ${rangeTextClass(vpdSt)}">${fmtNum(entry.vpd,2)} kPa</span></div>
              <div class="kv"><span class="kv-label">PPFD</span><span class="kv-value">${fmtNum(entry.ppfd,0)} µmol</span></div>
              <div class="kv"><span class="kv-label">DLI</span><span class="kv-value">${fmtNum(entry.dli,1)} mol/d</span></div>
            </div>
          </div>
          <div class="detail-block">
            <h4>Leitura de saída por planta</h4>
            ${grow.plants.length === 0
              ? "<p style='color:var(--text-faint); font-size:12.5px;'>Nenhuma planta cadastrada neste cultivo.</p>"
              : `<table class="saida-table">
                  <thead><tr><th>Planta</th><th class="num">pH saída</th><th class="num">PPM saída</th><th class="num">EC saída</th></tr></thead>
                  <tbody>${saidaRows}</tbody>
                </table>`
            }
            ${entry.observacoes ? `<h4 style="margin-top:16px;">Observações</h4><p style="font-size:12.5px; color:var(--text-dim); line-height:1.6; white-space:pre-wrap;">${escapeHtml(entry.observacoes)}</p>` : ""}
          </div>
        </div>
      </td></tr>`;
  }

  /* ===========================================================
     PANEL: PLANTAS
     =========================================================== */
  function renderPlantasPanel(grow, entries) {
    const panel = document.getElementById("panelPlantas");
    if (!panel) return;

    if (grow.plants.length === 0) {
      panel.innerHTML = `
        <div class="empty-state">
          <h3>Nenhuma planta cadastrada</h3>
          <p>Adicione as plantas deste cultivo para acompanhar as leituras de saída individualmente.</p>
          <button class="btn btn-primary" id="emptyNovaPlanta" style="margin-top:6px;">+ Adicionar planta</button>
        </div>`;
      document.getElementById("emptyNovaPlanta").addEventListener("click", () => openPlantaModal(null));
      return;
    }

    const cards = grow.plants.map(p => {
      let lastReading = null, lastDate = null;
      for (const e of entries) {
        if (e.leituras && e.leituras[p.id]) { lastReading = e.leituras[p.id]; lastDate = e.data; break; }
      }
      const day = p.dataInicio ? daysBetween(p.dataInicio, todayISO()) + 1 : null;
      const phSt = lastReading ? phStatus(lastReading.phSaida, grow.tipo) : null;
      return `
        <div class="plant-card">
          <div class="plant-card-head">
            <div class="pc-title">
              <span class="plant-swatch-lg" style="background:${plantColor(grow, p.id)}"></span>
              <div>
                <h3>${escapeHtml(p.nome)}</h3>
                <div class="pc-sub">${p.dataInicio ? `desde ${formatDateBR(p.dataInicio)}${day !== null ? " · dia " + day : ""}` : "sem data de início"}</div>
              </div>
            </div>
            ${p.colhida ? '<span class="badge-harvested">colhida</span>' : ""}
          </div>
          <div class="pc-stats">
            <div class="pc-stat"><div class="s-label">pH saída${lastDate ? " · " + formatDateBR(lastDate) : ""}</div><div class="s-value ${rangeTextClass(phSt)}">${lastReading ? fmtNum(lastReading.phSaida, 2) : "—"}</div></div>
            <div class="pc-stat"><div class="s-label">PPM saída</div><div class="s-value">${lastReading ? fmtNum(lastReading.ppmSaida, 0) : "—"}</div></div>
            <div class="pc-stat"><div class="s-label">EC saída</div><div class="s-value">${lastReading ? fmtNum(lastReading.ecSaida, 2) : "—"}</div></div>
          </div>
          <div class="plant-card-foot">
            <button class="btn btn-sm" data-editar-planta="${p.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-excluir-planta="${p.id}">Excluir</button>
          </div>
        </div>`;
    }).join("");

    panel.innerHTML = `<div class="plant-grid">${cards}</div>`;

    panel.querySelectorAll("[data-editar-planta]").forEach(btn => {
      btn.addEventListener("click", () => openPlantaModal(btn.dataset.editarPlanta));
    });
    panel.querySelectorAll("[data-excluir-planta]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pid = btn.dataset.excluirPlanta;
        const planta = grow.plants.find(p => p.id === pid);
        askConfirm("Excluir planta", `Excluir "${planta.nome}"? As leituras de saída dela nos registros existentes serão removidas.`, () => {
          grow.plants = grow.plants.filter(p => p.id !== pid);
          grow.entries.forEach(e => { if (e.leituras) delete e.leituras[pid]; });
          save();
          renderAll();
          showToast("Planta excluída.");
        });
      });
    });
  }

  /* ===========================================================
     PANEL: TENDÊNCIAS (gráficos SVG)
     =========================================================== */
  function renderTendenciasPanel(grow, entries) {
    const panel = document.getElementById("panelTendencias");
    if (!panel) return;

    const chronoAll = entries.slice().sort((a, b) => a.data.localeCompare(b.data));

    if (chronoAll.length < 2) {
      panel.innerHTML = `<div class="chart-empty" style="padding:60px 0;">Adicione ao menos 2 registros para visualizar tendências.</div>`;
      return;
    }

    const minDate = chronoAll[0].data;
    const maxDate = chronoAll[chronoAll.length - 1].data;
    const filtro = ui.tendenciasFiltro || { inicio: null, fim: null };
    const inicio = filtro.inicio || minDate;
    const fim = filtro.fim || maxDate;
    const chrono = chronoAll.filter(e => e.data >= inicio && e.data <= fim);

    function isPresetActive(preset) {
      if (preset === "all") return !filtro.inicio && !filtro.fim;
      const days = parseInt(preset, 10);
      const wantInicio = addDaysISO(maxDate, -(days - 1));
      const clampedInicio = wantInicio < minDate ? minDate : wantInicio;
      return inicio === clampedInicio && fim === maxDate;
    }

    panel.innerHTML = `
      <div class="tendencias-filtros">
        <div class="tf-field"><label for="tfInicio">De</label><input type="date" id="tfInicio" value="${inicio}" min="${minDate}" max="${maxDate}"></div>
        <div class="tf-field"><label for="tfFim">Até</label><input type="date" id="tfFim" value="${fim}" min="${minDate}" max="${maxDate}"></div>
        <div class="tf-presets">
          <button type="button" class="btn-chip ${isPresetActive("7") ? "active" : ""}" data-preset="7">7 dias</button>
          <button type="button" class="btn-chip ${isPresetActive("30") ? "active" : ""}" data-preset="30">30 dias</button>
          <button type="button" class="btn-chip ${isPresetActive("all") ? "active" : ""}" data-preset="all">Tudo</button>
        </div>
      </div>
      <div id="tendenciasChartsWrap"></div>
    `;

    document.getElementById("tfInicio").addEventListener("change", (e) => {
      ui.tendenciasFiltro = { inicio: e.target.value || null, fim: ui.tendenciasFiltro ? ui.tendenciasFiltro.fim : null };
      renderTendenciasPanel(grow, entries);
    });
    document.getElementById("tfFim").addEventListener("change", (e) => {
      ui.tendenciasFiltro = { inicio: ui.tendenciasFiltro ? ui.tendenciasFiltro.inicio : null, fim: e.target.value || null };
      renderTendenciasPanel(grow, entries);
    });
    panel.querySelectorAll("[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        if (preset === "all") {
          ui.tendenciasFiltro = { inicio: null, fim: null };
        } else {
          const days = parseInt(preset, 10);
          const wantInicio = addDaysISO(maxDate, -(days - 1));
          ui.tendenciasFiltro = { inicio: wantInicio < minDate ? minDate : wantInicio, fim: maxDate };
        }
        renderTendenciasPanel(grow, entries);
      });
    });

    const chartsWrap = document.getElementById("tendenciasChartsWrap");
    if (chrono.length < 2) {
      chartsWrap.innerHTML = `<div class="chart-empty" style="padding:60px 0;">Não há registros suficientes nesse intervalo de datas.</div>`;
      return;
    }

    chartsWrap.innerHTML = `
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>Temperatura &amp; Umidade</h3>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-swatch" style="background:#D98A63"></span>Temp. (°C)</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#5FA8BF"></span>Umidade (%)</span>
            </div>
          </div>
          <div id="chartTempUmid"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>VPD</h3>
            <div class="chart-legend"><span class="legend-item"><span class="legend-swatch" style="background:#9B84C9"></span>kPa</span></div>
          </div>
          <div id="chartVpd"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>PPFD &amp; DLI</h3>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-swatch" style="background:#D9A64E"></span>PPFD</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#D97FA8"></span>DLI</span>
            </div>
          </div>
          <div id="chartLight"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>Solução de entrada</h3>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-swatch" style="background:#8AB94F"></span>pH</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#4F8C5E"></span>EC (mS/cm)</span>
            </div>
          </div>
          <div id="chartEntrada"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>EC de saída por planta</h3>
            <div class="chart-legend" id="legendPlantsEc"></div>
          </div>
          <div id="chartPlantEc"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head">
            <h3>pH de saída por planta</h3>
            <div class="chart-legend" id="legendPlantsPh"></div>
          </div>
          <div id="chartPlantPh"></div>
        </div>
      </div>
    `;

    const dates = chrono.map(e => e.data);

    drawLineChart("chartTempUmid", dates, [
      { color: "#D98A63", values: chrono.map(e => e.temperatura), axis: "left", label: "Temp.", unit: "°C", decimals: 1 },
      { color: "#5FA8BF", values: chrono.map(e => e.umidade), axis: "right", label: "Umidade", unit: "%", decimals: 0 }
    ]);
    drawLineChart("chartVpd", dates, [
      { color: "#9B84C9", values: chrono.map(e => e.vpd), axis: "left", label: "VPD", unit: " kPa", decimals: 2 }
    ]);
    drawLineChart("chartLight", dates, [
      { color: "#D9A64E", values: chrono.map(e => e.ppfd), axis: "left", label: "PPFD", unit: " µmol", decimals: 0 },
      { color: "#D97FA8", values: chrono.map(e => e.dli), axis: "right", label: "DLI", unit: " mol/d", decimals: 1 }
    ]);
    drawLineChart("chartEntrada", dates, [
      { color: "#8AB94F", values: chrono.map(e => e.phEntrada), axis: "left", label: "pH", unit: "", decimals: 2 },
      { color: "#4F8C5E", values: chrono.map(e => e.ecEntrada), axis: "right", label: "EC", unit: " mS/cm", decimals: 2 }
    ]);

    const legendEc = document.getElementById("legendPlantsEc");
    const legendPh = document.getElementById("legendPlantsPh");
    const plantSeriesEc = [];
    const plantSeriesPh = [];
    grow.plants.forEach(p => {
      const color = plantColor(grow, p.id);
      const hasAny = chrono.some(e => e.leituras && e.leituras[p.id]);
      if (!hasAny) return;
      legendEc.innerHTML += `<span class="legend-item"><span class="legend-swatch dot" style="background:${color}"></span>${escapeHtml(p.nome)}</span>`;
      legendPh.innerHTML += `<span class="legend-item"><span class="legend-swatch dot" style="background:${color}"></span>${escapeHtml(p.nome)}</span>`;
      plantSeriesEc.push({ color, values: chrono.map(e => (e.leituras && e.leituras[p.id]) ? e.leituras[p.id].ecSaida : null), axis: "left", label: p.nome, unit: " mS/cm", decimals: 2 });
      plantSeriesPh.push({ color, values: chrono.map(e => (e.leituras && e.leituras[p.id]) ? e.leituras[p.id].phSaida : null), axis: "left", label: p.nome, unit: "", decimals: 2 });
    });
    if (plantSeriesEc.length) {
      drawLineChart("chartPlantEc", dates, plantSeriesEc);
      drawLineChart("chartPlantPh", dates, plantSeriesPh);
    } else {
      document.getElementById("chartPlantEc").innerHTML = `<div class="chart-empty">Nenhuma leitura de saída registrada ainda.</div>`;
      document.getElementById("chartPlantPh").innerHTML = `<div class="chart-empty">Nenhuma leitura de saída registrada ainda.</div>`;
    }
  }

  /* ---------- Minimal reusable SVG line chart ---------- */
  function drawLineChart(containerId, dates, series, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;

    const W = opts.wide ? 1040 : 470;
    const H = 200;
    const padL = 34, padR = 34, padT = 14, padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const n = dates.length;
    const hasData = series.some(s => s.values.some(v => v !== null && v !== undefined && v !== "" && !isNaN(v)));
    if (!hasData) {
      container.innerHTML = `<div class="chart-empty">Sem dados suficientes.</div>`;
      return;
    }

    function xFor(i) { return padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)); }

    function computeRange(values) {
      const nums = values.filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v)).map(Number);
      if (!nums.length) return [0, 1];
      let min = Math.min(...nums), max = Math.max(...nums);
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.15;
      return [min - pad, max + pad];
    }

    const leftSeries = series.filter(s => s.axis !== "right");
    const rightSeries = series.filter(s => s.axis === "right");
    const leftRange = computeRange(leftSeries.flatMap(s => s.values));
    const rightRange = rightSeries.length ? computeRange(rightSeries.flatMap(s => s.values)) : null;

    function yFor(v, range) {
      if (v === null || v === undefined || v === "" || isNaN(v)) return null;
      const [min, max] = range;
      return padT + plotH - ((Number(v) - min) / (max - min)) * plotH;
    }

    function pathFor(values, range) {
      let d = "";
      let started = false;
      values.forEach((v, i) => {
        const y = yFor(v, range);
        if (y === null) return; // dia sem esse dado — pula, mas mantém a linha ligada ao próximo ponto válido
        const x = xFor(i);
        d += (started ? " L " : " M ") + x.toFixed(1) + " " + y.toFixed(1);
        started = true;
      });
      return d;
    }

    let gridLines = "";
    for (let g = 0; g <= 3; g++) {
      const y = padT + (plotH * g) / 3;
      gridLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#DEE8D8" stroke-width="1"/>`;
    }

    const labelIdxs = n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
    let xLabels = "";
    labelIdxs.forEach(i => {
      const x = xFor(i);
      const anchor = i === 0 ? "start" : (i === n - 1 ? "end" : "middle");
      xLabels += `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="10" fill="#5F7057" text-anchor="${anchor}" font-family="IBM Plex Sans, sans-serif">${formatDateShort(dates[i])}</text>`;
    });

    let paths = "";
    series.forEach(s => {
      const range = s.axis === "right" ? rightRange : leftRange;
      const d = pathFor(s.values, range);
      if (d) paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`;
      s.values.forEach((v, i) => {
        const y = yFor(v, range);
        if (y === null) return;
        paths += `<circle cx="${xFor(i).toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${s.color}"/>`;
      });
    });

    // Camada de interação: linha-guia vertical + um pontinho por série,
    // ambos escondidos até o mouse passar por cima do gráfico.
    const hoverLine = `<line class="chart-hover-line" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="#B7C7B0" stroke-width="1" stroke-dasharray="3,3" style="display:none;"/>`;
    const hoverDots = series.map(s =>
      `<circle class="chart-hover-dot" r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5" style="display:none;"/>`
    ).join("");
    // Uma faixa invisível cobrindo toda a área do gráfico, para capturar o
    // mouse em qualquer ponto (inclusive longe das próprias linhas).
    const hoverCapture = `<rect class="chart-hover-capture" x="${padL}" y="0" width="${plotW}" height="${H}" fill="transparent"/>`;

    container.innerHTML = `
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block; overflow:visible;">
          ${gridLines}
          ${paths}
          ${hoverLine}
          ${hoverDots}
          ${xLabels}
          ${hoverCapture}
        </svg>
        <div class="chart-tooltip" style="display:none;"></div>
      </div>`;

    const svgEl = container.querySelector("svg");
    const captureEl = container.querySelector(".chart-hover-capture");
    const hoverLineEl = container.querySelector(".chart-hover-line");
    const hoverDotEls = container.querySelectorAll(".chart-hover-dot");
    const tooltipEl = container.querySelector(".chart-tooltip");

    function fmtVal(v, decimals) {
      if (v === null || v === undefined || v === "" || isNaN(v)) return "—";
      return Number(v).toFixed(decimals !== undefined ? decimals : 1);
    }

    function updateHover(clientX) {
      const rect = svgEl.getBoundingClientRect();
      if (rect.width === 0) return;
      const svgX = ((clientX - rect.left) / rect.width) * W;
      let idx = n === 1 ? 0 : Math.round(((svgX - padL) / plotW) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));

      const xPix = xFor(idx);
      hoverLineEl.setAttribute("x1", xPix);
      hoverLineEl.setAttribute("x2", xPix);
      hoverLineEl.style.display = "block";

      let tooltipHtml = `<div class="ct-date">${formatDateBR(dates[idx])}</div>`;
      series.forEach((s, si) => {
        const range = s.axis === "right" ? rightRange : leftRange;
        const v = s.values[idx];
        const y = yFor(v, range);
        const dot = hoverDotEls[si];
        if (y === null) {
          dot.style.display = "none";
        } else {
          dot.setAttribute("cx", xPix);
          dot.setAttribute("cy", y.toFixed(1));
          dot.style.display = "block";
        }
        const label = s.label ? escapeHtml(s.label) + ": " : "";
        tooltipHtml += `<div class="ct-row"><span class="ct-swatch" style="background:${s.color}"></span>${label}<strong>${fmtVal(v, s.decimals)}${s.unit || ""}</strong></div>`;
      });
      tooltipEl.innerHTML = tooltipHtml;
      tooltipEl.style.display = "block";

      const renderedX = (xPix / W) * rect.width;
      const tooltipWidth = tooltipEl.offsetWidth || 120;
      let left = renderedX + 12;
      if (left + tooltipWidth > rect.width) left = renderedX - tooltipWidth - 12;
      if (left < 0) left = 0;
      tooltipEl.style.left = left + "px";
    }

    function hideHover() {
      hoverLineEl.style.display = "none";
      hoverDotEls.forEach(d => d.style.display = "none");
      tooltipEl.style.display = "none";
    }

    captureEl.addEventListener("mousemove", (e) => updateHover(e.clientX));
    captureEl.addEventListener("mouseleave", hideHover);
    captureEl.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches[0]) { updateHover(e.touches[0].clientX); e.preventDefault(); }
    }, { passive: false });
    captureEl.addEventListener("touchend", hideHover);
  }

  function formatDateShort(iso) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }

  /* ===========================================================
     MODAL: CULTIVO
     =========================================================== */
  function populateProgramSelect(selectEl, currentValue) {
    const options = [`<option value="">Nenhum</option>`].concat(
      state.nutritionPrograms.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.nome)}</option>`)
    );
    selectEl.innerHTML = options.join("");
    selectEl.value = currentValue || "";
  }

  function openCultivoModal(id) {
    ui.editingCultivoId = id;
    const isEdit = !!id;
    document.getElementById("modalCultivoTitle").textContent = isEdit ? "Editar cultivo" : "Novo cultivo";
    document.getElementById("formCultivoError").classList.remove("show");
    const progSelect = document.getElementById("fCultivoPrograma");
    if (isEdit) {
      const g = getGrow(id);
      document.getElementById("fCultivoNome").value = g.nome;
      document.getElementById("fCultivoTipo").value = g.tipo || "fotoperiodo";
      document.getElementById("fCultivoData").value = g.dataInicio;
      document.getElementById("fCultivoFinalizado").checked = !!g.finalizado;
      populateProgramSelect(progSelect, g.programaId);
    } else {
      document.getElementById("fCultivoNome").value = "";
      document.getElementById("fCultivoTipo").value = "fotoperiodo";
      document.getElementById("fCultivoData").value = todayISO();
      document.getElementById("fCultivoFinalizado").checked = false;
      populateProgramSelect(progSelect, "");
    }
    openModal("modalCultivo");
  }

  document.getElementById("btnSalvarCultivo").addEventListener("click", () => {
    const nome = document.getElementById("fCultivoNome").value.trim();
    const tipo = document.getElementById("fCultivoTipo").value === "automatica" ? "automatica" : "fotoperiodo";
    const data = document.getElementById("fCultivoData").value;
    const programaId = document.getElementById("fCultivoPrograma").value || null;
    const finalizado = document.getElementById("fCultivoFinalizado").checked;
    const errEl = document.getElementById("formCultivoError");
    if (!nome || !data) {
      errEl.textContent = "Preencha o nome e a data de início.";
      errEl.classList.add("show");
      return;
    }
    if (ui.editingCultivoId) {
      const g = getGrow(ui.editingCultivoId);
      g.nome = nome; g.tipo = tipo; g.dataInicio = data; g.programaId = programaId; g.finalizado = finalizado;
    } else {
      const novo = { id: uid(), nome, tipo, dataInicio: data, programaId, finalizado, plants: [], entries: [] };
      state.grows.push(novo);
      state.selectedGrowId = novo.id;
    }
    save();
    closeAllModals();
    renderAll();
    showToast("Cultivo salvo.");
  });

  /* ===========================================================
     MODAL: PLANTA
     =========================================================== */
  function openPlantaModal(id) {
    const grow = getSelectedGrow();
    if (!grow) return;
    ui.editingPlantaId = id;
    const isEdit = !!id;
    document.getElementById("modalPlantaTitle").textContent = isEdit ? "Editar planta" : "Nova planta";
    document.getElementById("formPlantaError").classList.remove("show");
    if (isEdit) {
      const p = grow.plants.find(pp => pp.id === id);
      document.getElementById("fPlantaNome").value = p.nome;
      document.getElementById("fPlantaData").value = p.dataInicio || "";
      document.getElementById("fPlantaColhida").checked = !!p.colhida;
    } else {
      document.getElementById("fPlantaNome").value = "";
      document.getElementById("fPlantaData").value = grow.dataInicio;
      document.getElementById("fPlantaColhida").checked = false;
    }
    openModal("modalPlanta");
  }

  document.getElementById("btnSalvarPlanta").addEventListener("click", () => {
    const grow = getSelectedGrow();
    if (!grow) return;
    const nome = document.getElementById("fPlantaNome").value.trim();
    const dataInicio = document.getElementById("fPlantaData").value || null;
    const colhida = document.getElementById("fPlantaColhida").checked;
    const errEl = document.getElementById("formPlantaError");
    if (!nome) {
      errEl.textContent = "Informe um nome para a planta.";
      errEl.classList.add("show");
      return;
    }
    if (ui.editingPlantaId) {
      const p = grow.plants.find(pp => pp.id === ui.editingPlantaId);
      p.nome = nome; p.dataInicio = dataInicio; p.colhida = colhida;
    } else {
      grow.plants.push({ id: uid(), nome, dataInicio, colhida });
    }
    save();
    closeAllModals();
    renderAll();
    showToast("Planta salva.");
  });

  /* ===========================================================
     NUTRIENTES — chips categorizados (reutilizável)
     =========================================================== */
  function renderNutrientChipCategories(container, selectedArray, onChange) {
    container.innerHTML = "";
    const cats = sortedCategories();
    let any = false;
    cats.forEach(cat => {
      const nutrientsInCat = state.nutrients.filter(n => n.categoriaId === cat.id);
      if (!nutrientsInCat.length) return;
      any = true;
      const block = document.createElement("div");
      block.className = "nutrient-category-block";
      const titleDiv = document.createElement("div");
      titleDiv.className = "nutrient-category-title";
      titleDiv.innerHTML = `<span class="cat-order">${cat.ordem}</span>${escapeHtml(cat.nome)}`;
      block.appendChild(titleDiv);
      const list = document.createElement("div");
      list.className = "chip-toggle-list";
      nutrientsInCat.forEach(n => {
        const active = selectedArray.find(s => s.nome === n.nome);
        const chip = document.createElement("div");
        chip.className = "chip-toggle" + (active ? " on" : "");
        chip.innerHTML = `<span>${escapeHtml(n.nome)}</span>` + (active ? `<input type="text" class="dose-input" placeholder="ml/L" value="${escapeAttr(active.dose || "")}">` : "");
        chip.addEventListener("click", (e) => {
          if (e.target.classList.contains("dose-input")) return;
          const idx = selectedArray.findIndex(s => s.nome === n.nome);
          if (idx >= 0) selectedArray.splice(idx, 1);
          else selectedArray.push({ nome: n.nome, dose: "" });
          renderNutrientChipCategories(container, selectedArray, onChange);
          if (onChange) onChange();
        });
        const doseInput = chip.querySelector(".dose-input");
        if (doseInput) {
          doseInput.addEventListener("click", e => e.stopPropagation());
          doseInput.addEventListener("input", () => {
            const item = selectedArray.find(s => s.nome === n.nome);
            if (item) item.dose = doseInput.value;
            if (onChange) onChange();
          });
        }
        list.appendChild(chip);
      });
      block.appendChild(list);
      container.appendChild(block);
    });
    if (!any) {
      container.innerHTML = `<p style="color:var(--text-faint); font-size:12.5px;">Nenhum nutriente cadastrado.</p>`;
    }
  }

  /* ===========================================================
     MODAL: NOVO NUTRIENTE (personalizado)
     =========================================================== */
  function openNutrienteModal(target) {
    // target = { selectedArray, container, onChange }
    ui.nutrienteTarget = target;
    document.getElementById("fNutrienteNome").value = "";
    document.getElementById("formNutrienteError").classList.remove("show");
    const catSelect = document.getElementById("fNutrienteCategoria");
    catSelect.innerHTML = sortedCategories().map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.nome)}</option>`).join("");
    catSelect.value = "outros";
    openModal("modalNutriente");
  }

  document.getElementById("btnAddNutrient").addEventListener("click", () => {
    openNutrienteModal({
      selectedArray: currentEntryNutrients,
      container: document.getElementById("nutrientChipList"),
      onChange: null
    });
  });

  document.getElementById("btnSalvarNutriente").addEventListener("click", () => {
    const nome = document.getElementById("fNutrienteNome").value.trim();
    const categoriaId = document.getElementById("fNutrienteCategoria").value;
    const errEl = document.getElementById("formNutrienteError");
    if (!nome) {
      errEl.textContent = "Informe o nome do nutriente.";
      errEl.classList.add("show");
      return;
    }
    if (!state.nutrients.find(n => n.nome.toLowerCase() === nome.toLowerCase())) {
      state.nutrients.push({ nome, categoriaId });
      save();
    }
    if (ui.nutrienteTarget) {
      const { selectedArray, container, onChange } = ui.nutrienteTarget;
      if (!selectedArray.find(s => s.nome === nome)) selectedArray.push({ nome, dose: "" });
      renderNutrientChipCategories(container, selectedArray, onChange);
      if (onChange) onChange();
    }
    closeModal("modalNutriente");
    showToast("Nutriente adicionado.");
  });

  /* ===========================================================
     PROGRAMAS DE NUTRIÇÃO
     =========================================================== */
  function openProgramasModal() {
    renderProgramList();
    const first = state.nutritionPrograms[0];
    ui.editingProgramId = first ? first.id : null;
    renderProgramEditor();
    openModal("modalProgramas");
  }

  function renderProgramList() {
    const wrap = document.getElementById("programListWrap");
    wrap.innerHTML = "";
    if (state.nutritionPrograms.length === 0) {
      wrap.innerHTML = `<p style="color:var(--text-faint); font-size:12px;">Nenhum programa criado.</p>`;
      return;
    }
    state.nutritionPrograms.forEach(p => {
      const row = document.createElement("div");
      row.className = "program-list-row" + (p.id === ui.editingProgramId ? " active" : "");
      row.innerHTML = `<span class="plr-name">${escapeHtml(p.nome)}</span><span class="plr-meta">${allWeekNumbers(p).length} sem.</span>`;
      row.addEventListener("click", () => {
        ui.editingProgramId = p.id;
        renderProgramList();
        renderProgramEditor();
      });
      wrap.appendChild(row);
    });
  }

  document.getElementById("btnNovoPrograma").addEventListener("click", () => {
    const novo = { id: uid(), nome: "Novo programa", semanas: [{ id: uid(), numeros: [1], itens: [] }] };
    state.nutritionPrograms.push(novo);
    ui.editingProgramId = novo.id;
    save();
    renderProgramList();
    renderProgramEditor();
  });

  function renderProgramEditor() {
    const wrap = document.getElementById("programEditorWrap");
    const program = getProgram(ui.editingProgramId);
    if (!program) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;">
          <h3 style="font-size:15px;">Nenhum programa selecionado</h3>
          <p style="font-size:12.5px;">Crie ou selecione um programa à esquerda para editar as semanas.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:16px;">
        <input type="text" id="programNomeInput" value="${escapeAttr(program.nome)}" style="flex:1; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:9px 10px; font-size:14px; font-weight:600;">
        <button class="btn btn-sm btn-danger" id="btnExcluirPrograma">Excluir programa</button>
      </div>
      <p style="font-size:11.5px; color:var(--text-faint); margin-bottom:14px;">Cada bloco abaixo pode valer para uma ou várias semanas (ex: "3, 4, 5" ou "3-5") — útil quando a mesma mistura se repete por algumas semanas seguidas.</p>
      <div id="weeksWrap"></div>
      <button class="chip-add" id="btnAddWeek" style="width:100%; text-align:center;">+ adicionar bloco de semanas</button>
    `;

    document.getElementById("programNomeInput").addEventListener("input", (e) => {
      program.nome = e.target.value;
      save();
      renderProgramList();
    });
    document.getElementById("btnExcluirPrograma").addEventListener("click", () => {
      askConfirm("Excluir programa", `Excluir o programa "${program.nome}"? Cultivos que o usam ficarão sem programa vinculado.`, () => {
        state.nutritionPrograms = state.nutritionPrograms.filter(p => p.id !== program.id);
        state.grows.forEach(g => { if (g.programaId === program.id) g.programaId = null; });
        ui.editingProgramId = state.nutritionPrograms[0] ? state.nutritionPrograms[0].id : null;
        save();
        renderProgramList();
        renderProgramEditor();
        showToast("Programa excluído.");
      });
    });
    document.getElementById("btnAddWeek").addEventListener("click", () => {
      const allNums = program.semanas.flatMap(s => s.numeros || []);
      const nextNum = allNums.length ? Math.max(...allNums) + 1 : 1;
      program.semanas.push({ id: uid(), numeros: [nextNum], itens: [] });
      save();
      renderWeeks();
    });

    function weekNumberChipsHtml(numeros) {
      return (numeros && numeros.length)
        ? numeros.map(n => `<span class="week-number-chip">Semana ${n}</span>`).join("")
        : `<span style="color:var(--text-faint); font-size:10.5px;">nenhuma semana definida ainda</span>`;
    }

    function renderWeeks() {
      const weeksWrap = document.getElementById("weeksWrap");
      weeksWrap.innerHTML = "";
      program.semanas
        .slice()
        .sort((a, b) => {
          const aMin = a.numeros && a.numeros.length ? Math.min(...a.numeros) : Infinity;
          const bMin = b.numeros && b.numeros.length ? Math.min(...b.numeros) : Infinity;
          return aMin - bMin;
        })
        .forEach(semana => {
          const block = document.createElement("div");
          block.className = "week-block";
          block.innerHTML = `
            <div class="week-block-head">
              <div style="flex:1;">
                <label style="font-size:10.5px; color:var(--text-faint); display:block; margin-bottom:5px;">Semanas deste bloco (ex: 1,2,3 ou 1-3)</label>
                <input type="text" class="week-numbers-input" value="${escapeAttr((semana.numeros || []).join(", "))}" placeholder="Ex: 1-3">
                <div class="week-number-chips">${weekNumberChipsHtml(semana.numeros)}</div>
              </div>
              <button class="icon-btn" title="Remover este bloco" data-remove-week="${semana.id}">🗑</button>
            </div>
            <div class="week-chip-list"></div>
            <button type="button" class="chip-add" data-add-nutrient-week="${semana.id}" style="margin-top:8px;">+ adicionar nutriente</button>
          `;
          weeksWrap.appendChild(block);
          const chipContainer = block.querySelector(".week-chip-list");
          renderNutrientChipCategories(chipContainer, semana.itens, () => save());

          block.querySelector(".week-numbers-input").addEventListener("input", (e) => {
            semana.numeros = parseWeekNumbers(e.target.value);
            save();
            block.querySelector(".week-number-chips").innerHTML = weekNumberChipsHtml(semana.numeros);
            renderProgramList();
          });
          block.querySelector("[data-remove-week]").addEventListener("click", () => {
            program.semanas = program.semanas.filter(s => s.id !== semana.id);
            save();
            renderProgramList();
            renderWeeks();
          });
          block.querySelector("[data-add-nutrient-week]").addEventListener("click", () => {
            openNutrienteModal({
              selectedArray: semana.itens,
              container: chipContainer,
              onChange: () => save()
            });
          });
        });
    }
    renderWeeks();
  }

  /* ===========================================================
     IMPORTAR PLANILHA XLSX
     =========================================================== */
  // Nomes de grupo de coluna que representam contexto compartilhado
  // (não uma planta individual) no template de planilha do app.
  const IMPORT_SHARED_GROUPS = new Set(["Intake Water", "Controle de Temperatura e Umidade", "Luz", "Dist. Luz"]);

  // Termos que, se encontrados nos nutrientes do dia, indicam que a
  // floração já começou (heurística geral — ajustável depois na mão).
  const IMPORT_BLOOM_MARKERS = ["master bloom", "candy carb", "fat nug", "speed bud", "super shell", "dank mag", "calbor mag", "last mile", "complex zym", "zen"];

  // Termos que na verdade são "sem nutriente" (apelidos usados na planilha
  // para dizer que só foi dada água / carinho, sem fertilizante).
  const IMPORT_NUTRIENT_EXCLUDE = new Set(["amor e carinho", "somente águas por aqui danadinho", "somente aguas por aqui danadinho", "n/a", "na"]);

  // Produtos "A/B" que a planilha às vezes registra sem o sufixo — como os
  // dois sempre são dosados juntos, expandimos para o par completo.
  const IMPORT_NUTRIENT_EXPAND = { "master grow": ["Master Grow A", "Master Grow B"], "master bloom": ["Master Bloom A", "Master Bloom B"] };

  const IMPORT_ACTIVITY_ALIASES = {
    "daily check": "Daily Check", "rega": "Rega", "flush": "Flush",
    "rega, poda": "Rega & Poda", "poda, rega": "Rega & Poda",
    "rega, lst": "Rega & LST", "lst, rega": "Rega & LST",
    "rega, flush": "Flush", "flush, rega": "Flush",
  };

  let importParsedSheets = []; // [{ sheetName, rows2D, valid, willImport... }]

  function cleanGroupLabel(label) {
    return String(label).replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ0-9]+/, "").trim();
  }

  function toISODateFromCell(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return null;
  }

  function importSafeNumber(v) {
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date) return ""; // valor corrompido (virou data na planilha original)
    if (typeof v === "number") return isNaN(v) ? "" : v;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? "" : n;
  }

  // Algumas planilhas guardam umidade como fração (célula formatada como
  // "62%" mas com valor bruto 0.62) em vez do número inteiro que o app usa.
  function importFixHumidity(raw) {
    if (typeof raw === "number" && raw > 0 && raw <= 1) return raw * 100;
    return raw;
  }

  function parseCicloLuzNote(v) {
    if (!(v instanceof Date) || isNaN(v.getTime())) return null;
    const day = v.getUTCDate(), month = v.getUTCMonth() + 1;
    if (day >= 1 && day <= 24 && month >= 1 && month <= 24) return `Ciclo de luz: ${day}/${month}`;
    return null;
  }

  function importNormalizeAtividade(raw) {
    if (!raw) return "Daily Check";
    const key = String(raw).trim().toLowerCase();
    if (IMPORT_ACTIVITY_ALIASES[key]) return IMPORT_ACTIVITY_ALIASES[key];
    const existing = state.activityCatalog.find(a => a.toLowerCase() === key);
    if (existing) return existing;
    return String(raw).trim();
  }

  function importParseNutrientTokens(raw) {
    if (!raw) return [];
    const tokens = String(raw).split(",").map(s => s.trim()).filter(Boolean);
    const result = [];
    tokens.forEach(tok => {
      const key = tok.toLowerCase();
      if (IMPORT_NUTRIENT_EXCLUDE.has(key)) return;
      if (IMPORT_NUTRIENT_EXPAND[key]) {
        IMPORT_NUTRIENT_EXPAND[key].forEach(n => { if (!result.includes(n)) result.push(n); });
        return;
      }
      const existing = state.nutrients.find(n => n.nome.toLowerCase() === key);
      if (existing) { if (!result.includes(existing.nome)) result.push(existing.nome); }
      else { if (!result.includes(tok)) result.push(tok); }
    });
    return result;
  }

  function importInferEstagios(rows) {
    let phase = "Germinação";
    let bloomStarted = false;
    return rows.map(r => {
      const estRawLower = (r.estagioRaw || "").toString().toLowerCase();
      const notasLower = (r.notas || "").toString().toLowerCase();
      const nutrLower = (r.nutrientesRaw || "").toString().toLowerCase();

      if (/colh|harvest/.test(notasLower)) return "Colhida";
      if (/flush/i.test(r.atividadeNorm || "")) return "Flush";

      if (!bloomStarted) {
        if (/flora/.test(notasLower) || /flora/.test(estRawLower) || IMPORT_BLOOM_MARKERS.some(m => nutrLower.includes(m))) {
          bloomStarted = true;
        }
      }
      if (bloomStarted) { phase = "Floração"; return phase; }

      if (/seed/.test(estRawLower)) { phase = "Germinação"; return phase; }
      if (phase === "Germinação") phase = "Vegetativo";
      return phase;
    });
  }

  // Constrói o mapa de colunas (posição -> campo do app) a partir das duas
  // linhas de cabeçalho e das mesclagens da linha de grupo.
  function buildImportColumnMap(row1, row2, merges) {
    const nCols = Math.max(row1.length, row2.length);
    const groupAt = new Array(nCols).fill(null);
    (merges || []).forEach(m => {
      if (m.s.r === 0) {
        const label = row1[m.s.c];
        for (let c = m.s.c; c <= m.e.c; c++) groupAt[c] = label;
      }
    });
    for (let c = 0; c < nCols; c++) {
      if (groupAt[c] == null && row1[c] != null && String(row1[c]).trim() !== "") groupAt[c] = row1[c];
    }

    const map = {
      estagio: null, data: null, atividade: null, nutrientes: null, litros: null,
      phEntrada: null, ppmEntrada: null, ecEntrada: null,
      temperatura: null, umidade: null, vpd: null,
      ppfd: null, dli: null, cicloLuz: null, notas: null,
      plantGroups: []
    };
    const plantColsByGroup = {};
    const plantOrder = [];

    for (let c = 0; c < nCols; c++) {
      const label = (row2[c] || "").toString().trim();
      if (!label) continue;
      const labelLower = label.toLowerCase();
      const group = groupAt[c];

      if (map.estagio === null && labelLower === "estágio") { map.estagio = c; continue; }
      if (map.data === null && labelLower === "data") { map.data = c; continue; }
      if (map.atividade === null && labelLower === "atividade") { map.atividade = c; continue; }
      if (map.nutrientes === null && labelLower === "nutrientes") { map.nutrientes = c; continue; }
      if (labelLower === "special notes") { map.notas = c; continue; }
      if (labelLower === "ciclo de luz") { map.cicloLuz = c; continue; }

      if (group === "Intake Water") {
        if (labelLower === "litros") map.litros = c;
        else if (labelLower.startsWith("ph")) map.phEntrada = c;
        else if (labelLower.startsWith("ppm")) map.ppmEntrada = c;
        else if (labelLower === "ec") map.ecEntrada = c;
        continue;
      }
      if (group === "Controle de Temperatura e Umidade") {
        if (labelLower === "temperatura") map.temperatura = c;
        else if (labelLower === "umidade") map.umidade = c;
        else if (labelLower.startsWith("vpd")) map.vpd = c;
        continue;
      }
      if (group === "Luz" || group === "Dist. Luz") continue; // Ciclo de Luz já tratado acima; % e (cm) não são modelados

      const groupClean = group ? cleanGroupLabel(String(group)) : null;
      if (groupClean && !IMPORT_SHARED_GROUPS.has(group)) {
        if (!plantColsByGroup[groupClean]) {
          plantColsByGroup[groupClean] = { nome: groupClean, ph: null, ppm: null, ec: null };
          plantOrder.push(groupClean);
        }
        const pg = plantColsByGroup[groupClean];
        if (labelLower.startsWith("ph")) pg.ph = c;
        else if (labelLower.startsWith("ppm")) pg.ppm = c;
        else if (labelLower.startsWith("ec")) pg.ec = c;
        else if (labelLower === "ppfd" && map.ppfd === null) map.ppfd = c;
        else if (labelLower === "dli" && map.dli === null) map.dli = c;
      }
    }
    map.plantGroups = plantOrder.map(name => plantColsByGroup[name]);
    return map;
  }

  function importRowHasContent(row, map) {
    const cols = [map.atividade, map.nutrientes, map.litros, map.phEntrada, map.ppmEntrada, map.ecEntrada,
      map.temperatura, map.umidade, map.vpd, map.ppfd, map.dli, map.notas]
      .concat(map.plantGroups.flatMap(pg => [pg.ph, pg.ppm, pg.ec]));
    return cols.some(c => c !== null && c !== undefined && row[c] !== null && row[c] !== undefined && row[c] !== "");
  }

  function sheetLooksLikeGrowLog(rows2D) {
    for (const rowIdx of [1, 0]) {
      const row = rows2D[rowIdx];
      if (!row) continue;
      const lower = row.map(v => (v || "").toString().trim().toLowerCase());
      if (lower.includes("estágio") && lower.includes("data") && lower.includes("atividade") && lower.includes("nutrientes")) {
        return true;
      }
    }
    return false;
  }

  function parseGrowSheet(rows2D, merges) {
    const row1 = rows2D[0] || [];
    const row2 = rows2D[1] || [];
    const map = buildImportColumnMap(row1, row2, merges);
    const rawDataRows = rows2D.slice(2);

    const basic = [];
    rawDataRows.forEach(row => {
      if (!row) return;
      const dataISO = toISODateFromCell(row[map.data]);
      if (!dataISO) return;
      if (!importRowHasContent(row, map)) return;
      basic.push({
        dataISO,
        estagioRaw: map.estagio !== null ? row[map.estagio] : null,
        atividadeRaw: map.atividade !== null ? row[map.atividade] : null,
        nutrientesRaw: map.nutrientes !== null ? row[map.nutrientes] : null,
        notasRaw: map.notas !== null ? row[map.notas] : null,
        row,
      });
    });
    basic.forEach(p => { p.atividadeNorm = importNormalizeAtividade(p.atividadeRaw); });
    const estagios = importInferEstagios(basic.map(p => ({
      estagioRaw: p.estagioRaw, atividadeNorm: p.atividadeNorm, nutrientesRaw: p.nutrientesRaw, notas: p.notasRaw
    })));

    const plantNames = map.plantGroups.map(pg => pg.nome);
    const novosNutrientes = new Set();
    const novasAtividades = new Set();

    const parsedEntries = basic.map((p, idx) => {
      const row = p.row;
      const nutrientes = importParseNutrientTokens(p.nutrientesRaw).map(nome => {
        if (!state.nutrients.find(n => n.nome.toLowerCase() === nome.toLowerCase())) novosNutrientes.add(nome);
        return { nome, dose: "" };
      });
      if (!state.activityCatalog.find(a => a.toLowerCase() === p.atividadeNorm.toLowerCase())) {
        novasAtividades.add(p.atividadeNorm);
      }
      const cicloNote = parseCicloLuzNote(map.cicloLuz !== null ? row[map.cicloLuz] : null);
      let notas = p.notasRaw ? String(p.notasRaw).trim() : "";
      if (cicloNote) notas = notas ? `${notas} (${cicloNote})` : cicloNote;

      const leiturasPorPlanta = map.plantGroups.map(pg => ({
        nomePlanta: pg.nome,
        phSaida: importSafeNumber(pg.ph !== null ? row[pg.ph] : null),
        ppmSaida: importSafeNumber(pg.ppm !== null ? row[pg.ppm] : null),
        ecSaida: importSafeNumber(pg.ec !== null ? row[pg.ec] : null),
      }));

      return {
        data: p.dataISO,
        estagio: estagios[idx],
        atividade: p.atividadeNorm,
        nutrientes,
        litros: importSafeNumber(map.litros !== null ? row[map.litros] : null),
        phEntrada: importSafeNumber(map.phEntrada !== null ? row[map.phEntrada] : null),
        ppmEntrada: importSafeNumber(map.ppmEntrada !== null ? row[map.ppmEntrada] : null),
        ecEntrada: importSafeNumber(map.ecEntrada !== null ? row[map.ecEntrada] : null),
        temperatura: importSafeNumber(map.temperatura !== null ? row[map.temperatura] : null),
        umidade: importSafeNumber(importFixHumidity(map.umidade !== null ? row[map.umidade] : null)),
        vpd: importSafeNumber(map.vpd !== null ? row[map.vpd] : null),
        ppfd: importSafeNumber(map.ppfd !== null ? row[map.ppfd] : null),
        dli: importSafeNumber(map.dli !== null ? row[map.dli] : null),
        observacoes: notas,
        leiturasPorPlanta,
      };
    });

    return { plantNames, entries: parsedEntries, novosNutrientes: Array.from(novosNutrientes), novasAtividades: Array.from(novasAtividades) };
  }

  function guessTipoFromSheetName(name) {
    const n = name.toLowerCase();
    return (n.includes("auto")) ? "automatica" : "fotoperiodo";
  }

  function resetImportModal() {
    importParsedSheets = [];
    document.getElementById("importFileInput").value = "";
    document.getElementById("importDropLabel").textContent = "Clique para escolher um arquivo .xlsx";
    document.getElementById("importSheetsWrap").innerHTML = "";
    document.getElementById("importFootNote").textContent = "";
    document.getElementById("btnConfirmarImportacao").disabled = true;
  }

  function openImportModal() {
    resetImportModal();
    openModal("modalImportar");
  }
  document.getElementById("btnAbrirImportar").addEventListener("click", openImportModal);

  document.getElementById("importFileInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    document.getElementById("importDropLabel").textContent = `Arquivo: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        importParsedSheets = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
          const valid = sheetLooksLikeGrowLog(rows2D);
          return { sheetName: name, rows2D, merges: ws["!merges"] || [], valid, parsed: null };
        }).filter(s => s.valid);
        renderImportSheetsList();
      } catch (err) {
        showToast("Não foi possível ler esse arquivo. Verifique se é um .xlsx válido.");
      }
    };
    reader.readAsArrayBuffer(file);
  });

  function renderImportSheetsList() {
    const wrap = document.getElementById("importSheetsWrap");
    const footNote = document.getElementById("importFootNote");
    if (importParsedSheets.length === 0) {
      wrap.innerHTML = `<p style="font-size:12.5px; color:var(--text-faint);">Nenhuma aba com o formato esperado (Estágio, Data, Atividade, Nutrientes...) foi encontrada nesse arquivo.</p>`;
      footNote.textContent = "";
      document.getElementById("btnConfirmarImportacao").disabled = true;
      return;
    }
    wrap.innerHTML = "";
    importParsedSheets.forEach((sheet, idx) => {
      sheet.parsed = parseGrowSheet(sheet.rows2D, sheet.merges);
      const dates = sheet.parsed.entries.map(e => e.data).sort();
      const first = dates[0], last = dates[dates.length - 1];

      const card = document.createElement("div");
      card.className = "import-sheet-card checked";
      card.innerHTML = `
        <div class="import-sheet-head">
          <input type="checkbox" data-sheet-idx="${idx}" class="import-sheet-check" checked>
          <span class="ish-title">${escapeHtml(sheet.sheetName)}</span>
          <span class="ish-meta">${sheet.parsed.entries.length} registros · ${sheet.parsed.plantNames.length} planta${sheet.parsed.plantNames.length === 1 ? "" : "s"}${first ? ` · ${formatDateBR(first)} a ${formatDateBR(last)}` : ""}</span>
        </div>
        <div class="import-sheet-body">
          <div class="field">
            <label>Nome do cultivo</label>
            <input type="text" class="import-nome" value="${escapeAttr(sheet.sheetName)}">
          </div>
          <div class="field">
            <label>Tipo de cultivo</label>
            <select class="import-tipo">
              <option value="fotoperiodo" ${guessTipoFromSheetName(sheet.sheetName) === "fotoperiodo" ? "selected" : ""}>Fotoperíodo</option>
              <option value="automatica" ${guessTipoFromSheetName(sheet.sheetName) === "automatica" ? "selected" : ""}>Automática</option>
            </select>
          </div>
          <div class="field">
            <label>Data de início</label>
            <input type="date" class="import-data-inicio" value="${first || todayISO()}">
          </div>
          <div class="import-finish-row">
            <input type="checkbox" class="import-finalizado" checked>
            <label>Marcar como cultivo finalizado (colheita já realizada)</label>
          </div>
          <div class="import-summary" style="grid-column:1 / -1;">
            Plantas detectadas: ${sheet.parsed.plantNames.map(n => escapeHtml(n)).join(", ") || "nenhuma"}.
            ${sheet.parsed.novosNutrientes.length ? `Novos nutrientes que serão adicionados ao catálogo: ${sheet.parsed.novosNutrientes.map(n => escapeHtml(n)).join(", ")}.` : ""}
            ${sheet.parsed.novasAtividades.length ? `Novas atividades que serão adicionadas: ${sheet.parsed.novasAtividades.map(n => escapeHtml(n)).join(", ")}.` : ""}
          </div>
          ${sheet.parsed.entries.length === 0 ? `<div class="import-warning" style="grid-column:1 / -1;">Nenhum registro com dados foi encontrado nessa aba.</div>` : ""}
        </div>
      `;
      wrap.appendChild(card);

      const checkbox = card.querySelector(".import-sheet-check");
      checkbox.addEventListener("change", () => {
        card.classList.toggle("checked", checkbox.checked);
        updateImportFootNote();
      });
    });
    updateImportFootNote();
  }

  function updateImportFootNote() {
    const checks = Array.from(document.querySelectorAll(".import-sheet-check"));
    const checkedCount = checks.filter(c => c.checked).length;
    document.getElementById("importFootNote").textContent = checkedCount
      ? `${checkedCount} cultivo${checkedCount === 1 ? "" : "s"} ${checkedCount === 1 ? "será" : "serão"} criado${checkedCount === 1 ? "" : "s"}.`
      : "Selecione ao menos uma aba para importar.";
    document.getElementById("btnConfirmarImportacao").disabled = checkedCount === 0;
  }

  document.getElementById("btnConfirmarImportacao").addEventListener("click", () => {
    const cards = Array.from(document.querySelectorAll(".import-sheet-card"));
    let totalEntries = 0, totalGrows = 0;
    let lastGrowId = null;

    cards.forEach((card, idx) => {
      const checkbox = card.querySelector(".import-sheet-check");
      if (!checkbox.checked) return;
      const sheet = importParsedSheets[idx];
      if (!sheet || !sheet.parsed) return;

      const nome = card.querySelector(".import-nome").value.trim() || sheet.sheetName;
      const tipo = card.querySelector(".import-tipo").value === "automatica" ? "automatica" : "fotoperiodo";
      const dataInicio = card.querySelector(".import-data-inicio").value || todayISO();
      const finalizado = card.querySelector(".import-finalizado").checked;

      const plants = sheet.parsed.plantNames.map(nomePlanta => ({
        id: uid(), nome: nomePlanta, dataInicio, colhida: finalizado
      }));
      const plantIdByName = {};
      plants.forEach(p => { plantIdByName[p.nome] = p.id; });

      sheet.parsed.novosNutrientes.forEach(nome2 => {
        if (!state.nutrients.find(n => n.nome.toLowerCase() === nome2.toLowerCase())) {
          state.nutrients.push({ nome: nome2, categoriaId: "outros" });
        }
      });
      sheet.parsed.novasAtividades.forEach(a => {
        if (!state.activityCatalog.find(x => x.toLowerCase() === a.toLowerCase())) {
          state.activityCatalog.push(a);
        }
      });

      const entries = sheet.parsed.entries.map((e, i) => {
        const leituras = {};
        e.leiturasPorPlanta.forEach(l => {
          const pid = plantIdByName[l.nomePlanta];
          if (pid) leituras[pid] = { phSaida: l.phSaida, ppmSaida: l.ppmSaida, ecSaida: l.ecSaida };
        });
        return {
          id: uid(), criadoEm: Date.now() + i,
          data: e.data, estagio: e.estagio, atividade: e.atividade, nutrientes: e.nutrientes,
          litros: e.litros, phEntrada: e.phEntrada, ppmEntrada: e.ppmEntrada, ecEntrada: e.ecEntrada,
          temperatura: e.temperatura, umidade: e.umidade, vpd: e.vpd, ppfd: e.ppfd, dli: e.dli,
          observacoes: e.observacoes, leituras
        };
      });

      const novoGrow = { id: uid(), nome, tipo, dataInicio, programaId: null, finalizado, plants, entries };
      state.grows.push(novoGrow);
      lastGrowId = novoGrow.id;
      totalGrows++;
      totalEntries += entries.length;
    });

    if (totalGrows === 0) { showToast("Nenhum cultivo selecionado."); return; }

    if (lastGrowId) state.selectedGrowId = lastGrowId;
    save();
    closeAllModals();
    renderAll();
    showToast(`${totalGrows} cultivo${totalGrows === 1 ? "" : "s"} importado${totalGrows === 1 ? "" : "s"} (${totalEntries} registros no total).`);
  });

  /* ===========================================================
     MODAL: REGISTRO
     =========================================================== */
  let currentEntryNutrients = []; // [{nome, dose}]

  function populateSelect(selectEl, options, currentValue) {
    selectEl.innerHTML = options.map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join("");
    if (currentValue && !options.includes(currentValue)) {
      selectEl.innerHTML += `<option value="${escapeAttr(currentValue)}">${escapeHtml(currentValue)}</option>`;
    }
    if (currentValue) selectEl.value = currentValue;
  }

  document.getElementById("fAtividade").addEventListener("change", (e) => {
    if (e.target.value === "__custom__") {
      const custom = prompt("Nova atividade:");
      if (custom && custom.trim()) {
        const trimmed = custom.trim();
        if (!state.activityCatalog.includes(trimmed)) {
          state.activityCatalog.push(trimmed);
          save();
        }
        populateSelect(e.target, state.activityCatalog.concat(["__custom__"]), trimmed);
        fixCustomOptionLabel();
      } else {
        e.target.value = state.activityCatalog[0];
      }
    }
  });

  function fixCustomOptionLabel() {
    const sel = document.getElementById("fAtividade");
    const opt = Array.from(sel.options).find(o => o.value === "__custom__");
    if (opt) opt.textContent = "+ nova atividade...";
  }

  function renderSaidaTable(grow, entry) {
    const tbody = document.getElementById("saidaTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (grow.plants.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="color:var(--text-faint); font-size:12.5px; padding:8px;">Nenhuma planta cadastrada neste cultivo ainda.</td>`;
      tbody.appendChild(tr);
      return;
    }
    grow.plants.forEach(p => {
      const existing = (entry && entry.leituras && entry.leituras[p.id]) || {};
      const tr = document.createElement("tr");
      tr.dataset.plantId = p.id;
      const initialSt = existing.phSaida === undefined || existing.phSaida === "" || existing.phSaida === null
        ? null : phStatus(existing.phSaida, grow.tipo);
      tr.innerHTML = `
        <td class="prt-name"><span class="pc-swatch" style="width:8px;height:8px;border-radius:50%;background:${plantColor(grow, p.id)}; display:inline-block; margin-right:6px;"></span>${escapeHtml(p.nome)}</td>
        <td><div class="ph-input-wrap"><input type="number" step="0.01" class="in-ph" placeholder="pH" value="${existing.phSaida ?? ""}">${rangeDotHtml(initialSt)}</div></td>
        <td><input type="number" step="1" class="in-ppm" placeholder="ppm" value="${existing.ppmSaida ?? ""}"></td>
        <td><input type="number" step="0.01" class="in-ec" placeholder="mS/cm" value="${existing.ecSaida ?? ""}"></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector(".in-ph").addEventListener("input", () => refreshFormRangeIndicators(grow));
    });
  }

  function suggestedWeekNumber(grow, program) {
    const day = daysBetween(grow.dataInicio, todayISO()) + 1;
    const suggested = Math.max(1, Math.ceil(day / 7));
    const nums = allWeekNumbers(program);
    if (!nums.length) return null;
    if (suggested <= nums[0]) return nums[0];
    if (suggested >= nums[nums.length - 1]) return nums[nums.length - 1];
    return nums.includes(suggested) ? suggested : nums.reduce((closest, n) => Math.abs(n - suggested) < Math.abs(closest - suggested) ? n : closest, nums[0]);
  }

  function setupProgramApplySection(grow) {
    const section = document.getElementById("programApplySection");
    const program = grow.programaId ? getProgram(grow.programaId) : null;
    const nums = program ? allWeekNumbers(program) : [];
    if (!program || nums.length === 0) {
      section.style.display = "none";
      return;
    }
    section.style.display = "block";
    const container = document.getElementById("fProgramaSemanas");
    const suggested = suggestedWeekNumber(grow, program);
    container.innerHTML = nums.map(n => {
      const block = findBlockForWeek(program, n);
      const count = block ? block.itens.length : 0;
      const checked = n === suggested;
      return `<label class="week-check-chip ${checked ? "checked" : ""}">
        <input type="checkbox" value="${n}" ${checked ? "checked" : ""}>
        Semana ${n} (${count} nutriente${count === 1 ? "" : "s"})
      </label>`;
    }).join("");
    container.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener("change", () => {
        cb.closest(".week-check-chip").classList.toggle("checked", cb.checked);
      });
    });

    document.getElementById("btnAplicarSemana").onclick = () => {
      const checked = Array.from(container.querySelectorAll("input:checked"))
        .map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b);
      if (!checked.length) { showToast("Selecione ao menos uma semana."); return; }
      const merged = [];
      checked.forEach(n => {
        const block = findBlockForWeek(program, n);
        if (!block) return;
        block.itens.forEach(it => {
          const idx = merged.findIndex(m => m.nome === it.nome);
          if (idx >= 0) merged[idx] = { ...it };
          else merged.push({ ...it });
        });
      });
      currentEntryNutrients = merged;
      renderNutrientChipCategories(document.getElementById("nutrientChipList"), currentEntryNutrients, null);
      showToast(`Semana${checked.length > 1 ? "s" : ""} ${checked.join(", ")} aplicada${checked.length > 1 ? "s" : ""}.`);
    };
  }

  function applyLightDefaultsForStage(grow) {
    const estagio = document.getElementById("fEstagio").value;
    const lr = (LIGHT_RANGES[grow.tipo] || {})[estagio];
    if (lr) document.getElementById("calcFotoperiodo").value = lr.horas;
    recomputeDliField();
  }

  function refreshFormRangeIndicators(grow) {
    const estagio = document.getElementById("fEstagio").value;

    const phVal = document.getElementById("fPhEntrada").value;
    const phSt = phVal === "" ? null : phStatus(parseFloat(phVal), grow.tipo);
    const phBadge = document.getElementById("phEntradaBadge");
    phBadge.className = "range-pill " + (phSt ? "range-" + phSt : "range-none");
    phBadge.textContent = phSt ? statusLabel(phSt) : "—";
    const phRange = PH_RANGES[grow.tipo] || PH_RANGES.fotoperiodo;
    document.getElementById("phEntradaHint").textContent =
      `Faixa de referência (${TIPOS_CULTIVO[grow.tipo] || "Fotoperíodo"}): ${phRange.min.toFixed(1)}–${phRange.max.toFixed(1)}`;

    const vpdVal = document.getElementById("fVpd").value;
    const vpdSt = vpdVal === "" ? null : vpdStatus(parseFloat(vpdVal), estagio);
    const vpdBadge = document.getElementById("vpdBadge");
    vpdBadge.className = "range-pill " + (vpdSt ? "range-" + vpdSt : "range-none");
    vpdBadge.textContent = vpdSt ? statusLabel(vpdSt) : "—";
    const vpdRange = VPD_RANGES[estagio];
    document.getElementById("vpdHint").textContent = vpdRange
      ? `Faixa de referência para ${estagio}: ${vpdRange.min.toFixed(1)}–${vpdRange.max.toFixed(1)} kPa (considera a folha ${VPD_LEAF_TEMP_OFFSET}°C mais fria que o ar)`
      : `Considera a folha ${VPD_LEAF_TEMP_OFFSET}°C mais fria que o ar.`;

    const lightRange = (LIGHT_RANGES[grow.tipo] || {})[estagio];
    document.getElementById("ppfdHint").textContent = lightRange
      ? `Referência (${TIPOS_CULTIVO[grow.tipo] || "Fotoperíodo"}): ${lightRange.ppfd[0]}–${lightRange.ppfd[1]} µmol`
      : "";
    document.getElementById("dliHint").textContent = lightRange
      ? `Referência: ${lightRange.dli[0]}–${lightRange.dli[1]} mol/dia`
      : "";

    document.querySelectorAll("#saidaTableBody tr").forEach(tr => {
      const input = tr.querySelector(".in-ph");
      const dot = tr.querySelector(".range-dot");
      if (!input || !dot) return;
      const st = input.value === "" ? null : phStatus(parseFloat(input.value), grow.tipo);
      dot.outerHTML = rangeDotHtml(st);
    });
  }

  function openRegistroModal(entryId) {
    const grow = getSelectedGrow();
    if (!grow) return;
    ui.editingRegistroId = entryId;
    const isEdit = !!entryId;
    const entry = isEdit ? grow.entries.find(e => e.id === entryId) : null;

    document.getElementById("modalRegistroTitle").textContent = isEdit ? "Editar registro" : "Novo registro";
    document.getElementById("formRegistroError").classList.remove("show");

    document.getElementById("fData").value = entry ? entry.data : todayISO();
    populateSelect(document.getElementById("fEstagio"), ESTAGIOS, entry ? entry.estagio : (lastEstagio(grow) || ESTAGIOS[0]));
    populateSelect(document.getElementById("fAtividade"), state.activityCatalog.concat(["__custom__"]), entry ? entry.atividade : state.activityCatalog[0]);
    fixCustomOptionLabel();

    setupProgramApplySection(grow);

    currentEntryNutrients = entry ? (entry.nutrientes || []).map(n => ({ ...n })) : [];
    renderNutrientChipCategories(document.getElementById("nutrientChipList"), currentEntryNutrients, null);

    document.getElementById("fLitros").value = entry ? entry.litros ?? "" : "";
    document.getElementById("fPhEntrada").value = entry ? entry.phEntrada ?? "" : "";
    document.getElementById("fPpmEntrada").value = entry ? entry.ppmEntrada ?? "" : "";
    document.getElementById("fEcEntrada").value = entry ? entry.ecEntrada ?? "" : "";
    document.getElementById("fTemp").value = entry ? entry.temperatura ?? "" : "";
    document.getElementById("fUmidade").value = entry ? entry.umidade ?? "" : "";
    document.getElementById("fPpfd").value = entry ? entry.ppfd ?? "" : "";
    document.getElementById("fObservacoes").value = entry ? entry.observacoes ?? "" : "";
    recomputeVpdField();
    applyLightDefaultsForStage(grow);
    recomputeDliField();

    renderSaidaTable(grow, entry);
    refreshFormRangeIndicators(grow);
    openModal("modalRegistro");
  }

  function lastEstagio(grow) {
    const entries = sortedEntries(grow);
    return entries.length ? entries[0].estagio : null;
  }

  function recomputeVpdField() {
    const t = parseFloat(document.getElementById("fTemp").value);
    const rh = parseFloat(document.getElementById("fUmidade").value);
    const vpdField = document.getElementById("fVpd");
    if (!isNaN(t) && !isNaN(rh)) {
      vpdField.value = calcVPD(t, rh);
    } else {
      vpdField.value = "";
    }
  }
  function recomputeDliField() {
    const ppfd = parseFloat(document.getElementById("fPpfd").value);
    const hours = parseFloat(document.getElementById("calcFotoperiodo").value);
    const dliField = document.getElementById("fDli");
    if (!isNaN(ppfd) && !isNaN(hours)) {
      dliField.value = calcDLI(ppfd, hours);
    } else {
      dliField.value = "";
    }
  }
  document.getElementById("fTemp").addEventListener("input", () => {
    recomputeVpdField();
    const grow = getSelectedGrow();
    if (grow) refreshFormRangeIndicators(grow);
  });
  document.getElementById("fUmidade").addEventListener("input", () => {
    recomputeVpdField();
    const grow = getSelectedGrow();
    if (grow) refreshFormRangeIndicators(grow);
  });
  document.getElementById("fPhEntrada").addEventListener("input", () => {
    const grow = getSelectedGrow();
    if (grow) refreshFormRangeIndicators(grow);
  });
  document.getElementById("fPpfd").addEventListener("input", recomputeDliField);
  document.getElementById("calcFotoperiodo").addEventListener("input", recomputeDliField);
  document.getElementById("fEstagio").addEventListener("change", () => {
    const grow = getSelectedGrow();
    if (!grow) return;
    applyLightDefaultsForStage(grow);
    refreshFormRangeIndicators(grow);
  });

  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return "";
    const n = parseFloat(v);
    return isNaN(n) ? "" : n;
  }

  document.getElementById("btnSalvarRegistro").addEventListener("click", () => {
    const grow = getSelectedGrow();
    if (!grow) return;
    const errEl = document.getElementById("formRegistroError");

    const data = document.getElementById("fData").value;
    const estagio = document.getElementById("fEstagio").value;
    let atividade = document.getElementById("fAtividade").value;
    if (atividade === "__custom__") atividade = state.activityCatalog[state.activityCatalog.length - 1];

    if (!data || !estagio || !atividade) {
      errEl.textContent = "Preencha data, estágio e atividade.";
      errEl.classList.add("show");
      return;
    }

    const leituras = {};
    document.querySelectorAll("#saidaTableBody tr").forEach(tr => {
      const pid = tr.dataset.plantId;
      if (!pid) return; // linha de "nenhuma planta cadastrada", sem campos
      leituras[pid] = {
        phSaida: numOrNull(tr.querySelector(".in-ph").value),
        ppmSaida: numOrNull(tr.querySelector(".in-ppm").value),
        ecSaida: numOrNull(tr.querySelector(".in-ec").value),
      };
    });

    recomputeVpdField();

    const payload = {
      data, estagio, atividade,
      nutrientes: currentEntryNutrients.filter(n => n.nome).map(n => ({ nome: n.nome, dose: (n.dose || "").toString().trim() })),
      litros: numOrNull(document.getElementById("fLitros").value),
      phEntrada: numOrNull(document.getElementById("fPhEntrada").value),
      ppmEntrada: numOrNull(document.getElementById("fPpmEntrada").value),
      ecEntrada: numOrNull(document.getElementById("fEcEntrada").value),
      temperatura: numOrNull(document.getElementById("fTemp").value),
      umidade: numOrNull(document.getElementById("fUmidade").value),
      vpd: numOrNull(document.getElementById("fVpd").value),
      ppfd: numOrNull(document.getElementById("fPpfd").value),
      dli: numOrNull(document.getElementById("fDli").value),
      observacoes: document.getElementById("fObservacoes").value.trim(),
      leituras
    };

    if (ui.editingRegistroId) {
      const entry = grow.entries.find(e => e.id === ui.editingRegistroId);
      Object.assign(entry, payload);
    } else {
      grow.entries.push(Object.assign({ id: uid(), criadoEm: Date.now() }, payload));
    }

    save();
    closeAllModals();
    ui.activeTab = "registros";
    renderAll();
    showToast("Registro salvo.");
  });

  /* ---------------------------------------------------------
     ESCAPE HELPERS
     --------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, s => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  /* ---------------------------------------------------------
     SINCRONIZAÇÃO COM CONTA GOOGLE (via Supabase)
     ---------------------------------------------------------
     A chave abaixo é a chave pública ("publishable"/anon) do Supabase —
     ela é feita para ser exposta no cliente (o acesso real é controlado
     por Row Level Security no banco). O Client ID/Secret do Google NUNCA
     entram aqui: eles ficam configurados no painel do Supabase
     (Authentication → Providers → Google), que faz a troca de tokens do
     lado do servidor. Veja SYNC-SETUP.md para o passo a passo completo.
     --------------------------------------------------------- */
  const SUPABASE_URL = "https://klaktdvanzuooddxlvsb.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_A3vUvh_h5dPFS8MC_OdPrg_UMc5f66u";
  const SYNC_TABLE = "growbro_data";

  const supa = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  let authSession = null;
  let syncStatus = "idle"; // idle | syncing | synced | error
  let pushTimer = null;

  function setSyncStatus(status) {
    syncStatus = status;
    renderAccountBlock();
  }

  function renderAccountBlock() {
    const el = document.getElementById("accountBlock");
    const note = document.getElementById("sidebarFootNote");
    if (!el || !note) return;

    if (!supa) {
      el.innerHTML = "";
      note.textContent = "Dados salvos localmente no seu navegador.";
      return;
    }
    if (!authSession) {
      el.innerHTML = `<button class="btn-ghost-row account-login-btn" id="btnGoogleLogin" title="Entrar com Google"><span class="bgr-icon">🔐</span><span class="bgr-label">Entrar com Google</span></button>`;
      document.getElementById("btnGoogleLogin").addEventListener("click", loginWithGoogle);
      note.textContent = "Dados salvos localmente no seu navegador.";
      return;
    }

    const user = authSession.user;
    const email = user.email || "conta Google";
    const avatarUrl = user.user_metadata && user.user_metadata.avatar_url;
    const initial = (email[0] || "?").toUpperCase();
    const statusLabel = { syncing: "Sincronizando…", error: "Erro ao sincronizar" }[syncStatus] || "Sincronizado";
    const statusClass = syncStatus === "syncing" ? "syncing" : (syncStatus === "error" ? "error" : "");
    el.innerHTML = `
      <div class="account-card">
        ${avatarUrl
          ? `<img class="account-avatar" src="${escapeAttr(avatarUrl)}" referrerpolicy="no-referrer" alt="">`
          : `<span class="account-avatar-fallback">${escapeHtml(initial)}</span>`}
        <div class="account-info">
          <span class="account-email">${escapeHtml(email)}</span>
          <span class="account-sync-status ${statusClass}"><span class="dot"></span>${statusLabel}</span>
        </div>
        <button class="icon-btn" id="btnLogout" title="Sair">⎋</button>
      </div>`;
    document.getElementById("btnLogout").addEventListener("click", logoutFromGoogle);
    note.textContent = "Sincronizado com sua conta Google.";
  }

  async function loginWithGoogle() {
    if (!supa) return;
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supa.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) showToast("Não foi possível iniciar o login: " + error.message);
  }

  async function logoutFromGoogle() {
    if (!supa) return;
    await supa.auth.signOut();
    showToast("Você saiu da conta. Os dados continuam salvos neste navegador.");
  }

  function schedulePush() {
    if (!supa || !authSession) return;
    clearTimeout(pushTimer);
    setSyncStatus("syncing");
    pushTimer = setTimeout(pushToCloud, 1200);
  }

  async function pushToCloud() {
    if (!supa || !authSession) return;
    try {
      const payload = { user_id: authSession.user.id, data: state, updated_at: new Date().toISOString() };
      const { error } = await supa.from(SYNC_TABLE).upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      setSyncStatus("idle");
    } catch (e) {
      setSyncStatus("error");
    }
  }

  function adoptRemoteState(remoteState) {
    state = migrate(remoteState);
    if (!state.selectedGrowId && state.grows.length) state.selectedGrowId = state.grows[0].id;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    renderAll();
  }

  // Compara dois estados ignorando o timestamp — só pra saber se já estão
  // de fato em sincronia (evita perguntar à toa quando nada mudou).
  function statesLookEquivalent(a, b) {
    const strip = (s) => { const c = { ...s }; delete c.updatedAt; return JSON.stringify(c); };
    try { return strip(a) === strip(b); } catch (e) { return false; }
  }

  // Ao entrar, decide o que fazer com o que já existe na nuvem para essa
  // conta: se só um lado tem dados, usa esse lado sem perguntar; se os
  // dois têm dados diferentes, SEMPRE pergunta — mesmo que um pareça mais
  // recente — porque "mais recente neste aparelho" não quer dizer "já viu
  // as mudanças do outro aparelho". Isso é "o último lado escolhido vence"
  // no nível do cultivo inteiro, não uma mesclagem campo a campo.
  async function handlePostLoginSync() {
    if (!supa || !authSession) return;
    setSyncStatus("syncing");
    try {
      const { data, error } = await supa
        .from(SYNC_TABLE)
        .select("data, updated_at")
        .eq("user_id", authSession.user.id)
        .maybeSingle();
      if (error) throw error;

      const localHasContent = state.grows.length > 0;
      const remoteState = data && data.data;
      const remoteHasContent = remoteState && Array.isArray(remoteState.grows) && remoteState.grows.length > 0;

      if (remoteHasContent && !localHasContent) {
        // Nada a perder localmente — adota a nuvem. Ela já está correta,
        // não precisa reenviar nada.
        adoptRemoteState(remoteState);
        setSyncStatus("idle");
        return;
      }

      if (remoteHasContent && localHasContent && !statesLookEquivalent(state, remoteState)) {
        const remoteUpdated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const remoteIsNewer = remoteUpdated > (state.updatedAt || 0);
        setSyncStatus("idle");
        // Importante: NÃO agenda envio nenhum aqui. Enviar antes do
        // usuário decidir arriscaria sobrescrever a nuvem com o estado
        // deste aparelho antes mesmo dele escolher usar a nuvem.
        askConfirm(
          "Dados encontrados na nuvem",
          `Esta conta já tem dados salvos na nuvem${remoteIsNewer ? " e parecem mais recentes que os deste dispositivo" : ""}. Usar os dados da nuvem? Isso substitui os dados deste dispositivo.`,
          () => adoptRemoteState(remoteState), // "Confirmar" = usar a nuvem
          () => schedulePush() // "Cancelar" = manter este aparelho e enviá-lo
        );
        return;
      }

      // Nuvem vazia, ou já idêntica ao que está aqui: seguro sincronizar.
      setSyncStatus("idle");
      schedulePush();
    } catch (e) {
      setSyncStatus("error");
    }
  }

  function cleanupOAuthUrlFragments() {
    if (window.location.hash && /access_token|refresh_token/.test(window.location.hash)) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function setupAuthListener() {
    if (!supa) { renderAccountBlock(); return; }
    supa.auth.onAuthStateChange((event, session) => {
      authSession = session;
      renderAccountBlock();
      if (event === "SIGNED_IN") {
        cleanupOAuthUrlFragments();
        handlePostLoginSync();
      }
    });
    supa.auth.getSession().then(({ data }) => {
      authSession = data.session;
      renderAccountBlock();
    });
  }

  /* ---------------------------------------------------------
     BARRA LATERAL — recolher/expandir
     --------------------------------------------------------- */
  const SIDEBAR_COLLAPSE_KEY = "diario-cultivo:sidebar-collapsed";
  function setSidebarCollapsed(collapsed) {
    document.getElementById("app").classList.toggle("sidebar-collapsed", collapsed);
    document.getElementById("sidebar").classList.toggle("collapsed", collapsed);
    const btn = document.getElementById("btnToggleSidebar");
    btn.textContent = collapsed ? "›" : "‹";
    btn.title = collapsed ? "Expandir barra lateral" : "Recolher barra lateral";
    try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (e) { /* ignore */ }
  }
  document.getElementById("btnToggleSidebar").addEventListener("click", () => {
    const isCollapsed = document.getElementById("app").classList.contains("sidebar-collapsed");
    setSidebarCollapsed(!isCollapsed);
  });

  /* ---------------------------------------------------------
     BARRA LATERAL NO MOBILE — abre como gaveta por cima do conteúdo
     --------------------------------------------------------- */
  function isMobileViewport() {
    if (typeof window.matchMedia !== "function") return window.innerWidth <= 780;
    return window.matchMedia("(max-width: 780px)").matches;
  }
  function openMobileSidebar() {
    document.getElementById("sidebar").classList.add("mobile-open");
    document.getElementById("sidebarBackdrop").classList.add("show");
  }
  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("sidebarBackdrop").classList.remove("show");
  }
  document.getElementById("btnOpenMobileSidebar").addEventListener("click", openMobileSidebar);
  document.getElementById("sidebarBackdrop").addEventListener("click", closeMobileSidebar);
  // Qualquer clique num item de navegação dentro da barra (trocar de
  // cultivo, abrir um modal, etc.) fecha a gaveta — sem isso ela ficaria
  // aberta por cima do modal recém-aberto.
  document.getElementById("sidebar").addEventListener("click", (e) => {
    if (e.target.closest("button, .grow-item, .plant-chip-row")) closeMobileSidebar();
  });

  document.getElementById("btnFabNovoRegistro").addEventListener("click", () => openRegistroModal(null));

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */
  function init() {
    load();
    if (!state.selectedGrowId && state.grows.length) {
      state.selectedGrowId = state.grows[0].id;
    }
    let startCollapsed = false;
    try { startCollapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1"; } catch (e) { /* ignore */ }
    setSidebarCollapsed(startCollapsed);
    // O modo "recolhido só com ícones" é um recurso de desktop; no mobile
    // a barra é uma gaveta que, quando aberta, sempre mostra tudo.
    if (isMobileViewport()) document.getElementById("sidebar").classList.remove("collapsed");
    renderAll();
    setupAuthListener();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
