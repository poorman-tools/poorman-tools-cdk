import {
  createCron,
  CronOptionInput,
  deleteCron,
  getCron,
  getCronList,
  getCronLogDetail,
  getCronLogs,
  updateCron,
} from "../../services/cron-service";
import { withWorkspaceSession } from "../middleware";

function validateOption(option: CronOptionInput) {
  // Validate the option
  if (!option) {
    return { error: "Option is required" };
  }

  if (option.name.length < 3) {
    return { error: "Name must be at least 3 characters" };
  }

  if (!option.schedule) {
    return { error: "Schedule is required" };
  }

  // Check if the schedule follow AWS cron expression
  // https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html
  if (!option.schedule.expression) {
    return { error: "Cron expression is required" };
  }

  const cronExpression = option.schedule.expression;
  if (!cronExpression.startsWith("cron(")) {
    return { error: "Invalid cron expression" };
  }

  if (!cronExpression.endsWith(")")) {
    return { error: "Invalid cron expression" };
  }

  const cronParts = cronExpression.slice(5, -1).split(" ");
  if (cronParts.length !== 6) {
    return { error: "Invalid cron expression" };
  }

  // Each part must be a valid cron expression
  for (const part of cronParts) {
    if (part === "*") continue;
    if (part === "?") continue;
    if (part.match(/^\d+$/)) continue;
    if (part.match(/^\d+-\d+$/)) continue;
    if (part.match(/^\d+-\d+\/\d$/)) continue;
    if (part.match(/^\*\/\d+$/)) continue;
    return { error: "Invalid cron expression" };
  }

  if (!option.action) {
    return { error: "Action is required" };
  }

  if (option.action.type !== "fetch") {
    return { error: "Invalid action type" };
  }

  if (!option.action.url) {
    return { error: "URL is required" };
  }

  // URL must be a valid URL
  try {
    new URL(option.action.url);
  } catch {
    return { error: "Invalid URL" };
  }

  if (!option.action.method) {
    return { error: "Method is required" };
  }

  if (
    !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(option.action.method)
  ) {
    return { error: "Invalid method" };
  }

  return null;
}

export const handleCreateCron = withWorkspaceSession<CronOptionInput>(
  async ({ res, user, workspaceId, body }) => {
    if (!body) {
      return res.status(400).json({ error: "Body is required" });
    }

    const option = body;
    const validated = validateOption(option);

    if (validated?.error) {
      return res.status(400).json(validated.error);
    }

    return res.json({
      success: true,
      data: {
        Id: await createCron(workspaceId, user.Id, option),
      },
    });
  }
);

export const handleGetCronList = withWorkspaceSession<unknown>(
  async ({ res, workspaceId }) => {
    // Get list of cron jobs of the workspace
    return res.json({
      data: await getCronList(workspaceId),
    });
  }
);

export const handleGetCron = withWorkspaceSession<unknown, { cronId: string }>(
  async ({ res, params, workspaceId }) => {
    const cronId = params?.cronId;

    if (!cronId) {
      return res.status(400).json({ error: "Cron ID is required" });
    }

    const cron = await getCron(cronId);

    if (!cron) {
      return res.status(404).json({ error: "Cron not found" });
    }

    if (cron.WorkspaceId !== workspaceId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({ data: cron });
  }
);

export const handleGetCronLogs = withWorkspaceSession<
  unknown,
  { cronId: string }
>(async ({ res, params, workspaceId }) => {
  const cronId = params?.cronId;

  if (!cronId) {
    return res.status(400).json({ error: "Cron ID is required" });
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return res.status(404).json({ error: "Cron not found" });
  }

  if (cron.WorkspaceId !== workspaceId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json({ ...(await getCronLogs(cronId, 10)), cron });
});

export const handleGetCronLogDetail = withWorkspaceSession<
  unknown,
  { cronId: string; cronLogId: string }
>(async ({ res, params, workspaceId }) => {
  const cronId = params?.cronId;
  const cronLogId = params?.cronLogId;

  if (!cronId || !cronLogId) {
    return res.status(400).json({ error: "Cron ID is required" });
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return res.status(404).json({ error: "Cron not found" });
  }

  if (cron.WorkspaceId !== workspaceId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json({
    cron,
    data: await getCronLogDetail(cronId, cronLogId),
  });
});

export const handleUpdateCron = withWorkspaceSession<
  CronOptionInput,
  { cronId: string }
>(async ({ res, params, workspaceId, body }) => {
  if (!body) {
    return res.status(400).json({ error: "Body is required" });
  }

  const option = body;
  const validated = validateOption(option);

  if (validated?.error) {
    return res.status(400).json(validated.error);
  }

  // Check if cron exists
  const cronId = params?.cronId;

  if (!cronId) {
    return res.status(400).json({ error: "Cron ID is required" });
  }

  if (!option) {
    return res.status(400).json({ error: "Option is required" });
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return res.status(404).json({ error: "Cron not found" });
  }

  if (cron.WorkspaceId !== workspaceId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await updateCron(cron, option);
  return res.json({ success: true });
});

export const handleDeleteCron = withWorkspaceSession<
  unknown,
  { cronId: string }
>(async ({ res, params, workspaceId }) => {
  const cronId = params?.cronId;
  if (!cronId) {
    return res.status(400).json({ error: "Cron ID is required" });
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return res.status(404).json({ error: "Cron not found" });
  }

  if (cron.WorkspaceId !== workspaceId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await deleteCron(cron);
  return res.json({ success: true });
});
