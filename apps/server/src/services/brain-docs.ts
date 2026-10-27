"use strict";

/**
 * Brain Endpoints public documentation.
 *
 * Single source of truth for both HTML and Markdown docs + the LLMS.txt
 * manifest. No API key or auth required — these docs describe the feature
 * generically.
 */

export const BRAIN_DOCS_MARKDOWN = `# wtrdb Brain Endpoints

> Publish any knowledge graph in wtrdb as a queryable REST API and MCP server. Each Brain endpoint wraps exactly one graph and exposes natural-language questions, raw Cypher passthrough, entity lookup, and graph traversal via both HTTP and the Model Context Protocol.

## Overview

A **Brain endpoint** is the external interface to a single knowledge graph. When you publish a graph as a Brain, wtrdb mints a unique API key (in the form \`brn_<48 hex chars>\`) and makes the graph available through two transports simultaneously:

- **REST API** — plain HTTP/JSON for direct programmatic access
- **MCP Server** — Streamable HTTP transport implementing the Model Context Protocol, so Claude Desktop, Cursor, Codex, and other MCP-aware agents can mount the graph as a tool source

Both transports speak to the same underlying graph. They just use different protocols.

## Publishing an endpoint

1. Open the utilities panel and click into any knowledge graph star
2. Expand the **Brain Endpoints** section
3. Click **Publish current graph**
4. Pick:
   - A friendly name
   - The **query model** (used to translate natural language into Cypher)
   - The **traversal model** (used to summarize the raw query results into a prose answer)
   - Whether to allow raw Cypher passthrough
5. Click **Publish Brain Endpoint**

Your new endpoint appears in the list with its REST URL, MCP URL, and API key. Both URLs are immediately usable.

## Authentication

Every Brain endpoint has a unique API key in the URL path:

\`\`\`
/api/brain/<apiKey>/ask
/api/brain/<apiKey>/mcp
\`\`\`

The key is generated when you publish and looks like \`brn_c022a2df94e52cc458a814cd25fb75a8a0e6350d78e448e4\`. Treat it like a secret — anyone with the key can query the graph.

You can rotate the key from the endpoint card (click **Rotate Key**) or delete the endpoint entirely.

## REST API

### POST /api/brain/:apiKey/ask

Ask a natural-language question. The server translates it to Cypher using the endpoint's query model, executes it against the graph, then summarizes the raw results into a prose answer using the endpoint's traversal model.

**Request**
\`\`\`
POST /api/brain/brn_xxx/ask
Content-Type: application/json

{
  "question": "How many entities are in this graph?"
}
\`\`\`

**Response**
\`\`\`
{
  "answer": "This graph contains a total of 799 entities.",
  "cypher": "MATCH (n) RETURN count(n) AS entityCount LIMIT 50",
  "resultCount": 1
}
\`\`\`

### POST /api/brain/:apiKey/cypher

Run a raw Cypher query directly. Only available if the endpoint was created with **Allow raw Cypher passthrough** enabled.

**Request**
\`\`\`
POST /api/brain/brn_xxx/cypher
Content-Type: application/json

{
  "query": "MATCH (n:Person) RETURN n.name LIMIT 5"
}
\`\`\`

**Response**
\`\`\`
{
  "rows": [
    { "n.name": "pawan" },
    { "n.name": "admin" },
    { "n.name": "kunal" }
  ]
}
\`\`\`

### GET /api/brain/:apiKey/schema

Return the schema of the underlying graph: entity type counts and relationship type counts.

**Response**
\`\`\`
{
  "totalEntities": 799,
  "totalRelationships": 4627,
  "entityTypes": {
    "Location": 435,
    "Concept": 222,
    "Event": 109,
    "Organization": 18,
    "Product": 6
  },
  "relationshipTypes": {
    "RELATED_TO": 1800,
    "PARTICIPATES_IN": 540,
    "MENTIONS": 320
  }
}
\`\`\`

## MCP Server

### Transport

Streamable HTTP at:

\`\`\`
POST /api/brain/:apiKey/mcp
\`\`\`

The transport is stateless — each request initializes a fresh MCP server instance. This is ideal for serverless and most agent clients.

### Tools

Each Brain endpoint exposes the following MCP tools:

- **ask** — Natural-language question → concise prose answer
  - Input: \`{ question: string }\`
  - Returns: \`{ answer, cypher, resultCount }\`

- **cypher** — Raw Cypher passthrough *(only present if \`Allow Cypher\` is enabled)*
  - Input: \`{ query: string }\`
  - Returns: \`{ rows: [...] }\`

- **entity_lookup** — Find entities by name
  - Input: \`{ name: string, fuzzy?: boolean }\`
  - Returns: \`{ matches: [{ name, label, properties }] }\`

- **traverse** — BFS from an entity, follow relationships N hops
  - Input: \`{ startEntity: string, hops?: 1|2|3, relTypes?: string[] }\`
  - Returns: \`{ nodes, edges }\`

### Resources

- **graph://schema** — Entity types, relationship types, and instance counts for the underlying graph. Same data as \`GET /api/brain/:apiKey/schema\`.

## Client setup

### Claude Desktop

Add to \`~/.claude/mcp-servers.json\`:

\`\`\`
{
  "mcpServers": {
    "my-graph": {
      "type": "http",
      "url": "https://your-host/api/brain/brn_xxx/mcp"
    }
  }
}
\`\`\`

### Cursor

Cursor supports MCP via the **Settings → MCP** pane. Add a new HTTP server with the MCP URL from your endpoint card.

### MCP Inspector

Run the official inspector:

\`\`\`
npx @modelcontextprotocol/inspector
\`\`\`

Select **Streamable HTTP** as the transport and paste the MCP URL. You'll see the tools and resources, and can call them interactively.

### Raw curl

A single MCP \`initialize\` request looks like this:

\`\`\`
curl -X POST https://your-host/api/brain/brn_xxx/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "my-client", "version": "1.0" }
    }
  }'
\`\`\`

## Model configuration

When you publish a Brain endpoint, you can pick the LLM used for each stage of the query pipeline:

- **Query Model** — handles natural-language → Cypher translation. Precision matters here; a good reasoning model will catch intent and schema nuances a simpler model misses.
- **Traversal Model** — handles raw-results → prose summarization. Usually can be a cheaper non-reasoning model since the hard work is already done.

Both settings are independent per endpoint — you can pin a premium model on one graph and a cheap one on another. If you leave either as "Inherit from app default", the endpoint uses your app-wide DIAL-KG Models preferences.

## Rate limits & expiry

Each endpoint has a default rate limit of **60 requests per minute**. You can change this when publishing or by editing the endpoint later.

Endpoints are permanent by default, but you can set an optional **expiry date** — after that timestamp the API key stops working and requests return \`401\`.

## Example flows

### Ask a question via REST

\`\`\`
curl -X POST https://your-host/api/brain/brn_xxx/ask \\
  -H "Content-Type: application/json" \\
  -d '{"question":"Who are the people in this graph?"}'
\`\`\`

### Ask a question via MCP (from an agent)

Call the \`ask\` tool with \`{ "question": "Who are the people in this graph?" }\`. The agent receives a text content block with the JSON response.

### Traverse from a known entity

Call the \`traverse\` tool with \`{ "startEntity": "Alice", "hops": 2 }\`. Returns all nodes and edges within 2 hops of Alice.

### Fetch the schema as an MCP resource

Read the \`graph://schema\` resource. Returns a JSON document with entity types and relationship types.
`;

