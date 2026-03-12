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
  paymentResponseHandler: lambda.IFunction;
  timeoutHandler: lambda.IFunction;
  reserveSeats: lambda.IFunction;
  ticketGen: lambda.IFunction;
  paymentService: lambda.IFunction;
  paymentRequestQueue: sqs.IQueue;
  paymentResponseQueue: sqs.IQueue;
  timeoutQueue: sqs.IQueue;
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

  const paymentResponseInvocations = resources.paymentResponseHandler.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler',
  });

  const timeoutInvocations = resources.timeoutHandler.metricInvocations({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'TimeoutHandler',
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

  const paymentResponseErrors = resources.paymentResponseHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler Errors',
  });

  const timeoutErrors = resources.timeoutHandler.metricErrors({
    statistic: 'Sum',
    period: cdk.Duration.minutes(1),
    label: 'TimeoutHandler Errors',
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

  const paymentResponseDuration = resources.paymentResponseHandler.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler Duration',
  });

  const timeoutDuration = resources.timeoutHandler.metricDuration({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'TimeoutHandler Duration',
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
      'IF((biInv + prInv + toInv + peInv + rsInv + psInv + tgInv) > 0, 100 * (biErr + prErr + toErr + peErr + rsErr + psErr + tgErr) / (biInv + prInv + toInv + peInv + rsInv + psInv + tgInv), 0)',
    usingMetrics: {
      biInv: bookingInitiatorInvocations,
      prInv: paymentResponseInvocations,
      toInv: timeoutInvocations,
      peInv: publicEndpointInvocations,
      rsInv: reserveSeatsInvocations,
      psInv: paymentServiceInvocations,
      tgInv: ticketGenInvocations,
      biErr: bookingInitiatorErrors,
      prErr: paymentResponseErrors,
      toErr: timeoutErrors,
      peErr: publicEndpointErrors,
      rsErr: reserveSeatsErrors,
      psErr: paymentServiceErrors,
      tgErr: ticketGenErrors,
    },
  });

  // --- Queue metrics ---
  const paymentRequestQueueDepth = resources.paymentRequestQueue.metricApproximateNumberOfMessagesVisible({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'PaymentRequestQueue',
  });

  const paymentResponseQueueDepth = resources.paymentResponseQueue.metricApproximateNumberOfMessagesVisible({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseQueue',
  });

  const timeoutQueueDepth = resources.timeoutQueue.metricApproximateNumberOfMessagesVisible({
    statistic: 'Average',
    period: cdk.Duration.minutes(1),
    label: 'TimeoutQueue',
  });

  // --- Lambda concurrent executions (resource usage) ---
  const bookingInitiatorConcurrent = resources.bookingInitiator.metric('ConcurrentExecutions', {
    statistic: 'Maximum',
    period: cdk.Duration.minutes(1),
    label: 'BookingInitiator Concurrent',
  });

  const paymentResponseConcurrent = resources.paymentResponseHandler.metric('ConcurrentExecutions', {
    statistic: 'Maximum',
    period: cdk.Duration.minutes(1),
    label: 'PaymentResponseHandler Concurrent',
  });

  const timeoutConcurrent = resources.timeoutHandler.metric('ConcurrentExecutions', {
    statistic: 'Maximum',
    period: cdk.Duration.minutes(1),
    label: 'TimeoutHandler Concurrent',
  });

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
      left: [httpLatency, bookingInitiatorDuration, paymentResponseDuration, timeoutDuration, publicEndpointDuration],
      width: 12,
    }),
  );

  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Booking Flow Invocations',
      left: [
        bookingInitiatorInvocations,
        reserveSeatsInvocations,
        paymentServiceInvocations,
        paymentResponseInvocations,
        ticketGenInvocations,
        timeoutInvocations,
        publicEndpointInvocations,
      ],
      width: 12,
    }),
    new cloudwatch.GraphWidget({
      title: 'Error Count',
      left: [
        bookingInitiatorErrors,
        paymentResponseErrors,
        timeoutErrors,
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
      left: [bookingInitiatorConcurrent, paymentResponseConcurrent, timeoutConcurrent],
      width: 12,
    }),
  );

  dashboard.addWidgets(
    new cloudwatch.SingleValueWidget({
      title: 'Queue Depth',
      metrics: [paymentRequestQueueDepth, paymentResponseQueueDepth, timeoutQueueDepth],
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