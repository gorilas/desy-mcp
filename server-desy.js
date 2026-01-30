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
import { z } from "zod";

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

const COMPONENT_ALIASES = {
  "button": ["button", "botón", "botones", "boton"],
  "button-loader": ["button-loader", "botón cargando", "boton cargando", "loader button"],
  "modal": ["modal", "ventana modal", "diálogo", "dialogo", "dialog"],
  "input": ["input", "entrada", "campo", "text input", "campo de texto"],
  "select": ["select", "selector", "desplegable", "dropdown"],
  "checkbox": ["checkbox", "casilla", "casilla de verificación", "check"],
  "radio": ["radio", "radio button", "botón de radio", "boton de radio"],
  "accordion": ["accordion", "acordeón", "acordeon", "desplegable"],
  "alert": ["alert", "alerta", "aviso", "notificación", "notificacion"],
  "badge": ["badge", "insignia", "etiqueta"],
  "breadcrumb": ["breadcrumb", "migas de pan", "breadcrumbs", "navegación"],
  "card": ["card", "tarjeta", "cards", "tarjetas"],
  "carousel": ["carousel", "carrusel", "slider"],
  "dropdown": ["dropdown", "desplegable", "menú desplegable", "menu desplegable"],
  "footer": ["footer", "pie de página", "pie de pagina"],
  "header": ["header", "cabecera", "encabezado"],
  "icon": ["icon", "icono", "icons", "iconos"],
  "link": ["link", "enlace", "enlaces", "links"],
  "list": ["list", "lista", "listas", "lists"],
  "menu": ["menu", "menú", "navegación", "navegacion", "nav"],
  "navbar": ["navbar", "barra de navegación", "navigation bar"],
  "pagination": ["pagination", "paginación", "paginacion", "pager"],
  "progress": ["progress", "progreso", "barra de progreso", "progress bar"],
  "spinner": ["spinner", "cargando", "loading", "loader"],
  "tab": ["tab", "tabs", "pestaña", "pestañas", "pestana", "pestanas"],
  "table": ["table", "tabla", "tablas", "tables"],
  "tag": ["tag", "etiqueta", "tags", "etiquetas"],
  "textarea": ["textarea", "área de texto", "area de texto", "text area"],
  "toast": ["toast", "notificación", "notificacion", "mensaje"],
  "tooltip": ["tooltip", "descripción emergente", "hint", "ayuda"],
  "form": ["form", "formulario", "formularios", "forms"],
  "search": ["search", "búsqueda", "busqueda", "buscador"],
  "avatar": ["avatar", "foto de perfil", "imagen de usuario"],
  "switch": ["switch", "interruptor", "toggle"],
  "stepper": ["stepper", "pasos", "wizard", "asistente"],
  "sidebar": ["sidebar", "barra lateral", "menú lateral", "menu lateral"],
  "divider": ["divider", "divisor", "separador", "línea", "linea"],
  "chip": ["chip", "chips", "etiqueta pequeña"],
  "date-picker": ["date-picker", "datepicker", "selector de fecha", "calendario", "calendar"],
  "file-upload": ["file-upload", "subir archivo", "upload", "carga de archivos"],
  "autocomplete": ["autocomplete", "autocompletar", "sugerencias"],
};

function normalizeComponentName(input) {
  if (!input || typeof input !== 'string') return null;
  
  const normalized = input.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const [canonical, aliases] of Object.entries(COMPONENT_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedAlias === normalized || normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        return canonical;
      }
    }
  }
  
  return normalized;
}

function findComponentKey(components, searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') return null;
  
  const normalized = searchTerm.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  if (components[normalized]) {
    return normalized;
  }
  
  const canonicalName = normalizeComponentName(searchTerm);
  
  for (const [canonical, aliases] of Object.entries(COMPONENT_ALIASES)) {
    const isMatch = canonical === canonicalName || aliases.some(alias => {
      const normalizedAlias = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normalizedAlias === normalized;
    });
    
    if (isMatch) {
      for (const alias of aliases) {
        const normalizedAlias = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (components[normalizedAlias]) {
          return normalizedAlias;
        }
        const withHtml = `${normalizedAlias} (html)`;
        if (components[withHtml]) {
          return withHtml;
        }
      }
    }
  }
  
  for (const compKey of Object.keys(components)) {
    const compKeyNorm = compKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (compKeyNorm.includes(normalized) || normalized.includes(compKeyNorm)) {
      return compKey;
    }
  }
  
  return null;
}

