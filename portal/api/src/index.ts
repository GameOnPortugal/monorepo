import { buildApp } from "./app";

const port = parseInt(process.env.PORT ?? "3001", 10);
const app = buildApp();

console.log(`portal-api listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
