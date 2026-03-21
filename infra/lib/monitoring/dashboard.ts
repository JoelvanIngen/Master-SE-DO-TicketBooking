import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export interface MonitoringResources {
  httpApi: apigatewayv2.HttpApi;
  publicEndpoint: lambda.IFunction;
  bookingInitiator: lambda.IFunction;
  streamRouter: lambda.IFunction;
  seatReservationResponseHandler: lambda.IFunction;
  paymentResponseHandler: lambda.IFunction;
  ticketGenerationResultHandler: lambda.IFunction;
  deadLetterQueueHandler: lambda.IFunction;
  notificationHandler: lambda.IFunction;
  reserveSeats: lambda.IFunction;
  ticketGen: lambda.IFunction;
  paymentService: lambda.IFunction;
  seatReservationRequestQueue: sqs.IQueue;
  seatReservationResponseQueue: sqs.IQueue;
  paymentRequestQueue: sqs.IQueue;
  paymentResponseQueue: sqs.IQueue;
  ticketGenRequestQueue: sqs.IQueue;
  ticketGenResponseQueue: sqs.IQueue;
  notificationQueue: sqs.IQueue;
  deadLetterQueue: sqs.IQueue;
  bookingTable: dynamodb.ITable;
}

export function createDashboard(
  scope: Construct,
  resources: MonitoringResources,
): cloudwatch.Dashboard {
  const dashboard = new cloudwatch.Dashboard(scope, 'TicketBookingDashboard', {
    dashboardName: `${cdk.Stack.of(scope).stackName}-dashboard`,
  });

  // --- HTTP API metrics (query endpoint) ---
  const httpRequestCount = resources.httpApi.metricCount({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'HTTP API Requests',
  });

  const httpLatency = resources.httpApi.metricLatency({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'HTTP API Latency',
  });

  // --- Lambda invocation metrics ---
  const bookingInitiatorInvocations = resources.bookingInitiator.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'BookingInitiator',
  });

  const streamRouterInvocations = resources.streamRouter.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'streamRouter',
  });

  const seatReservationResponseHandlerInvocations =
    resources.seatReservationResponseHandler.metricInvocations({
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
      label: 'seatReservationResponseHandler',
    });

  const paymentResponseInvocations = resources.paymentResponseHandler.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler',
  });

  const ticketGenerationResultHandlerInvocations =
    resources.ticketGenerationResultHandler.metricInvocations({
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
      label: 'ticketGenerationResultHandler',
    });

  const deadLetterQueueInvocations = resources.deadLetterQueueHandler.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'DeadLetterQueueHandler',
  });

  const notificationHandlerInvocations = resources.notificationHandler.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'notificationHandler',
  });

  const publicEndpointInvocations = resources.publicEndpoint.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PublicEndpoint',
  });

  const reserveSeatsInvocations = resources.reserveSeats.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'ReserveSeats',
  });

  const paymentServiceInvocations = resources.paymentService.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentService',
  });

  const ticketGenInvocations = resources.ticketGen.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'TicketGen',
  });

  // --- Lambda error metrics ---
  const bookingInitiatorErrors = resources.bookingInitiator.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'BookingInitiator Errors',
  });

  const streamRouterErrors = resources.streamRouter.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'streamRouter Errors',
  });

  const seatReservationResponseHandlerErrors =
    resources.seatReservationResponseHandler.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
      label: 'seatReservationResponseHandler Errors',
    });

  const paymentResponseErrors = resources.paymentResponseHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler Errors',
  });

  const ticketGenerationResultHandlerErrors = resources.ticketGenerationResultHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'ticketGenerationResultHandler Errors',
  });

  const deadLetterQueueErrors = resources.deadLetterQueueHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'DeadLetterQueueHandler Errors',
  });

  const notificationHandlerErrors = resources.notificationHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'notificationHandler Errors',
  });

  const publicEndpointErrors = resources.publicEndpoint.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PublicEndpoint Errors',
  });

  const reserveSeatsErrors = resources.reserveSeats.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'ReserveSeats Errors',
  });

  const paymentServiceErrors = resources.paymentService.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentService Errors',
  });

  const ticketGenErrors = resources.ticketGen.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'TicketGen Errors',
  });

  // --- Lambda duration metrics (latency/performance) ---
  const bookingInitiatorDuration = resources.bookingInitiator.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'BookingInitiator Duration',
  });

  const streamRouterDuration = resources.streamRouter.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'streamRouter Duration',
  });

  const seatReservationResponseHandlerDuration =
    resources.seatReservationResponseHandler.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'seatReservationResponseHandler Duration',
    });

  const paymentResponseDuration = resources.paymentResponseHandler.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler Duration',
  });

  const ticketGenerationResultHandlerDuration =
    resources.ticketGenerationResultHandler.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'ticketGenerationResultHandler Duration',
    });

  const deadLetterQueueDuration = resources.deadLetterQueueHandler.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'DeadLetterQueue Duration',
  });

  const notificationHandlerDuration = resources.notificationHandler.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'notificationHandler Duration',
  });

  const publicEndpointDuration = resources.publicEndpoint.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'PublicEndpoint Duration',
  });

  // --- Error rate ---
  const totalErrorRate = new cloudwatch.MathExpression({
    label: 'Lambda Error Rate (%)',
    period: cdk.Duration.minutes(1),
    expression:
      'IF((biInv + srInv + srrhInv + prInv + tgrhInv + toInv + nhInv + peInv + rsInv + psInv + tgInv) > 0, 100 * (biErr + srErr + srrhErr + prErr + tgrhErr + toErr + nhErr + peErr + rsErr + psErr + tgErr) / (biInv + srInv + srrhInv + prInv + tgrhInv + toInv + nhInv + peInv + rsInv + psInv + tgInv), 0)',
    usingMetrics: {
      biInv: bookingInitiatorInvocations,
      srInv: streamRouterInvocations,
      srrhInv: seatReservationResponseHandlerInvocations,
      prInv: paymentResponseInvocations,
      tgrhInv: ticketGenerationResultHandlerInvocations,
      dlqInv: deadLetterQueueInvocations,
      nhInv: notificationHandlerInvocations,
      peInv: publicEndpointInvocations,
      rsInv: reserveSeatsInvocations,
      psInv: paymentServiceInvocations,
      tgInv: ticketGenInvocations,
      biErr: bookingInitiatorErrors,
      srErr: streamRouterErrors,
      srrhErr: seatReservationResponseHandlerErrors,
      prErr: paymentResponseErrors,
      tgrhErr: ticketGenerationResultHandlerErrors,
      dlqErr: deadLetterQueueErrors,
      nhErr: notificationHandlerErrors,
      peErr: publicEndpointErrors,
      rsErr: reserveSeatsErrors,
      psErr: paymentServiceErrors,
      tgErr: ticketGenErrors,
    },
  });

  // --- Queue metrics ---
  const paymentRequestQueueDepth =
    resources.paymentRequestQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'PaymentRequestQueue',
    });

  const paymentResponseQueueDepth =
    resources.paymentResponseQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'PaymentResponseQueue',
    });

  const ticketGenRequestQueueDepth =
    resources.ticketGenRequestQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'ticketGenRequestQueue',
    });

  const ticketGenResponseQueueDepth =
    resources.ticketGenResponseQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'ticketGenResponseQueue',
    });

  const notificationQueueDepth =
    resources.notificationQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'notificationQueue',
    });

  const deadLetterQueueDepth = resources.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'DeadLetterQueue',
  });

  // --- Lambda concurrent executions (resource usage) ---
  const bookingInitiatorConcurrent = resources.bookingInitiator.metric('ConcurrentExecutions', {
    statistic: 'Maximum',
    period: cdk.Duration.minutes(1),
    label: 'BookingInitiator Concurrent',
  });

  const streamRouterConcurrent = resources.streamRouter.metric('ConcurrentExecutions', {
    statistic: 'Maximum',
    period: cdk.Duration.minutes(1),
    label: 'streamRouter Concurrent',
  });

  const seatReservationResponseHandlerConcurrent = resources.seatReservationResponseHandler.metric(
    'ConcurrentExecutions',
    {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
      label: 'seatReservationResponseHandler Concurrent',
    },
  );

  const paymentResponseConcurrent = resources.paymentResponseHandler.metric(
    'ConcurrentExecutions',
    {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
      label: 'PaymentResponseHandler Concurrent',
    },
  );

  const ticketGenerationResultHandlerConcurrent = resources.ticketGenerationResultHandler.metric(
    'ConcurrentExecutions',
    {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
      label: 'ticketGenerationResultHandler Concurrent',
    },
  );

  const deadLetterQueueHandlerConcurrent = resources.deadLetterQueueHandler.metric(
    'ConcurrentExecutions',
    {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
      label: 'DeadLetterQueueHandler Concurrent',
    },
  );

  const notificationHandlerConcurrent = resources.notificationHandler.metric(
    'ConcurrentExecutions',
    {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
      label: 'notificationHandler Concurrent',
    },
  );

  // --- DynamoDB resource usage ---
  const consumedReads = resources.bookingTable.metricConsumedReadCapacityUnits({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'Consumed Reads',
  });

  const consumedWrites = resources.bookingTable.metricConsumedWriteCapacityUnits({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'Consumed Writes',
  });

  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'HTTP API Traffic',
      left: [httpRequestCount],
      width: 12,
    }),
    new cloudwatch.GraphWidget({
      title: 'Latency',
      left: [
        httpLatency,
        bookingInitiatorDuration,
        streamRouterDuration,
        seatReservationResponseHandlerDuration,
        paymentResponseDuration,
        ticketGenerationResultHandlerDuration,
        deadLetterQueueDuration,
        notificationHandlerDuration,
        publicEndpointDuration,
      ],
      width: 12,
    }),
  );

  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Booking Flow Invocations',
      left: [
        bookingInitiatorInvocations,
        streamRouterInvocations,
        seatReservationResponseHandlerInvocations,
        reserveSeatsInvocations,
        paymentServiceInvocations,
        paymentResponseInvocations,
        ticketGenerationResultHandlerInvocations,
        ticketGenInvocations,
        deadLetterQueueInvocations,
        notificationHandlerInvocations,
        publicEndpointInvocations,
      ],
      width: 12,
    }),
    new cloudwatch.GraphWidget({
      title: 'Error Count',
      left: [
        bookingInitiatorErrors,
        streamRouterErrors,
        seatReservationResponseHandlerErrors,
        paymentResponseErrors,
        ticketGenerationResultHandlerErrors,
        deadLetterQueueErrors,
        notificationHandlerErrors,
        publicEndpointErrors,
        reserveSeatsErrors,
        paymentServiceErrors,
        ticketGenErrors,
      ],
      width: 12,
    }),
  );

  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Lambda Error Rate',
      left: [totalErrorRate],
      width: 12,
    }),
    new cloudwatch.GraphWidget({
      title: 'Concurrent Executions',
      left: [
        bookingInitiatorConcurrent,
        streamRouterConcurrent,
        seatReservationResponseHandlerConcurrent,
        paymentResponseConcurrent,
        ticketGenerationResultHandlerConcurrent,
        deadLetterQueueHandlerConcurrent,
        notificationHandlerConcurrent,
      ],
      width: 12,
    }),
  );

  dashboard.addWidgets(
    new cloudwatch.SingleValueWidget({
      title: 'Queue Depth',
      metrics: [
        paymentRequestQueueDepth,
        paymentResponseQueueDepth,
        ticketGenRequestQueueDepth,
        ticketGenResponseQueueDepth,
        notificationQueueDepth,
        deadLetterQueueDepth,
      ],
      width: 12,
    }),
    new cloudwatch.GraphWidget({
      title: 'DynamoDB Resource Usage',
      left: [consumedReads, consumedWrites],
      width: 12,
    }),
  );

  return dashboard;
}
