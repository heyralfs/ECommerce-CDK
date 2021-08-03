import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as sns from "@aws-cdk/aws-sns";
import * as subs from "@aws-cdk/aws-sns-subscriptions";
import * as sqs from "@aws-cdk/aws-sqs";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";

export class OrdersApplicationStack extends cdk.Stack {
	readonly ordersHandler: lambdaNodeJS.NodejsFunction;

	constructor(
		scope: cdk.Construct,
		id: string,
		productsDdb: dynamodb.Table,
		props?: cdk.StackProps
	) {
		super(scope, id, props);

		/**
		 * Orders Ddb
		 */
		const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
			tableName: "orders",
			partitionKey: {
				name: "pk",
				type: dynamodb.AttributeType.STRING,
			},
			sortKey: {
				name: "sk",
				type: dynamodb.AttributeType.STRING,
			},
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			billingMode: dynamodb.BillingMode.PROVISIONED,
			readCapacity: 1,
			writeCapacity: 1,
		});

		/**
		 * Order Events Topic
		 */
		const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
			topicName: "order-events",
			displayName: "Order events topic",
		});
		ordersTopic.addSubscription(
			new subs.EmailSubscription("ralf.oliveira@inatel.br", {
				json: true,
				filterPolicy: {
					eventType: sns.SubscriptionFilter.stringFilter({
						allowlist: ["ORDER_DELETED"],
					}),
				},
			})
		);

		/**
		 * Orders handler
		 */
		this.ordersHandler = new lambdaNodeJS.NodejsFunction(
			this,
			"OrdersFunction",
			{
				functionName: "OrdersFunction",
				entry: "lambda/ordersFunction.js",
				handler: "handler",
				bundling: {
					minify: false,
					sourceMap: false,
				},
				tracing: lambda.Tracing.ACTIVE,
				memorySize: 128,
				timeout: cdk.Duration.seconds(30),
				environment: {
					PRODUCTS_DDB: productsDdb.tableName,
					ORDERS_DDB: ordersDdb.tableName,
					ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
				},
			}
		);

		/**
		 * Grant permissions
		 */
		productsDdb.grantReadData(this.ordersHandler);
		ordersDdb.grantReadWriteData(this.ordersHandler);
		ordersTopic.grantPublish(this.ordersHandler);

		/**
		 * Order Events Queue (and DLQ)
		 */
		const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
			queueName: "order-events-dlq",
		});
		const orderEvents = new sqs.Queue(this, "OrderEvents", {
			queueName: "order-events",
			deadLetterQueue: {
				queue: orderEventsDlq,
				maxReceiveCount: 3, // se acontecer 3 error, vem pra DLQ
			},
		});
		// inscreve a fila no tópico
		ordersTopic.addSubscription(
			new subs.SqsSubscription(orderEvents, {
				filterPolicy: {
					eventType: sns.SubscriptionFilter.stringFilter({
						allowlist: ["ORDER_CREATED", "ORDER_DELETED"],
					}),
				},
			})
		);
	}
}
