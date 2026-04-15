# Graylog MCP Server

A minimal MCP (Model Context Protocol) server in JavaScript that integrates with Graylog.

## Features

- JavaScript MCP server
- Tools: `fetch_graylog_messages` (query Graylog and return messages)

## Requirements

- Node.js 18+

## Installation

```bash
git clone git@github.com:LedLimon/graylog-mcp.git
cd graylog-mcp
npm install
```

## Configuration

Set the following environment variables so the server can connect to Graylog:

- `BASE_URL`: Graylog base URL, e.g. `https://graylog.example.com`
- `API_TOKEN`: Graylog API token (used as the username, with password `token`)

> :exclamation: Suggestion: add these variables to your respective MCP client configuration file or app. Example in **Cursor** more below.


## Use with an MCP client (Cursor/Claude Desktop)

1. Add this server to your MCP client configuration, poiting to the mcp entrypoint file (`src/index.js`). Common locations:

- Cursor: `~/.cursor/mcp.json`
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Linux): `~/.config/claude-desktop/claude_desktop_config.json`

Example config in **Cursor**:

```json
{
  "mcpServers": {
    "simple-graylog-mcp": {
      "command": "node",
      "args": [
        "/path/to/graylog-mcp/src/index.js"
      ],
      "env": {
        "BASE_URL": "http://your.graylog.server.net.br:9000",
        "API_TOKEN": "your_graylog_api_token"
      }
    }
  }
}
```
OR
```json
{
  "mcpServers": {
    "simple-graylog-mcp": {
      "command": "node",
      "args": [
        "/path/to/graylog-mcp/src/index.js"
      ],
      "env": {
        "BASE_URL": "http://your.graylog.server.net.br:9000",
        "GRAYLOG_USERNAME": "your_login",
        "GRAYLOG_PASSWORD": "your_password"
      }
    }
  }
}
```

2. After that, your client is already able to use the `fetch_graylog_messages` tool. Example prompt:

```
Search for the latest 20 error logs of the example application, given that they occurred in the last 15 minutes.
```

This should be enough for the tool to be used, but if wanted, you can also explicitly "force" the use of the tool. Example prompt:

```
Search for the latest 20 error logs of the example application, given that they occurred in the last 15 minutes.

use simple-graylog-mcp
```


## Available tools

### fetch_graylog_messages

Fetch messages from Graylog.

Parameters:

- `query` (string): Search query. Example: `level:ERROR AND service:api`.
- `searchTimeRangeInSeconds` (number, optional): Relative time range in seconds. Default: `900` (15 minutes).
- `searchCountLimit` (number, optional): Max number of messages. Default: `50`.
- `fields` (string, optional): Comma-separated fields to include. Default: `*`.

## Troubleshooting

- Ensure `BASE_URL` and `API_TOKEN` are set.
- Verify Node.js version is 18+.
- Run `npm install` if dependencies are missing.

## License

MIT
