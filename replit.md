# DESY MCP Server

Servidor MCP para el Sistema de Diseño del Gobierno de Aragón (DESY).

## Overview

Este proyecto proporciona un servidor MCP (Model Context Protocol) que da acceso programático a la documentación del sistema de diseño DESY, incluyendo componentes, patrones, guías de estilo y código en HTML, Nunjucks y Angular.

## Project Structure

```
install-desy-mcp/
├── server-desy.js    # Servidor MCP principal
├── index.js          # Generador de guías de instalación
├── index.d.ts        # Definiciones TypeScript
├── package.json      # Dependencias npm
├── README.md         # Documentación
├── CHANGELOG.md      # Historial de cambios
├── SPEC.md           # Especificaciones
├── LICENSE           # Licencia MIT
└── iframe.html       # Página HTML embebida
```

## Running the Server

```bash
cd install-desy-mcp && npm start
```

El servidor se ejecuta usando stdio (protocolo estándar MCP).

## Herramientas MCP disponibles

- `get_component_code_html` - Obtiene código HTML de componentes
- `get_component_code_nunjucks` - Obtiene código Nunjucks
- `get_component_code_angular` - Obtiene código Angular
- `get_component_props` - Obtiene propiedades de componentes
- `search_components` - Busca componentes
- `get_guideline` - Obtiene guías de estilo
- `list_categories` - Lista categorías disponibles
- `refresh_cache` - Actualiza el cache

## Dependencies

- Node.js 20+
- @modelcontextprotocol/sdk

## Recent Changes

- Eliminada integración con Cloudflare Worker
- Configurado para ejecutarse directamente con Node.js