function parseCodeBlocks(markdown, format = 'html') {
  const examples = [];
  const lines = markdown.split('\n');
  
  let currentExample = null;
  let inCodeBlock = false;
  let codeBlockType = null;
  let codeBuffer = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/^###\s+(.+)\s*\[#\]/)) {
      if (currentExample && (currentExample.html || currentExample.nunjucks)) {
        examples.push(currentExample);
      }
      const title = line.match(/^###\s+(.+)\s*\[#\]/)[1].trim();
      currentExample = { title, html: null, nunjucks: null, description: '' };
    }
    else if (line.match(/^###\s+(.+)/)) {
      if (currentExample && (currentExample.html || currentExample.nunjucks)) {
        examples.push(currentExample);
      }
      const title = line.match(/^###\s+(.+)/)[1].trim();
      currentExample = { title, html: null, nunjucks: null, description: '' };
    }
    
    if (line.startsWith('```html')) {
      inCodeBlock = true;
      codeBlockType = 'html';
      codeBuffer = [];
    } else if (line.startsWith('```js') || line.startsWith('```javascript')) {
      inCodeBlock = true;
      codeBlockType = 'nunjucks';
      codeBuffer = [];
    } else if (line === '```' && inCodeBlock) {
      if (currentExample) {
        const code = codeBuffer.join('\n').trim();
        if (codeBlockType === 'html') {
          currentExample.html = code;
        } else if (codeBlockType === 'nunjucks') {
          currentExample.nunjucks = code;
        }
      }
      inCodeBlock = false;
      codeBlockType = null;
      codeBuffer = [];
    } else if (inCodeBlock) {
      codeBuffer.push(line);
    }
  }
  
  if (currentExample && (currentExample.html || currentExample.nunjucks)) {
    examples.push(currentExample);
  }
  
  return examples;
}

function formatCodeOutput(examples, format = 'html', variant = null) {
  if (variant) {
    const variantLower = variant.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const filtered = examples.filter(ex => {
      const titleNorm = ex.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return titleNorm.includes(variantLower) || variantLower.includes(titleNorm);
    });
    
    if (filtered.length > 0) {
      examples = filtered;
    }
  }
  
  const output = [];
  
  for (const example of examples) {
    const code = format === 'html' ? example.html : example.nunjucks;
    if (code) {
      output.push(`### ${example.title}\n\`\`\`${format === 'html' ? 'html' : 'js'}\n${code}\n\`\`\``);
    }
  }
  
  if (output.length === 0) {
    return `No se encontraron ejemplos de código ${format.toUpperCase()} para este componente.`;
  }
  
  return output.join('\n\n');
}

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
      if (currentCategory && !categories[currentCategory]) {
        categories[currentCategory] = {
          name: currentCategory,
          description: `Componentes de ${currentCategory.toLowerCase()}`,
          components: [],
        };
      }
    } else if (stripped.startsWith("- ") || stripped.startsWith("  - ")) {
      const linkText = stripped.replace(/^-\s*/, "").replace(/^\s*-\s*/, "");
      const link = parseMarkdownLink(linkText);
      if (link && link.url.includes("/componente-")) {
        const componentName = link.text;
        const urlLower = link.url.toLowerCase();
        const hasHtml = urlLower.includes("-codigo") && !urlLower.includes("-angular");
        const hasNunjucks = urlLower.includes("nunjucks");
        const hasAngular = urlLower.includes("angular");
        const hasProps = urlLower.includes("propiedades") || urlLower.includes("props");

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
        if (!components[key]) {
          components[key] = component;
        }

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

async function getComponentCode(tech, component, variant = null) {
  const { components } = await fetchLlmsTxt();
  
  if (!component || typeof component !== 'string') {
    const available = Object.keys(components);
    return `Error: Debes especificar un nombre de componente.\n\nComponentes disponibles (${available.length} total):\n- ${available.join("\n- ")}`;
  }
  
  let key = findComponentKey(components, component);

  if (!key) {
    const available = Object.keys(components);
    const searchNorm = component.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const suggestions = available.filter(k => {
      const kNorm = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return kNorm.includes(searchNorm.substring(0, 3)) || searchNorm.includes(kNorm.substring(0, 3));
    }).slice(0, 5);
    
    let response = `Componente '${component}' no encontrado.`;
    if (suggestions.length > 0) {
      response += `\n\n¿Quizás quisiste decir?\n- ${suggestions.join("\n- ")}`;
    }
    response += `\n\nComponentes disponibles (${available.length} total):\n- ${available.slice(0, 20).join("\n- ")}`;
    if (available.length > 20) {
      response += `\n... y ${available.length - 20} más`;
    }
    return response;
  }

  const comp = components[key];

  let codeUrl = comp.url;
  if (!codeUrl.includes('-codigo')) {
    codeUrl = codeUrl.replace('.html.md', '-codigo.html.md');
  }
  
  if (tech === 'angular' && !codeUrl.includes('-angular')) {
    codeUrl = codeUrl.replace('-codigo.html.md', '-codigo-angular.html.md');
  }

  try {
    const content = await fetchUrl(codeUrl);
    
    const examples = parseCodeBlocks(content, tech === 'nunjucks' ? 'nunjucks' : 'html');
    
    if (examples.length === 0) {
      return `No se encontraron ejemplos de código para '${comp.name}'.\n\nContenido disponible en: ${codeUrl}`;
    }
    
    const format = tech === 'nunjucks' ? 'nunjucks' : 'html';
    const header = `## ${comp.name} - Código ${format.toUpperCase()}\n\n`;
    const codeOutput = formatCodeOutput(examples, format, variant);
    
    return header + codeOutput;
  } catch (error) {
    try {
      const fallbackContent = await fetchUrl(comp.url);
      return `No se pudo obtener la página de código. Documentación disponible:\n\n${fallbackContent.substring(0, 2000)}...`;
    } catch {
      return `Error al obtener el código: ${error.message}`;
    }
  }
}

async function getComponentProps(component) {
  const { components } = await fetchLlmsTxt();
  
  if (!component || typeof component !== 'string') {
    return { error: "Debes especificar un nombre de componente" };
  }
  
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
  
  if (!query || typeof query !== 'string') {
    return Object.values(components).slice(0, 100).map(comp => ({
      name: comp.name,
      description: comp.description,
      category: comp.category,
      url: comp.url,
      hasHtml: comp.hasHtml,
      hasNunjucks: comp.hasNunjucks,
      hasAngular: comp.hasAngular,
    }));
  }
  
  const queryLower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedQuery = normalizeComponentName(query);
  const results = [];
  const seen = new Set();

  if (normalizedQuery && components[normalizedQuery]) {
    const comp = components[normalizedQuery];
    results.push({
      name: comp.name,
      canonicalName: normalizedQuery,
      description: comp.description,
      category: comp.category,
      url: comp.url,
      hasHtml: comp.hasHtml,
      hasNunjucks: comp.hasNunjucks,
      hasAngular: comp.hasAngular,
      matchType: 'exact',
    });
    seen.add(normalizedQuery);
  }

  for (const [canonical, aliases] of Object.entries(COMPONENT_ALIASES)) {
    if (seen.has(canonical)) continue;
    
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedAlias.includes(queryLower) || queryLower.includes(normalizedAlias)) {
        if (components[canonical]) {
          const comp = components[canonical];
          results.push({
            name: comp.name,
            canonicalName: canonical,
            description: comp.description,
            category: comp.category,
            url: comp.url,
            hasHtml: comp.hasHtml,
            hasNunjucks: comp.hasNunjucks,
            hasAngular: comp.hasAngular,
            matchType: 'alias',
            matchedAlias: alias,
          });
          seen.add(canonical);
          break;
        }
      }
    }
  }

  for (const [key, comp] of Object.entries(components)) {
    if (seen.has(key)) continue;
    
    const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nameNorm = comp.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const descNorm = comp.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (keyNorm.includes(queryLower) || nameNorm.includes(queryLower) || descNorm.includes(queryLower)) {
      results.push({
        name: comp.name,
        canonicalName: key,
        description: comp.description,
        category: comp.category,
        url: comp.url,
        hasHtml: comp.hasHtml,
        hasNunjucks: comp.hasNunjucks,
        hasAngular: comp.hasAngular,
        matchType: 'partial',
      });
      seen.add(key);
    }
  }

  return results.slice(0, 100);
}

