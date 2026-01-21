/**
 * @typedef {Object} MCPConfig
 * @property {string} client - Client name
 * @property {string} iconUrl - Client icon URL
 * @property {string} [deepLink] - Deep link for installation
 * @property {string} [remoteCommand] - CLI command for installation
 * @property {string} instructions - Installation instructions
 * @property {Object} [configJson] - Configuration JSON
 */

// DESY Server Configuration
const DESY_CONFIG = {
  serverName: "DESY MCP Server",
  mcpUrl: "https://desy-mcp.replit.app"
};

/**
 * Generates MCP configuration for DESY server
 * @param {string} mcpUrl - MCP server URL (ignored, uses DESY config)
 * @param {string} serverName - Server display name (ignored, uses DESY config)
 * @returns {MCPConfig[]} Array of client configurations
 */
function generateMCPConfig(mcpUrl, serverName) {
  const configs = [
    {
      client: "Cursor",
      iconUrl: "https://www.google.com/s2/favicons?domain=cursor.com&sz=64",
      instructions:
        `Add to **~/.cursor/mcp.json** or **.cursor/mcp.json** (project-specific):`,
      configJson: {
        mcpServers: {
          [DESY_CONFIG.serverName]: {
            url: DESY_CONFIG.mcpUrl,
          },
        },
      },
    },
    {
      client: "VS Code",
      iconUrl: "https://www.google.com/s2/favicons?domain=code.visualstudio.com&sz=64",
      instructions: "Add to VS Code **settings.json**:",
      configJson: {
        mcp: {
          servers: {
            [DESY_CONFIG.serverName]: {
              type: "http",
              url: DESY_CONFIG.mcpUrl,
            },
          },
        },
      },
    },
    {
      client: "Claude Desktop / Claude.ai",
      iconUrl: "https://www.google.com/s2/favicons?domain=claude.ai&sz=64",
      instructions: `Go to **Settings → Connectors → Add Custom Connector** and fill in:
- **Name**: ${DESY_CONFIG.serverName}
- **URL**: ${DESY_CONFIG.mcpUrl}

Please note that if you are part of an organisation, you may not have access to custom connectors at this point. Ask your org administrator.`,
    },
    {
      client: "Claude Code",
      iconUrl: "https://www.google.com/s2/favicons?domain=claude.ai&sz=64",
      remoteCommand: `claude mcp add --transport http "${DESY_CONFIG.serverName
        .replaceAll(" ", "-")
        .replaceAll(".", "_")}" ${DESY_CONFIG.mcpUrl}`,
      instructions: "Run the command in your terminal",
    },
    {
      client: "Windsurf",
      iconUrl: "https://www.google.com/s2/favicons?domain=codeium.com&sz=64",
      instructions: "Add to your Windsurf MCP configuration:",
      configJson: {
        mcpServers: {
          [DESY_CONFIG.serverName]: {
            serverUrl: DESY_CONFIG.mcpUrl,
          },
        },
      },
    },
    {
      client: "Cline",
      iconUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
      instructions:
        "Go to **MCP Servers** section → **Remote Servers** → **Edit Configuration**:",
      configJson: {
        mcpServers: {
          [DESY_CONFIG.serverName]: {
            url: DESY_CONFIG.mcpUrl,
            type: "streamableHttp",
          },
        },
      },
    },
    {
      client: "Gemini CLI",
      iconUrl: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64",
      instructions: "Add to **~/.gemini/settings.json**:",
      configJson: {
        mcpServers: {
          [DESY_CONFIG.serverName]: { httpUrl: DESY_CONFIG.mcpUrl },
        },
      },
    },
    {
      client: "ChatGPT",
      iconUrl: "https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64",
      instructions: `First, go to **Settings -> Connectors -> Advanced Settings** and turn on **Developer Mode**.

Then, in connector settings click **create**.

Fill in:
- **Name**: ${DESY_CONFIG.serverName}
- **URL**: ${DESY_CONFIG.mcpUrl}
- **Authentication**: OAuth

In a new chat ensure developer mode is turned on with the connector(s) selected.

Please note that <a href="https://platform.openai.com/docs/guides/developer-mode" target="_blank">Developer Mode</a> must be enabled.`,
    },
  ];

  return configs;
}

/**
 * Generates installation guide in markdown format
 * @param {string} mcpUrl - MCP server URL (ignored for DESY)
 * @param {string} serverName - Server display name (ignored for DESY)
 * @returns {string} Markdown formatted installation guide
 */
function generateMCPInstallationGuide(mcpUrl, serverName) {
  const configs = generateMCPConfig(mcpUrl, serverName);

  let markdown = `# MCP Server Installation Guide\n\n`;
  markdown += `**Server Name**: \`${DESY_CONFIG.serverName}\`  \n`;
  markdown += `**Server URL**: \`${DESY_CONFIG.mcpUrl}\`\n\n`;
  markdown += `**Description**: Servidor MCP para el Sistema de Diseño del Gobierno de Aragón (DESY). Proporciona acceso a componentes, patrones, guías de estilo y código.\n\n`;
  markdown += `---\n\n`;

  configs.forEach((config, index) => {
    markdown += `## ${config.client}\n\n`;

    if (config.remoteCommand) {
      markdown += `**Command:**\n\`\`\`bash\n${config.remoteCommand}\n\`\`\`\n\n`;
    }

    markdown += `**Instructions:** ${config.instructions}\n\n`;

    if (config.configJson) {
      markdown += `**Configuration:**\n\`\`\`json\n${JSON.stringify(
        config.configJson,
        null,
        2
      )}\n\`\`\`\n\n`;
    }

    if (index < configs.length - 1) {
      markdown += `---\n\n`;
    }
  });

  return markdown;
}

export { generateMCPConfig, generateMCPInstallationGuide };
