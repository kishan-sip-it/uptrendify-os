# Canva MCP Research — verified findings (2026-10-23)

Environment: Claude CLI, `canva` MCP server **connected and authorized** (tools prefixed `mcp__canva__`). Verified live, not assumed.

## Tools verified available (from live tool registry)

Search/inspect: `search-designs` ✅ (executed), `search-folders`, `list-folder-items`, `search-brand-templates`, `get-design-dataset`, `list-comments`, `list-replies`, `get-assets`, `list-brand-kits`, `get-brand-template-dataset`.
Create/edit: `create-design`, `create-design-from-brand-template`, `create-brand-template-draft`, `generate-design`, `generate-design-structured`, `generate-image`, `edit-design`, `resize-design`, `copy-design`, `merge-designs`, `create-design-from-candidate`, `create-folder`, `move-item-to-folder`, `comment-on-design`, `reply-to-comment`, `request-outline-review`.
Import/export: `import-design-from-url`, `export-design`, `get-export-formats` ✅ (executed), `get-create-design-async-job`, `upload-asset-from-url`, `create-upload-url`, `resolve-shortlink`, raster/vector utilities (`remove-background`, `separate-image-layers`), motion import.

## Executed experiments (real results)

1. `search-designs (ownership: owned, sort: modified_descending, limit: 5)` → returned 5 owned designs with ids, titles, thumbnails, edit/view URLs. Connection works; account access confirmed.
2. `get-export-formats (design_id: DAHYdORHiDo)` → supported formats: **`pdf, jpg, png, pptx, gif, mp4`**. **SVG is NOT an available export format** on this connection.

## Consequences for this task

- The repo already contains a Canva-SVG → native-block importer (`lib/studio/import-template.ts`). Automated Canva→UpTrendifyOS import at scale would require SVG exports; **that path is not available** through the verified MCP toolset. PPTX export exists, but the repo has no PPTX→native importer; building one was rejected as out of scope and high-risk for fidelity.
- No Canva design/template content is being copied into the library. All 500 templates are original UpTrendifyOS compositions built from the native schema. This also satisfies the “no scraping proprietary Canva templates” constraint.
- Canva MCP is **not used at runtime** by the feature (the mission forbids a runtime dependency on Canva for browsing built-in templates; the bundled library is local data).
- Legitimate uses kept: visual/style research and, if needed later, generating reference mockups. UNVERIFIED: per-tool rate limits and plan-gated features (not probed beyond read-only calls to avoid consuming user quota).

## Conclusion

Build the 500-template library **entirely local and original** using the native `uptrendify-doc` schema. Documented limitation: no verified automated import path from Canva designs to fully editable native documents with the connected toolset (missing SVG export; no PPTX importer). If a future Canva API grants SVG/DOM export, `importSvgTemplate` is the ready ingestion path.
