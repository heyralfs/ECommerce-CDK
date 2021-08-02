import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class EventsDdbStack extends cdk.Stack {
	readonly table: dynamodb.Table;

	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		this.table = new dynamodb.Table(this, "EventsDdb", {
			tableName: "events",
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
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			// readCapacity: 1,
			// writeCapacity: 1,
		});

		/**
		 * Auto scaling config
		 */
		/*
		const readScale = this.table.autoScaleReadCapacity({
			maxCapacity: 4,
			minCapacity: 1,
		});
		readScale.scaleOnUtilization({
			// faz um upScaling se atingir 50% da capacidade de leitura
			targetUtilizationPercent: 50,
			// se fez um upScaling, não faz outro em menos de 60s
			scaleInCooldown: cdk.Duration.seconds(60),
			// se fez um downScaling, não faz outro em menos de 60s
			scaleOutCooldown: cdk.Duration.seconds(60),
		});
		const writeScale = this.table.autoScaleWriteCapacity({
			maxCapacity: 4,
			minCapacity: 1,
		});
		writeScale.scaleOnUtilization({
			targetUtilizationPercent: 50,
			scaleInCooldown: cdk.Duration.seconds(60),
			scaleOutCooldown: cdk.Duration.seconds(60),
		});
		*/
	}
}
