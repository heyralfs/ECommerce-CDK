import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2";
import * as apigatewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3n from "@aws-cdk/aws-s3-notifications";
import * as iam from "@aws-cdk/aws-iam";
import * as sqs from "@aws-cdk/aws-sqs";
import { DynamoEventSource, SqsDlq } from "@aws-cdk/aws-lambda-event-sources";

export class InvoiceWSApiStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		/**
		 * Invoices Table
		 */
		const invoicesDdb = new dynamodb.Table(this, "InvoicesDdb2", {
			tableName: "invoices2",
			billingMode: dynamodb.BillingMode.PROVISIONED,
			readCapacity: 1,
			writeCapacity: 1,
			partitionKey: {
				name: "pk",
				type: dynamodb.AttributeType.STRING,
			},
			sortKey: {
				name: "sk",
				type: dynamodb.AttributeType.STRING,
			},
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			timeToLiveAttribute: "ttl",
			// stream => geração de eventos
			stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
		});

		/**
		 * Invoices Bucket
		 */
		const bucket = new s3.Bucket(this, "InvoiceBucket2", {
			bucketName: "rof-invoices2",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		/**
		 * Conncetion handler
		 */
		const connectionHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceConnectionFunction",
			{
				functionName: "InvoiceConnectionFunction",
				entry: "lambda/invoiceConnectionFunction.js",
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

		/**
		 * Disconncetion handler
		 */
		const disconnectionHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceDisconnectionFunction",
			{
				functionName: "InvoiceDisconnectionFunction",
				entry: "lambda/invoiceDisconnectionFunction.js",
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

		/**
		 * Api Gateway - WebSocket
		 */
		const webSocketApi = new apigatewayv2.WebSocketApi(
			this,
			"InvoiceWSApi",
			{
				apiName: "InvoiceWSApi",
				description: "This is the Invoice WebSocket Api",
				// quando cliente se conecta, invoca o lambda
				connectRouteOptions: {
					integration:
						new apigatewayv2_integrations.LambdaWebSocketIntegration(
							{ handler: connectionHandler }
						),
				},
				// cliente se desconecta...
				disconnectRouteOptions: {
					integration:
						new apigatewayv2_integrations.LambdaWebSocketIntegration(
							{ handler: disconnectionHandler }
						),
				},
			}
		);

		/**
		 * Stage
		 */
		const stage = "prod";
		new apigatewayv2.WebSocketStage(this, "InvoiceSWApiStage", {
			webSocketApi: webSocketApi,
			stageName: stage,
			autoDeploy: true,
		});

		// endpoint
		const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;

		/**
		 * Get Url Handler
		 */
		const getUrlHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceWSUrlFunction",
			{
				functionName: "InvoiceWSUrlFunction",
				entry: "lambda/invoiceWSUrlFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
				environment: {
					INVOICES_DDB: invoicesDdb.tableName,
					BUCKET_NAME: bucket.bucketName,
					INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
				},
			}
		);
		// permissions
		invoicesDdb.grantReadWriteData(getUrlHandler);
		bucket.grantReadWrite(getUrlHandler);

		/**
		 * Invoice Import Handler
		 */
		const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceWSImportFunction",
			{
				functionName: "InvoiceWSImportFunction",
				entry: "lambda/invoiceWSImportFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
				environment: {
					INVOICES_DDB: invoicesDdb.tableName,
				},
			}
		);
		// permissions
		invoicesDdb.grantReadWriteData(invoiceImportHandler);
		bucket.grantReadWrite(invoiceImportHandler);
		// invoke
		bucket.addEventNotification(
			s3.EventType.OBJECT_CREATED_PUT,
			new s3n.LambdaDestination(invoiceImportHandler)
		);

		/**
		 * Cancel Import Handler
		 */
		const cancelImportHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"CancelImportFunction",
			{
				functionName: "CancelImportFunction",
				entry: "lambda/cancelImportFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
				environment: {
					INVOICES_DDB: invoicesDdb.tableName,
				},
			}
		);
		// permissions
		invoicesDdb.grantReadWriteData(cancelImportHandler);

		/**
		 * Policy Statements & Role Policies
		 */
		const resourcePost = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/POST/@connections/*`;
		const resourceGet = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/GET/@connections/*`;
		const resourceDelete = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/DELETE/@connections/*`;
		const wsApiPolicy = new iam.PolicyStatement({
			effect: iam.Effect.ALLOW,
			actions: ["execute-api:ManageConnections"],
			resources: [resourcePost, resourceGet, resourceDelete],
		});
		invoiceImportHandler.addToRolePolicy(wsApiPolicy);
		getUrlHandler.addToRolePolicy(wsApiPolicy);
		cancelImportHandler.addToRolePolicy(wsApiPolicy);

		/**
		 * Routes config
		 * {
		 *    "action": "getImportUrl", // rota vem aqui
		 *    "data": { ... }
		 * }
		 */
		webSocketApi.addRoute("getImportUrl", {
			integration:
				new apigatewayv2_integrations.LambdaWebSocketIntegration({
					handler: getUrlHandler,
				}),
		});
		webSocketApi.addRoute("cancelImport", {
			integration:
				new apigatewayv2_integrations.LambdaWebSocketIntegration({
					handler: cancelImportHandler,
				}),
		});

		/**
		 * Events Ddb
		 */
		const eventsDdb = new dynamodb.Table(this, "EventsDdb2", {
			tableName: "events2",
			partitionKey: {
				name: "pk",
				type: dynamodb.AttributeType.STRING,
			},
			sortKey: {
				name: "sk",
				type: dynamodb.AttributeType.STRING,
			},
			timeToLiveAttribute: "ttl",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			billingMode: dynamodb.BillingMode.PROVISIONED,
			readCapacity: 1,
			writeCapacity: 1,
		});

		/**
		 * Invoice Events Handler
		 */
		const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"InvoiceWSEventsFunction",
			{
				functionName: "InvoiceWSEventsFunction",
				entry: "lambda/invoiceWSEventsFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
				environment: {
					EVENTS_DDB: eventsDdb.tableName,
				},
			}
		);
		// invoice events dlq
		const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq2", {
			queueName: "invoice-events-dlq2",
		});
		// subscrição da lambda no evento do dynamo
		invoiceEventsHandler.addEventSource(
			new DynamoEventSource(invoicesDdb, {
				startingPosition: lambda.StartingPosition.TRIM_HORIZON,
				batchSize: 5,
				bisectBatchOnError: true,
				onFailure: new SqsDlq(invoiceEventsDlq),
				retryAttempts: 3,
			})
		);
		// permissions
		eventsDdb.grantWriteData(invoiceEventsHandler);
		invoiceEventsDlq.addToResourcePolicy(wsApiPolicy);
	}
}
