import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Environment } from "../env";
import { Password } from "../helpers/password";

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
