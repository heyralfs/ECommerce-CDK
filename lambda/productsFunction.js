const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");
const uuid = require("uuid");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB;
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

const ddbClient = new AWS.Dynamodb.DocumentClient();

exports.handler = async function (event, context) {
	const method = event.httpMethod;
	console.log(event);

	const apiRequestId = event.requestContext.requestId;
	const lambdaRequestId = context.awsRequestId;

	console.log(
		`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`
	);

	if (event.resource === "/products") {
		if (method === "GET") {
			console.log("GET /products");

			const data = await getAllProducts();

			return {
				statusCode: 200,
				headers: {},
				body: JSON.stringify(data.Items),
			};
		} else if (method === "POST") {
			const product = JSON.parse(event.body);
			product.id = uuid.v4();

			await createProduct(product);

			return {
				statusCode: 201,
				body: JSON.stringify(product),
			};
		}
	}

	return {
		statusCode: 400,
		headers: {},
		body: JSON.stringify({
			message: "Bad request",
			ApiGwRequestId: apiRequestId,
			LambdaRequestId: lambdaRequestId,
		}),
	};
};

function getAllProducts() {
	const params = {
		TableName: productsDdb,
	};
	try {
		return ddbClient.scan(params).promise();
	} catch (err) {
		console.log(err);
	}
}

function createProduct(product) {
	const params = {
		TableName: productsDdb,
		Item: {
			id: product.id,
			productName: product.productName,
			code: product.code,
			price: product.price,
			model: product.model,
		},
	};
	try {
		return ddbClient.put(params).promise();
	} catch (err) {
		return err;
	}
}
