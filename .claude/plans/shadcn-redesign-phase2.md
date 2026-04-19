# shadcn/ui Redesign — Phase 2: Figma MCP Integration

## Current State (completed in Phase 1)
- shadcn/ui design tokens are in place (HSL colors, Inter font, rem spacing, 0.5rem radius)
- base.css, mobile.css, exam.css, settings.css all updated
- 100+ hardcoded color values replaced with CSS variables
- Service worker cache bumped to v20
- Committed and pushed at `ed09cd4`

## MCP Fix (completed)
- Cleared stale `figma` entry from `~/.claude/mcp-needs-auth-cache.json`
- Switched MCP config to env-based API key (`FIGMA_API_KEY` via `env` field)
- Updated both `~/.claude/.mcp.json` and VS Code `mcp.json`
- Package: `figma-developer-mcp` v0.7.1 (tools: `get_figma_data`, `download_figma_images`)
- **Requires restart** of Claude Code / VS Code to reconnect

## Prerequisite: Duplicate Figma Community File
- Community URL: https://www.figma.com/community/file/1203061493325953101
- Must duplicate to own Figma account — community files can't be accessed via API
- After duplicating, the new URL contains a `fileKey` to use with `get_figma_data`

## Phase 2 Steps

### Step 1: Pull shadcn/ui Figma tokens
- Call `get_figma_data({ fileKey, depth: 1 })` for top-level structure
- Drill into token/styles pages for exact color, spacing, radius, shadow, typography values

### Step 2: Compare & refine tokens
Cross-reference Figma tokens against `css/base.css` `:root` (lines 1-87) and `body.dark` (lines 89-120):
- Verify radius, shadow, color palette values match exactly
- Check font sizes, line heights, letter spacing
- Validate dark mode colors
- Current palette is "zinc" — verify against Figma source

### Step 3: Component-by-component refinement
For each: inspect Figma node → compare CSS → fix mismatches

| Component | CSS Location | Key Issues |
|-----------|-------------|------------|
| **Button** | base.css ~1611 | Missing secondary/outline variants; hover uses opacity instead of color shift |
| **Input** | base.css ~1505 | Check focus ring pattern; add disabled state |
| **Card** | base.css ~5007 | Verify padding against Figma |
| **Badge** | base.css ~4835 | Hardcoded `11px`, `5px 10px` — convert to tokens |
| **Dialog** | base.css ~4991 | Verify backdrop blur, max-width |
| **Toggle** | settings.css ~39 | RTL handling for slider position |
| **Tabs** | base.css ~1211 | Verify muted background tokens |

### Step 4: RTL logical properties
Convert ~45 physical direction properties to CSS logical properties:
- `border-left` → `border-inline-start`
- `padding-right` → `padding-inline-end`
- `margin-left` → `margin-inline-start`
- Exception: `input[type="datetime-local"]` keeps `direction: ltr`

### Step 5: Dark mode pass
- Fix hardcoded colors that don't adapt (badge, delete button, `rgba()` shadows)
- Verify contrast ratios for muted text on dark backgrounds
- Test all components in `body.dark`

### Step 6: Cleanup remaining hardcoded colors
- Pomodoro timer: `#22c55e`, `#ef4444` → `var(--success)`, `var(--danger)`
- Priority borders: hardcoded hex → CSS variables
- Various `rgba()` hover states → `hsl(... / alpha)` or tokens

### Step 7: Finalize
- Bump service worker cache: `countdown-push-v20` → `countdown-push-v21`
- Test locally in both light/dark mode, verify RTL
- Commit and push

## Files to modify
- `css/base.css` — main component styles (7700+ lines)
- `css/mobile.css` — mobile responsive overrides
- `css/exam.css` — exam mode overlay
- `css/settings.css` — settings popover
- `service-worker.js` — bump cache after changes
