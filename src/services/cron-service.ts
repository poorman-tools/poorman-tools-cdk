import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { generateCronId } from "../helpers/nanoid";
import { Environment } from "../env";
import { parseSafeJSON } from "../helpers/safe-json";

interface CronActionInput {
  type: "fetch";
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

interface CronScheduleInput {
  type: "cron";
  expression: string;
}

export interface CronOptionInput {
  name: string;
  description: string;
  schedule: CronScheduleInput;
  action: CronActionInput;
}

interface CronRecord {
  Id: string;
  Setting: CronOptionInput;
  Name: string;
  Description: string;
  WorkspaceId: string;
  FailedCount: number;
  UpdatedAt: string;
  CreatedAt: string;
  ScheduleId: string;
  Status: string;
}

function mapCronRecord(item: any): CronRecord {
  return {
    Id: item.Id.S,
    Setting: JSON.parse(item.Setting.S ?? "{}"),
    Name: item.Name.S,
    Description: item.Description.S,
    CreatedAt: item.CreatedAt.S,
    UpdatedAt: item.UpdatedAt.S,
    FailedCount: Number(item.FailedCount.N),
    WorkspaceId: item.WorkspaceId.S,
    ScheduleId: item.ScheduleId.S,
    Status: item.CronStatus.S,
  };
}

export async function createCron(
  workspaceId: string,
  userId: string,
  option: CronOptionInput
) {
  const client = new DynamoDBClient();
  const cronId = generateCronId();

  const scheduleName = `pmt-schedule-${cronId}`;

  await client.send(
    new PutItemCommand({
      TableName: Environment.tableName,
      Item: {
        PK: { S: `cron#${cronId}` },
        SK: { S: `cron#${cronId}` },
        GSI1PK: { S: `workspace#${workspaceId}` },
        GSI1SK: { S: `cron#${cronId}` },

        Id: { S: cronId },
        WorkspaceId: { S: workspaceId },
        Name: { S: option.name },
        Description: { S: option.description },
        Setting: { S: JSON.stringify(option) },
        CronStatus: { S: "ENABLED" }, // ENABLED, DISABLED, TOO_MANY_FAIL
        CreatedBy: { S: userId },
        CreatedAt: { S: new Date().toISOString() },
        UpdatedAt: { S: new Date().toISOString() },
        ScheduleId: { S: scheduleName },
        FailedCount: { N: "0" },
      },
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  const scheduleClient = new SchedulerClient();
  await scheduleClient.send(
    new CreateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: option.schedule.expression,
      State: "ENABLED",
      Description: option.description,
      GroupName: Environment.schedulerGroupName,
      FlexibleTimeWindow: {
        Mode: "OFF",
      },
      Target: {
        Arn: Environment.lambdaExecuteCronArn,
        Input: JSON.stringify({ cronId }),
        RoleArn: Environment.roleArn,
      },
    })
  );

  return cronId;
}

export async function updateCron(cron: CronRecord, option: CronOptionInput) {
  const client = new DynamoDBClient();

  await client.send(
    new UpdateItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cron.Id}` },
        SK: { S: `cron#${cron.Id}` },
      },
      UpdateExpression:
        "SET Setting = :setting, #Name = :name, Description = :description, UpdatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":setting": { S: JSON.stringify(option) },
        ":name": { S: option.name },
        ":description": { S: option.description },
        ":updatedAt": { S: new Date().toISOString() },
      },
      ExpressionAttributeNames: {
        "#Name": "Name",
      },
    })
  );

  const scheduleClient = new SchedulerClient();
  await scheduleClient.send(
    new UpdateScheduleCommand({
      Name: cron.ScheduleId,
      ScheduleExpression: option.schedule.expression,
      State: cron.Status === "ENABLED" ? "ENABLED" : "DISABLED",
      Description: option.description,
      GroupName: Environment.schedulerGroupName,
      FlexibleTimeWindow: {
        Mode: "OFF",
      },
      Target: {
        Arn: Environment.lambdaExecuteCronArn,
        Input: JSON.stringify({ cronId: cron.Id }),
        RoleArn: Environment.roleArn,
      },
    })
  );
}

export async function deleteCron(cron: CronRecord) {
  const client = new DynamoDBClient();

  try {
    const scheduleClient = new SchedulerClient();
    await scheduleClient.send(
      new DeleteScheduleCommand({
        GroupName: Environment.schedulerGroupName,
        Name: cron.ScheduleId,
      })
    );
  } catch (e) {
    console.log("Failed to delete schedule", e);
  }

  await client.send(
    new DeleteItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cron.Id}` },
        SK: { S: `cron#${cron.Id}` },
      },
    })
  );
}

