/**
 * DESY MCP Server - Sistema de Diseño del Gobierno de Aragón
 *
 * Servidor MCP que proporciona acceso a la documentación de DESY,
 * incluyendo componentes, patrones, guías de estilo y código.
 *
 * Basado en install-this-mcp: https://github.com/janwilmake/install-this-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import https from "https";
import http from "http";

const LLMS_TXT_URL = "https://desy.aragon.es/llms.txt";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

// Cache management
let cache = {
  data: null,
  timestamp: 0,
};

/**
 * Fetch with proper SSL handling for Node.js
 */
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

/**
 * Parse markdown link [text](url)
 */
function parseMarkdownLink(line) {
  const match = line.trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) {
    return { text: match[1], url: match[2] };
  }
  return null;
}

/**
 * Parse llms.txt content
 */
function parseLlmsTxt(content) {
  const categories = {};
  const components = {};
  let currentCategory = null;

  const lines = content.split("\n");

  for (const line of lines) {
    const stripped = line.trim();

    if (!stripped) continue;

    // Check for section headers
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

/**
 * Fetch and parse llms.txt with cache
 */
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

/**
 * Get component code
 */
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

/**
 * Get component props
 */
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

/**
 * Search components
 */
async function searchComponents(query) {
  const { components } = await fetchLlmsTxt();
  const queryLower = query.toLowerCase();
  const results = [];

  for (const [key, comp] of Object.entries(components)) {
    if (
      queryLower.includes(key) ||
      queryLower.includes(comp.name.toLowerCase()) ||
      queryLower.includes(comp.description.toLowerCase())
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

/**
 * Get guideline section
 */
async function getGuideline(section) {
  const { categories } = await fetchLlmsTxt();
  const sectionLower = section.toLowerCase().trim();

  for (const [catName, category] of Object.entries(categories)) {
    if (sectionLower.includes(catName.toLowerCase())) {
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
      if (sectionLower.includes(comp.name.toLowerCase()) || sectionLower.includes(comp.url.toLowerCase())) {
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

/**
 * List categories
 */
async function listCategories() {
  const { categories } = await fetchLlmsTxt();

  const result = {};
  for (const [catName, category] of Object.entries(categories)) {
    result[catName] = category.components.map((c) => c.name);
  }

  return result;
}

/**
 * Refresh cache
 */
async function refreshCache() {
  cache = { data: null, timestamp: 0 };
  await fetchLlmsTxt(true);
  return { status: "success", message: "Cache actualizado correctamente" };
}

// Create MCP server
const server = new Server(
  {
    name: "DESY MCP Server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_component_code_html",
        description: "Obtiene el código HTML de un componente de DESY",
        inputSchema: {
          type: "object",
          properties: {
            component: {
              type: "string",
              description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
            },
          },
          required: ["component"],
        },
      },
      {
        name: "get_component_code_nunjucks",
        description: "Obtiene el código Nunjucks de un componente de DESY",
        inputSchema: {
          type: "object",
          properties: {
            component: {
              type: "string",
              description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
            },
          },
          required: ["component"],
        },
      },
      {
        name: "get_component_code_angular",
        description: "Obtiene el código Angular de un componente de DESY",
        inputSchema: {
          type: "object",
          properties: {
            component: {
              type: "string",
              description: "Nombre del componente (ej: 'botones', 'modal', 'formularios')",
            },
          },
          required: ["component"],
        },
      },
      {
        name: "get_component_props",
        description: "Obtiene los parámetros y propiedades configurables de un componente de DESY",
        inputSchema: {
          type: "object",
          properties: {
            component: {
              type: "string",
              description: "Nombre del componente",
            },
          },
          required: ["component"],
        },
      },
      {
        name: "search_components",
        description: "Busca componentes de DESY por nombre o descripción",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Término de búsqueda",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_guideline",
        description: "Obtiene guías de estilo, documentación de componentes o patrones",
        inputSchema: {
          type: "object",
          properties: {
            section: {
              type: "string",
              description: "Sección a consultar (ej: 'estilos', 'componentes', 'patrones', 'accesibilidad')",
            },
          },
          required: ["section"],
        },
      },
      {
        name: "list_categories",
        description: "Lista todas las categorías y componentes disponibles en DESY",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "refresh_cache",
        description: "Fuerza la actualización del cache de llms.txt",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "get_component_code_html":
        result = await getComponentCode("html", args.component);
        break;
      case "get_component_code_nunjucks":
        result = await getComponentCode("nunjucks", args.component);
        break;
      case "get_component_code_angular":
        result = await getComponentCode("angular", args.component);
        break;
      case "get_component_props":
        result = await getComponentProps(args.component);
        break;
      case "search_components":
        result = await searchComponents(args.query);
        break;
      case "get_guideline":
        result = await getGuideline(args.section);
        break;
      case "list_categories":
        result = await listCategories();
        break;
      case "refresh_cache":
        result = await refreshCache();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Handle list resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "desy://llms.txt",
        name: "DESY Documentation Index",
        description: "Índice completo de la documentación de DESY",
        mimeType: "text/plain",
      },
    ],
  };
});

// Handle read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "desy://llms.txt") {
    const content = await fetchUrl(LLMS_TXT_URL);
    return {
      contents: [
        {
          uri: "desy://llms.txt",
          mimeType: "text/plain",
          text: content,
        },
      ],
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: `Recurso no encontrado: ${uri}`,
      },
    ],
  };
});

// Handle list prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "generate_component_page",
        description: "Genera el código para una página con un componente DESY",
        arguments: [
          {
            name: "component",
            description: "Nombre del componente",
            required: true,
          },
          {
            name: "tech",
            description: "Tecnología (html, nunjucks, angular)",
            required: true,
          },
        ],
      },
    ],
  };
});

// Handle get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "generate_component_page") {
    const code = await getComponentCode(args.tech, args.component);
    return {
      description: `Plantilla para generar página con componente ${args.component}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Genera una página completa usando el siguiente código de DESY (${args.tech}):\n\n${code}\n\nLa página debe ser accesible y seguir las guías de estilo de DESY.`,
          },
        },
      ],
    };
  }

  return {
    messages: [],
  };
});

// Run server
const transport = new StdioServerTransport();
await server.connect(transport);

console.log("DESY MCP Server running on stdio...");
