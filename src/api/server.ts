import express from "express";
import cors from "cors";
import {
  handleAuth,
  handleMe,
  handleRevokeSession,
  handleSessionList,
} from "./handlers/auth-handler";
import {
  handleCreateCron,
  handleCronStatistic,
  handleDeleteCron,
  handleGetCron,
  handleGetCronList,
  handleGetCronLogDetail,
  handleGetCronLogs,
  handleUpdateCron,
} from "./handlers/cron-handler";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.post("/v1/auth", handleAuth);
app.get("/v1/auth/sessions", handleSessionList);
app.post("/v1/auth/revoke", handleRevokeSession);
app.get("/v1/me", handleMe);

/**
 * Cron API
 */
app.post("/v1/workspace/:workspaceId/cron", handleCreateCron);
app.delete("/v1/workspace/:workspaceId/cron/:cronId", handleDeleteCron);
app.get("/v1/workspace/:workspaceId/cron", handleGetCronList);
app.post("/v1/workspace/:workspaceId/cron/:cronId", handleUpdateCron);
app.get("/v1/workspace/:workspaceId/cron/:cronId", handleGetCron);
app.get("/v1/workspace/:workspaceId/cron/:cronId/logs", handleGetCronLogs);

app.get(
  "/v1/workspace/:workspaceId/cron/:cronId/logs/:cronLogId",
  handleGetCronLogDetail
);
app.get("/v1/stats/cron", handleCronStatistic);

export const expressApp = app;
