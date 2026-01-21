/**
 * DESY MCP Server - Sistema de Diseño del Gobierno de Aragón
 *
 * Servidor MCP que proporciona acceso a la documentación de DESY,
 * incluyendo componentes, patrones, guías de estilo y código.
 *
 * Basado en install-this-mcp: https://github.com/janwilmake/install-this-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import https from "https";
import http from "http";
import crypto from "crypto";

import cors from "cors";

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id']
}));
app.use(express.json());

const PORT = 5000;
const SERVER_URL = "https://desy-mcp.replit.app";
const LLMS_TXT_URL = "https://desy.aragon.es/llms.txt";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

let cache = {
  data: null,
  timestamp: 0,
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function parseMarkdownLink(line) {
  const match = line.trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) {
    return { text: match[1], url: match[2] };
  }
  return null;
}

function parseLlmsTxt(content) {
  const categories = {};
  const components = {};
  let currentCategory = null;

  const lines = content.split("\n");

  for (const line of lines) {
    const stripped = line.trim();

    if (!stripped) continue;

    if (stripped.startsWith("## ")) {
      currentCategory = stripped.slice(3).trim();
      if (currentCategory && !categories[currentCategory]) {
        categories[currentCategory] = {
          name: currentCategory,
          description: `Documentación de ${currentCategory.toLowerCase()}`,
          components: [],
        };
      }
    } else if (stripped.startsWith("### ")) {
      currentCategory = stripped.slice(4).trim();
    } else if (stripped.startsWith("- ")) {
      const link = parseMarkdownLink(stripped.slice(2));
      if (link && link.url.includes("/componente-") && !link.url.endsWith(".md")) {
        const componentName = link.text;
        const hasHtml = link.url.includes("-codigo");
        const hasNunjucks = link.url.toLowerCase().includes("nunjucks");
        const hasAngular = link.url.toLowerCase().includes("angular");
        const hasProps = link.url.toLowerCase().includes("propiedades") || link.url.toLowerCase().includes("props");

        const component = {
          name: componentName,
          url: link.url,
          description: link.text,
          category: currentCategory || "General",
          hasHtml,
          hasNunjucks,
          hasAngular,
          hasProps,
        };

        const key = componentName.toLowerCase();
        components[key] = component;

        if (currentCategory && categories[currentCategory]) {
          categories[currentCategory].components.push(component);
        }
      }
    }
  }

  return { categories, components };
}

async function fetchLlmsTxt(forceRefresh = false) {
  const now = Date.now();
  const cacheExpired = now - cache.timestamp > CACHE_DURATION_MS;

  if (!forceRefresh && !cacheExpired && cache.data) {
    return cache.data;
  }

  try {
    const content = await fetchUrl(LLMS_TXT_URL);
    const parsed = parseLlmsTxt(content);
    cache = { data: parsed, timestamp: now };
    return parsed;
  } catch (error) {
    if (cache.data) {
      return cache.data;
    }
    throw new Error(`Failed to fetch llms.txt: ${error.message}`);
  }
}

async function getComponentCode(tech, component) {
  const { components } = await fetchLlmsTxt();
  const key = component.toLowerCase().trim();

  if (!components[key]) {
    const available = Object.keys(components).slice(0, 10);
    return `Componente '${component}' no encontrado.\n\nComponentes disponibles:\n- ${available.join("\n- ")}`;
  }

  const comp = components[key];

  try {
    const content = await fetchUrl(comp.url);
    return content;
  } catch (error) {
    return `Error al obtener el código: ${error.message}`;
  }
}

async function getComponentProps(component) {
  const { components } = await fetchLlmsTxt();
  const key = component.toLowerCase().trim();

  if (!components[key]) {
    return { error: `Componente '${component}' no encontrado` };
  }

  const comp = components[key];
  const propsUrl = comp.url
    .replace("-codigo", "-props")
    .replace("-codigo-angular", "-props-angular");

  try {
    const response = await fetchUrl(propsUrl);
    return {
      component: comp.name,
      description: comp.description,
      url: propsUrl,
      propsHtml: response,
    };
  } catch {
    return {
      component: comp.name,
      description: comp.description,
      url: comp.url,
      category: comp.category,
      availableFormats: {
        html: comp.hasHtml,
        nunjucks: comp.hasNunjucks,
        angular: comp.hasAngular,
      },
      note: "Para obtener las propiedades detalladas, consulta la documentación en la URL del componente",
    };
  }
}

async function searchComponents(query) {
  const { components } = await fetchLlmsTxt();
  const queryLower = query.toLowerCase();
  const results = [];

  for (const [key, comp] of Object.entries(components)) {
    if (
      key.includes(queryLower) ||
      comp.name.toLowerCase().includes(queryLower) ||
      comp.description.toLowerCase().includes(queryLower)
    ) {
      results.push({
        name: comp.name,
        description: comp.description,
        category: comp.category,
        url: comp.url,
        hasHtml: comp.hasHtml,
        hasNunjucks: comp.hasNunjucks,
        hasAngular: comp.hasAngular,
      });
    }
  }

  return results.slice(0, 20);
}

async function getGuideline(section) {
  const { categories } = await fetchLlmsTxt();
  const sectionLower = section.toLowerCase().trim();

  for (const [catName, category] of Object.entries(categories)) {
    if (catName.toLowerCase().includes(sectionLower)) {
      const lines = [`# ${catName}\n`];
      lines.push(`${category.description}\n\n`);

      for (const comp of category.components.slice(0, 30)) {
        lines.push(`- [${comp.name}](${comp.url}): ${comp.description}`);
      }

      return lines.join("\n");
    }
  }

  for (const category of Object.values(categories)) {
    for (const comp of category.components) {
      if (comp.name.toLowerCase().includes(sectionLower) || comp.url.toLowerCase().includes(sectionLower)) {
        try {
          return await fetchUrl(comp.url);
        } catch {
          break;
        }
      }
    }
  }

  const available = Object.keys(categories);
  return `Sección '${section}' no encontrada.\n\nSecciones disponibles:\n- ${available.join("\n- ")}`;
}

async function listCategories() {
  const { categories } = await fetchLlmsTxt();

  const result = {};
  for (const [catName, category] of Object.entries(categories)) {
    result[catName] = category.components.map((c) => c.name);
  }

  return result;
}

async function refreshCache() {
  cache = { data: null, timestamp: 0 };
  await fetchLlmsTxt(true);
  return { status: "success", message: "Cache actualizado correctamente" };
}

function createMcpServer() {
  const server = new McpServer({
    name: "DESY MCP Server",
    version: "1.0.0",
  });

  server.tool(
    "get_component_code_html",
    "Obtiene el código HTML de un componente de DESY",
    {
      component: {
        type: "string",
        description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
      },
    },
    async ({ component }) => ({
      content: [{ type: "text", text: await getComponentCode("html", component) }],
    })
  );

  server.tool(
    "get_component_code_nunjucks",
    "Obtiene el código Nunjucks de un componente de DESY",
    {
      component: {
        type: "string",
        description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
      },
    },
    async ({ component }) => ({
      content: [{ type: "text", text: await getComponentCode("nunjucks", component) }],
    })
  );

  server.tool(
    "get_component_code_angular",
    "Obtiene el código Angular de un componente de DESY",
    {
      component: {
        type: "string",
        description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
      },
    },
    async ({ component }) => ({
      content: [{ type: "text", text: await getComponentCode("angular", component) }],
    })
  );

  server.tool(
    "get_component_props",
    "Obtiene los parámetros y propiedades configurables de un componente de DESY",
    {
      component: {
        type: "string",
        description: "Nombre del componente",
      },
    },
    async ({ component }) => ({
      content: [{ type: "text", text: JSON.stringify(await getComponentProps(component), null, 2) }],
    })
  );

  server.tool(
    "search_components",
    "Busca componentes de DESY por nombre o descripción",
    {
      query: {
        type: "string",
        description: "Término de búsqueda",
      },
    },
    async ({ query }) => ({
      content: [{ type: "text", text: JSON.stringify(await searchComponents(query), null, 2) }],
    })
  );

  server.tool(
    "get_guideline",
    "Obtiene guías de estilo, documentación de componentes o patrones",
    {
      section: {
        type: "string",
        description: "Sección a consultar (ej: 'estilos', 'componentes', 'patrones', 'accesibilidad')",
      },
    },
    async ({ section }) => ({
      content: [{ type: "text", text: await getGuideline(section) }],
    })
  );

  server.tool(
    "list_categories",
    "Lista todas las categorías y componentes disponibles en DESY",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await listCategories(), null, 2) }],
    })
  );

  server.tool(
    "refresh_cache",
    "Fuerza la actualización del cache de llms.txt",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await refreshCache(), null, 2) }],
    })
  );

  return server;
}

function generateInstallationHTML() {
  const clients = [
    {
      name: "VS Code",
      icon: "https://www.google.com/s2/favicons?domain=code.visualstudio.com&sz=64",
      instructions: `Añadir al <code>settings.json</code> de VS Code:`,
      config: {
        mcp: {
          servers: {
            "DESY MCP Server": {
              type: "http",
              url: `${SERVER_URL}/mcp`
            }
          }
        }
      }
    },
    {
      name: "Cursor",
      icon: "https://www.google.com/s2/favicons?domain=cursor.com&sz=64",
      instructions: `Añadir a <code>~/.cursor/mcp.json</code> o <code>.cursor/mcp.json</code> (proyecto-específico):`,
      config: {
        mcpServers: {
          "DESY MCP Server": {
            url: `${SERVER_URL}/mcp`
          }
        }
      }
    },
    {
      name: "Claude Desktop / Claude.ai",
      icon: "https://www.google.com/s2/favicons?domain=claude.ai&sz=64",
      instructions: `Ir a <strong>Settings → Connectors → Add Custom Connector</strong> y rellenar:
      <ul>
        <li><strong>Name</strong>: DESY MCP Server</li>
        <li><strong>URL</strong>: ${SERVER_URL}/mcp</li>
      </ul>`,
      config: null
    },
    {
      name: "Claude Code",
      icon: "https://www.google.com/s2/favicons?domain=claude.ai&sz=64",
      instructions: `Ejecutar en terminal:`,
      command: `claude mcp add --transport http "DESY-MCP-Server" ${SERVER_URL}/mcp`
    },
    {
      name: "Windsurf",
      icon: "https://www.google.com/s2/favicons?domain=codeium.com&sz=64",
      instructions: `Añadir a la configuración MCP de Windsurf:`,
      config: {
        mcpServers: {
          "DESY MCP Server": {
            serverUrl: `${SERVER_URL}/mcp`
          }
        }
      }
    },
    {
      name: "ChatGPT",
      icon: "https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64",
      instructions: `Ir a <strong>Settings → Connectors → Advanced Settings</strong>, activar <strong>Developer Mode</strong>. Luego crear conector con:
      <ul>
        <li><strong>Name</strong>: DESY MCP Server</li>
        <li><strong>URL</strong>: ${SERVER_URL}/mcp</li>
        <li><strong>Authentication</strong>: OAuth</li>
      </ul>`,
      config: null
    },
    {
      name: "Gemini CLI",
      icon: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64",
      instructions: `Añadir a <code>~/.gemini/settings.json</code>:`,
      config: {
        mcpServers: {
          "DESY MCP Server": {
            httpUrl: `${SERVER_URL}/mcp`
          }
        }
      }
    }
  ];

  const clientCards = clients.map(client => {
    let configSection = '';
    if (client.config) {
      configSection = `<pre class="c-pre"><code>${JSON.stringify(client.config, null, 2)}</code></pre>`;
    }
    if (client.command) {
      configSection = `<pre class="c-pre"><code>${client.command}</code></pre>`;
    }

    return `
      <div class="c-card">
        <div class="c-card__header">
          <img src="${client.icon}" alt="${client.name}" class="c-card__icon">
          <h3 class="c-card__title">${client.name}</h3>
        </div>
        <div class="c-card__body">
          <p>${client.instructions}</p>
          ${configSection}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DESY MCP Server - Instalación</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <link rel="mask-icon" href="/favicon.svg" color="#fce400">
  <meta name="msapplication-TileImage" content="/favicon.svg">
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-primary: #226937;
      --color-primary-dark: #1a5029;
      --color-primary-light: #e8f5eb;
      --color-warning: #fce400;
      --color-warning-dark: #d4bf00;
      --color-neutral-dark: #212529;
      --color-neutral-base: #6c757d;
      --color-neutral-light: #f8f9fa;
      --color-white: #ffffff;
      --color-black: #000000;
      --color-border: #dee2e6;
      --color-focus: #fce400;
      --font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      --radius-sm: 4px;
      --radius-md: 8px;
      --spacing-xs: 0.25rem;
      --spacing-sm: 0.5rem;
      --spacing-md: 1rem;
      --spacing-lg: 1.5rem;
      --spacing-xl: 2rem;
      --spacing-2xl: 3rem;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: var(--font-family);
      background-color: var(--color-neutral-light);
      min-height: 100vh;
      color: var(--color-neutral-dark);
      line-height: 1.6;
      font-size: 1rem;
    }

    a {
      color: var(--color-primary);
      text-decoration: underline;
    }

    a:hover {
      color: var(--color-primary-dark);
    }

    a:focus {
      outline: 3px solid var(--color-focus);
      outline-offset: 2px;
    }

    .c-header {
      background-color: var(--color-white);
      border-bottom: 1px solid var(--color-border);
    }

    .c-header__top {
      background-color: var(--color-primary);
      padding: var(--spacing-sm) 0;
    }

    .c-header__top-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 var(--spacing-lg);
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .c-header__logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      color: var(--color-white);
      text-decoration: none;
      font-weight: 700;
      font-size: 0.875rem;
    }

    .c-header__logo:hover {
      color: var(--color-white);
    }

    .c-header__logo svg {
      height: 24px;
      width: auto;
    }

    .c-header__main {
      padding: var(--spacing-lg) 0;
    }

    .c-header__main-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 var(--spacing-lg);
    }

    .c-header__title {
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-neutral-dark);
      margin-bottom: var(--spacing-xs);
    }

    .c-header__subtitle {
      font-size: 1.125rem;
      color: var(--color-neutral-base);
      font-weight: 400;
    }

    .c-main {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-2xl) var(--spacing-lg);
    }

    .c-section {
      margin-bottom: var(--spacing-2xl);
    }

    .c-section__title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-neutral-dark);
      margin-bottom: var(--spacing-lg);
      padding-bottom: var(--spacing-sm);
      border-bottom: 3px solid var(--color-primary);
      display: inline-block;
    }

    .c-server-info {
      background-color: var(--color-primary-light);
      border: 1px solid var(--color-primary);
      border-left: 4px solid var(--color-primary);
      border-radius: var(--radius-md);
      padding: var(--spacing-lg);
      margin-bottom: var(--spacing-2xl);
    }

    .c-server-info__label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-primary-dark);
      margin-bottom: var(--spacing-sm);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .c-server-info__url {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 1.125rem;
      color: var(--color-primary-dark);
      background-color: var(--color-white);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-sm);
      display: inline-block;
      border: 1px solid var(--color-primary);
      word-break: break-all;
    }

    .c-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: var(--spacing-lg);
    }

    .c-card {
      background-color: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
      overflow: hidden;
    }

    .c-card:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .c-card__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      background-color: var(--color-neutral-light);
      border-bottom: 1px solid var(--color-border);
    }

    .c-card__icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
    }

    .c-card__title {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-neutral-dark);
      margin: 0;
    }

    .c-card__body {
      padding: var(--spacing-lg);
    }

    .c-card__body p {
      color: var(--color-neutral-base);
      margin-bottom: var(--spacing-md);
      font-size: 0.9375rem;
    }

    .c-card__body ul {
      margin: var(--spacing-sm) 0 var(--spacing-md) var(--spacing-lg);
      color: var(--color-neutral-base);
    }

    .c-card__body li {
      margin-bottom: var(--spacing-xs);
    }

    .c-card__body code {
      font-family: 'Consolas', 'Monaco', monospace;
      background-color: var(--color-neutral-light);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.875rem;
      color: var(--color-primary-dark);
    }

    .c-pre {
      background-color: #1e1e1e;
      border-radius: var(--radius-sm);
      padding: var(--spacing-md);
      overflow-x: auto;
      margin: 0;
    }

    .c-pre code {
      font-family: 'Consolas', 'Monaco', 'Fira Code', monospace;
      font-size: 0.8125rem;
      color: #d4d4d4;
      background: none;
      padding: 0;
      line-height: 1.5;
      white-space: pre;
    }

    .c-tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-md);
    }

    .c-tool {
      background-color: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      transition: border-color 0.2s ease;
    }

    .c-tool:hover {
      border-color: var(--color-primary);
    }

    .c-tool__name {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-primary);
      margin-bottom: var(--spacing-xs);
    }

    .c-tool__desc {
      font-size: 0.875rem;
      color: var(--color-neutral-base);
      margin: 0;
    }

    .c-footer {
      background-color: var(--color-neutral-dark);
      color: var(--color-white);
      padding: var(--spacing-xl) 0;
      margin-top: var(--spacing-2xl);
    }

    .c-footer__inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 var(--spacing-lg);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--spacing-md);
    }

    .c-footer__text {
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .c-footer__links {
      display: flex;
      gap: var(--spacing-lg);
    }

    .c-footer__link {
      color: var(--color-white);
      text-decoration: none;
      font-size: 0.875rem;
      opacity: 0.9;
      transition: opacity 0.2s ease;
    }

    .c-footer__link:hover {
      opacity: 1;
      color: var(--color-white);
    }

    .c-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xs);
      background-color: var(--color-warning);
      color: var(--color-black);
      font-size: 0.75rem;
      font-weight: 700;
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--radius-sm);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    @media (max-width: 768px) {
      .c-header__title {
        font-size: 1.5rem;
      }

      .c-cards-grid {
        grid-template-columns: 1fr;
      }

      .c-tools-grid {
        grid-template-columns: 1fr;
      }

      .c-footer__inner {
        flex-direction: column;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <header class="c-header">
    <div class="c-header__top">
      <div class="c-header__top-inner">
        <a href="https://www.aragon.es" class="c-header__logo" target="_blank">
          <svg viewBox="0 0 120 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <text x="0" y="18" font-family="Public Sans, sans-serif" font-size="14" font-weight="700">GOBIERNO DE ARAGÓN</text>
          </svg>
        </a>
      </div>
    </div>
    <div class="c-header__main">
      <div class="c-header__main-inner">
        <h1 class="c-header__title">DESY MCP Server</h1>
        <p class="c-header__subtitle">Servidor MCP para el Sistema de Diseño del Gobierno de Aragón</p>
      </div>
    </div>
  </header>

  <main class="c-main">
    <div class="c-server-info">
      <p class="c-server-info__label">URL del servidor MCP</p>
      <code class="c-server-info__url">${SERVER_URL}/mcp</code>
    </div>

    <section class="c-section">
      <h2 class="c-section__title">Instrucciones de instalación</h2>
      <div class="c-cards-grid">
        ${clientCards}
      </div>
    </section>

    <section class="c-section">
      <h2 class="c-section__title">Herramientas disponibles</h2>
      <div class="c-tools-grid">
        <div class="c-tool">
          <h4 class="c-tool__name">get_component_code_html</h4>
          <p class="c-tool__desc">Obtiene el código HTML de un componente de DESY</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">get_component_code_nunjucks</h4>
          <p class="c-tool__desc">Obtiene el código Nunjucks de un componente</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">get_component_code_angular</h4>
          <p class="c-tool__desc">Obtiene el código Angular de un componente</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">get_component_props</h4>
          <p class="c-tool__desc">Obtiene las propiedades configurables de un componente</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">search_components</h4>
          <p class="c-tool__desc">Busca componentes por nombre o descripción</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">get_guideline</h4>
          <p class="c-tool__desc">Obtiene guías de estilo y documentación oficial</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">list_categories</h4>
          <p class="c-tool__desc">Lista todas las categorías y componentes disponibles</p>
        </div>
        <div class="c-tool">
          <h4 class="c-tool__name">refresh_cache</h4>
          <p class="c-tool__desc">Fuerza la actualización del cache de documentación</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="c-footer">
    <div class="c-footer__inner">
      <p class="c-footer__text">Desarrollado para el Sistema de Diseño DESY del Gobierno de Aragón</p>
      <div class="c-footer__links">
        <a href="https://desy.aragon.es" class="c-footer__link" target="_blank">DESY</a>
        <a href="https://www.aragon.es" class="c-footer__link" target="_blank">Gobierno de Aragón</a>
        <a href="https://bitbucket.org/sdaragon/desy-html" class="c-footer__link" target="_blank">Repositorio</a>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-cache");
  res.send(generateInstallationHTML());
});

app.get("/favicon.svg", (req, res) => {
  res.sendFile(process.cwd() + "/favicon.svg");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "DESY MCP Server", version: "1.0.0" });
});

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

setInterval(cleanupSessions, 5 * 60 * 1000);

function generateSessionId() {
  return crypto.randomUUID();
}

async function handleMcpRequest(req, res) {
  try {
    let sessionId = req.headers["mcp-session-id"];
    let session = sessionId ? sessions.get(sessionId) : null;
    
    if (!session) {
      if (req.method === "GET") {
        res.status(400).json({ 
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found. Send POST first." },
          id: null
        });
        return;
      }
      
      sessionId = generateSessionId();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (id) => {
          console.log(`Session initialized: ${id}`);
        }
      });
      const server = createMcpServer();
      await server.connect(transport);
      
      session = { transport, server, lastAccess: Date.now() };
      sessions.set(sessionId, session);
    } else {
      session.lastAccess = Date.now();
    }
    
    res.setHeader("Mcp-Session-Id", sessionId);
    await session.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(`MCP ${req.method} error:`, error);
    if (!res.headersSent) {
      res.status(500).json({ 
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message },
        id: null
      });
    }
  }
}

app.post("/mcp", handleMcpRequest);
app.get("/mcp", handleMcpRequest);

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    try {
      await session.transport.close?.();
    } catch (e) {}
    sessions.delete(sessionId);
  }
  res.status(200).json({ message: "Session closed" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DESY MCP Server running on http://0.0.0.0:${PORT}`);
  console.log(`MCP endpoint: ${SERVER_URL}/mcp`);
  console.log(`Installation guide: ${SERVER_URL}`);
});
