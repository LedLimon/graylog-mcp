#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const server = new Server({
    name: "simple-graylog-mcp",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "fetch_graylog_messages",
                description: "Fetch messages from Graylog using the Views Search API (Graylog 6.x compatible). Returns total_results count and message list.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Elasticsearch query string (e.g. 'level:3' for ERROR, 'level:4' for WARN, '*' for all)",
                        },
                        searchTimeRangeInSeconds: {
                            type: "number",
                            description: "Time range in seconds (e.g. 3600 = 1h, 14400 = 4h). Default: 900",
                        },
                        searchCountLimit: {
                            type: "number",
                            description: "Max number of messages to return (1-1000). Default: 50. Use 1 to only get the total count.",
                        },
                        streamId: {
                            type: "string",
                            description: "Graylog stream ID to search in. If omitted, searches across all accessible streams.",
                        },
                        fields: {
                            type: "string",
                            description: "Comma-separated list of fields to return (e.g. 'message,level,source,timestamp'). Default: all fields.",
                        },
                    },
                },
            },
            {
                name: "count_graylog_messages",
                description: "Count messages in Graylog by level for a given stream and time range. Returns counts for ERROR (level 3) and WARN (level 4).",
                inputSchema: {
                    type: "object",
                    properties: {
                        streamId: {
                            type: "string",
                            description: "Graylog stream ID to count messages in",
                        },
                        searchTimeRangeInSeconds: {
                            type: "number",
                            description: "Time range in seconds (e.g. 3600 = 1h, 14400 = 4h). Default: 3600",
                        },
                    },
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "fetch_graylog_messages") {
        return fetchGraylogMessages(request);
    }
    if (request.params.name === "count_graylog_messages") {
        return countGraylogMessages(request);
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});

function getAuth() {
    const apiToken = process.env.API_TOKEN;
    const username = process.env.GRAYLOG_USERNAME;
    const password = process.env.GRAYLOG_PASSWORD;

    if (username && password) {
        return { username, password };
    }
    if (apiToken) {
        return { username: apiToken, password: "token" };
    }
    throw new Error("No Graylog credentials configured. Set GRAYLOG_USERNAME+GRAYLOG_PASSWORD or API_TOKEN.");
}

function getBaseUrl() {
    const url = process.env.BASE_URL ?? "";
    return url.replace(/\/$/, "");
}

async function graylogRequest(method, path, data = null) {
    const config = {
        method,
        url: `${getBaseUrl()}/api${path}`,
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-By": "mcp-graylog",
        },
        auth: getAuth(),
    };
    if (data !== null) {
        config.data = data;
    }
    const response = await axios(config);
    return response.data;
}

async function executeViewsSearch(queryString, timeRangeSeconds, streamId, limit) {
    const searchType = {
        id: "st1",
        type: "messages",
        limit,
        offset: 0,
        streams: streamId ? [streamId] : [],
    };

    const search = await graylogRequest("POST", "/views/search", {
        queries: [{
            id: "q1",
            timerange: { type: "relative", range: timeRangeSeconds },
            query: { type: "elasticsearch", query_string: queryString },
            search_types: [searchType],
        }],
    });

    const job = await graylogRequest("POST", `/views/search/${search.id}/execute`, {
        parameter_bindings: {},
    });

    // Poll until done (max 30s)
    let status;
    for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        status = await graylogRequest("GET", `/views/search/status/${job.id}`);
        if (status?.execution?.done) break;
    }

    const stResult = status?.results?.q1?.search_types?.st1 ?? {};
    return {
        total_results: stResult.total_results ?? 0,
        messages: (stResult.messages ?? []).map((m) => m.message),
        effective_timerange: status?.results?.q1?.execution_stats?.effective_timerange ?? null,
        errors: status?.results?.q1?.errors ?? [],
    };
}

async function fetchGraylogMessages(request) {
    const query = request.params.arguments?.query ?? "*";
    const timeRange = request.params.arguments?.searchTimeRangeInSeconds ?? 900;
    const limit = request.params.arguments?.searchCountLimit ?? 50;
    const streamId = request.params.arguments?.streamId ?? null;

    try {
        const result = await executeViewsSearch(query, timeRange, streamId, limit);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result),
            }],
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error: ${error.message}`,
            }],
        };
    }
}

async function countGraylogMessages(request) {
    const streamId = request.params.arguments?.streamId ?? null;
    const timeRange = request.params.arguments?.searchTimeRangeInSeconds ?? 3600;

    try {
        const [errorsResult, warningsResult] = await Promise.all([
            executeViewsSearch("level:3", timeRange, streamId, 1),
            executeViewsSearch("level:4", timeRange, streamId, 1),
        ]);

        const result = {
            stream_id: streamId,
            time_range_seconds: timeRange,
            effective_timerange: errorsResult.effective_timerange,
            errors: errorsResult.total_results,
            warnings: warningsResult.total_results,
        };

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result),
            }],
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error: ${error.message}`,
            }],
        };
    }
}

const transport = new StdioServerTransport();
await server.connect(transport);
