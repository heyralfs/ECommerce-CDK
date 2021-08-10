import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as sqs from "@aws-cdk/aws-sqs";

export class AuditEventBusStack extends cdk.Stack {
	readonly bus: events.EventBus;

	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		/**
		 * EVENT BUS
		 */
		this.bus = new events.EventBus(this, "AuditEventBus", {
			eventBusName: "AuditEventBus",
		});

		/**
		 * RULE:
		 * source: app.order
		 * detailType: order
		 * reason: PRODUCT_NOT_FOUND
		 */
		const nonValidOrderRule = new events.Rule(this, "NonValidOrderRule", {
			ruleName: "NonValidOrderRule",
			description: "Rule matching non valid order",
			eventBus: this.bus,
			eventPattern: {
				source: ["app.order"],
				detailType: ["order"],
				detail: {
					reason: ["PRODUC_NOT_FOUND"],
				},
			},
		});

		/**
		 * ORDER ERRORS FUNCTION
		 */
		const orderErrorsFunction = new lambdaNodeJS.NodejsFunction(
			this,
			"OrderErrorsFunction",
			{
				functionName: "OrderErrorsFunction",
				entry: "lambda/orderErrorsFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
			}
		);
		// ADD TARGET
		nonValidOrderRule.addTarget(
			new targets.LambdaFunction(orderErrorsFunction)
		);

		// ...
		//source: app.invoice
		//detailType: invoice
		//reason: FAIL_NO_INVOICE_NUMBER
		const nonValidInvoiceRule = new events.Rule(
			this,
			"NonValidInvoiceRule",
			{
				ruleName: "NonValidInvoiceRule",
				description: "Rule matching non valid invoice",
				eventBus: this.bus,
				eventPattern: {
					source: ["app.invoice"],
					detailType: ["invoice"],
					detail: {
						errorDetail: ["FAIL_NO_INVOICE_NUMBER"],
					},
				},
			}
		);

		const invoiceErrorsFunction = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceErrorsFunction",
			{
				functionName: "InvoiceErrorsFunction",
				entry: "lambda/invoiceErrorsFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
			}
		);
		nonValidInvoiceRule.addTarget(
			new targets.LambdaFunction(invoiceErrorsFunction)
		);

		//source: app.invoice
		//detailType: invoice
		//reason: FAIL_NO_INVOICE_NUMBER
		const timeoutImportInvoiceRule = new events.Rule(
			this,
			"TimeoutImportInvoiceRule",
			{
				ruleName: "TimeoutImportInvoiceRule",
				description: "Rule matching timeout import invoice",
				eventBus: this.bus,
				eventPattern: {
					source: ["app.invoice"],
					detailType: ["invoice"],
					detail: {
						errorDetail: ["TIMEOUT"],
					},
				},
			}
		);
		timeoutImportInvoiceRule.addTarget(
			new targets.SqsQueue(
				new sqs.Queue(this, "InvoiceImportTimeout", {
					queueName: "invoice-import-timeout",
				})
			)
		);

		// arquivar eventos
		this.bus.archive("BusArchive", {
			archiveName: "auditEvents",
			eventPattern: {
				source: ["app.order"],
			},
			retention: cdk.Duration.days(10),
		});
	}
}
