import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as certManager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as log from "aws-cdk-lib/aws-logs";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { Construct } from "constructs";
import { PoormanToolApi } from "./poormantools-api";

const PREFIX = "pmt";
const API_DOMAIN_NAME = "api.poorman.tools";
export class PoormantoolsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiHostedZone = new route53.HostedZone(
      this,
      `${PREFIX}-hosted-zone`,
      {
        zoneName: "poorman.tools",
      }
    );

    const apiCertificate = new certManager.Certificate(this, `${PREFIX}-cert`, {
      domainName: "api.poorman.tools",
      certificateName: `${PREFIX}-cert`,
      validation: certManager.CertificateValidation.fromDns(apiHostedZone),
    });

    // Create app database
    const ddb = new dynamodb.TableV2(this, `${PREFIX}-database`, {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      tableName: `${PREFIX}-database`,
      replicas: [{ region: "ap-southeast-1" }],
      timeToLiveAttribute: "TTL",
      globalSecondaryIndexes: [
        {
          indexName: "GSI1",
          partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    const cronLogTable = new dynamodb.TableV2(
      this,
      `${PREFIX}-database-cronlog`,
      {
        partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
        tableName: `${PREFIX}-database-cronlog`,
        timeToLiveAttribute: "TTL",
        globalSecondaryIndexes: [
          {
            indexName: "GSI1",
            partitionKey: {
              name: "GSI1PK",
              type: dynamodb.AttributeType.STRING,
            },
            sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
          },
        ],
      }
    );

    // Create the event bridge schedule group
    const cronScheduleGroup = new scheduler.CfnScheduleGroup(
      this,
      `${PREFIX}-schedule-group`,
      {
        name: `${PREFIX}-schedule-group`,
      }
    );

    // Create IAM user for lamdba function
    const lambdaPolicy = new iam.Policy(this, `${PREFIX}-lambda-policy`, {
      statements: [
        new iam.PolicyStatement({
          actions: ["dynamodb:*"],
          resources: [ddb.tableArn, cronLogTable.tableArn],
        }),
        new iam.PolicyStatement({
          actions: ["logs:*"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["events:*"],
          resources: [cronScheduleGroup.attrArn],
        }),
        new iam.PolicyStatement({
          actions: ["scheduler:*"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["lambda:*"],
          resources: ["*"],
        }),
      ],
    });

    const lambdaRole = new iam.Role(this, `${PREFIX}-lambda-role`, {
      roleName: `${PREFIX}-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const cronRunnerRole = new iam.Role(this, `${PREFIX}-cron-runner-role`, {
      roleName: `${PREFIX}-cron-runner-role`,
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    lambdaPolicy.attachToRole(lambdaRole);
    lambdaPolicy.attachToRole(cronRunnerRole);

    const logGroup = new log.LogGroup(this, `${PREFIX}-log-group`, {
      logGroupName: `${PREFIX}-log-group`,
      retention: log.RetentionDays.ONE_WEEK,
    });

    // Create lambda for testing cron job
    const executingCronLambda = new lambdaNodejs.NodejsFunction(
      this,
      `${PREFIX}-cron-runner`,
      {
        entry: "src/execute-cron-action.ts",
        functionName: `${PREFIX}-fn-cron-runner`,
        handler: "handler",
        role: lambdaRole,
        logGroup: logGroup,
        timeout: cdk.Duration.seconds(10),
        environment: {
          SCHEDULER_GROUP_NAME: cronScheduleGroup.name ?? "",
          DDB_TABLE_NAME: ddb.tableName,
          DDB_TABLE_NAME_CRON_LOG: cronLogTable.tableName,
        },
      }
    );

    const apiStack = new PoormanToolApi(this, `${PREFIX}-api`, {
      role: lambdaRole,
      domainName: API_DOMAIN_NAME,
      apiCertificate,
      environment: {
        DDB_TABLE_NAME: ddb.tableName,
        DDB_TABLE_NAME_CRON_LOG: cronLogTable.tableName,
        ROLE_ARN: cronRunnerRole.roleArn,
        SCHEDULER_GROUP_NAME: cronScheduleGroup.name ?? "",
        LAMBDA_EXECUTE_CRON_ARN: executingCronLambda.functionArn,
      },
    });

    new route53.ARecord(this, `${PREFIX}-alias-record`, {
      zone: apiHostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGateway(apiStack.gateway)
      ),
      recordName: API_DOMAIN_NAME,
    });
  }
}
