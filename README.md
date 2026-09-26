# Engenharia de Prompts para Escrita Acadêmica com IA Generativa (prompts)

Página web (site estático) com os prompts do livro **Engenharia de Prompts para Escrita Acadêmica com IA Generativa**, de Andréia dos Santos Sachete, Jaline Gonçalves Mombach, Raquel Salcedo Gomes e Fábio Diniz Rossi. Permite buscar, navegar por capítulos e copiar cada prompt para uso no assistente de IA preferido.

Publicado via **GitHub Pages**: https://jalinegm.github.io/prompts-livro-iffar/

## Recursos

- Busca por termo, figura ou capítulo (ex.: `Figura 12`, `resumo`, `Paulo Freire`), com destaque do termo e atualização da URL
- Sumário lateral no desktop e painel de capítulos (lateral no tablet / bottom sheet no celular)
- Botão **Copiar prompt** em cada cartão
- Modo compacto para listagem densa
- Exibição opcional da resposta de exemplo de cada prompt
- Tema claro/escuro automático (segue a preferência do sistema)
- Navegação acessível (skip link, foco preso no painel, anúncios para leitores de tela)

## Estrutura

```
index.html   Estrutura da página
styles.css   Estilos e tema (claro/escuro)
app.js       Lógica de busca, sumário, cópia e interações
prompts.js   Dados: estrutura de partes/capítulos e os prompts
img/         Imagens (logo da editora)
```

Sem build e sem dependências: são apenas arquivos estáticos.

## Rodando localmente

Como é um site estático, basta servir a pasta com qualquer servidor HTTP. Por exemplo:

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000.

## Editando o conteúdo

Todo o conteúdo fica em `prompts.js`:

- `window.ESTRUTURA`: partes do livro e seus capítulos (`numero`, `titulo`).
- `window.PROMPTS`: lista de prompts. Cada item tem:
  - `id` — identificador (ex.: `fig-1`)
  - `figura` — número da figura no livro
  - `capitulo` — número do capítulo
  - `titulo` — descrição curta
  - `tecnicas` — palavras-chave/técnicas
  - `prompt` — o texto do prompt
  - `resposta` — (opcional) resposta de exemplo

Para adicionar um prompt, inclua um novo objeto no array `window.PROMPTS`. O contador de prompts e o sumário são gerados automaticamente.

