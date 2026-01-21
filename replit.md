# DESY MCP Server

Servidor MCP para el Sistema de Diseño del Gobierno de Aragón (DESY).

## Overview

Este proyecto proporciona un servidor MCP (Model Context Protocol) que da acceso programático a la documentación del sistema de diseño DESY, incluyendo componentes, patrones, guías de estilo y código en HTML, Nunjucks y Angular.

**URL de producción**: https://desy-mcp.replit.app

## Project Structure

```
/
├── server-desy.js    # Servidor MCP HTTP con Express
├── index.js          # Generador de guías de instalación (ESM)
├── index.d.ts        # Definiciones TypeScript
├── package.json      # Dependencias npm
├── README.md         # Documentación
├── CHANGELOG.md      # Historial de cambios
├── LICENSE           # Licencia MIT
└── replit.md         # Documentación del proyecto
```

## Running the Server

```bash
npm start
```

El servidor HTTP se ejecuta en el puerto 5000 y proporciona:
- Página de instrucciones en `/`
- Endpoint MCP en `/mcp`
- Health check en `/health`

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
- express

## Recent Changes

- Reorganizada estructura de archivos (todo en la raíz)
- Convertido a servidor HTTP con Express (puerto 5000)
- Añadida página de instrucciones de instalación
- Configurado para deploy en https://desy-mcp.replit.app
