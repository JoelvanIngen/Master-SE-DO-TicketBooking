#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TicketBookingStack } from '../lib/stack';

const app = new cdk.App();
new TicketBookingStack(app, 'TicketBookingStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'eu-north-1'
    },
});