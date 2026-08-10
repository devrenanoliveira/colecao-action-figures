// Dashboard da coleção de action figures.
// Toda a informação vem de data.json (gerado por scripts/atualizar_dashboard.py
// a partir de data/colecao.csv) — este arquivo só renderiza, não calcula nada.

const STATUS_LABEL = { tenho: "Tenho", encomendado: "Encomendado", quero: "Quero" };

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

function initDarkMode() {
  const btn = document.getElementById("darkModeBtn");
  btn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    try {
      localStorage.setItem("colecaoFiguresDarkMode", document.body.classList.contains("dark"));
    } catch (e) {}
    // Redesenha os gráficos pra pegar as cores certas do tema
    if (window.__charts) {
      window.__charts.forEach((c) => c.destroy());
      renderCharts(window.__dados);
    }
  });
}

function figureCardHTML(item) {
  const imagem = item.imagem_url
    ? `<img class="figure-thumb" src="${escapeHtml(item.imagem_url)}" alt="${escapeHtml(item.nome)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'figure-thumb-fallback\\'>Sem imagem</div>'">`
    : `<div class="figure-thumb-fallback">Sem imagem</div>`;

  const link = item.link_mfc
    ? `<a class="figure-link" href="${escapeHtml(item.link_mfc)}" target="_blank" rel="noopener">Ver no MyFigureCollection ↗</a>`
    : "";

  const obs = item.observacao ? `<div class="figure-obs">${escapeHtml(item.observacao)}</div>` : "";

  const meta = [item.franquia, item.categoria, item.lancamento].filter(Boolean).join(" · ");

  return `
    <div class="figure-card">
      <div class="figure-thumb-wrap">${imagem}</div>
      <div class="figure-body">
        <span class="figure-status-badge ${item.status}">${STATUS_LABEL[item.status] || item.status}</span>
        <div class="figure-nome">${escapeHtml(item.nome)}</div>
        <div class="figure-meta">${escapeHtml(meta)}</div>
        ${obs}
        ${link}
      </div>
    </div>`;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGrid(elId, itens, status) {
  const el = document.getElementById(elId);
  const filtrados = itens.filter((i) => i.status === status);
  if (filtrados.length === 0) {
    el.innerHTML = `<div class="empty-state">Nenhum item nesta categoria ainda.</div>`;
    return;
  }
  el.innerHTML = filtrados.map(figureCardHTML).join("");
}

function chartColors() {
  const dark = document.body.classList.contains("dark");
  return {
    grid: dark ? "#334155" : "#e1e0d9",
    text: dark ? "#94a3b8" : "#52514e",
  };
}

function renderCharts(dados) {
  const colors = chartColors();
  window.__charts = [];

  const ctxStatus = document.getElementById("chartStatus");
  const chartStatus = new Chart(ctxStatus, {
    type: "doughnut",
    data: {
      labels: ["Tenho", "Encomendado", "Quero"],
      datasets: [{
        data: [dados.resumo.tenho, dados.resumo.encomendado, dados.resumo.quero],
        backgroundColor: ["#0ca30c", "#D97706", "#2563EB"],
        borderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: colors.text, font: { size: 11 } } },
      },
    },
  });
  window.__charts.push(chartStatus);

  const franquias = Object.entries(dados.resumo.por_franquia).slice(0, 8);
  const ctxFranquia = document.getElementById("chartFranquia");
  const chartFranquia = new Chart(ctxFranquia, {
    type: "bar",
    data: {
      labels: franquias.map((f) => f[0]),
      datasets: [{
        data: franquias.map((f) => f[1]),
        backgroundColor: "#2563EB",
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.text, precision: 0 }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.text, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
  window.__charts.push(chartFranquia);
}

function renderKpis(resumo) {
  document.getElementById("kpiTotal").textContent = resumo.total;
  document.getElementById("kpiTenho").textContent = resumo.tenho;
  document.getElementById("kpiEncomendado").textContent = resumo.encomendado;
  document.getElementById("kpiQuero").textContent = resumo.quero;
}

async function carregarDados() {
  try {
    // cache-busting: evita que o navegador/CDN do GitHub Pages sirva uma versão antiga do JSON
    const resp = await fetch("data.json?v=" + Date.now());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const dados = await resp.json();
    window.__dados = dados;

    document.getElementById("atualizadoEm").textContent = dados.atualizado_em;
    renderKpis(dados.resumo);
    renderGrid("grid-tenho", dados.itens, "tenho");
    renderGrid("grid-encomendado", dados.itens, "encomendado");
    renderGrid("grid-quero", dados.itens, "quero");

    // Gráficos ficam num try separado: se o Chart.js não carregar (bloqueio de CDN,
    // adblocker, etc.), a coleção continua visível mesmo sem os gráficos.
    try {
      renderCharts(dados);
    } catch (chartErr) {
      console.error("Falha ao renderizar gráficos:", chartErr);
    }
  } catch (err) {
    console.error("Falha ao carregar data.json:", err);
    document.getElementById("fetchError").style.display = "block";
  }
}

initTabs();
initDarkMode();
carregarDados();
