import * as cdk from "@aws-cdk/core";
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as cwlogs from "@aws-cdk/aws-logs";
import { CfnAccount } from "@aws-cdk/aws-apigateway";

export class ECommerceApiStack extends cdk.Stack {
	readonly urlOutput: cdk.CfnOutput;

	constructor(
		scope: cdk.Construct,
		id: string,
		productsHandler: lambdaNodeJS.NodejsFunction,
		props?: cdk.StackProps
	) {
		super(scope, id, props);

		/**
		 * Log Group
		 */
		const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs", {
			logGroupName: "ECommerceAPI",
		});

		/**
		 * Api Gateway
		 */
		const api = new apigateway.RestApi(this, "ecommerce-api", {
			restApiName: "ECommerce Service",
			description: "This is the ECommerce service",
			deployOptions: {
				accessLogDestination: new apigateway.LogGroupLogDestination(
					logGroup
				),
				accessLogFormat:
					apigateway.AccessLogFormat.jsonWithStandardFields({
						caller: true,
						httpMethod: true,
						ip: true,
						protocol: true,
						requestTime: true,
						resourcePath: true,
						responseLength: true,
						status: true,
						user: true,
					}),
			},
		});

		/**
		 * Api Resources & Methods
		 */
		// lambda integration
		const productsFunctionIntegration = new apigateway.LambdaIntegration(
			productsHandler,
			{
				requestTemplates: {
					"application/json": '{"statusCode": "200"}',
				},
			}
		);
		// /products
		const productsResource = api.root.addResource("products");

		// GET /products
		productsResource.addMethod("GET", productsFunctionIntegration);

		// POST /products
		productsResource.addMethod("POST", productsFunctionIntegration);

		// /products/{id}
		const productsIdResource = productsResource.addResource("{id}");

		// GET /products/{id}
		productsIdResource.addMethod("GET", productsFunctionIntegration);

		// PUT /products/{id}
		productsIdResource.addMethod("PUT", productsFunctionIntegration);

		// DELETE /products/{id}
		productsIdResource.addMethod("DELETE", productsFunctionIntegration);

		// /orders
		// /events
		// /invoices

		/**
		 * Output
		 */
		this.urlOutput = new cdk.CfnOutput(this, "url", {
			exportName: "url",
			value: api.url,
		});
	}
}
