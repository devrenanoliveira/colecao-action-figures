// Modo admin: só quem cola um token do GitHub com permissão de escrita neste repositório consegue
// marcar/desmarcar "À venda". Visitantes veem o site normal. O token fica só no navegador do dono.
(function () {
  const REPO = "devrenanoliveira/colecao-action-figures";
  const ARQUIVO = "data/colecao.csv";
  const API = `https://api.github.com/repos/${REPO}/contents/${ARQUIVO}`;
  const KEY = "colecaoAdminToken";
  const lerToken = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  let token = lerToken();
  let fila = Promise.resolve();
  let dados = null; // data.json, para conferir o link do MFC antes de gravar

  const hdr = () => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" });
  const b64dec = (b) => new TextDecoder("utf-8").decode(Uint8Array.from(atob(b.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

  async function gravarVenda(id, vender) {
    const r = await fetch(API + "?ref=main&t=" + Date.now(), { headers: hdr() });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 || r.status === 404 ? "Token sem permissão neste repositório." : "Erro " + r.status);
    const arq = await r.json();
    const linhas = b64dec(arq.content).split("\n");
    const cab = linhas[0].replace("\r", "").split(";").map((c) => c.trim().toLowerCase().replace(/[ _]/g, ""));
    const col = cab.findIndex((c) => ["interessenavenda", "interessevenda", "venda", "avenda"].includes(c));
    if (col < 0) throw new Error("Coluna de venda não encontrada no CSV.");
    const idx = id; // id do data.json = nº da linha de dados (1ª linha após o cabeçalho = 1)
    const item = dados.itens.find((i) => i.id === id);
    const campos = (linhas[idx] || "").split(";");
    // Confere se a linha ainda é o mesmo item (o CSV pode ter mudado desde que a página carregou).
    if (!item || !item.link_mfc || !(linhas[idx] || "").includes(item.link_mfc)) throw new Error("O CSV mudou; recarregue a página.");
    campos[col] = vender ? "Sim" : "Não";
    linhas[idx] = campos.join(";");
    const p = await fetch(API, {
      method: "PUT",
      headers: { ...hdr(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${vender ? "Marca à venda" : "Tira da venda"}: ${item.nome}`,
        content: b64enc(linhas.join("\n")),
        sha: arq.sha,
        branch: "main",
      }),
    });
    if (!p.ok) throw new Error("Não consegui salvar (" + p.status + ").");
  }

  function aviso(txt, erro) {
    let el = document.getElementById("adminToast");
    if (!el) { el = document.createElement("div"); el.id = "adminToast"; document.body.appendChild(el); }
    el.textContent = txt; el.className = erro ? "erro" : ""; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), erro ? 6000 : 3500);
  }

  // Estado real (CSV no GitHub) por id; o data.json público pode estar minutos atrás do último commit.
  let vendaCsv = {};
  function lerEstado(arq) {
    const linhas = b64dec(arq.content).split("\n");
    const cab = linhas[0].replace("\r", "").split(";").map((c) => c.trim().toLowerCase().replace(/[ _]/g, ""));
    const col = cab.findIndex((c) => ["interessenavenda", "interessevenda", "venda", "avenda"].includes(c));
    vendaCsv = {};
    if (col >= 0) linhas.slice(1).forEach((l, i) => { if (l.trim()) vendaCsv[i + 1] = /^(sim|s|yes|true|1)$/i.test((l.split(";")[col] || "").trim()); });
  }

  function marcarCards(root) {
    root.querySelectorAll(".figure-card:not([data-admin])").forEach((card) => {
      card.dataset.admin = "1";
      const real = vendaCsv[Number(card.dataset.id)];
      if (real !== undefined) {
        const wrap = card.querySelector(".figure-thumb-wrap");
        const tem = !!card.querySelector(".figure-venda-flag");
        if (real && !tem) wrap.insertAdjacentHTML("afterbegin", '<div class="figure-venda-flag">À venda</div>');
        if (!real && tem) card.querySelector(".figure-venda-flag").remove();
      }
      const b = document.createElement("button");
      b.type = "button"; b.className = "admin-venda-btn";
      b.textContent = card.querySelector(".figure-venda-flag") ? "Tirar da venda" : "Marcar à venda";
      card.querySelector(".figure-body")?.appendChild(b);
    });
  }

  function ligarAdmin() {
    document.body.classList.add("admin-on");
    document.querySelectorAll(".figure-grid").forEach((g) => {
      marcarCards(g);
      new MutationObserver(() => marcarCards(g)).observe(g, { childList: true });
    });
    document.addEventListener("click", (ev) => {
      const b = ev.target.closest(".admin-venda-btn");
      if (!b) return;
      const card = b.closest(".figure-card");
      const id = Number(card.dataset.id);
      const vender = !card.querySelector(".figure-venda-flag");
      b.disabled = true; b.textContent = "Salvando…";
      fila = fila.then(() => gravarVenda(id, vender)).then(() => {
        const wrap = card.querySelector(".figure-thumb-wrap");
        card.querySelector(".figure-venda-flag")?.remove();
        if (vender) wrap.insertAdjacentHTML("afterbegin", '<div class="figure-venda-flag">À venda</div>');
        b.textContent = vender ? "Tirar da venda" : "Marcar à venda";
        aviso("Salvo! O site público atualiza em 1–2 minutos.");
      }).catch((e) => {
        b.textContent = vender ? "Marcar à venda" : "Tirar da venda";
        aviso(e.message, true);
      }).finally(() => (b.disabled = false));
    });
  }

  const btn = document.createElement("button");
  btn.className = "header-icon-btn"; btn.id = "adminBtn";
  document.querySelector(".header-right")?.appendChild(btn);

  function atualizarBtn() {
    btn.textContent = token ? "🔓 Admin (sair)" : "🔒 Admin";
    btn.title = token ? "Sair do modo admin" : "Entrar no modo admin (só o dono)";
  }
  atualizarBtn();

  btn.addEventListener("click", () => {
    if (token) { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); return; }
    const t = prompt("Modo admin (só o dono do site).\nCole o token do GitHub com permissão de escrita em 'Contents' neste repositório:");
    if (!t) return;
    try { localStorage.setItem(KEY, t.trim()); } catch (e) { return aviso("Navegador bloqueou o armazenamento.", true); }
    location.reload();
  });

  if (token) {
    fetch("data.json?t=" + Date.now()).then((r) => r.json()).then((d) => { dados = d; })
      .then(() => fetch(API + "?ref=main&t=" + Date.now(), { headers: hdr() }))
      .then(async (r) => {
        if (!r.ok) { try { localStorage.removeItem(KEY); } catch (e) {} token = null; atualizarBtn(); return aviso("Token inválido ou sem permissão — saí do modo admin.", true); }
        lerEstado(await r.json());
        ligarAdmin();
      });
  }
})();
