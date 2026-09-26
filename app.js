(function () {
  "use strict";

  var ESTRUTURA = window.ESTRUTURA || [];
  var PROMPTS = window.PROMPTS || [];

  // Mapa capítulo -> dados do capítulo (com parte associada)
  var capitulosPorNumero = {};
  ESTRUTURA.forEach(function (grupo) {
    grupo.capitulos.forEach(function (cap) {
      capitulosPorNumero[cap.numero] = { numero: cap.numero, titulo: cap.titulo, parte: grupo.parte, parteTitulo: grupo.titulo };
    });
  });

  // ===== Utilidades =====

  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function escapeHtml(texto) {
    return String(texto || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Destaca [VARIAVEIS EM CAIXA ALTA] e, opcionalmente, um termo de busca.
  // Recebe texto já em HTML-safe (escapado) como entrada crua (texto puro).
  function formatarTextoPrompt(textoCru, termoBusca) {
    var seguro = escapeHtml(textoCru);
    seguro = seguro.replace(/\[([A-ZÀ-Ú0-9 ÇÃÕÂÊÔ_-]{2,})\]/g, function (m, dentro) {
      return '<span class="variavel" title="Substitua pelo seu conteúdo">[' + dentro + ']</span>';
    });
    if (termoBusca) {
      seguro = destacarTermo(seguro, termoBusca);
    }
    return seguro;
  }

  function formatarTextoSimples(textoCru, termoBusca) {
    var seguro = escapeHtml(textoCru);
    if (termoBusca) {
      seguro = destacarTermo(seguro, termoBusca);
    }
    return seguro;
  }

  // Destaca ocorrências (insensível a acento/caixa) de termoBusca dentro de um HTML já escapado,
  // evitando quebrar tags já inseridas (ex.: <span class="variavel">).
  function destacarTermo(html, termoBusca) {
    var termo = termoBusca.trim();
    if (!termo) return html;
    var termoNorm = normalizar(termo);
    if (!termoNorm) return html;

    // Percorre o HTML fora de tags, comparando por versão normalizada.
    var resultado = "";
    var i = 0;
    while (i < html.length) {
      if (html[i] === "<") {
        var fim = html.indexOf(">", i);
        if (fim === -1) { resultado += html.slice(i); break; }
        resultado += html.slice(i, fim + 1);
        i = fim + 1;
        continue;
      }
      var proxTag = html.indexOf("<", i);
      var trecho = proxTag === -1 ? html.slice(i) : html.slice(i, proxTag);
      resultado += destacarEmTexto(trecho, termoNorm);
      i = proxTag === -1 ? html.length : proxTag;
    }
    return resultado;
  }

  function destacarEmTexto(trecho, termoNorm) {
    var trechoNorm = normalizar(trecho);
    var out = "";
    var pos = 0;
    var idx;
    while ((idx = trechoNorm.indexOf(termoNorm, pos)) !== -1) {
      out += trecho.slice(pos, idx);
      out += "<mark>" + trecho.slice(idx, idx + termoNorm.length) + "</mark>";
      pos = idx + termoNorm.length;
    }
    out += trecho.slice(pos);
    return out;
  }

  function debounce(fn, atraso) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, atraso);
    };
  }

  function anunciar(mensagem) {
    var regiao = document.getElementById("anuncio-global");
    if (!regiao) return;
    regiao.textContent = "";
    window.setTimeout(function () { regiao.textContent = mensagem; }, 30);
  }

  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var viaClipboardApi = navigator.clipboard.writeText(texto);
      var expirou = new Promise(function (resolve) { setTimeout(resolve, 800, "expirou"); });
      return Promise.race([viaClipboardApi.then(function () { return "ok"; }), expirou])
        .then(function (resultado) {
          if (resultado !== "ok") return copiarComFallback(texto);
        })
        .catch(function () { return copiarComFallback(texto); });
    }
    return copiarComFallback(texto);
  }

  function copiarComFallback(texto) {
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement("textarea");
        area.value = texto;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        resolve();
      } catch (erro) {
        reject(erro);
      }
    });
  }

  // ===== Interpretação da busca =====
  // Reconhece "fig 12", "figura 12", "12", "cap 8", "capítulo 8" além de busca livre.
  function interpretarBusca(termo) {
    var norm = normalizar(termo).trim();
    var resultado = { termoLivre: termo.trim(), figura: null, capitulo: null };

    var mFigura = norm.match(/^(?:fig\.?|figura)\s*(\d+)$/);
    if (mFigura) { resultado.figura = parseInt(mFigura[1], 10); return resultado; }

    var mSoNumero = norm.match(/^(\d+)$/);
    if (mSoNumero) { resultado.figura = parseInt(mSoNumero[1], 10); return resultado; }

    var mCap = norm.match(/^(?:cap\.?|capitulo)\s*(\d+)$/);
    if (mCap) { resultado.capitulo = parseInt(mCap[1], 10); return resultado; }

    return resultado;
  }

  function itemCorresponde(item, termoOriginal) {
    if (!termoOriginal) return true;
    var interpretado = interpretarBusca(termoOriginal);

    if (interpretado.figura !== null) {
      return item.figura === interpretado.figura;
    }
    if (interpretado.capitulo !== null) {
      return item.capitulo === interpretado.capitulo;
    }

    var termoNorm = normalizar(termoOriginal);
    var cap = capitulosPorNumero[item.capitulo] || {};
    var campos = [
      item.titulo,
      item.prompt,
      (item.tecnicas || []).join(" "),
      String(item.figura),
      "figura " + item.figura,
      cap.titulo,
      "capitulo " + cap.numero,
      "cap " + cap.numero
    ];
    return campos.some(function (campo) { return normalizar(campo).indexOf(termoNorm) !== -1; });
  }

  // ===== Estado =====
  var estado = {
    termo: "",
    compacto: false,
    expandidos: {}, // id -> true (prompt truncado "mostrar tudo")
    linhaExpandida: {} // id -> true (modo compacto expandido)
  };

  // ===== Construção do sumário (desktop + painel) =====

  function construirSumario(containerId, resultadosPorCapitulo) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    ESTRUTURA.forEach(function (grupo) {
      var tituloParte = document.createElement("p");
      tituloParte.className = "sumario__parte";
      tituloParte.textContent = grupo.parte + " · " + grupo.titulo;
      container.appendChild(tituloParte);

      grupo.capitulos.forEach(function (cap) {
        var total = PROMPTS.filter(function (p) { return p.capitulo === cap.numero; }).length;
        var visiveis = resultadosPorCapitulo ? (resultadosPorCapitulo[cap.numero] || 0) : total;

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sumario__item";
        btn.id = "sumario-link-" + containerId + "-cap" + cap.numero;
        btn.dataset.cap = cap.numero;

        var contagemTexto = estado.termo ? (visiveis + " de " + total) : String(total);
        btn.innerHTML =
          '<span class="sumario__num">Cap. ' + cap.numero + '</span>' +
          escapeHtml(cap.titulo) +
          ' <span class="sumario__contagem">(' + contagemTexto + ')</span>';

        if (estado.termo && visiveis === 0) {
          btn.classList.add("sem-resultado");
          btn.disabled = true;
        }

        btn.addEventListener("click", function () {
          var alvo = document.getElementById("cap-" + cap.numero);
          if (alvo) {
            alvo.scrollIntoView({ behavior: prefereReduzirMovimento() ? "auto" : "smooth", block: "start" });
            alvo.setAttribute("tabindex", "-1");
            alvo.focus({ preventScroll: true });
          }
          fecharPainel();
        });

        container.appendChild(btn);
      });
    });
  }

  function prefereReduzirMovimento() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ===== Renderização da lista principal =====

  function renderizarLista() {
    var listaEl = document.getElementById("lista-capitulos");
    var estadoVazio = document.getElementById("estado-vazio");
    var estadoVazioTermo = document.getElementById("estado-vazio-termo");
    listaEl.innerHTML = "";

    var termo = estado.termo;
    var totalVisiveis = 0;
    var resultadosPorCapitulo = {};

    ESTRUTURA.forEach(function (grupo) {
      grupo.capitulos.forEach(function (cap) {
        var itensDoCap = PROMPTS.filter(function (p) { return p.capitulo === cap.numero; });
        var encontrados = itensDoCap.filter(function (item) { return itemCorresponde(item, termo); });
        resultadosPorCapitulo[cap.numero] = encontrados.length;
        totalVisiveis += encontrados.length;

        if (termo && encontrados.length === 0) return;

        var secao = document.createElement("section");
        secao.className = "secao-capitulo";
        secao.id = "cap-" + cap.numero;

        var sobretitulo = document.createElement("p");
        sobretitulo.className = "secao-capitulo__sobretitulo";
        sobretitulo.textContent = grupo.parte.toUpperCase() + " · CAPÍTULO " + cap.numero;
        secao.appendChild(sobretitulo);

        var h2 = document.createElement("h2");
        h2.innerHTML = escapeHtml(cap.titulo) + " <small>" + encontrados.length + (encontrados.length === 1 ? " prompt" : " prompts") + "</small>";
        secao.appendChild(h2);

        var listaPrompts = document.createElement("div");
        listaPrompts.className = "lista-prompts" + (estado.compacto ? " compacto" : "");

        encontrados.forEach(function (item) {
          listaPrompts.appendChild(criarCartao(item, termo));
        });

        secao.appendChild(listaPrompts);
        listaEl.appendChild(secao);
      });
    });

    var contador = document.getElementById("contador");
    var totalGeral = PROMPTS.length;
    contador.textContent = termo
      ? (totalVisiveis + " de " + totalGeral + " prompts")
      : (totalGeral + " prompts");

    if (termo && totalVisiveis === 0) {
      estadoVazio.hidden = false;
      estadoVazioTermo.textContent = 'Nenhum prompt encontrado para "' + termo + '".';
    } else {
      estadoVazio.hidden = true;
    }

    construirSumario("sumario-desktop", resultadosPorCapitulo);
    construirSumario("sumario-painel", resultadosPorCapitulo);
    ativarScrollSpy();
  }

  function criarCartao(item, termo) {
    var cap = capitulosPorNumero[item.capitulo] || {};
    var art = document.createElement("article");
    art.className = "cartao";
    art.id = item.id;
    art.setAttribute("tabindex", "-1");

    var linhasPrompt = (item.prompt.match(/\n/g) || []).length + 1;
    var tituloHtml = formatarTextoSimples(item.titulo, termo);
    var promptHtml = formatarTextoPrompt(item.prompt, termo);

    var cabecalho = document.createElement("div");
    cabecalho.className = "cartao__cabecalho";
    cabecalho.innerHTML =
      '<span class="selo-figura">' + (item.figura ? "Figura " + item.figura : "Sem número de figura") + '</span>' +
      '<h3>' + tituloHtml + '</h3>' +
      (item.tecnicas && item.tecnicas.length
        ? '<ul class="tecnicas">' + item.tecnicas.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>"
        : "");
    art.appendChild(cabecalho);

    var corpo = document.createElement("div");
    corpo.className = "cartao__corpo";

    var truncar = linhasPrompt > 8 && !estado.expandidos[item.id];
    var blocoPrompt = document.createElement("div");
    blocoPrompt.className = "bloco-prompt";
    blocoPrompt.innerHTML =
      '<p class="rotulo">Prompt</p>' +
      '<div class="prompt-caixa' + (truncar ? " truncado" : "") + '"><pre class="prompt-texto">' + promptHtml + "</pre></div>";
    corpo.appendChild(blocoPrompt);

    if (linhasPrompt > 8) {
      var botaoExpandir = document.createElement("button");
      botaoExpandir.type = "button";
      botaoExpandir.className = "botao-expandir";
      var estaExpandido = !!estado.expandidos[item.id];
      botaoExpandir.textContent = estaExpandido ? "Mostrar menos" : "Mostrar tudo";
      botaoExpandir.setAttribute("aria-expanded", String(estaExpandido));
      botaoExpandir.addEventListener("click", function () {
        estado.expandidos[item.id] = !estado.expandidos[item.id];
        renderizarLista();
      });
      blocoPrompt.appendChild(botaoExpandir);
    }

    var acoes = document.createElement("div");
    acoes.className = "acoes";

    var botaoCopiar = document.createElement("button");
    botaoCopiar.type = "button";
    botaoCopiar.className = "botao-primario";
    botaoCopiar.textContent = "Copiar prompt";
    botaoCopiar.addEventListener("click", function () {
      copiarTexto(item.prompt).then(function () {
        var textoOriginal = "Copiar prompt";
        botaoCopiar.textContent = "Copiado ✓";
        botaoCopiar.classList.add("copiado");
        anunciar("Prompt da Figura " + (item.figura || item.id) + " copiado");
        setTimeout(function () {
          botaoCopiar.textContent = textoOriginal;
          botaoCopiar.classList.remove("copiado");
        }, 2000);
      });
    });
    acoes.appendChild(botaoCopiar);

    corpo.appendChild(acoes);

    if (item.resposta) {
      var det = document.createElement("details");
      det.className = "resposta-disclosure";
      var sum = document.createElement("summary");
      sum.textContent = "Ver resposta obtida no livro";
      det.appendChild(sum);

      var respostaCorpo = document.createElement("div");
      respostaCorpo.className = "resposta-corpo";

      var metaPartes = [];
      if (item.ferramenta) metaPartes.push("Gerada com " + item.ferramenta);
      if (item.data_geracao) metaPartes.push(item.data_geracao);
      if (metaPartes.length) {
        var meta = document.createElement("p");
        meta.className = "resposta-meta";
        meta.textContent = metaPartes.join(" · ");
        respostaCorpo.appendChild(meta);
      }

      var rotuloResp = document.createElement("p");
      rotuloResp.className = "rotulo";
      rotuloResp.textContent = "Resposta obtida no livro";
      respostaCorpo.appendChild(rotuloResp);

      var respTexto = document.createElement("p");
      respTexto.className = "resposta-texto";
      respTexto.innerHTML = formatarTextoSimples(item.resposta, termo);
      respostaCorpo.appendChild(respTexto);

      det.appendChild(respostaCorpo);
      corpo.appendChild(det);
    }

    art.appendChild(corpo);

    if (estado.compacto) {
      var linha = document.createElement("button");
      linha.type = "button";
      linha.className = "linha-compacta";
      linha.innerHTML =
        '<span class="selo-figura">' + (item.figura ? "Fig. " + item.figura : "—") + '</span>' +
        '<span class="linha-compacta__titulo">' + tituloHtml + '</span>' +
        '<span class="linha-compacta__cap">Cap. ' + item.capitulo + '</span>';
      linha.setAttribute("aria-expanded", String(!!estado.linhaExpandida[item.id]));
      linha.addEventListener("click", function () {
        estado.linhaExpandida[item.id] = !estado.linhaExpandida[item.id];
        art.classList.toggle("expandido", estado.linhaExpandida[item.id]);
        linha.setAttribute("aria-expanded", String(estado.linhaExpandida[item.id]));
      });
      art.insertBefore(linha, cabecalho);
      if (estado.linhaExpandida[item.id]) art.classList.add("expandido");
    }

    return art;
  }

  // ===== Scroll-spy do sumário =====
  var observer = null;
  function ativarScrollSpy() {
    if (observer) observer.disconnect();
    var secoes = document.querySelectorAll(".secao-capitulo");
    if (!secoes.length || !("IntersectionObserver" in window)) return;

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var capNum = entry.target.id.replace("cap-", "");
          marcarCapituloAtivo(capNum);
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px", threshold: 0 });

    secoes.forEach(function (s) { observer.observe(s); });
  }

  function marcarCapituloAtivo(capNum) {
    ["sumario-desktop", "sumario-painel"].forEach(function (containerId) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll(".sumario__item").forEach(function (btn) {
        var ativo = btn.dataset.cap === String(capNum);
        btn.setAttribute("aria-current", ativo ? "true" : "false");
      });
    });
  }

  // ===== Busca =====

  function aplicarBuscaNaUrl(termo) {
    var url = new URL(location.href);
    if (termo) url.searchParams.set("q", termo);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url.toString());
  }

  function iniciarBusca() {
    var input = document.getElementById("busca-input");
    var limparBtn = document.getElementById("busca-limpar");

    var params = new URLSearchParams(location.search);
    var termoInicial = params.get("q") || "";
    if (termoInicial) {
      input.value = termoInicial;
      estado.termo = termoInicial;
      limparBtn.hidden = false;
    }

    var atualizar = debounce(function () {
      estado.termo = input.value.trim();
      limparBtn.hidden = !estado.termo;
      aplicarBuscaNaUrl(estado.termo);
      renderizarLista();
    }, 150);

    input.addEventListener("input", atualizar);

    limparBtn.addEventListener("click", function () {
      input.value = "";
      estado.termo = "";
      limparBtn.hidden = true;
      aplicarBuscaNaUrl("");
      renderizarLista();
      input.focus();
    });

    document.getElementById("estado-vazio-limpar").addEventListener("click", function () {
      limparBtn.click();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        limparBtn.click();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "/") return;
      var alvo = e.target;
      var estaDigitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (estaDigitando) return;
      e.preventDefault();
      input.focus();
    });
  }

  // ===== Modo compacto =====
  function iniciarToggleCompacto() {
    var botao = document.getElementById("botao-compacto");
    botao.addEventListener("click", function () {
      estado.compacto = !estado.compacto;
      botao.setAttribute("aria-pressed", String(estado.compacto));
      renderizarLista();
    });
  }

  // ===== Hambúrguer do menu no desktop (recolher/mostrar sumário) =====
  function lerPreferenciaMenuOculto() {
    try { return localStorage.getItem("menuOculto") === "1"; } catch (e) { return false; }
  }
  function salvarPreferenciaMenuOculto(oculto) {
    try { localStorage.setItem("menuOculto", oculto ? "1" : "0"); } catch (e) { /* sem acesso ao storage; ignora */ }
  }

  function iniciarToggleMenuDesktop() {
    var botao = document.getElementById("botao-menu-desktop");
    var layout = document.querySelector(".layout");
    var rotulo = botao.querySelector("span");

    function aplicar(oculto) {
      layout.classList.toggle("menu-oculto", oculto);
      botao.setAttribute("aria-pressed", String(oculto));
      rotulo.textContent = oculto ? "Mostrar menu" : "Ocultar menu";
    }

    aplicar(lerPreferenciaMenuOculto());

    botao.addEventListener("click", function () {
      var oculto = !layout.classList.contains("menu-oculto");
      aplicar(oculto);
      salvarPreferenciaMenuOculto(oculto);
    });
  }

  // ===== Painel de capítulos (tablet / mobile) =====
  var focoAnteriorPainel = null;

  function abrirPainel(gatilho) {
    var overlay = document.getElementById("painel-overlay");
    var painel = document.getElementById("painel-sumario");
    focoAnteriorPainel = gatilho;
    overlay.hidden = false;
    painel.hidden = false;
    document.body.style.overflow = "hidden";
    ["botao-capitulos", "botao-capitulos-tablet"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute("aria-expanded", "true");
    });
    var fechar = document.getElementById("painel-fechar");
    fechar.focus();
    prenderFoco(painel);
  }

  function fecharPainel() {
    var overlay = document.getElementById("painel-overlay");
    var painel = document.getElementById("painel-sumario");
    if (painel.hidden) return;
    overlay.hidden = true;
    painel.hidden = true;
    document.body.style.overflow = "";
    ["botao-capitulos", "botao-capitulos-tablet"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute("aria-expanded", "false");
    });
    if (focoAnteriorPainel) focoAnteriorPainel.focus();
  }

  function prenderFoco(container) {
    function onKeydown(e) {
      if (e.key === "Escape") {
        fecharPainel();
        return;
      }
      if (e.key !== "Tab") return;
      var focaveis = container.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])');
      if (!focaveis.length) return;
      var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault(); primeiro.focus();
      }
    }
    container.addEventListener("keydown", onKeydown);
  }

  function iniciarPainelCapitulos() {
    ["botao-capitulos", "botao-capitulos-tablet"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", function () { abrirPainel(btn); });
    });
    document.getElementById("painel-fechar").addEventListener("click", fecharPainel);
    document.getElementById("painel-overlay").addEventListener("click", fecharPainel);
  }

  // ===== Botão voltar ao topo =====
  function iniciarBotaoTopo() {
    var botao = document.getElementById("botao-topo");
    window.addEventListener("scroll", debounce(function () {
      var limite = window.innerHeight * 1.5;
      botao.hidden = window.scrollY < limite;
    }, 100));
    botao.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefereReduzirMovimento() ? "auto" : "smooth" });
    });
  }

  // ===== Início =====
  document.addEventListener("DOMContentLoaded", function () {
    iniciarBusca();
    iniciarToggleCompacto();
    iniciarToggleMenuDesktop();
    iniciarPainelCapitulos();
    iniciarBotaoTopo();
    renderizarLista();
  });
})();
