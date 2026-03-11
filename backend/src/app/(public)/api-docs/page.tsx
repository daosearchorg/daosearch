import { Badge } from "@/components/ui/badge";
import { openApiSpec } from "@/lib/openapi";
import type { Metadata } from "next";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = {
  title: "API Documentation - DaoSearch",
  description: "Public REST API documentation for DaoSearch — search web novels, rankings, booklists, and more.",
};

type Param = {
  name: string;
  in: string;
  required?: boolean;
  schema: Record<string, unknown>;
  description?: string;
};

type PathMethod = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Param[];
  responses: Record<string, { description: string }>;
};

function buildCurl(path: string, params: Param[]): string {
  const base = "https://daosearch.io/api/v1";
  const queryParams = params
    .filter((p) => p.in === "query")
    .slice(0, 2)
    .map((p) => {
      const val = p.schema.default ?? (p.schema.type === "integer" ? "1" : p.schema.type === "string" ? (p.schema.enum as string[])?.[0] ?? "example" : "1");
      return `${p.name}=${val}`;
    });

  let url = `${base}${path}`;
  url = url.replace(/\{id\}/, "161155");
  if (queryParams.length > 0) url += `?${queryParams.join("&")}`;

  return `curl "${url}"`;
}

function buildExampleResponse(path: string, method: PathMethod): string {
  const hasItems = method.responses["200"]?.description?.toLowerCase().includes("paginated");
  if (hasItems) {
    return JSON.stringify({ data: ["..."], pagination: { page: 1, totalPages: 10, total: 200 } }, null, 2);
  }
  if (path.includes("{id}") && !path.includes("/")) {
    return JSON.stringify({ data: { id: 161155, title: "...", titleTranslated: "...", stats: {} } }, null, 2);
  }
  return JSON.stringify({ data: "..." }, null, 2);
}

export default function ApiDocsPage() {
  const spec = openApiSpec;
  const paths = Object.entries(spec.paths) as unknown as [string, { get: PathMethod }][];

  const groups = new Map<string, { path: string; method: PathMethod }[]>();
  for (const [path, methods] of paths) {
    const m = methods.get;
    const tag = m.tags[0] || "Other";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push({ path, method: m });
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">API</h1>
        <p className="text-sm sm:text-base text-muted-foreground text-center max-w-lg">
          Public read-only REST API. No auth required. Rate limited to 30 req/min.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5">
            <span className="text-xs sm:text-sm text-muted-foreground">Base URL</span>
            <code className="text-sm font-mono">https://daosearch.io/api/v1</code>
          </div>
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5">
            <span className="text-xs sm:text-sm text-muted-foreground">OpenAPI Spec</span>
            <a href="/api/v1/openapi.json" className="text-sm font-mono text-primary hover:underline">/api/v1/openapi.json</a>
          </div>
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-1.5">
            <span className="text-xs sm:text-sm text-muted-foreground">MCP Server</span>
            <code className="text-sm font-mono">https://daosearch.io/api/mcp</code>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Pagination</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Paginated endpoints accept <code className="text-xs bg-muted px-1 py-0.5 rounded">page</code> and
          an optional <code className="text-xs bg-muted px-1 py-0.5 rounded">limit</code> parameter (1-50) to control how many items are returned per page.
          When <code className="text-xs bg-muted px-1 py-0.5 rounded">limit</code> is set, pagination metadata adjusts accordingly — for example,
          <code className="text-xs bg-muted px-1 py-0.5 rounded">?page=2&limit=10</code> returns items 11-20.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Response Format</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground">Success</span>
            <pre className="text-xs font-mono overflow-x-auto">
{`{
  "data": { ... },
  "pagination": {
    "page": 1,
    "totalPages": 10,
    "total": 200
  }
}`}
            </pre>
          </div>
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground">Error</span>
            <pre className="text-xs font-mono overflow-x-auto">
{`{
  "error": {
    "code": "NOT_FOUND",
    "message": "Book not found"
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      {Array.from(groups.entries()).map(([tag, endpoints]) => (
        <section key={tag} className="flex flex-col gap-4">
          <h2 className="text-base sm:text-lg font-medium">{tag}</h2>
          <div className="flex flex-col gap-3">
            {endpoints.map(({ path, method }) => {
              const curl = buildCurl(path, method.parameters);
              const exampleResponse = buildExampleResponse(path, method);
              return (
                <div key={path} id={method.operationId} className="rounded-lg border bg-card">
                  <div className="p-4 sm:p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[11px] font-semibold">
                        GET
                      </Badge>
                      <code className="text-sm font-mono font-medium">/v1{path}</code>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">{method.description}</p>

                    {method.parameters.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Parameters</span>
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {method.parameters.map((param) => (
                                <tr key={param.name} className="border-b last:border-0">
                                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap align-top">
                                    {param.name}
                                    {param.required && <span className="text-destructive ml-0.5">*</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs text-muted-foreground align-top">
                                    <span className="text-foreground/50">{String(param.schema.type)}</span>
                                    {Array.isArray(param.schema.enum) && (
                                      <span className="ml-1 text-foreground/40">
                                        [{(param.schema.enum as string[]).join(", ")}]
                                      </span>
                                    )}
                                    {param.description && (
                                      <span className="ml-1.5">{param.description}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Example</span>
                        <CopyButton text={curl} />
                      </div>
                      <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">{curl}</pre>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Response</span>
                      <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">{exampleResponse}</pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">AI Integrations</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground">ChatGPT</span>
            <p className="text-sm text-muted-foreground">Custom GPT with access to all DaoSearch endpoints.</p>
            <a
              href="https://chatgpt.com/g/g-69b1c31a6d00819196df8e07dc4591a9-daosearch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Open in ChatGPT
            </a>
          </div>
          <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground">Discord Bot</span>
            <p className="text-sm text-muted-foreground">Slash commands for search, rankings, reviews, and more.</p>
            <a href="/discord" className="text-sm text-primary hover:underline">
              Learn more
            </a>
          </div>
        </div>
      </section>

      <section id="mcp-server" className="flex flex-col gap-4 scroll-mt-20">
        <h2 className="text-base sm:text-lg font-medium">MCP Server</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          DaoSearch exposes an MCP (Model Context Protocol) server for AI agents.
          It uses the Streamable HTTP transport and provides all 13 tools from the API above.
        </p>
        <div className="rounded-lg border bg-card p-4 sm:p-5 flex flex-col gap-2">
          <span className="text-xs sm:text-sm text-muted-foreground">Claude Desktop Config</span>
          <pre className="text-xs font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "daosearch": {
      "type": "streamable-http",
      "url": "https://daosearch.io/api/mcp"
    }
  }
}`}
          </pre>
        </div>
      </section>
    </div>
  );
}
