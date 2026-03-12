import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import { MonitoringResources } from './dashboard';

export function createAlarms(
  scope: Construct,
  resources: MonitoringResources,
  alarmEmail?: string,
): cloudwatch.Alarm[] {
  let alarmTopic: sns.Topic | undefined;

  if (alarmEmail) {
    alarmTopic = new sns.Topic(scope, 'MonitoringAlarmTopic', {
      topicName: `${cdk.Stack.of(scope).stackName}-alerts`,
    });

    alarmTopic.addSubscription(new subscriptions.EmailSubscription(alarmEmail));
  }

  const bookingInitiatorLatencyAlarm = new cloudwatch.Alarm(scope, 'BookingInitiatorLatencyAlarm', {
    metric: resources.bookingInitiator.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'BookingInitiator Duration',
    }),
    threshold: 3000,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: 'BookingInitiator average duration is above 3000 ms',
  });

  const lambdaErrorsAlarm = new cloudwatch.Alarm(scope, 'BookingFlowLambdaErrorsAlarm', {
    metric: new cloudwatch.MathExpression({
      expression: 'biErr + prErr + toErr + rsErr + psErr + tgErr',
      period: cdk.Duration.minutes(1),
      label: 'Total Booking Flow Errors',
      usingMetrics: {
        biErr: resources.bookingInitiator.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        prErr: resources.paymentResponseHandler.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        toErr: resources.timeoutHandler.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        rsErr: resources.reserveSeats.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        psErr: resources.paymentService.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        tgErr: resources.ticketGen.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
      },
    }),
    threshold: 0,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: 'At least one Lambda in the booking flow reported an error',
  });

  const paymentRequestQueueBacklogAlarm = new cloudwatch.Alarm(scope, 'PaymentRequestQueueBacklogAlarm', {
    metric: resources.paymentRequestQueue.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
      label: 'PaymentRequestQueue Depth',
    }),
    threshold: 5,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: 'Payment request queue backlog is above 5 messages',
  });

  const alarms = [
    bookingInitiatorLatencyAlarm,
    lambdaErrorsAlarm,
    paymentRequestQueueBacklogAlarm,
  ];

  if (alarmTopic) {
    for (const alarm of alarms) {
      alarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));
    }
  }

  return alarms;
}