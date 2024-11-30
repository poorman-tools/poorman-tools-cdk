import {
  DynamoDBClient,
  PutItemCommand,
  BatchGetItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { Environment } from "../env";
import { generateSessionId } from "../helpers/nanoid";
import { mapDataToUserData, UserRecord } from "./user-service";

export interface UserSession {
  user: UserRecord;
  role: string;
}

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string; country?: string },
  expireInSecond: number = 86400
) {
  const client = new DynamoDBClient();
  const sessionId = "uz_" + userId + "." + generateSessionId();
  const ttlInSeconds = Math.floor(Date.now() / 1000) + expireInSecond;

  await client.send(
    new PutItemCommand({
      TableName: Environment.tableName,
      Item: {
        PK: { S: `session#${sessionId}` },
        SK: { S: `session#${sessionId}` },
        GSI1PK: { S: `user#${userId}` },
        GSI1SK: { S: `session#${sessionId}` },
        SessionId: { S: sessionId },
        UserId: { S: userId },
        TTL: { N: ttlInSeconds.toString() },
        CreatedAt: { S: new Date().toISOString() },
        LastUsedTimestamp: { N: Date.now().toString() },
        IP: { S: meta.ip ?? "" },
        UserAgent: { S: meta.userAgent ?? "" },
        Country: { S: meta.country ?? "" },
      },
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );

  return sessionId;
}

/**
 * Getting user data from session token. If specified workspaceId,
 * it will check if the user has permission in that workspace.
 *
 * This function will do one batch query for efficiency.
 *
 * @param sessionToken
 * @param workspaceId
 * @returns
 */
export async function validateSession(
  sessionToken: string,
  workspaceId?: string
): Promise<UserSession | null> {
  // Session ID must begin with "uz_"
  if (!sessionToken.startsWith("uz_")) return null;
  const [userId] = sessionToken.slice(3).split(".");

  // Validate session ID
  const client = new DynamoDBClient();

  const { Responses } = await client.send(
    new BatchGetItemCommand({
      RequestItems: {
        [Environment.tableName]: {
          Keys: [
            {
              PK: { S: `session#${sessionToken}` },
              SK: { S: `session#${sessionToken}` },
            },
            {
              PK: { S: `user#${userId}` },
              SK: { S: `meta` },
            },
            ...(workspaceId
              ? [
                  {
                    PK: { S: `user#${userId}` },
                    SK: { S: `workspace#${workspaceId}` },
                  },
                ]
              : []),
          ],
        },
      },
    })
  );

  if (!Responses) return null;

  const items = Responses[Environment.tableName];
  if (!items) return null;

  // Check if session exists
  const sessionRecord = items.find(
    (item) => item.PK.S === `session#${sessionToken}`
  );
  if (!sessionRecord) return null;

  // Checking this user has permission in specified workspace
  const workspaceRecord = items.find(
    (item) =>
      item.PK.S === `user#${userId}` && item.SK.S === `workspace#${workspaceId}`
  );
  if (workspaceId && !workspaceRecord) return null;

  // Finding the user detail data
  const userRecord = items.find(
    (item) => item.PK.S === `user#${userId}` && item.SK.S === "meta"
  );

  if (!userRecord) return null;

  return {
    user: mapDataToUserData(userRecord)!,
    role: workspaceRecord?.Role.S!,
  };
}

export async function getAllSessions(userId: string) {
  const client = new DynamoDBClient();
  const { Items } = await client.send(
    new QueryCommand({
      TableName: Environment.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `user#${userId}` },
        ":sk": { S: "session#" },
      },
    })
  );

  if (!Items) return [];

  return Items.map((item) => ({
    SessionId: item.PK.S!.replace("session#", ""),
    CreatedAt: item.CreatedAt.S!,
    LastUsedTimestamp: item.LastUsedTimestamp.N!,
    UserAgent: item.UserAgent.S!,
  }));
}

export async function revokeSession(sessionToken: string) {
  const client = new DynamoDBClient();

  await client.send(
    new DeleteItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `session#${sessionToken}` },
        SK: { S: `session#${sessionToken}` },
      },
    })
  );
}

export async function revokeSuffixSession(
  userId: string,
  suffixSessionToken: string
) {
  const client = new DynamoDBClient();
  const sessionList = await getAllSessions(userId);
  const matchedSessions = sessionList.filter((s) =>
    s.SessionId.endsWith(suffixSessionToken)
  );

  for (const matchedSession of matchedSessions) {
    revokeSession(matchedSession.SessionId);
  }
}
