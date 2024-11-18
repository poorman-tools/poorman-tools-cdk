import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Environment } from "../env";
import { generateUserId } from "../helpers/nanoid";

export interface UserRecordInput {
  Name: string;
  Picture?: string;
}

export interface UserRecord extends UserRecordInput {
  Id: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export function mapDataToUserData(
  data?: Record<string, AttributeValue>
): UserRecord | null {
  if (!data) return null;

  return {
    Id: data.Id.S!,
    Name: data.Name.S!,
    Picture: data.Picture?.S,
    CreatedAt: data.CreatedAt.S!,
    UpdatedAt: data.UpdatedAt.S!,
  };
}

export async function createUser(input: UserRecordInput) {
  const id = generateUserId();
  const client = new DynamoDBClient();

  await client.send(
    new PutItemCommand({
      TableName: Environment.tableName,
      Item: {
        PK: { S: `user#${id}` },
        SK: { S: "meta" },
        Id: { S: id },
        Name: { S: input.Name },
        ...(input.Picture && { Picture: { S: input.Picture } }),
        CreatedAt: { S: new Date().toISOString() },
        UpdatedAt: { S: new Date().toISOString() },
      },
      ConditionExpression:
        "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  return id;
}

export async function getUser(id: string) {
  const client = new DynamoDBClient();

  const data = await client.send(
    new GetItemCommand({
      TableName: Environment.tableName,
      Key: {
        PK: { S: `user#${id}` },
        SK: { S: "meta" },
      },
    })
  );

  return mapDataToUserData(data.Item);
}