export async function updateCronFailCount(cronId: string) {
  const client = new DynamoDBClient();

  await client.send(
    new UpdateItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cronId}` },
        SK: { S: `cron#${cronId}` },
      },
      UpdateExpression: "SET FailedCount = FailedCount + :inc",
      ExpressionAttributeValues: {
        ":inc": { N: "1" },
      },
    })
  );
}

export async function updateCronResetFailCount(cronId: string) {
  const client = new DynamoDBClient();

  await client.send(
    new UpdateItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cronId}` },
        SK: { S: `cron#${cronId}` },
      },
      UpdateExpression: "SET FailedCount = :inc",
      ExpressionAttributeValues: {
        ":inc": { N: "0" },
      },
    })
  );
}

export async function disableFailedCron(cron: CronRecord) {
  const client = new DynamoDBClient();

  const scheduleClient = new SchedulerClient();
  await scheduleClient.send(
    new DeleteScheduleCommand({
      GroupName: Environment.schedulerGroupName,
      Name: cron.ScheduleId,
    })
  );

  await client.send(
    new UpdateItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cron.Id}` },
        SK: { S: `cron#${cron.Id}` },
      },
      UpdateExpression: "SET CronStatus = :status",
      ExpressionAttributeValues: {
        ":status": { S: "TOO_MANY_FAIL" },
      },
    })
  );
}

export async function getCron(cronId: string) {
  const client = new DynamoDBClient();

  const { Item } = await client.send(
    new GetItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `cron#${cronId}` },
        SK: { S: `cron#${cronId}` },
      },
    })
  );

  if (!Item) return null;
  return mapCronRecord(Item);
}

export async function getCronList(workspaceId: string) {
  const client = new DynamoDBClient();

  const { Items } = await client.send(
    new QueryCommand({
      TableName: Environment.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `workspace#${workspaceId}` },
        ":sk": { S: "cron#" },
      },
    })
  );

  return (Items ?? []).map(mapCronRecord) as CronRecord[];
}

export async function createCronLog(
  workspaceId: string,
  cronId: string,
  success: boolean,
  log: {
    action?: CronActionInput;
    startedAt: string;
    status: string;
    body: string;
    duration?: number;
  }
) {
  const client = new DynamoDBClient();

  // Rention for 2 days
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 2;

  // Trim the body to 10,000 characters.

  await client.send(
    new PutItemCommand({
      TableName: Environment.cronLogTableName,
      Item: {
        PK: { S: `cronlog#${cronId}` },
        SK: { S: `log#${log.startedAt}` },
        GSI1PK: { S: `workspace#${workspaceId}` },
        GSI2SK: { S: `cronlog#${cronId}#${log.startedAt}` },
        StartedAt: { S: log.startedAt },
        CronStatus: { S: log.status },
        Success: { BOOL: success },
        CronDuration: { N: String(log.duration ?? 0) },
        Content: { S: log.body.substring(0, 10000) },
        CronAction: { S: log.action ? JSON.stringify(log.action) : "{}" },
        TTL: { N: String(ttl) },
      },
    })
  );
}

export async function getCronLogs(
  cronId: string,
  limit: number,
  lastEvaluatedKey?: string
) {
  const client = new DynamoDBClient();

  const { Items, LastEvaluatedKey } = await client.send(
    new QueryCommand({
      TableName: Environment.cronLogTableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: `cronlog#${cronId}` },
      },
      Limit: limit,
      ScanIndexForward: false,
      ProjectionExpression: "SK, CronStatus, Success, CronDuration, StartedAt",
      ExclusiveStartKey: lastEvaluatedKey
        ? {
            PK: { S: `cronlog#${cronId}` },
            SK: { S: lastEvaluatedKey },
          }
        : undefined,
    })
  );

  return {
    cursor: LastEvaluatedKey?.SK.S,
    data: Items?.map((item) => ({
      Id: item.SK.S,
      Status: item.CronStatus?.S,
      Success: item.Success.BOOL,
      Duration: Number(item.CronDuration?.N),
      StartedAt: item.StartedAt?.S,
    })),
  };
}

export async function getCronLogDetail(cronId: string, logId: string) {
  const client = new DynamoDBClient();

  const { Item } = await client.send(
    new GetItemCommand({
      TableName: Environment.cronLogTableName,
      Key: {
        PK: { S: `cronlog#${cronId}` },
        SK: { S: `log#${logId}` },
      },
    })
  );

  if (!Item) return null;

  return {
    Id: Item.SK.S,
    Status: Item.CronStatus?.S,
    Success: Item.Success.BOOL,
    Duration: Number(Item.CronDuration?.N),
    StartedAt: Item.StartedAt?.S,
    Content: Item.Content?.S,
    Action: parseSafeJSON(Item.CronAction?.S),
  };
}
