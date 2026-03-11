import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {
  HttpLambdaIntegration,
  WebSocketAwsIntegration,
  WebSocketLambdaIntegration,
} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';

export class TicketBookingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queues
    const paymentRequestQueue = new sqs.Queue(this, 'PaymentRequestQueue');
    const paymentResponseQueue = new sqs.Queue(this, 'PaymentResponseQueue');

    // DynamoDB table
    const bookingTable = new dynamodb.Table(this, 'BookingTable', {
      partitionKey: { name: 'bookingReferenceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // WebSocket
    const webSocketApi = new WebSocketApi(this, 'TicketWebSocketApi', {
      routeSelectionExpression: '$request.body.action',
    });

    const wsStage = new WebSocketStage(this, 'WsStage', {
      webSocketApi,
      // Has nothing to do with PR testing, just a suffix on the url cos AWS wants that
      stageName: 'prod',
      autoDeploy: true,
    });

    // Common NodeJS stuff
    // We do not want all the aws props to be bundled, as they are already present in the lambda environment
    const nodeJsFunctionProps: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_24_X,
      bundling: { externalModules: ['@aws-sdk/*'] },
      architecture: lambda.Architecture.ARM_64,
    };

    // Fake Services NodeJS Lambdas
    const reserveSeats = new NodejsFunction(this, 'ReserveSeats', {
      entry: 'fake-services-nodejs/src/reserveSeats.ts',
      ...nodeJsFunctionProps,
    });

    const ticketGen = new NodejsFunction(this, 'TicketGen', {
      entry: 'fake-services-nodejs/src/ticketGen.ts',
      ...nodeJsFunctionProps,
    });

    const paymentService = new NodejsFunction(this, 'paymentService', {
      entry: 'fake-services-nodejs/src/payment.ts',
      ...nodeJsFunctionProps,
      environment: { PAYMENT_RESPONSE_QUEUE_URL: paymentResponseQueue.queueUrl },
    });
    paymentService.addEventSource(new SqsEventSource(paymentRequestQueue));

    // Java Lambdas
    const bookingJavaJar = 'booking-service-java/target/booking-service-lambda.jar';

    const javaFunctionProps = {
      runtime: lambda.Runtime.JAVA_25,
      memorySize: 2048,
      timeout: cdk.Duration.seconds(15),
      snapStart: lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
      architecture: lambda.Architecture.ARM_64,
    };

    const generateTicket = new lambda.Function(this, 'GenerateTicketHandler', {
      ...javaFunctionProps,
      handler: 'io.berndruecker.ticketbooking.handlers.GenerateTicketHandler',
      code: lambda.Code.fromAsset(bookingJavaJar),
      environment: { TICKETGEN_FUNCTION_NAME: ticketGen.functionName },
    });

    const paymentResponseHandler = new lambda.Function(this, 'PaymentResponseHandler', {
      ...javaFunctionProps,
      handler: 'io.berndruecker.ticketbooking.handlers.PaymentResponseHandler',
      code: lambda.Code.fromAsset(bookingJavaJar),
    });
    paymentResponseHandler.currentVersion.addEventSource(new SqsEventSource(paymentResponseQueue));

    // Step Function Machine
    const stateMachine = new sfn.StateMachine(this, 'BookingStateMachine', {
      definitionBody: sfn.DefinitionBody.fromFile('ticket-booking.asl.json'),
      definitionSubstitutions: {
        // Must match ticket-booking.asl.json placeholders
        PAYMENT_REQUEST_QUEUE_URL: paymentRequestQueue.queueUrl,
        ReserveSeatsArn: reserveSeats.currentVersion.functionArn,
        // Pin specific version to allow snapstart
        GenerateTicketArn: generateTicket.currentVersion.functionArn,
        BookingTableName: bookingTable.tableName,
        WebSocketCallbackUrl: wsStage.callbackUrl,
      },
    });

    // More WebSocket
    // Tiny Lambda for connects/disconnects
    // Don't use NodeJS function props for this one, it doesn't like it
    const wsConnectLambda = new lambda.Function(this, 'WsConnectLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      architecture: lambda.Architecture.ARM_64,
    });
    const wsConnIntegration = new WebSocketLambdaIntegration('WSConnIntegration', wsConnectLambda);

    webSocketApi.addRoute('$connect', { integration: wsConnIntegration });
    webSocketApi.addRoute('$disconnect', { integration: wsConnIntegration });

    // Allow WS API to start Step Functions
    const apiGwSfnRole = new iam.Role(this, 'ApiGwSfnRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    stateMachine.grantStartExecution(apiGwSfnRole);

    const bookTicketIntegration = new WebSocketAwsIntegration('BookTicketIntegration', {
      integrationUri: `arn:aws:apigateway:${this.region}:states:action/StartExecution`,
      integrationMethod: apigatewayv2.HttpMethod.POST,
      credentialsRole: apiGwSfnRole,

      // VTLas a raw string.
      requestTemplates: {
        'application/json': `
{
  "stateMachineArn": "${stateMachine.stateMachineArn}",
  "input": "{ \\"bookingReferenceId\\": \\"$context.requestId\\", \\"connectionId\\": \\"$context.connectionId\\", \\"body\\": $util.escapeJavaScript($input.json('$')) }"
}
    `,
      },
    });

    webSocketApi.addRoute('bookTicket', {
      integration: bookTicketIntegration,
    });

    // Grant Step Functions permission to post messages to the WebSocket
    stateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          this.formatArn({
            service: 'execute-api',
            resource: webSocketApi.apiId,
            resourceName: `${wsStage.stageName}/POST/@connections/*`,
          }),
        ],
      }),
    );

    // HTTP API (for querying with no ws/connection loss)
    const publicEndpoint = new NodejsFunction(this, 'PublicEndpoint', {
      entry: 'public-endpoint-nodejs/src/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
      environment: {
        TABLE_NAME: bookingTable.tableName,
      },
    });

    const httpApi = new apigatewayv2.HttpApi(this, 'TicketApi');
    httpApi.addRoutes({
      path: '/ticket/{bookingReferenceId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTicketIntegration', publicEndpoint),
    });

    // IAM Permissions
    paymentResponseQueue.grantSendMessages(paymentService);
    paymentRequestQueue.grantSendMessages(stateMachine);
    ticketGen.grantInvoke(generateTicket);
    bookingTable.grantReadData(publicEndpoint);
    bookingTable.grantWriteData(stateMachine);
    stateMachine.grantTaskResponse(paymentResponseHandler.currentVersion);
    reserveSeats.grantInvoke(stateMachine);
    generateTicket.currentVersion.grantInvoke(stateMachine);

    // Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
  }
}
