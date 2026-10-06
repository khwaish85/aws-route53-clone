"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};
type ModelContext = { registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void> };

export function WebMCPBridge() {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: ModelTool) => Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({
      name: "list_hosted_zones",
      title: "List hosted zones",
      description: "Search the signed-in user's Route 53 hosted zones.",
      inputSchema: { type: "object", properties: { search: { type: "string" } }, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input) { return api(`/zones?search=${encodeURIComponent(String(input.search || ""))}&page_size=100`); },
    });
    void register({
      name: "create_hosted_zone",
      title: "Create hosted zone",
      description: "Create a public or private Route 53 hosted zone and return the saved zone.",
      inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, zone_type: { type: "string", enum: ["public", "private"] } }, required: ["name"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) { return api("/zones", { method: "POST", body: JSON.stringify({ name: input.name, description: input.description || "", zone_type: input.zone_type || "public" }) }); },
    });
    return () => lifecycle.abort();
  }, []);
  return null;
}
