import { config } from "dotenv";

config({
  path: `.env.${process.env.POORMAN_ENV}`,
});

export const Environment = Object.freeze({
  tableName: process.env.DDB_TABLE_NAME as string,
  cronLogTableName: process.env.DDB_TABLE_NAME_CRON_LOG as string,
  roleArn: process.env.ROLE_ARN as string,
  schedulerGroupName: process.env.SCHEDULER_GROUP_NAME as string,
  lambdaExecuteCronArn: process.env.LAMBDA_EXECUTE_CRON_ARN as string,

  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID!,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET!,
});
