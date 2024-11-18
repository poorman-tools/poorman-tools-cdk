import express from "express";
import cors from "cors";
import { handleAuth, handleMe } from "./handlers/auth-handler";
import {
  handleCreateCron,
  handleDeleteCron,
  handleGetCronList,
  handleGetCronLogs,
  handleUpdateCron,
} from "./handlers/cron-handler";
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.post("/v1/auth", handleAuth);
app.get("/v1/me", handleMe);

app.post("/v1/workspace/:workspaceId/cron", handleCreateCron);
app.delete("/v1/workspace/:workspaceId/cron/:cronId", handleDeleteCron);
app.get("/v1/workspace/:workspaceId/cron", handleGetCronList);
app.post("/v1/workspace/:workspaceId/cron/:cronId", handleUpdateCron);
app.get("/v1/workspace/:workspaceId/cron/:cronId/logs", handleGetCronLogs);

export const expressApp = app;
