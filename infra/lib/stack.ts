import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {NodejsFunction, NodejsFunctionProps} from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class TicketBookingStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // SQS Queues
        const paymentRequestQueue = new sqs.Queue(this, 'PaymentRequestQueue');
        const paymentResponseQueue = new sqs.Queue(this, 'PaymentResponseQueue');

        // Common NodeJS stuff
        // We do not want all the aws props to be bundled, as they are already present in the lambda environment
        const nodeJsFunctionProps: NodejsFunctionProps = {
            runtime: lambda.Runtime.NODEJS_24_X,
            bundling: { externalModules: ['@aws-sdk/*'] },
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
        }

        const retrievePayment = new lambda.Function(this, 'RetrievePaymentHandler', {
            ...javaFunctionProps,
            handler: 'io.berndruecker.ticketbooking.handlers.RetrievePaymentHandler',
            code: lambda.Code.fromAsset(bookingJavaJar),
            environment: { PAYMENT_REQUEST_QUEUE_URL: paymentRequestQueue.queueUrl },
        });

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
        paymentResponseHandler.addEventSource(new SqsEventSource(paymentResponseQueue));

        // Step Function Machine
        const stateMachine = new sfn.StateMachine(this, 'BookingStateMachine', {
            definitionBody: sfn.DefinitionBody.fromFile('ticket-booking.asl.json'),
            definitionSubstitutions: {
                // Must match ticket-booking.asl.json placeholders
                "ReserveSeatsArn": reserveSeats.functionArn,
                "RetrievePaymentArn": retrievePayment.functionArn,
                "GenerateTicketArn": generateTicket.functionArn
            },
        });

        // For the waitForTaskToken pattern
        stateMachine.addToRolePolicy(new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [retrievePayment.functionArn]
        }));

        // Public Endpoint NodeJS Lambda
        const publicEndpoint = new NodejsFunction(this, 'PublicEndpoint', {
            entry: 'public-endpoint-nodejs/src/index.ts',
            runtime: lambda.Runtime.NODEJS_24_X,
            timeout: cdk.Duration.seconds(60),
            environment: { STATE_MACHINE_ARN: stateMachine.stateMachineArn },
        });

        // HTTP API
        const httpApi = new apigateway.HttpApi(this, 'TicketApi');
        httpApi.addRoutes({
            path: '/ticket',
            methods: [apigateway.HttpMethod.PUT],
            integration: new HttpLambdaIntegration('PublicEndpointIntegration', publicEndpoint),
        });

        // IAM Permissions
        paymentRequestQueue.grantSendMessages(retrievePayment);
        paymentResponseQueue.grantSendMessages(paymentService);
        ticketGen.grantInvoke(generateTicket);
        stateMachine.grantStartExecution(publicEndpoint);
        stateMachine.grantRead(publicEndpoint);
        stateMachine.grantTaskResponse(paymentResponseHandler);

        reserveSeats.grantInvoke(stateMachine);
        retrievePayment.grantInvoke(stateMachine);
        generateTicket.grantInvoke(stateMachine);

        // Output gateway URL so we can use it for e2e testing
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: httpApi.apiEndpoint,
            description: 'The URL of the API Gateway',
        });
    }
}