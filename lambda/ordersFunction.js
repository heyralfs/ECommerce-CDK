const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");
const uuid = require("uuid");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB;
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {
	const method = event.httpMethod;

	const apiRequestId = event.requestContext.requestId;
	const lambdaRequestId = context.awsRequestId;
	console.log(
		`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`
	);

	if (event.resource === "/orders") {
		if (method === "GET") {
			if (event.queryStringParameters) {
				if (event.queryStringParameters.username) {
					if (event.queryStringParameters.orderId) {
						// Get one order from an user
						// GET /orders?username=matilde&orderId=123
					} else {
						// Get all orders from an user
						// GET /orders?username=matilde
					}
				}
			} else {
				// Get all orders
				// GET /orders
			}
		} else if (method === "POST") {
			// Create an order
			// POST /orders
		} else if (method === "DELETE") {
			if (
				event.queryStringParameters &&
				event.queryStringParameters.username &&
				event.queryStringParameters.orderId
			) {
				// Delete an order
				// DELETE /orders?username=matilde&orderId=123
			}
		}
	}
};
