// Efeitos visuais: esferas do dragão no header, entrada escalonada dos cards e contagem animada dos KPIs.
(function () {
  const logo = document.querySelector(".header-left");
  if (logo) {
    const b = document.createElement("div");
    b.className = "balls";
    b.setAttribute("aria-hidden", "true");
    for (let n = 1; n <= 7; n++) b.insertAdjacentHTML("beforeend", `<div class="ball">${"★".repeat(n)}</div>`);
    logo.insertBefore(b, logo.children[1]);
  }

  // Cards são re-renderizados a cada filtro: numera cada um para o atraso escalonado do CSS.
  const numerar = (grid) => grid.querySelectorAll(".figure-card").forEach((c, i) => c.style.setProperty("--i", i));
  document.querySelectorAll(".figure-grid").forEach((g) => {
    new MutationObserver(() => numerar(g)).observe(g, { childList: true });
    numerar(g);
  });

  // KPIs: sobe de 0 até o valor quando o app.js escreve o número.
  document.querySelectorAll(".kpi-value").forEach((el) => {
    new MutationObserver(() => {
      const alvo = parseInt(el.textContent, 10);
      if (el.dataset.busy || Number.isNaN(alvo) || el.dataset.anim === String(alvo)) return;
      el.dataset.anim = alvo;
      el.dataset.busy = "1";
      const t0 = performance.now();
      const passo = (t) => {
        const p = Math.min((t - t0) / 900, 1);
        el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(passo);
        else setTimeout(() => delete el.dataset.busy, 0);
      };
      requestAnimationFrame(passo);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
