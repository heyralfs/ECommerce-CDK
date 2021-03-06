const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB;
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {
	console.log(`event: ${event}`);

	await createEvent(event.productEvent);

	console.log(
		`Product Event created - ProducID: ${event.productEvent.productId} - RequestId: ${event.productEvent.requestId}`
	);

	context.succeed(
		JSON.stringify({
			productEventCreated: true,
			message: "ok ",
		})
	);
};

/**
 * CREATE EVENT FUNCTION
 */
function createEvent(productEvent) {
	const timestamp = Date.now();
	const ttl = ~~(timestamp / 1000 + 60 * 60); // 60 minutes

	const params = {
		TableName: eventsDdb,
		Item: {
			pk: `#product_${productEvent.productCode}`,
			sk: `${productEvent.eventType}#${timestamp}`,
			ttl,
			username: productEvent.username,
			createdAt: timestamp,
			requestId: productEvent.requestId,
			eventType: productEvent.eventType,
			info: {
				productId: productEvent.productId,
			},
			// productId: productEvent.productId,
		},
	};

	try {
		return ddbClient.put(params).promise();
	} catch (err) {
		console.log(err);
	}
}
