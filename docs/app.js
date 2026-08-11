// Dashboard da coleção de action figures.
// Toda a informação vem de data.json (gerado por scripts/atualizar_dashboard.py
// a partir de data/colecao.csv) — este arquivo só renderiza, não calcula nada.

const STATUS_LABEL = { tenho: "Tenho", encomendado: "Encomendado", quero: "Quero" };

// IDs dos itens selecionados pra exportação em PDF — persiste entre trocas de aba/filtro.
const selecionados = new Set();

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

  const obs = item.observacao
    ? `<div class="figure-meta-row"><span class="figure-meta-label">Obs.:</span> ${escapeHtml(item.observacao)}</div>`
    : "";

  // Lista de campos com rótulo — só entra na lista quem tiver valor preenchido.
  const camposMeta = [
    ["Franquia", item.franquia],
    ["Linha", item.linha_produto],
    ["Categoria", item.categoria],
    ["Lançamento", item.lancamento],
  ]
    .filter(([, valor]) => Boolean(valor))
    .map(([label, valor]) => `<div class="figure-meta-row"><span class="figure-meta-label">${label}:</span> ${escapeHtml(valor)}</div>`)
    .join("");

  const vendaFlag = item.interesse_venda ? `<div class="figure-venda-flag">À venda</div>` : "";
  const marcado = selecionados.has(item.id) ? "checked" : "";

  return `
    <div class="figure-card ${selecionados.has(item.id) ? "selecionado" : ""}" data-id="${item.id}">
      <div class="figure-thumb-wrap">
        <label class="figure-select-overlay" title="Selecionar para o PDF">
          <input type="checkbox" class="figure-select-checkbox" data-id="${item.id}" ${marcado}>
        </label>
        ${vendaFlag}
        ${imagem}
      </div>
      <div class="figure-body">
        <span class="figure-status-badge ${item.status}">${STATUS_LABEL[item.status] || item.status}</span>
        <div class="figure-nome">${escapeHtml(item.nome)}</div>
        <div class="figure-meta-list">
          ${camposMeta}
          ${obs}
        </div>
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

function renderCards(elId, itensFiltrados, mensagemVazio) {
  const el = document.getElementById(elId);
  if (itensFiltrados.length === 0) {
    el.innerHTML = `<div class="empty-state">${mensagemVazio}</div>`;
    return;
  }
  el.innerHTML = itensFiltrados.map(figureCardHTML).join("");
}

// Extrai o ano (4 dígitos) de um texto livre de lançamento, ex: "2026-04" → "2026".
function extrairAno(lancamento) {
  if (!lancamento) return null;
  const texto = String(lancamento);
  const anoCompleto = texto.match(/\d{4}/);
  if (anoCompleto) return anoCompleto[0];
  // Formatos como "abr/26" ou "26" (só 2 dígitos) — assume 20xx.
  const anoCurto = texto.match(/\b(\d{2})\b/);
  return anoCurto ? `20${anoCurto[1]}` : null;
}

function valoresUnicos(itensDoStatus, extractor) {
  const set = new Set();
  itensDoStatus.forEach((item) => {
    const v = extractor(item);
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

/**
 * Monta a barra de filtros (Franquia/Linha/Categoria/Ano) de uma aba e liga
 * os eventos que refiltram o grid correspondente sempre que um select muda.
 */
function initFiltros(status, itens) {
  const itensDoStatus = itens.filter((i) => i.status === status);
  const containerId = `filtros-${status}`;
  const container = document.getElementById(containerId);
  if (!container) return;

  const franquias = valoresUnicos(itensDoStatus, (i) => i.franquia);
  const linhas = valoresUnicos(itensDoStatus, (i) => i.linha_produto);
  const categorias = valoresUnicos(itensDoStatus, (i) => i.categoria);
  const anos = valoresUnicos(itensDoStatus, (i) => extrairAno(i.lancamento)).sort().reverse();

  // Só esconde a barra se a aba estiver vazia — com 1+ item, filtrar já faz sentido
  // (o próprio dono vai cadastrando mais itens e os filtros passam a valer mais).
  if (itensDoStatus.length === 0) {
    container.innerHTML = "";
    renderCards(`grid-${status}`, itensDoStatus, "Nenhum item nesta categoria ainda.");
    return;
  }

  const campo = (id, label, opcoes) => `
    <div class="filtro-grupo">
      <label class="filtro-label" for="${id}">${label}</label>
      <select id="${id}" class="filtro-select">
        <option value="">Todas</option>
        ${opcoes.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
      </select>
    </div>`;

  container.innerHTML = `
    <div class="figure-filters">
      ${campo(`f-franquia-${status}`, "Franquia", franquias)}
      ${campo(`f-linha-${status}`, "Linha", linhas)}
      ${campo(`f-categoria-${status}`, "Categoria", categorias)}
      ${campo(`f-ano-${status}`, "Ano", anos)}
      <button type="button" class="filtro-limpar" id="f-limpar-${status}">Limpar filtros</button>
    </div>`;

  const aplicar = () => {
    const vFranquia = document.getElementById(`f-franquia-${status}`).value;
    const vLinha = document.getElementById(`f-linha-${status}`).value;
    const vCategoria = document.getElementById(`f-categoria-${status}`).value;
    const vAno = document.getElementById(`f-ano-${status}`).value;

    const filtrados = itensDoStatus.filter((item) => {
      if (vFranquia && item.franquia !== vFranquia) return false;
      if (vLinha && item.linha_produto !== vLinha) return false;
      if (vCategoria && item.categoria !== vCategoria) return false;
      if (vAno && extrairAno(item.lancamento) !== vAno) return false;
      return true;
    });

    renderCards(`grid-${status}`, filtrados, "Nenhum item encontrado com esses filtros.");
  };

  ["franquia", "linha", "categoria", "ano"].forEach((campoId) => {
    document.getElementById(`f-${campoId}-${status}`).addEventListener("change", aplicar);
  });
  document.getElementById(`f-limpar-${status}`).addEventListener("click", () => {
    ["franquia", "linha", "categoria", "ano"].forEach((campoId) => {
      document.getElementById(`f-${campoId}-${status}`).value = "";
    });
    aplicar();
  });

  aplicar();
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

// ── SELEÇÃO DE ITENS + PDF ──────────────────────────────────────────

function initSelecao() {
  // Delegação de evento: um listener só, funciona mesmo depois dos grids
  // serem re-renderizados pelos filtros (os checkboxes são recriados toda hora).
  document.addEventListener("change", (ev) => {
    if (!ev.target.classList.contains("figure-select-checkbox")) return;
    const id = Number(ev.target.dataset.id);
    if (ev.target.checked) {
      selecionados.add(id);
      ev.target.closest(".figure-card")?.classList.add("selecionado");
    } else {
      selecionados.delete(id);
      ev.target.closest(".figure-card")?.classList.remove("selecionado");
    }
    atualizarBarraSelecao();
  });

  document.getElementById("btnLimparSelecao").addEventListener("click", () => {
    selecionados.clear();
    document.querySelectorAll(".figure-select-checkbox").forEach((cb) => (cb.checked = false));
    document.querySelectorAll(".figure-card.selecionado").forEach((c) => c.classList.remove("selecionado"));
    atualizarBarraSelecao();
  });

  document.getElementById("btnGerarPdf").addEventListener("click", gerarPdfSelecionados);
}

function atualizarBarraSelecao() {
  const bar = document.getElementById("selecaoBar");
  const count = selecionados.size;
  document.getElementById("selecaoCount").textContent =
    count === 1 ? "1 selecionada" : `${count} selecionadas`;
  bar.hidden = count === 0;
}

// Pega até 2 iniciais do nome da figure (ex: "Goku Black" → "GB") pro avatar
// que aparece no PDF quando não tem imagem disponível.
function obterIniciais(nome) {
  if (!nome) return "?";
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  const letras = palavras.slice(0, 2).map((p) => p[0].toUpperCase());
  return letras.join("") || "?";
}

// Busca uma imagem por URL e converte pra data URL (base64) pro jsPDF conseguir
// embutir no PDF. Se a imagem falhar (CORS, link quebrado, offline, demorar
// demais), resolve com null em vez de travar a geração do PDF inteiro.
function blobParaDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(blob);
  });
}

function comTimeout(promessa, timeoutMs) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([promessa, timeout]);
}

// Busca uma imagem por URL e converte pra data URL (base64) pro jsPDF conseguir
// embutir no PDF. Tenta primeiro direto na fonte; se o servidor de origem não liberar
// CORS (comum em CDNs de hotlink, como o do MyFigureCollection), tenta de novo através
// de um proxy de imagens público (wsrv.nl) que reencaminha com os cabeçalhos de CORS
// certos. Se nada funcionar, resolve com null em vez de travar o PDF inteiro.
async function imagemParaDataUrl(url, timeoutMs = 7000) {
  if (!url) return null;

  const tentarDireto = fetch(url, { mode: "cors" })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("HTTP " + r.status))))
    .then(blobParaDataUrl)
    .catch(() => null);

  const direto = await comTimeout(tentarDireto, timeoutMs);
  if (direto) return direto;

  // Importante: o wsrv.nl espera a URL de origem SEM o protocolo (ele mesmo assume https)
  // e com as barras "/" intactas — usar encodeURIComponent aqui (que também converte "/"
  // em "%2F") faz o serviço não conseguir separar domínio de caminho e a busca falha.
  const semProtocolo = url.replace(/^https?:\/\//i, "");
  const urlProxy = `https://wsrv.nl/?url=${encodeURI(semProtocolo)}&output=jpg`;
  const tentarProxy = fetch(urlProxy, { mode: "cors" })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("HTTP " + r.status))))
    .then(blobParaDataUrl)
    .catch(() => null);

  return comTimeout(tentarProxy, timeoutMs);
}

