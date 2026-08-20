import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Discord's in-app browser (Android/iOS webview) is the primary target —
    // see docs/plans/03-portal.md "Mobile" — and dev-server HMR over a LAN IP
    // needs the host bound explicitly rather than localhost-only.
    host: true,
  },
});
