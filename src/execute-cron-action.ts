import { Handler } from "aws-lambda";
import {
  createCronLog,
  disableCron,
  getCron,
  updateCronFailCount,
  updateCronResetFailCount,
} from "./services/cron-service";

// Get type for lambda that got called from scheduled event
// https://docs.aws.amazon.com/lambda/latest/dg/services-cloudwatchevents-expressions.html
export const handler: Handler = async (event: { cronId: string }, context) => {
  console.log("Event: ", event);

  if (!event.cronId) {
    throw new Error("Missing cronId");
  }

  // Get the crontime
  const startedDate = new Date().toISOString();

  // Get the cronId from the event
  const cronId = event.cronId;
  const cron = await getCron(cronId);

  if (!cron) {
    throw new Error("Cron not found");
  }

  if (cron.FailedCount >= 1440) {
    // Disable the cron
    await disableCron(cron, "TOO_MANY_FAIL");
    return {
      statusCode: 200,
      body: JSON.stringify("Hello, world!"),
    };
  }

  // Perform the action
  const startedTime = performance.now();
  let success = false;
  let status = "";
  let body = "";

  try {
    const response = await fetch(cron.Setting.action.url, {
      signal: AbortSignal.timeout(5000),
      method: cron.Setting.action.method ?? "GET",
      body: cron.Setting.action.body,
      headers: cron.Setting.action.headers,
    });

    status = response.status.toString();
    success = response.ok;
    body = await response.text();
  } catch (e) {
    if (e instanceof DOMException) {
      status = "Timeout";
    }
  }

  const endedTime = performance.now();

  if (!success) {
    // Update failed count
    await updateCronFailCount(cronId);
  } else {
    if (cron.FailedCount > 0) {
      // Reset failed count
      await updateCronResetFailCount(cronId);
    }
  }

  // Writing some logs
  await createCronLog(cron.WorkspaceId, cronId, success, {
    body,
    status,
    startedAt: startedDate,
    duration: Number(endedTime - startedTime),
    action: cron.Setting.action,
  });

  return {
    statusCode: 200,
    body: JSON.stringify("Hello, world!"),
  };
};
