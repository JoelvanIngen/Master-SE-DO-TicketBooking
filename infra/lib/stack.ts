import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {
  HttpLambdaIntegration,
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
    const timeoutQueue = new sqs.Queue(this, 'TimeoutQueue');

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

    const wsApiEndpoint = `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`;

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

    // Internal Services
    const bookingInitiator = new NodejsFunction(this, 'BookingInitiator', {
      entry: 'booking-service/src/bookingInitiator.ts',
      ...nodeJsFunctionProps,
      environment: {
        TABLE_NAME: bookingTable.tableName,
        PAYMENT_REQUEST_QUEUE_URL: paymentRequestQueue.queueUrl,
        TIMEOUT_QUEUE_URL: timeoutQueue.queueUrl,
        WS_API_ENDPOINT: wsApiEndpoint,
        RESERVE_SEATS_FN: reserveSeats.functionName,
      },
    });

    const paymentResponseHandler = new NodejsFunction(this, 'PaymentResponseHandler', {
      entry: 'booking-service/src/paymentResponseHandler.ts',
      ...nodeJsFunctionProps,
      environment: {
        TABLE_NAME: bookingTable.tableName,
        WS_API_ENDPOINT: wsApiEndpoint,
        TICKET_GEN_FN: ticketGen.functionName,
      },
    });
    paymentResponseHandler.addEventSource(new SqsEventSource(paymentResponseQueue));

    const timeoutHandler = new NodejsFunction(this, 'TimeoutHandler', {
      entry: 'booking-service/src/timeoutHandler.ts',
      ...nodeJsFunctionProps,
      environment: {
        TABLE_NAME: bookingTable.tableName,
        WS_API_ENDPOINT: wsApiEndpoint,
      },
    });
    timeoutHandler.addEventSource(new SqsEventSource(timeoutQueue));

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

    // WS triggers booking initiator
    webSocketApi.addRoute('bookTicket', {
      integration: new WebSocketLambdaIntegration('BookTicketIntegration', bookingInitiator),
    });

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
    bookingTable.grantReadWriteData(bookingInitiator);
    bookingTable.grantReadWriteData(paymentResponseHandler);
    bookingTable.grantReadWriteData(timeoutHandler);
    bookingTable.grantReadData(publicEndpoint);

    paymentRequestQueue.grantSendMessages(bookingInitiator);
    timeoutQueue.grantSendMessages(bookingInitiator);
    paymentResponseQueue.grantSendMessages(paymentService);

    reserveSeats.grantInvoke(bookingInitiator);
    ticketGen.grantInvoke(paymentResponseHandler);

    const manageConnectionsPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        this.formatArn({
          service: 'execute-api',
          resource: webSocketApi.apiId,
          resourceName: `${wsStage.stageName}/POST/@connections/*`,
        }),
      ],
    });
    bookingInitiator.addToRolePolicy(manageConnectionsPolicy);
    paymentResponseHandler.addToRolePolicy(manageConnectionsPolicy);
    timeoutHandler.addToRolePolicy(manageConnectionsPolicy);

    // Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
  }
}
