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
	if (event.resource === "/products/events/{code}") {
		// GET /products/events/{code}
		const data = await getEventsByCode(events.pathParameters.code);

		return {
			statusCode: 200,
			body: JSON.stringify(convertItemToEvents(data.Items)),
		};
	} else if (event.resource === "/products/events/{code}/{event}") {
		// GET /products/events/{code}/{event}
		const data = await getEventsByCodeAndEventType(
			event.pathParameters.code,
			event.pathParameters.event
		);

		return {
			statusCode: 200,
			body: JSON.stringify(convertItemToEvents(data.Items)),
		};
	} else if (event.resource === "/products/events") {
		if (
			event.queryStringParameters &&
			event.queryStringParameters.username
		) {
			// with Global Secondary Index
			// GET /products/events?username=matilde
			const data = await getEventsByUsername(
				event.queryStringParameters.username
			);

			return {
				statusCode: 200,
				body: JSON.stringify(convertItemToEvents(data.Items)),
			};
		} else if (
			event.queryStringParameters &&
			event.queryStringParameters.username2
		) {
			// without Global Secondary Index
			// GET /products/events?username2=matilde
			const data = await getEventsByUsername2(
				event.queryStringParameters.username2
			);

			return {
				statusCode: 200,
				body: JSON.stringify(convertItemToEvents(data.Items)),
			};
		}
	}

	return {
		statusCode: 400,
		body: JSON.stringify("Bad request!"),
	};
};

/**
 * Convert items to events
 */
function convertItemToEvents(items) {
	return items.map((item) => {
		return {
			createdAt: item.createdAt,
			eventType: item.sk.split("#")[0], // sk = <eventType>#<timestamp>
			username: item.username,
			productId: item.info.productId,
			requestId: productId.requestId,
			code: item.pk.split("_")[1], // #product_<CODE>
		};
	});
}

/**
 * Get events by code
 */
function getEventsByCode(code) {
	const params = {
		TableName: eventsDdb,
		KeyConditionExpression: "pk = :code",
		ExpressionAttributeValues: {
			":code": `#product_${code}`,
		},
	};
	try {
		return ddbClient.query(parms).promise();
	} catch (err) {
		return err;
	}
}

/**
 * Get events by code and event type
 */
function getEventsByCodeAndEventType(code, eventType) {
	const params = {
		TableName: eventsDdb,
		KeyConditionExpression: "pk = :code AND begins_with (sk, :eventType)",
		ExpressionAttributeValues: {
			":code": `#product_${code}`,
			":eventType": eventType,
		},
	};
	try {
		return ddbClient.query(params).promise();
	} catch (err) {
		return err;
	}
}

/**
 * Get events by username
 */
// with Global Secondary Index
function getEventsByUsername(username) {
	const params = {
		TableName: eventsDdb,
		IndexName: "usernameIndex", // GSI name
		KeyConditionExpression:
			"username = :username AND begins_with (pl, :prefix)",
		ExpressionAttributeValues: {
			":username": username,
			":prefix": "#product_",
		},
	};
	try {
		return ddbClient.query(params).promise();
	} catch (err) {
		return err;
	}
}
// without Global Secondary Index - low performance, not recommended
function getEventsByUsername2(username) {
	const params = {
		TableName: eventsDdb,
		FilterExpression: "username = :username AND begins_with (pl, :prefix)",
		ExpressionAttributeValues: {
			":username": username,
			":prefix": "#product_",
		},
	};
	try {
		return ddbClient.scan(params).promise();
	} catch (err) {
		return err;
	}
}
