# Code Flow
| Step | AWS Step Functions State | Worker                          | Target                  | Responder                       |
|------|--------------------------|---------------------------------|-------------------------|---------------------------------|
| 1    | Reserve Seats            | `reserveSeats` (TS)             | None (returns directly) | None                            |
| 2    | Retrieve Payment         | `RetrievePaymentHandler` (Java) | `payment` (TS)          | `PaymentResponseHandler` (Java) |
| 3    | Generate Ticket          | `generateTicketHandler` (Java)  | `ticketGen` (TS)        | None                            |