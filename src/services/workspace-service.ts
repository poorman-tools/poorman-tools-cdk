import {
  BatchGetItemCommand,
  DynamoDBClient,
  QueryCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { generateWorkspaceId } from "../helpers/nanoid";
import { Environment } from "../env";
import { mapDataToUserData } from "./user-service";

export async function createWorkspace(userId: string, name: string) {
  const workspaceId = generateWorkspaceId();
  const client = new DynamoDBClient();

  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: Environment.tableName,
            Item: {
              PK: { S: `workspace#${workspaceId}` },
              SK: { S: "meta" },
              Id: { S: workspaceId },
              Name: { S: name },
              CreatedAt: { S: new Date().toISOString() },
              UpdatedAt: { S: new Date().toISOString() },
            },
            ConditionExpression:
              "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: Environment.tableName,
            Item: {
              PK: { S: `user#${userId}` },
              SK: { S: `workspace#${workspaceId}` },
              GSI1PK: { S: `workspace#${workspaceId}` },
              GSI1SK: { S: `user#${userId}` },
              WorkspaceId: { S: workspaceId },
              WorkspaceName: { S: name },
              UserId: { S: userId },
              Role: { S: "owner" },
              CreatedAt: { S: new Date().toISOString() },
              UpdatedAt: { S: new Date().toISOString() },
            },
            ConditionExpression:
              "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    })
  );

  return workspaceId;
}

export async function getWorkspaceByUser(userId: string) {
  const client = new DynamoDBClient();

  const { Items } = await client.send(
    new QueryCommand({
      TableName: Environment.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `user#${userId}` },
        ":sk": { S: "workspace#" },
      },
    })
  );

  return Items?.map((item) => ({
    Id: item.WorkspaceId.S!,
    Name: item.WorkspaceName?.S!,
  }));
}

export async function getWorkspaceUsers(workspaceId: string) {
  const client = new DynamoDBClient();

  const { Items } = await client.send(
    new QueryCommand({
      TableName: Environment.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `workspace#${workspaceId}` },
        ":sk": { S: "user#" },
      },
    })
  );

  // Get batch of users from workspace
  const userIds = Items?.map((item) => item.UserId.S!);

  // Make a batch request of user
  const { Responses } = await client.send(
    new BatchGetItemCommand({
      RequestItems: {
        [Environment.tableName]: {
          Keys: userIds?.map((userId) => ({
            PK: { S: `user#${userId}` },
            SK: { S: "meta" },
          })),
        },
      },
    })
  );

  return Responses?.[Environment.tableName].map(mapDataToUserData);
}
