# DESY MCP Server

> Servidor MCP para el Sistema de Diseño del Gobierno de Aragón

Este servidor MCP proporciona acceso programático a la documentación de DESY, permitiendo a los asistentes de IA obtener código de componentes, guías de estilo y patrones.

**URL de producción**: https://desy-mcp.replit.app

## Servidor MCP de DESY

El servidor MCP de DESY proporciona acceso programático a la documentación del Sistema de Diseño del Gobierno de Aragón, incluyendo:

- **Componentes**: Botones, formularios, modales, tablas, etc.
- **Patrones**: Patrones de UI para casos de uso comunes
- **Estilos**: Colores, tipografía, espaciado, retícula
- **Código**: Implementaciones en HTML, Nunjucks y Angular

### Herramientas disponibles

| Herramienta | Descripción |
|-------------|-------------|
| `get_component_code_html` | Obtiene el código HTML de un componente |
| `get_component_code_nunjucks` | Obtiene el código Nunjucks de un componente |
| `get_component_code_angular` | Obtiene el código Angular de un componente |
| `get_component_props` | Obtiene los parámetros configurables de un componente |
| `search_components` | Busca componentes por nombre o descripción |
| `get_guideline` | Obtiene guías de estilo y documentación |
| `list_categories` | Lista todas las categorías y componentes |

## Instalación en clientes MCP

### Cursor

Añadir a `~/.cursor/mcp.json` o `.cursor/mcp.json` (proyecto-específico):

```json
{
  "mcpServers": {
    "DESY MCP Server": {
      "url": "https://desy-mcp.replit.app"
    }
  }
}
```

### VS Code

Añadir al `settings.json` de VS Code:

```json
{
  "mcp": {
    "servers": {
      "DESY MCP Server": {
        "type": "http",
        "url": "https://desy-mcp.replit.app"
      }
    }
  }
}
```

### Claude Desktop / Claude.ai

1. Ir a **Settings → Connectors → Add Custom Connector**
2. Rellenar:
   - **Name**: `DESY MCP Server`
   - **URL**: `https://desy-mcp.replit.app`

### Claude Code

Ejecutar en terminal:

```bash
claude mcp add --transport http "DESY-MCP-Server" https://desy-mcp.replit.app
```

### Windsurf

```json
{
  "mcpServers": {
    "DESY MCP Server": {
      "serverUrl": "https://desy-mcp.replit.app"
    }
  }
}
```

## Desarrollo

### Requisitos

- Node.js 20+
- npm

### Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar servidor MCP
npm start
```

El servidor HTTP se ejecuta en el puerto 5000 y proporciona:
- Página de instrucciones en `/`
- Endpoint MCP en `/mcp`

## Licencia

MIT

## Atribución

Este proyecto está basado en [install-this-mcp](https://github.com/janwilmake/install-this-mcp) de Jan Wilmake.

El Sistema de Diseño DESY es desarrollado por el [Gobierno de Aragón](https://www.aragon.es).
