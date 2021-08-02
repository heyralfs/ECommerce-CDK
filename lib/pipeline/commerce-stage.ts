import * as cdk from "@aws-cdk/core";
import { ProductsFunctionStack } from "../stacks/productsFunction-stack";
import { ECommerceApiStack } from "../stacks/ecommerceApi-stack";
import { ProductsDdbStack } from "../stacks/productsDdb-stack";
import { EventsDdbStack } from "../stacks/eventsDdb-stack";
import { ProductEventsFunctionStack } from "../stacks/productEventsFunction-stack";
import { OrdersApplicationStack } from "../stacks/ordersApplication-stack";

export class ECommerceStage extends cdk.Stage {
	public readonly urlOutput: cdk.CfnOutput;

	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const tags = {
			["cost"]: "ECommerce",
			["team"]: "heyralfs",
		};

		/**
		 * PRODUCTS DDB STACK
		 */
		const productsDdbStack = new ProductsDdbStack(this, "ProductsDdb", {
			tags,
		});

		/**
		 * EVENTS DDB STACK
		 */
		const eventsDdbStack = new EventsDdbStack(this, "EventsDdb", { tags });

		/**
		 * PRODUCT EVENTS FUNCTION STACK
		 */
		const productEventsFunctionStack = new ProductEventsFunctionStack(
			this,
			"ProductEventsFunction",
			eventsDdbStack.table,
			{
				tags,
			}
		);
		productEventsFunctionStack.addDependency(eventsDdbStack);

		/**
		 * PRODUCTS FUNCTION STACK
		 */
		const productsFunctionStack = new ProductsFunctionStack(
			this,
			"ProductsFunction",
			productsDdbStack.table,
			productEventsFunctionStack.handler,
			{ tags }
		);
		productsFunctionStack.addDependency(productsDdbStack);
		productsFunctionStack.addDependency(productEventsFunctionStack);

		/**
		 * ORDERS APPLICATION STACK
		 */
		const ordersApplicationStack = new OrdersApplicationStack(
			this,
			"OrdersApplication",
			productsDdbStack.table,
			{ tags }
		);
		ordersApplicationStack.addDependency(productsDdbStack);

		/**
		 * ECOMMERCE API STACK
		 */
		const eCommerceApiStack = new ECommerceApiStack(
			this,
			"ECommerceApi",
			productsFunctionStack.handler,
			ordersApplicationStack.ordersHandler,
			{ tags }
		);
		eCommerceApiStack.addDependency(productsFunctionStack);
		eCommerceApiStack.addDependency(ordersApplicationStack);

		/**
		 * OUTPUT
		 */
		this.urlOutput = eCommerceApiStack.urlOutput;
	}
}
