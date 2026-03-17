# AGENTS.md - Guidance for Agentic Coding Agents

This file provides guidance for agentic coding agents that operate in this repository.

## Build/Lint/Test Commands

### Available npm Scripts

```bash
npm start    # Runs: node server-desy.js
```

### Running Node.js Files

```bash
node server-desy.js    # Start the MCP server
```

### Testing Framework

No test framework is currently configured. If adding tests, recommend using **vitest**.

### Linting

No formal linting is configured. If adding linting, recommend **eslint** with ESM support.

## Code Style Guidelines

### Project Type

- **Type**: Node.js ES Module (type: "module")
- **Language**: JavaScript with JSDoc typing

### Dependencies

- `@modelcontextprotocol/sdk`, `express`, `cors`, `zod`

### Imports

Use ES module syntax (`import X from "module.js"`):
- Named imports preferred
- Group: external libs, internal modules, local files

```javascript
// External libs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Local files
import cors from "cors";
```

### Formatting

- **Indentation**: 2 spaces
- **Max line length**: ~100 characters (soft limit)
- **Semicolons**: Always use semicolons
- **Variables**: One var/const per line

```javascript
const PORT = 5000;
const SERVER_URL = "https://desy-mcp-production.up.railway.app/";
```

### Types

- Use **JSDoc** `@typedef` for complex types
- Use **TypeScript** annotations in `.d.ts` files
- Use **zod** for runtime validation of inputs

```javascript
/**
 * @typedef {Object} Component
 * @property {string} name - Component name
 * @property {string} url - Component documentation URL
 * @property {boolean} hasHtml - Has HTML code examples
 */

const componentSchema = z.object({
  component: z.string().describe("Component name"),
  variant: z.string().optional(),
});
```

### Naming Conventions

- **Functions/variables**: `camelCase`
- **Classes/constructors**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- Descriptive names, Spanish/English mix is okay (project is for DESY)

### Error Handling

- Use `try/catch` for async operations
- Return meaningful error messages
- Log errors with `console.error`
- Graceful degradation (return cached data on fetch failure)

```javascript
async function fetchData() {
  try {
    const content = await fetchUrl(URL);
    return parseContent(content);
  } catch (error) {
    if (cache.data) return cache.data;
    throw new Error(`Failed: ${error.message}`);
  }
}
```

### Functions

- Keep functions small and focused
- Use `async/await` for asynchronous operations
- Document complex functions with JSDoc

```javascript
/**
 * Normalizes input by removing accents and lowercasing.
 * @param {string} input - Input string
 * @returns {string|null} Normalized string or null
 */
function normalizeInput(input) {
  if (!input || typeof input !== 'string') return null;
  return input.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
```

### General Patterns

- Use **caching** for external data fetches
- **Normalize** input strings (lowercase, trim, remove accents)
- Support both **Spanish and English** names
- **Session management** for stateful MCP connections

## Project Architecture

### Components

1. **MCP Server** (`@modelcontextprotocol/sdk`)
   - Tools: `get_component_code_html`, `get_component_code_nunjucks`, `get_component_code_angular`, `get_component_props`, `search_components`, `get_guideline`, `list_categories`, `refresh_cache`
   - Uses zod for input validation

2. **Express HTTP Server**
   - Endpoints: `/` (install page), `/health`, `/mcp`

3. **Caching Layer**
   - 24-hour TTL for external DESY documentation

4. **Session Management**
   - Streamable HTTP transport with 30-minute TTL

### Key Files

- `server-desy.js` - Main server (single file)
- `package.json` - Dependencies

### Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.25.3",
  "cors": "^2.8.5",
  "express": "^5.2.1",
  "zod": "^4.3.5"
}
```
