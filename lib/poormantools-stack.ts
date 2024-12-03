import * as cdk from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as certManager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as log from "aws-cdk-lib/aws-logs";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { Construct } from "constructs";
import { PoormanToolApi } from "./poormantools-api";
import { config } from "dotenv";

// How to get CDK profile name
if (!["production", "development"].includes(process.env.POORMAN_ENV ?? "")) {
  throw "You cannot run without specifying the environment";
}

config({
  path: `.env.${process.env.POORMAN_ENV}`,
});

const PREFIX = process.env.STACK_PREFIX ?? "pmt";
const BASE_DOMAIN = process.env.STACK_BASE_DOMAIN!;
const API_DOMAIN_NAME = `api.${BASE_DOMAIN}`;

export class PoormantoolsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiHostedZone = new route53.HostedZone(
      this,
      `${PREFIX}-hosted-zone`,
      {
        zoneName: BASE_DOMAIN,
      }
    );

    const apiCertificate = new certManager.Certificate(this, `${PREFIX}-cert`, {
      domainName: API_DOMAIN_NAME,
      certificateName: `${PREFIX}-cert`,
      validation: certManager.CertificateValidation.fromDns(apiHostedZone),
    });

    // Create the secret manager
    const secret = secretsManager.Secret.fromSecretNameV2(
      this,
      `${PREFIX}-secret-app`,
      `${PREFIX}-secret-app`
    );

    // Create app database
    const ddb = new dynamodb.TableV2(this, `${PREFIX}-database`, {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      tableName: `${PREFIX}-database`,
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

    // Setup email services
    const emailIdentity = new ses.EmailIdentity(
      this,
      `${PREFIX}-email-identity`,
      {
        identity: ses.Identity.publicHostedZone(apiHostedZone),
        mailFromDomain: `mail.${BASE_DOMAIN}`,
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

    const lambdaRole = new iam.Role(this, `${PREFIX}-lambda-role`, {
      roleName: `${PREFIX}-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const cronRunnerRole = new iam.Role(this, `${PREFIX}-cron-runner-role`, {
      roleName: `${PREFIX}-cron-runner-role`,
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    // Create IAM user for lamdba function
    const lambdaPolicy = new iam.Policy(this, `${PREFIX}-lambda-policy`, {
      statements: [
        // Allow lambda to access DynamoDB and its secondary index
        new iam.PolicyStatement({
          actions: ["dynamodb:*"],
          resources: [
            ddb.tableArn,
            `${ddb.tableArn}/index/*`,
            cronLogTable.tableArn,
            `${cronLogTable.tableArn}/index/*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["logs:*"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["iam:PassRole"],
          resources: [cronRunnerRole.roleArn],
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
        memorySize: 128,
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
        GITHUB_CLIENT_ID: secret
          .secretValueFromJson("GITHUB_CLIENT_ID")
          .unsafeUnwrap(),
        GITHUB_CLIENT_SECRET: secret
          .secretValueFromJson("GITHUB_CLIENT_SECRET")
          .unsafeUnwrap(),
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
