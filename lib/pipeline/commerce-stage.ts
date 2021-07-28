import * as cdk from "@aws-cdk/core";
import { ProductsFunctionStack } from "../stacks/productsFunction-stack";
import { ECommerceApiStack } from "../stacks/ecommerceApi-stack";

export class ECommerceStage extends cdk.Stage {
	public readonly urlOutput: cdk.CfnOutput;

	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const tags = {
			["cost"]: "ECommerce",
			["team"]: "heyralfs",
		};

		const productsFunctionStack = new ProductsFunctionStack(
			this,
			"ProductsFunction",
			{ tags }
		);

		const eCommerceApiStack = new ECommerceApiStack(
			this,
			"ECommerceApi",
			productsFunctionStack.handler,
			{ tags }
		);
		eCommerceApiStack.addDependency(productsFunctionStack);

		this.urlOutput = eCommerceApiStack.urlOutput;
	}
}
