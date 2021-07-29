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
	} else if (event.resource === "/products/{id}") {
		const productId = event.pathParameters.id;

		if (method === "GET") {
			const data = await getProductById(productId);
			if (data.Item) {
				return {
					statusCode: 200,
					body: JSON.stringify(data.Item),
				};
			} else {
				return {
					statusCode: 404,
					body: JSON.stringify(
						`Product with id ${productId} not found`
					),
				};
			}
		} else if (method === "PUT") {
			const data = await getProductById(productId);

			if (data.Item) {
				const product = JSON.parse(event.body);
				const result = await updateProduct(productId, product);
				console.log(result);

				return {
					statusCode: 200,
					body: JSON.stringify(product),
				};
			} else {
				return {
					statusCode: 404,
					body: JSON.stringify(
						`Product with id ${productId} not found`
					),
				};
			}
		} else if (method === "DELETE") {
			const data = await getProductById(productId);

			if (data.Item) {
				const result = await deleteProduct(productId);
				console.log(result);

				return {
					statusCode: 200,
					body: JSON.stringify(data.Item),
				};
			} else {
				return {
					statusCode: 404,
					body: JSON.stringify(
						`Product with id ${productId} not found`
					),
				};
			}
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

/**
 * GET ALL PRODUCTS
 */
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

/**
 * CREATE PRODUCT
 */
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

/**
 * GET PRODUCT BY ID
 */
function getProductById(productId) {
	const params = {
		TableName: productsDdb,
		Key: {
			id: productId,
		},
	};
	try {
		return ddbClient.get(params).promise();
	} catch (err) {
		console.log(err);
	}
}

/**
 * UPDATE PRODUCT
 */
function updateProduct(productId, product) {
	const params = {
		TableName: productsDdb,
		Key: {
			id: productId,
		},
		UpdateExpression:
			"set productName = :n, code = :c, price = :p, model = :m",
		ExpressionAttributeValues: {
			":n": product.productName,
			":c": product.code,
			":p": product.price,
			":m": product.model,
		},
		ReturnValues: "UPDATED_NEW",
	};
	try {
		return ddbClient.update(params).promise();
	} catch (error) {
		return err;
	}
}

/**
 * DELETE PRODUCT
 */
function deleteProduct(productId) {
	const params = {
		TableName: productsDdb,
		Key: {
			id: productId,
		},
	};
	try {
		return ddbClient.delete(params).promise();
	} catch (err) {
		console.log(err);
	}
}