async function gerarPdfSelecionados() {
  const btn = document.getElementById("btnGerarPdf");
  const itens = (window.__dados?.itens || []).filter((i) => selecionados.has(i.id));
  if (itens.length === 0) return;

  if (!window.jspdf) {
    alert("Não foi possível carregar a biblioteca de PDF (jsPDF). Verifique sua conexão e tente de novo.");
    return;
  }

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Gerando PDF...";

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margem = 15;
    const larguraUtil = 210 - margem * 2;
    let y = 20;

    // Paleta do tema "Clássico Goku" do dashboard, em RGB (0-255) — é o que o jsPDF espera.
    const COR_AZUL = [30, 90, 168]; // var(--brand-navy)
    const COR_LARANJA = [255, 107, 0]; // var(--brand-gold)
    const COR_VERDE = [12, 163, 12]; // status "tenho"
    const COR_AMBAR = [217, 119, 6]; // status "encomendado"
    const COR_CINZA = [110, 110, 110];
    const COR_LINHA = [255, 217, 168]; // divisórias em laranja claro

    doc.setTextColor(...COR_AZUL);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("Minha Coleção de Action Figures — Seleção", margem, y);
    doc.setFont(undefined, "normal");
    y += 3;
    doc.setDrawColor(...COR_LARANJA);
    doc.setLineWidth(0.8);
    doc.line(margem, y, margem + larguraUtil, y);
    doc.setLineWidth(0.2);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(...COR_CINZA);
    doc.text(`${itens.length} item(ns) selecionado(s) — gerado em ${new Date().toLocaleDateString("pt-BR")}`, margem, y);
    doc.setTextColor(0);
    y += 10;

    const larguraImg = 30;
    const alturaImg = 38;
    const xTexto = margem + larguraImg + 6;
    const larguraTexto = larguraUtil - larguraImg - 6;

    for (const item of itens) {
      const linhasInfo = [
        ["Status", STATUS_LABEL[item.status] || item.status],
        ["Franquia", item.franquia],
        ["Linha", item.linha_produto],
        ["Categoria", item.categoria],
        ["Lançamento", item.lancamento],
        ["À venda", item.interesse_venda ? "Sim" : "Não"],
        ["Observação", item.observacao],
        ["Link MFC", item.link_mfc],
      ].filter(([, v]) => Boolean(v));

      // Pré-calcula quantas linhas cada campo vai ocupar (com quebra de texto) ANTES de
      // desenhar, pra saber a altura real do bloco — é isso que evita um item comprido
      // (observação ou link grandes) invadir o espaço do próximo.
      doc.setFontSize(9);
      const linhasCalculadas = linhasInfo.map(([label, valor]) => {
        const texto = doc.splitTextToSize(`${label}: ${valor}`, larguraTexto);
        // avanco = quanto o cursor Y desce pra desenhar este campo: 5mm de espaçamento
        // antes da primeira linha + 4mm pra cada linha extra que o texto quebrou.
        const avanco = 5 + (texto.length - 1) * 4;
        return { label, valor, texto, avanco };
      });
      // 5mm da linha do nome + o avanço de cada campo + margem de segurança antes da
      // linha divisória, pra ela nunca ficar colada (ou sobrepor) o último texto.
      const alturaTextoTotal = 5 + linhasCalculadas.reduce((soma, l) => soma + l.avanco, 0) + 6;
      const alturaBloco = Math.max(alturaImg + 8, alturaTextoTotal);

      if (y + alturaBloco > 282) {
        doc.addPage();
        y = 20;
      }

      const dataUrl = await imagemParaDataUrl(item.imagem_url);

      if (dataUrl) {
        try {
          // Detecta o formato real (JPEG/PNG/WEBP) a partir do prefixo "data:image/...";
          // passar o formato errado pro jsPDF pode fazer a imagem não aparecer.
          const mime = /^data:image\/(\w+);/.exec(dataUrl)?.[1]?.toUpperCase() || "JPEG";
          const formato = mime === "JPG" ? "JPEG" : mime;
          doc.addImage(dataUrl, formato, margem, y, larguraImg, alturaImg, undefined, "FAST");
          doc.setDrawColor(...COR_LINHA);
          doc.rect(margem, y, larguraImg, alturaImg);
        } catch (e) {
          doc.setDrawColor(...COR_LINHA);
          doc.rect(margem, y, larguraImg, alturaImg);
        }
      } else {
        // Sem imagem disponível (bloqueio de CORS no link de origem) — em vez de deixar o
        // espaço em branco/"Sem imagem", desenha um avatar circular com as iniciais do
        // nome da figure, no estilo das cores do dashboard, alternando azul/laranja.
        doc.setFillColor(255, 248, 238); // fundo creme claro (--surface)
        doc.setDrawColor(...COR_LINHA);
        doc.roundedRect(margem, y, larguraImg, alturaImg, 2, 2, "FD");

        const corAvatar = item.id % 2 === 0 ? COR_AZUL : COR_LARANJA;
        const cx = margem + larguraImg / 2;
        const cy = y + alturaImg / 2;
        const raio = Math.min(larguraImg, alturaImg) / 2 - 4;
        doc.setFillColor(...corAvatar);
        doc.circle(cx, cy, raio, "F");

        const iniciais = obterIniciais(item.nome);
        doc.setFont(undefined, "bold");
        doc.setFontSize(iniciais.length > 1 ? 13 : 16);
        doc.setTextColor(255, 255, 255);
        doc.text(iniciais, cx, cy, { align: "center", baseline: "middle" });
        doc.setFont(undefined, "normal");
        doc.setTextColor(0);
      }

      let yTexto = y + 5;
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.setTextColor(...COR_AZUL);
      doc.text(item.nome, xTexto, yTexto);
      doc.setFont(undefined, "normal");
      doc.setFontSize(9);
      doc.setTextColor(0);

      linhasCalculadas.forEach(({ label, valor, texto, avanco }) => {
        yTexto += 5;
        // Destaca campos específicos com a cor correspondente do dashboard, em vez de
        // deixar tudo preto — status por cor semântica, "À venda" em laranja quando Sim.
        if (label === "Status") {
          const cor = item.status === "tenho" ? COR_VERDE : item.status === "encomendado" ? COR_AMBAR : COR_AZUL;
          doc.setFont(undefined, "bold");
          doc.setTextColor(...cor);
        } else if (label === "À venda" && valor === "Sim") {
          doc.setFont(undefined, "bold");
          doc.setTextColor(...COR_LARANJA);
        }
        doc.text(texto, xTexto, yTexto);
        doc.setFont(undefined, "normal");
        doc.setTextColor(0);
        yTexto += avanco - 5;
      });

      y += alturaBloco;
      doc.setDrawColor(...COR_LINHA);
      doc.setLineWidth(0.4);
      doc.line(margem, y - 4, margem + larguraUtil, y - 4);
      doc.setLineWidth(0.2);
    }

    doc.save("colecao-selecionada.pdf");
  } catch (err) {
    console.error("Falha ao gerar PDF:", err);
    alert("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// ── VISUALIZAÇÃO COMPACTA ────────────────────────────────────────────

function initCompactToggle() {
  const btn = document.getElementById("compactBtn");
  try {
    if (localStorage.getItem("colecaoFiguresCompactView") === "true") {
      document.body.classList.add("compact-view");
      btn.classList.add("active");
    }
  } catch (e) {}

  btn.addEventListener("click", () => {
    const ativo = document.body.classList.toggle("compact-view");
    btn.classList.toggle("active", ativo);
    try {
      localStorage.setItem("colecaoFiguresCompactView", ativo);
    } catch (e) {}
  });
}

function renderKpis(resumo) {
  document.getElementById("kpiTotal").textContent = resumo.total;
  document.getElementById("kpiTenho").textContent = resumo.tenho;
  document.getElementById("kpiEncomendado").textContent = resumo.encomendado;
  document.getElementById("kpiQuero").textContent = resumo.quero;
  document.getElementById("kpiVenda").textContent = resumo.a_venda ?? 0;
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
    initFiltros("tenho", dados.itens);
    initFiltros("encomendado", dados.itens);
    initFiltros("quero", dados.itens);

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
initSelecao();
initCompactToggle();
carregarDados();
