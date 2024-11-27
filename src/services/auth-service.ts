import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Environment } from "../env";
import { Password } from "../helpers/password";
import { createUser } from "./user-service";

export async function createEmailAuth(
  userId: string,
  email: string,
  password: string
) {
  const client = new DynamoDBClient();
  const authKey = `auth#email#${email}`;

  await client.send(
    new PutItemCommand({
      TableName: Environment.tableName,
      Item: {
        PK: { S: authKey },
        SK: { S: authKey },
        AuthType: { S: "email" },
        Email: { S: email },
        HashedPassword: { S: Password.hashPassword(password) },
        CreatedAt: { S: new Date().toISOString() },
        UserId: { S: userId },
        GSI1PK: { S: `user#${userId}` },
        GSI1SK: { S: authKey },
      },
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );
}

interface GitHubUser {
  id: string;
  login: string;
  email: string | null;
}

/**
 * Validate the github login. If the account is not linked, it will create a new account.
 *
 * @param code
 */
export async function validateGithubAuth(code: string) {
  const client = new DynamoDBClient();

  // Get the access token from Github code
  const accessTokenResponse: {
    access_token: string;
    token_type: string;
    scope: string;
  } = await (
    await fetch(`https://github.com/login/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: Environment.GITHUB_CLIENT_ID,
        client_secret: Environment.GITHUB_CLIENT_SECRET,
        code,
      }),
    })
  ).json();

  console.info("Getting the access token", accessTokenResponse);
  const accessToken = accessTokenResponse.access_token;
  if (!accessToken) return null;

  const githubResponse = (await (
    await fetch(`https://api.github.com/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  ).json()) as GitHubUser;

  if (!githubResponse) return null;
  if (!githubResponse.id) return null;

  const authKey = `auth#github#${githubResponse.id}`;

  // Check if the github account is already linked
  const { Item: AuthRecord } = await client.send(
    new GetItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: authKey },
        SK: { S: authKey },
      },
    })
  );

  if (AuthRecord) {
    console.info("Github account already linked", AuthRecord);
    return AuthRecord.UserId.S!;
  }

  // Create new account
  const newUserId = await createUser({
    Name: githubResponse.login,
  });

  console.info("Creating new account", newUserId);

  await client.send(
    new PutItemCommand({
      TableName: Environment.tableName,
      Item: {
        PK: { S: authKey },
        SK: { S: authKey },
        AuthType: { S: "github" },
        Email: { S: githubResponse.email ?? "" },
        CreatedAt: { S: new Date().toISOString() },
        UserId: { S: newUserId },
        GSI1PK: { S: `user#${newUserId}` },
        GSI1SK: { S: authKey },
      },
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  return newUserId;
}

/**
 *
 * @param email
 * @param password
 * @returns user id or null if not found
 */
export async function validateEmailAuth(
  email: string,
  password: string
): Promise<string | null> {
  const client = new DynamoDBClient();
  const authKey = `auth#email#${email}`;

  const { Item } = await client.send(
    new GetItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: authKey },
        SK: { S: authKey },
      },
    })
  );

  if (!Item) return null;

  const hashedPassword = Item.HashedPassword.S!;
  if (!Password.comparePassword(hashedPassword, password)) return null;

  return Item.UserId.S!;
}
