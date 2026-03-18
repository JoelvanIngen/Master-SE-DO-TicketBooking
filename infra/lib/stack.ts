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
import * as path from 'path';
import { createDashboard, MonitoringResources } from './monitoring/dashboard';
import { createAlarms } from './monitoring/alarms';
import { NagSuppressions } from 'cdk-nag';

export class TicketBookingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queues
    const deadLetterQueue = new sqs.Queue(this, 'deadLetterQueue', { enforceSSL: true });
    const seatReservationRequestQueue = new sqs.Queue(this, 'SeatReservationReqQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const seatReservationResponseQueue = new sqs.Queue(this, 'SeatReservationResQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const paymentRequestQueue = new sqs.Queue(this, 'PaymentRequestQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const paymentResponseQueue = new sqs.Queue(this, 'PaymentResponseQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const ticketGenRequestQueue = new sqs.Queue(this, 'TicketGenReqQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const ticketGenResponseQueue = new sqs.Queue(this, 'TicketGenResQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
    const notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // DynamoDB table
    const bookingTable = new dynamodb.Table(this, 'BookingTable', {
      partitionKey: { name: 'bookingReferenceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
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
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
    };

    // Fake Services NodeJS Lambdas
    const reserveSeats = new NodejsFunction(this, 'ReserveSeats', {
      entry: path.join(__dirname, '../../fake-services-nodejs/src/reserveSeats.ts'),
      ...nodeJsFunctionProps,
      environment: { SEAT_RESERVATION_RESPONSE_QUEUE_URL: seatReservationResponseQueue.queueUrl },
    });
    reserveSeats.addEventSource(new SqsEventSource(seatReservationRequestQueue));
    seatReservationResponseQueue.grantSendMessages(reserveSeats);

    const ticketGen = new NodejsFunction(this, 'TicketGen', {
      entry: path.join(__dirname, '../../fake-services-nodejs/src/ticketGen.ts'),
      ...nodeJsFunctionProps,
      environment: { TICKET_GEN_RESPONSE_QUEUE_URL: ticketGenResponseQueue.queueUrl },
    });
    ticketGen.addEventSource(new SqsEventSource(ticketGenRequestQueue));
    ticketGenResponseQueue.grantSendMessages(ticketGen);

    const paymentService = new NodejsFunction(this, 'paymentService', {
      entry: path.join(__dirname, '../../fake-services-nodejs/src/payment.ts'),
      ...nodeJsFunctionProps,
      environment: { PAYMENT_RESPONSE_QUEUE_URL: paymentResponseQueue.queueUrl },
    });
    paymentService.addEventSource(new SqsEventSource(paymentRequestQueue));
    paymentResponseQueue.grantSendMessages(paymentService);

    // Internal Services
    const bookingInitiator = new NodejsFunction(this, 'BookingInitiator', {
      entry: path.join(__dirname, '../../booking-service/src/bookingInitiator.ts'),
      ...nodeJsFunctionProps,
      environment: {
        TABLE_NAME: bookingTable.tableName,
        NOTIFICATION_QUEUE_URL: notificationQueue.queueUrl,
      },
    });
    bookingTable.grantWriteData(bookingInitiator);
    notificationQueue.grantSendMessages(bookingInitiator);

    const streamRouter = new NodejsFunction(this, 'StreamRouter', {
      entry: path.join(__dirname, '../../booking-service/src/streamRouter.ts'),
      ...nodeJsFunctionProps,
      timeout: cdk.Duration.seconds(30), // Because of large batches
      memorySize: 512, // More compute for large batches
      environment: {
        SEAT_RESERVATION_REQUEST_QUEUE_URL: seatReservationRequestQueue.queueUrl,
        PAYMENT_REQUEST_QUEUE_URL: paymentRequestQueue.queueUrl,
        TICKET_GEN_REQUEST_QUEUE_URL: ticketGenRequestQueue.queueUrl,
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
    notificationQueue.grantSendMessages(streamRouter);

    const seatReservationResponseHandler = new NodejsFunction(
      this,
      'seatReservationResponseHandler',
      {
        entry: path.join(__dirname, '../../booking-service/src/seatReservationResponseHandler.ts'),
        ...nodeJsFunctionProps,
        environment: { TABLE_NAME: bookingTable.tableName },
      },
    );
    seatReservationResponseHandler.addEventSource(new SqsEventSource(seatReservationResponseQueue));
    bookingTable.grantWriteData(seatReservationResponseHandler);

    const paymentResponseHandler = new NodejsFunction(this, 'PaymentResponseHandler', {
      entry: path.join(__dirname, '../../booking-service/src/paymentResponseHandler.ts'),
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    paymentResponseHandler.addEventSource(new SqsEventSource(paymentResponseQueue));
    bookingTable.grantWriteData(paymentResponseHandler);

    const ticketGenerationResultHandler = new NodejsFunction(this, 'TicketGenResHandler', {
      entry: path.join(__dirname, '../../booking-service/src/ticketGenResponseHandler.ts'),
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    ticketGenerationResultHandler.addEventSource(new SqsEventSource(ticketGenResponseQueue));
    bookingTable.grantWriteData(ticketGenerationResultHandler);

    const deadLetterQueueHandler = new NodejsFunction(this, 'DeadLetterHandler', {
      entry: path.join(__dirname, '../../booking-service/src/dlqHandler.ts'),
      ...nodeJsFunctionProps,
      environment: { TABLE_NAME: bookingTable.tableName },
    });
    deadLetterQueueHandler.addEventSource(new SqsEventSource(deadLetterQueue));
    bookingTable.grantWriteData(deadLetterQueueHandler);

    const notificationHandler = new NodejsFunction(this, 'NotificationHandler', {
      entry: path.join(__dirname, '../../booking-service/src/notificationHandler.ts'),
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
      entry: path.join(__dirname, '../../public-endpoint-nodejs/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
      environment: {
        TABLE_NAME: bookingTable.tableName,
      },
    });
    bookingTable.grantReadData(publicEndpoint);

    const httpApi = new apigatewayv2.HttpApi(this, 'TicketApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type'],
        maxAge: cdk.Duration.days(10),
      },
    });
    httpApi.addRoutes({
      path: '/ticket/{bookingReferenceId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTicketIntegration', publicEndpoint),
    });

    const monitoringResources: MonitoringResources = {
      httpApi,
      publicEndpoint,
      bookingInitiator,
      streamRouter,
      seatReservationResponseHandler,
      paymentResponseHandler,
      ticketGenerationResultHandler,
      deadLetterQueueHandler,
      notificationHandler,
      reserveSeats,
      ticketGen,
      paymentService,
      seatReservationRequestQueue,
      seatReservationResponseQueue,
      paymentRequestQueue,
      paymentResponseQueue,
      ticketGenRequestQueue,
      ticketGenResponseQueue,
      notificationQueue,
      deadLetterQueue,
      bookingTable,
    };

    createDashboard(this, monitoringResources);
    createAlarms(this, monitoringResources /*, 'dertje.roggeveen@student.uva.nl' */);

    // Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });

    // Stack-wide suppressions for bureaucratic rules
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'We are using the default AWS role for basic CloudWatch logging to avoid unnecessary complexity in a prototype.',
      },
      {
        id: 'AwsSolutions-APIG1',
        reason:
          'API access logging is disabled to save on CloudWatch storage costs for this university assignment.',
      },
    ]);

    // Resource-specific suppressions for intentionally public APIs
    NagSuppressions.addResourceSuppressions(
      httpApi,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'This endpoint must remain public so users can retrieve their tickets. The unique booking ID acts as the access token.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      webSocketApi,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'The WebSocket must be public so any user can connect and initiate the booking process.',
        },
      ],
      true,
    );

    // Resource-specific suppression for necessary wildcard permissions
    NagSuppressions.addResourceSuppressions(
      notificationHandler,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'The wildcard is required to push messages back to clients because WebSocket connection IDs are generated dynamically.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      streamRouter,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'AWS requires this database monitoring permission to be applied globally, making a wildcard mandatory.',
          appliesTo: ['Resource::*'],
        },
      ],
      true,
    );
  }
}
