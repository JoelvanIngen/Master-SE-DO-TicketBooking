# Implementation

This document justifies our implementation decisions.

## Orchestration

Orchestration is performed by the `streamRouter` function, which triggers on DynamoDB Stream events for booking state changes. This function then messages the correct functions via SQS based on the status of the DDB entry. The `streamRouter` therefore serves as central orchestrator.

### Lack of Step Functions

Whilst earlier versions used Step Functions for central orchestration, this approach had multiple inherent drawbacks.

- **Costs**:
  - The expensive execution of step functions was our primary driver to move away from Step Functions.
  - The Step Functions caused >90% of expenses, costing up to $10 for a single load test.
  - Whilst we could have spent effort to reduce the amount of steps, this would have caused slowdowns, concurrency limit issues, moved parts of orchestration out of Step Functions, and cause unclear code-flow.
  - Whilst express Step Functions could have solved the costs problem, this would have disallowed us to use SQS, and would have forced us into synchronous communication and caused concurrency limit issues.
- **Lack of AWS integration**
  - Many parts of Step Functions were difficult to integrate with other AWS services, such as WebSocket connections, which is trivial using normal Lambdas.
  - Moving away from Step Functions allowed a much cleaner CDK stack.
- **Bloated state chart**
  - The state chart became increasingly long, unreadable, and its syntax was confusing as opposed to normal code.
  - Once again, parts of this could be solved by moving orchestration to Lambda functions, defeating the purpose of Step Functions as a central orchestrator.

There are downsides to the pure Lambda + SQS approach, too:

- **Lack of workflow tracing**: more effort is required to debug a non-functional workflow, and it requires reading the logs of functions in order until a failure or non-firing function is found.
  - This was mitigated by the fact that we only made the switch once we had a functional workflow, and we no longer needed debug tracing.
- **Manual state management** The workflow state needs to be written into the DDB, and the orchestrator lambda needs to handle it. This is more convoluted than a statechart.

### Benefits of current approach

#### Scalable

The entire workflow is asynchronous. No two lambdas wait for each other, and internal workflow messaging is conducted via SQS. This means the workflow is exceptionally resilient to load increase and load spikes.

#### Extensible

The workflow can easily be extended by adding an extra state in the DDB, and adding a `streamRouter` case to handle the state.
Then, only the new logic is implemented separate from the existing logic, and existing code needs minimal modification, as all functions are decoupled.
Implementing new features is trivial.
