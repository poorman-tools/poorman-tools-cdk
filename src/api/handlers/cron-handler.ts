import {
  createCron,
  CronOptionInput,
  deleteCron,
  getCron,
  getCronList,
  getCronLogDetail,
  getCronLogs,
  getCronStatistic,
  updateCron,
} from "../../services/cron-service";
import {
  APIFailedResponse,
  APISuccessResponse,
  withErrorHandler,
  withWorkspaceSession,
} from "../middleware";

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
  async ({ user, workspaceId, body }) => {
    if (!body) {
      return new APIFailedResponse("Body is required", 400);
    }

    const option = body;
    const validated = validateOption(option);

    if (validated?.error) {
      return new APIFailedResponse(validated.error, 400);
    }

    return new APISuccessResponse({
      Id: await createCron(workspaceId, user.Id, option),
    });
  }
);

export const handleGetCronList = withWorkspaceSession<unknown>(
  async ({ workspaceId }) => {
    // Get list of cron jobs of the workspace
    return new APISuccessResponse(await getCronList(workspaceId));
  }
);

export const handleGetCron = withWorkspaceSession<unknown, { cronId: string }>(
  async ({ params, workspaceId }) => {
    const cronId = params?.cronId;

    if (!cronId) {
      return new APIFailedResponse("Cron ID is required", 400);
    }

    const cron = await getCron(cronId);

    if (!cron) {
      return new APIFailedResponse("Cron not found", 404);
    }

    if (cron.WorkspaceId !== workspaceId) {
      return new APIFailedResponse("Forbidden", 403);
    }

    return new APISuccessResponse(cron);
  }
);

export const handleGetCronLogs = withWorkspaceSession<
  unknown,
  { cronId: string }
>(async ({ req, params, workspaceId }) => {
  const cronId = params?.cronId;
  const limit = Number(req.query.limit ?? 20);
  const cursor = (req.query?.cursor as string) ?? undefined;

  if (!cronId) {
    return new APIFailedResponse("Cron ID is required", 400);
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return new APIFailedResponse("Cron not found", 404);
  }

  if (cron.WorkspaceId !== workspaceId) {
    return new APIFailedResponse("Forbidden", 403);
  }

  return new APISuccessResponse({
    ...(await getCronLogs(cronId, limit, cursor)),
    cron,
  });
});

export const handleGetCronLogDetail = withWorkspaceSession<
  unknown,
  { cronId: string; cronLogId: string }
>(async ({ params, workspaceId }) => {
  const cronId = params?.cronId;
  const cronLogId = params?.cronLogId;

  if (!cronId || !cronLogId) {
    return new APIFailedResponse("Cron ID is required", 400);
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return new APIFailedResponse("Cron not found", 404);
  }

  if (cron.WorkspaceId !== workspaceId) {
    return new APIFailedResponse("Forbidden", 403);
  }

  return new APISuccessResponse({
    cron,
    log: await getCronLogDetail(cronId, cronLogId),
  });
});

export const handleUpdateCron = withWorkspaceSession<
  CronOptionInput,
  { cronId: string }
>(async ({ params, workspaceId, body }) => {
  if (!body) {
    return new APIFailedResponse("Body is required", 400);
  }

  const option = body;
  const validated = validateOption(option);

  if (validated?.error) {
    return new APIFailedResponse(validated.error, 400);
  }

  // Check if cron exists
  const cronId = params?.cronId;

  if (!cronId) {
    return new APIFailedResponse("Cron ID is required", 400);
  }

  if (!option) {
    return new APIFailedResponse("Option is required", 400);
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return new APIFailedResponse("Cron not found", 404);
  }

  if (cron.WorkspaceId !== workspaceId) {
    return new APIFailedResponse("Forbidden", 403);
  }

  await updateCron(cron, option);
  return new APISuccessResponse({ success: true });
});

export const handleDeleteCron = withWorkspaceSession<
  unknown,
  { cronId: string }
>(async ({ params, workspaceId }) => {
  const cronId = params?.cronId;
  if (!cronId) {
    return new APIFailedResponse("Cron ID is required", 400);
  }

  const cron = await getCron(cronId);

  if (!cron) {
    return new APIFailedResponse("Cron not found", 404);
  }

  if (cron.WorkspaceId !== workspaceId) {
    return new APIFailedResponse("Forbidden", 403);
  }

  await deleteCron(cron);
  return new APISuccessResponse({ success: true });
});

export const handleCronStatistic = withErrorHandler(async () => {
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1))
    .toISOString()
    .split("T")[0];

  const last30day = new Date(new Date().setDate(new Date().getDate() - 31))
    .toISOString()
    .split("T")[0];

  return new APISuccessResponse(await getCronStatistic(last30day, yesterday));
});