async function getGuideline(section) {
  const { categories } = await fetchLlmsTxt();
  
  if (!section || typeof section !== 'string') {
    const available = Object.keys(categories);
    return `Error: Debes especificar una sección.\n\nSecciones disponibles:\n- ${available.join("\n- ")}`;
  }
  
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
    "Obtiene snippets de código HTML listos para copiar y usar de un componente DESY. Soporta nombres en español e inglés (ej: 'button' o 'botón'). Devuelve ejemplos de código por variante.",
    {
      component: z.string().describe("Nombre del componente en español o inglés (ej: 'button', 'botón', 'modal', 'alert')"),
      variant: z.string().optional().describe("Variante específica del componente (ej: 'primario', 'deshabilitado', 'hover'). Si no se especifica, devuelve todos los ejemplos."),
    },
    async ({ component, variant }) => ({
      content: [{ type: "text", text: await getComponentCode("html", component, variant) }],
    })
  );

  server.tool(
    "get_component_code_nunjucks",
    "Obtiene snippets de código Nunjucks/macros listos para copiar y usar de un componente DESY. Soporta nombres en español e inglés. Devuelve ejemplos de código por variante.",
    {
      component: z.string().describe("Nombre del componente en español o inglés (ej: 'button', 'botón', 'modal', 'alert')"),
      variant: z.string().optional().describe("Variante específica del componente (ej: 'primario', 'deshabilitado', 'hover'). Si no se especifica, devuelve todos los ejemplos."),
    },
    async ({ component, variant }) => ({
      content: [{ type: "text", text: await getComponentCode("nunjucks", component, variant) }],
    })
  );

  server.tool(
    "get_component_code_angular",
    "Obtiene snippets de código Angular listos para copiar y usar de un componente DESY. Soporta nombres en español e inglés. Devuelve ejemplos de código por variante.",
    {
      component: z.string().describe("Nombre del componente en español o inglés (ej: 'button', 'botón', 'modal', 'alert')"),
      variant: z.string().optional().describe("Variante específica del componente (ej: 'primario', 'deshabilitado', 'hover'). Si no se especifica, devuelve todos los ejemplos."),
    },
    async ({ component, variant }) => ({
      content: [{ type: "text", text: await getComponentCode("angular", component, variant) }],
    })
  );

  server.tool(
    "get_component_props",
    "Obtiene los parámetros y propiedades configurables de un componente de DESY",
    {
      component: z.string().describe("Nombre del componente"),
    },
    async ({ component }) => ({
      content: [{ type: "text", text: JSON.stringify(await getComponentProps(component), null, 2) }],
    })
  );

  server.tool(
    "search_components",
    "Busca componentes de DESY por nombre o descripción",
    {
      query: z.string().describe("Término de búsqueda"),
    },
    async ({ query }) => ({
      content: [{ type: "text", text: JSON.stringify(await searchComponents(query), null, 2) }],
    })
  );

  server.tool(
    "get_guideline",
    "Obtiene guías de estilo, documentación de componentes o patrones",
    {
      section: z.string().describe("Sección a consultar (ej: 'estilos', 'componentes', 'patrones', 'accesibilidad')"),
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
  // Generate one-click install URLs
  const vscodeConfig = {
    name: "DESY MCP Server",
    type: "http",
    url: `${SERVER_URL}/mcp`
  };
  const vscodeInstallUrl = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeConfig))}`;
  
  const cursorConfig = {
    url: `${SERVER_URL}/mcp`
  };
  const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent("DESY MCP Server")}&config=${Buffer.from(JSON.stringify(cursorConfig)).toString('base64')}`;

  const clients = [
    {
      name: "VS Code",
      icon: "https://www.google.com/s2/favicons?domain=code.visualstudio.com&sz=64",
      instructions: `Añadir al <code>settings.json</code> de VS Code:`,
      installUrl: vscodeInstallUrl,
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
      installUrl: cursorInstallUrl,
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
    }
  ];

  const clientCards = clients.map(client => {
    let configSection = '';
    if (client.config) {
      configSection = `<pre><code>${JSON.stringify(client.config, null, 2)}</code></pre>`;
    }
    if (client.command) {
      configSection = `<pre><code class="language-bash">${client.command}</code></pre>`;
    }
    
    let installButton = '';
    if (client.installUrl) {
      installButton = `<a href="${client.installUrl}" class="install-button">Instalar Ahora</a>`;
    }

    return `
      <div class="client-card">
        <div class="client-header">
          <img src="${client.icon}" alt="${client.name}" class="client-icon">
          <h3>${client.name}</h3>
          ${installButton}
        </div>
        <div class="client-instructions">
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
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      line-height: 1.6;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    header {
      text-align: center;
      margin-bottom: 50px;
    }
    
    h1 {
      font-size: 2.5rem;
      color: #fff;
      margin-bottom: 10px;
    }
    
    .subtitle {
      font-size: 1.2rem;
      color: #a0a0a0;
    }
    
    .server-info {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 40px;
      text-align: center;
    }
    
    .server-url {
      font-family: monospace;
      font-size: 1.1rem;
      color: #4fc3f7;
      background: rgba(79, 195, 247, 0.1);
      padding: 10px 20px;
      border-radius: 6px;
      display: inline-block;
    }
    
    h2 {
      font-size: 1.8rem;
      margin-bottom: 30px;
      color: #fff;
      text-align: center;
    }
    
    .clients-grid {
      display: grid;
      gap: 20px;
    }
    
    .client-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 25px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .client-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    }
    
    .client-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .client-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
    }
    
    .client-header h3 {
      font-size: 1.3rem;
      color: #fff;
      flex-grow: 1;
    }
    
    .install-button {
      background: #22c55e;
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      transition: background 0.2s, transform 0.2s;
      white-space: nowrap;
    }
    
    .install-button:hover {
      background: #16a34a;
      transform: translateY(-1px);
    }
    
    .client-instructions p {
      margin-bottom: 15px;
      color: #b0b0b0;
    }
    
    .client-instructions ul {
      margin: 10px 0 15px 20px;
      color: #b0b0b0;
    }
    
    pre {
      background: #0d1117;
      border-radius: 8px;
      padding: 15px;
      overflow-x: auto;
    }
    
    code {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 0.9rem;
      color: #79c0ff;
    }
    
    .tools-section {
      margin-top: 50px;
      padding-top: 40px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }
    
    .tool-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 15px;
    }
    
    .tool-card h4 {
      color: #4fc3f7;
      font-family: monospace;
      margin-bottom: 8px;
    }
    
    .tool-card p {
      font-size: 0.9rem;
      color: #909090;
    }
    
    footer {
      margin-top: 60px;
      text-align: center;
      color: #606060;
      font-size: 0.9rem;
    }
    
    footer a {
      color: #4fc3f7;
      text-decoration: none;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>DESY MCP Server</h1>
      <p class="subtitle">Sistema de Diseño del Gobierno de Aragón</p>
    </header>
    
    <div class="server-info">
      <p>URL del servidor MCP:</p>
      <div class="server-url">${SERVER_URL}/mcp</div>
    </div>
    
    <h2>Instrucciones de Instalación</h2>
    
    <div class="clients-grid">
      ${clientCards}
    </div>
    
    <div class="tools-section">
      <h2>Herramientas Disponibles</h2>
      <div class="tools-grid">
        <div class="tool-card">
          <h4>get_component_code_html</h4>
          <p>Obtiene el código HTML de un componente</p>
        </div>
        <div class="tool-card">
          <h4>get_component_code_nunjucks</h4>
          <p>Obtiene el código Nunjucks de un componente</p>
        </div>
        <div class="tool-card">
          <h4>get_component_code_angular</h4>
          <p>Obtiene el código Angular de un componente</p>
        </div>
        <div class="tool-card">
          <h4>get_component_props</h4>
          <p>Obtiene las propiedades configurables</p>
        </div>
        <div class="tool-card">
          <h4>search_components</h4>
          <p>Busca componentes por nombre o descripción</p>
        </div>
        <div class="tool-card">
          <h4>get_guideline</h4>
          <p>Obtiene guías de estilo y documentación</p>
        </div>
        <div class="tool-card">
          <h4>list_categories</h4>
          <p>Lista todas las categorías disponibles</p>
        </div>
        <div class="tool-card">
          <h4>refresh_cache</h4>
          <p>Actualiza el cache de documentación</p>
        </div>
      </div>
    </div>
    
    <footer>
      <p>Desarrollado para el <a href="https://desy.aragon.es" target="_blank">Sistema de Diseño DESY</a> del <a href="https://www.aragon.es" target="_blank">Gobierno de Aragón</a></p>
    </footer>
  </div>
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
