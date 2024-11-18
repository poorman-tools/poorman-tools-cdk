import { config } from "dotenv";
config();

export const Environment = Object.freeze({
  tableName: process.env.DDB_TABLE_NAME as string,
  cronLogTableName: process.env.DDB_TABLE_NAME_CRON_LOG as string,
  roleArn: process.env.ROLE_ARN as string,
  schedulerGroupName: process.env.SCHEDULER_GROUP_NAME as string,
  lambdaExecuteCronArn: process.env.LAMBDA_EXECUTE_CRON_ARN as string,
});
