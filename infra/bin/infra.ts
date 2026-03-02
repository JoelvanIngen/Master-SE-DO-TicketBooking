#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TicketBookingStack } from '../lib/stack';

// STACK_ENV set by github actions if PR
const envName = process.env.STACK_ENV || 'Prod';
const stackName = `TicketBookingStack-${envName}`;

const app = new cdk.App();
new TicketBookingStack(app, 'TicketBookingStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'eu-north-1'
    },
});