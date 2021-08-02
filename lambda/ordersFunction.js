const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");
const uuid = require("uuid");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB;
const ordersDdb = process.env.ORDERS_DDB;
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
						const data = await getOrder(
							event.queryStringParameters.username,
							event.queryStringParameters.orderId
						);

						if (data.Item) {
							return {
								statusCode: 200,
								body: JSON.stringify(
									convertToOrderResponse(data.Item)
								),
							};
						} else {
							return {
								statusCode: 404,
								body: JSON.stringify("Order not found"),
							};
						}
					} else {
						// Get all orders from an user
						// GET /orders?username=matilde
						const data = await getOrdersByUsername(
							event.queryStringParameters.username
						);
						return {
							statusCode: 200,
							body: JSON.stringify(
								data.Items.map(convertToOrderResponse)
							),
						};
					}
				}
			} else {
				// Get all orders
				// GET /orders

				const data = await getAllOrders();

				return {
					statusCode: 200,
					body: JSON.stringify(
						data.Items.map(convertToOrderResponse)
					),
				};
			}
		} else if (method === "POST") {
			// Create an order
			// POST /orders

			const orderRequest = JSON.parse(event.body);
			const result = await fetchProducts(orderRequest);
			if (
				result.Responses.products.length ===
				orderRequest.productIds.length
			) {
				const products = [];
				result.Responses.products.forEach((product) => {
					console.log(product);
					products.push(product);
				});

				const orderCreated = await createOrder(orderRequest, products);
				console.log(orderCreated);

				return {
					statusCode: 201,
					body: JSON.stringify(convertToOrderResponse(orderCreated)),
				};
			} else {
				return {
					statusCode: 404,
					body: JSON.stringify("Some product was not found"),
				};
			}
		} else if (method === "DELETE") {
			if (
				event.queryStringParameters &&
				event.queryStringParameters.username &&
				event.queryStringParameters.orderId
			) {
				// Delete an order
				// DELETE /orders?username=matilde&orderId=123

				const data = await getOrder(
					event.queryStringParameters.username,
					event.queryStringParameters.orderId
				);
				if (data.Item) {
					await deleteOrder(
						event.queryStringParameters.username,
						event.queryStringParameters.orderId
					);
					return {
						statusCode: 200,
						body: JSON.stringify(convertToOrderResponse(data.Item)),
					};
				} else {
					return {
						statusCode: 404,
						body: JSON.stringify("Product not found"),
					};
				}
			}
		}
	}
};

/**
 * Fecth products function
 */
function fetchProducts(orderRequest) {
	const keys = [];
	orderRequest.productIds.forEach((productId) => {
		keys.push({
			id: productId,
		});
	});
	const params = {
		RequestItems: {
			// products<Table.TableName>: {
			[productsDdb]: {
				Keys: keys,
			},
		},
	};
	try {
		return ddbClient.batchGet(params).promise();
	} catch (err) {
		return err;
	}
}

/**
 * Convert to order response function
 */
function convertToOrderResponse(order) {
	return {
		username: order.pk,
		id: order.sk,
		createdAt: order.createdAt,
		products: order.products,
		billing: {
			payment: order.billing.payment,
			totalPrice: order.billing.totalPrice,
		},
		shipping: {
			type: order.shipping.type,
			carrier: order.shipping.carrier,
		},
	};
}

/**
 * Create order function
 */
async function createOrder(orderRequest, products) {
	const timestamp = Date.now();
	const orderProducts = [];
	let totalPrice = 0;

	products.forEach((product) => {
		totalPrice += product.price;
		orderProducts.push({
			code: product.code,
			price: product.price,
			id: product.id,
		});
	});

	const orderItem = {
		pk: orderRequest.username,
		sk: uuid.v4(),
		createdAt: timestamp,
		billing: {
			payment: orderRequest.payment,
			totalPrice,
		},
		shipping: {
			type: orderRequest.shipping.type,
			carrier: orderRequest.shipping.carrier,
		},
		products: orderProducts,
	};

	try {
		await ddbClient
			.put({
				TableName: ordersDdb,
				Item: orderItem,
			})
			.promise();
		return orderItem;
	} catch (err) {
		return err;
	}
}

/**
 * Get all orders function
 */
function getAllOrders() {
	try {
		return ddbClient
			.scan({
				TableName: ordersDdb,
			})
			.promise();
	} catch (err) {
		return err;
	}
}

/**
 * Get orders by username function
 */
function getOrdersByUsername(username) {
	const params = {
		TableName: ordersDdb,
		KeyConditionExpression: "pk = :username",
		ExpressionAttributeValues: {
			":username": username,
		},
	};
	try {
		return ddbClient.query(params).promise();
	} catch (err) {
		console.log(err);
	}
}

/**
 * Get order fucntion
 */
function getOrder(username, orderId) {
	const params = {
		TableName: ordersDdb,
		Key: {
			pk: username,
			sk: orderId,
		},
	};
	try {
		return ddbClient.get(params).promise();
	} catch (err) {
		return err;
	}
}

/**
 * Delete order function
 */
function deleteOrder(username, orderId) {
	const params = {
		TableName: ordersDdb,
		Key: {
			pk: username,
			sk: orderId,
		},
	};
	try {
		return ddbClient.delete(params).promise();
	} catch (err) {
		return err;
	}
}
