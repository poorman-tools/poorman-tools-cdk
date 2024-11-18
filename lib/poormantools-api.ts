import * as cdk from "aws-cdk-lib";
import * as log from "aws-cdk-lib/aws-logs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { Role } from "aws-cdk-lib/aws-iam";

interface PoormanToolApiProps {
  domainName: string;
  apiCertificate: Certificate;
  environment: Record<string, string>;
  role: Role;
}

export class PoormanToolApi extends Construct {
  public gateway: LambdaRestApi;

  constructor(
    scope: Construct,
    id: string,
    { role, domainName, apiCertificate, environment }: PoormanToolApiProps
  ) {
    super(scope, id);

    const functionName = `${id}-default`;

    // Create log group
    const logGroup = new log.LogGroup(this, `${id}-log-api`, {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, functionName, {
      entry: "src/api/index.ts",
      functionName: functionName,
      handler: "handler",
      logGroup: logGroup,
      role,
      environment,
    });

    // Create API endpoint with default 404 response handler
    const apiGateway = new apigw.RestApi(this, id, {
      endpointTypes: [apigw.EndpointType.EDGE],
      restApiName: id,
      domainName: {
        domainName,
        certificate: apiCertificate,
      },
    });

    apiGateway.root.addProxy({
      defaultIntegration: new apigw.LambdaIntegration(fn, { proxy: true }),
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: apigw.Cors.DEFAULT_HEADERS,
      },
    });

    this.gateway = apiGateway;
  }
}
