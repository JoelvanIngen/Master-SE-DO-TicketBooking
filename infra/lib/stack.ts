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
import { SqsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';

export class TicketBookingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queues
    const seatReservationRequestQueue = new sqs.Queue(this, 'SeatReservationReqQueue');
    const seatReservationResponseQueue = new sqs.Queue(this, 'SeatReservationResQueue');
    const paymentRequestQueue = new sqs.Queue(this, 'PaymentRequestQueue');
    const paymentResponseQueue = new sqs.Queue(this, 'PaymentResponseQueue');
    const ticketGenRequestQueue = new sqs.Queue(this, 'TicketGenReqQueue');
    const ticketGenResponseQueue = new sqs.Queue(this, 'TicketGenResQueue');
    const notificationQueue = new sqs.Queue(this, 'NotificationQueue');
    const timeoutQueue = new sqs.Queue(this, 'TimeoutQueue');

    // DynamoDB table
    const bookingTable = new dynamodb.Table(this, 'BookingTable', {
      partitionKey: { name: 'bookingReferenceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
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
      environment: { SEAT_RESERVATION_RESPONSE_QUEUE_URL: seatReservationResponseQueue.queueUrl },
    });
    reserveSeats.addEventSource(new SqsEventSource(seatReservationRequestQueue));
    seatReservationResponseQueue.grantSendMessages(reserveSeats);

    const ticketGen = new NodejsFunction(this, 'TicketGen', {
      entry: 'fake-services-nodejs/src/ticketGen.ts',
      ...nodeJsFunctionProps,
      environment: { TICKET_GEN_RESPONSE_QUEUE_URL: ticketGenResponseQueue.queueUrl },
    });
    ticketGen.addEventSource(new SqsEventSource(ticketGenRequestQueue));
    ticketGenResponseQueue.grantSendMessages(ticketGen);

    const paymentService = new NodejsFunction(this, 'paymentService', {
      entry: 'fake-services-nodejs/src/payment.ts',
      ...nodeJsFunctionProps,
      environment: { PAYMENT_RESPONSE_QUEUE_URL: paymentResponseQueue.queueUrl },
    });
    paymentService.addEventSource(new SqsEventSource(paymentRequestQueue));
    paymentResponseQueue.grantSendMessages(paymentService);

    // Internal Services
    const bookingInitiator = new NodejsFunction(this, 'BookingInitiator', {
      entry: 'booking-service/src/bookingInitiator.ts',
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    bookingTable.grantWriteData(bookingInitiator);

    const streamRouter = new NodejsFunction(this, 'StreamRouter', {
      entry: 'booking-service/src/streamRouter.ts',
      ...nodeJsFunctionProps,
      environment: {
        SEAT_RESERVATION_REQUEST_QUEUE_URL: seatReservationRequestQueue.queueUrl,
        PAYMENT_REQUEST_QUEUE_URL: paymentRequestQueue.queueUrl,
        TICKET_GEN_REQUEST_QUEUE_URL: ticketGenRequestQueue.queueUrl,
        TIMEOUT_QUEUE_URL: timeoutQueue.queueUrl,
        NOTIFICATION_QUEUE_URL: notificationQueue.queueUrl,
      },
    });
    streamRouter.addEventSource(
      new DynamoEventSource(bookingTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 100,
        parallelizationFactor: 10,
        retryAttempts: 3,
      }),
    );
    seatReservationRequestQueue.grantSendMessages(streamRouter);
    paymentRequestQueue.grantSendMessages(streamRouter);
    ticketGenRequestQueue.grantSendMessages(streamRouter);
    timeoutQueue.grantSendMessages(streamRouter);
    notificationQueue.grantSendMessages(streamRouter);

    const seatReservationResponseHandler = new NodejsFunction(
      this,
      'seatReservationResponseHandler',
      {
        entry: 'booking-service/src/seatReservationResponseHandler.ts',
        ...nodeJsFunctionProps,
        environment: { TABLE_NAME: bookingTable.tableName },
      },
    );
    seatReservationResponseHandler.addEventSource(new SqsEventSource(seatReservationResponseQueue));
    bookingTable.grantWriteData(seatReservationResponseHandler);

    const paymentResponseHandler = new NodejsFunction(this, 'PaymentResponseHandler', {
      entry: 'booking-service/src/paymentResponseHandler.ts',
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    paymentResponseHandler.addEventSource(new SqsEventSource(paymentResponseQueue));
    bookingTable.grantWriteData(paymentResponseHandler);

    const ticketGenerationResHandler = new NodejsFunction(this, 'TicketGenResHandler', {
      entry: 'booking-service/src/ticketGenResponseHandler.ts',
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    ticketGenerationResHandler.addEventSource(new SqsEventSource(ticketGenResponseQueue));
    bookingTable.grantWriteData(ticketGenerationResHandler);

    const timeoutHandler = new NodejsFunction(this, 'TimeoutHandler', {
      entry: 'booking-service/src/timeoutHandler.ts',
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    timeoutHandler.addEventSource(new SqsEventSource(timeoutQueue));
    bookingTable.grantWriteData(timeoutHandler);

    const notificationHandler = new NodejsFunction(this, 'NotificationHandler', {
      entry: 'booking-service/src/notificationHandler.ts',
      ...nodeJsFunctionProps,
      environment: { WS_API_ENDPOINT: wsApiEndpoint },
    });
    notificationHandler.addEventSource(new SqsEventSource(notificationQueue));
    notificationHandler.addToRolePolicy(
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
    bookingTable.grantReadData(publicEndpoint);

    const httpApi = new apigatewayv2.HttpApi(this, 'TicketApi');
    httpApi.addRoutes({
      path: '/ticket/{bookingReferenceId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTicketIntegration', publicEndpoint),
    });

    // Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
  }
}