/**
 * Minimal Markdown → HTML renderer for the subset of syntax we use:
 *  - # / ## / ###  headings
 *  - paragraphs
 *  - blockquotes (>)
 *  - unordered lists (-)
 *  - inline code (`…`) and fenced code blocks (```...```)
 *  - bold (**...**)
 *  - links ([text](url))
 *
 * No external dep required.
 */
export function markdownToHtml(md: string): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const renderInline = (text: string): string => {
    // Escape first, then apply inline markdown
    let html = escapeHtml(text);
    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2">$1</a>',
    );
    return html;
  };

  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let inCode = false;
  let codeBuffer: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (line.startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeBuffer = [];
      } else {
        out.push(
          `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
        );
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${renderInline(line.slice(2))}</h1>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      closeList();
      // Collect consecutive blockquote lines
      const buf: string[] = [line.slice(2)];
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("> ")) {
        buf.push(lines[j].slice(2));
        j++;
      }
      out.push(`<blockquote>${renderInline(buf.join(" "))}</blockquote>`);
      i = j;
      continue;
    }

    // List
    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
      i++;
      continue;
    }

    // Paragraph
    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
    i++;
  }

  closeList();
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

/**
 * LLMS.txt index manifest. Points to the full docs in multiple formats.
 * Spec: https://llmstxt.org
 */
export function buildLlmsIndex(origin: string): string {
  return `# wtrdb

> wtrdb is a living knowledge graph platform. It lets you build, federate, and query knowledge graphs from documents, then publish them as REST APIs and MCP servers for external agents.

wtrdb implements the DIAL-KG pipeline (dual-track extraction + governance adjudication + schema induction) and produces graphs backed by FalkorDB. Every graph can be published as a **Brain endpoint** — a dual-transport interface that external tools can query via HTTP/JSON or via the Model Context Protocol.

## Docs

- [Brain Endpoints](${origin}/docs/brain.md): Publish knowledge graphs as REST + MCP endpoints. Covers authentication, the four MCP tools (ask, cypher, entity_lookup, traverse), client setup for Claude Desktop, Cursor, MCP Inspector, and raw curl examples.
- [Full documentation](${origin}/llms-full.txt): Complete inline documentation for LLMs — the entire Brain docs in a single fetch.

## Optional

- [Brain HTML docs](${origin}/docs/brain): Same content as the Markdown above, rendered for humans.
`;
}

/**
 * HTML wrapper for the docs Markdown. Dark theme, matching the rest of the
 * app's aesthetic.
 */
export function buildBrainDocsHtml(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brain Endpoints — wtrdb docs</title>
<meta name="description" content="Documentation for wtrdb Brain Endpoints: publish knowledge graphs as REST + MCP servers.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, -apple-system, system-ui, sans-serif;
    background: #0B1014;
    color: #E7EEF6;
    margin: 0;
    padding: 60px 20px;
    line-height: 1.6;
  }
  .container {
    max-width: 760px;
    margin: 0 auto;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #8FA2B5;
    text-decoration: none;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 32px;
    transition: color 150ms;
  }
  .back:hover { color: #07A288; }
  h1 {
    color: #07A288;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 16px;
  }
  h2 {
    color: #E7EEF6;
    font-size: 18px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 48px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(36, 54, 69, 0.6);
  }
  h3 {
    color: #B8E52B;
    font-size: 13px;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    margin: 24px 0 8px;
  }
  p {
    color: #8FA2B5;
    font-size: 14px;
    margin: 12px 0;
  }
  strong { color: #E7EEF6; font-weight: 600; }
  a { color: #07A288; text-decoration: none; border-bottom: 1px dotted rgba(7, 162, 136, 0.4); }
  a:hover { color: #5BBE4E; border-bottom-color: #5BBE4E; }
  ul {
    padding-left: 20px;
    margin: 12px 0;
  }
  li {
    color: #8FA2B5;
    font-size: 14px;
    margin: 6px 0;
  }
  li strong { color: #E7EEF6; }
  blockquote {
    border-left: 3px solid #07A288;
    padding: 8px 20px;
    margin: 16px 0;
    background: rgba(7, 162, 136, 0.06);
    border-radius: 0 8px 8px 0;
    color: #E7EEF6;
    font-size: 15px;
    font-style: italic;
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    background: rgba(7, 162, 136, 0.12);
    border: 1px solid rgba(7, 162, 136, 0.25);
    border-radius: 4px;
    padding: 1px 6px;
    color: #B8E52B;
  }
  pre {
    background: #070B0F;
    border: 1px solid #243645;
    border-radius: 8px;
    padding: 16px 20px;
    overflow-x: auto;
    margin: 16px 0;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    color: #E7EEF6;
    font-size: 12px;
    line-height: 1.6;
  }
  .footer {
    margin-top: 80px;
    padding-top: 24px;
    border-top: 1px solid rgba(36, 54, 69, 0.4);
    font-size: 11px;
    color: #4A5A6D;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .footer a { color: #8FA2B5; border: none; }
  .footer a:hover { color: #07A288; }
</style>
</head>
<body>
<div class="container">
  <a class="back" href="/">← wtrdb</a>
  ${bodyHtml}
  <div class="footer">
    This page is also available as <a href="/docs/brain.md">Markdown</a> · <a href="/llms.txt">llms.txt</a> · <a href="/llms-full.txt">llms-full.txt</a>
  </div>
</div>
</body>
</html>`;
}
