# Paste this as your first message in the next session:

---

Continue the shadcn/ui redesign of this PWA. Phase 1 is done (commit `ed09cd4`) — design tokens, Inter font, rem spacing, flat shadows, and component updates are in place across all CSS files.

Now use the **Figma MCP** (already installed) to:

1. First, duplicate the official shadcn/ui Figma kit to my account: https://www.figma.com/community/file/1203061493325953101
2. Use `get_file_styles` to pull the exact design tokens (colors, radius, shadows, spacing)
3. Compare against our current CSS variables in `css/base.css` `:root` and fix any mismatches
4. Inspect key components (Button, Input, Card, Badge, Dialog, Toggle, Tabs) and refine our CSS to match pixel-perfectly
5. Verify RTL layout works correctly (this is a Hebrew RTL app)
6. Do a dark mode pass for all components
7. Bump the service worker cache and push when done

The plan file is at `.claude/plans/shadcn-redesign-phase2.md`. The app is a vanilla JS PWA with Firebase — no framework or bundler.

---
