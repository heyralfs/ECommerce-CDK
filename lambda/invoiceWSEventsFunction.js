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
	const promises = [];

	event.Records.forEach(async (record) => {
		console.log(record);

		// pode-se utilizar
		// record.dynamodb.Keys.pk.S
		// para verificar se evento é invoice ou transaction
		// e economizar nos if/else abaixo

		if (record.eventName === "INSERT") {
			if (record.dynamodb.NewImage.pk.S.startsWith("#invoice")) {
				// Invoice event
				console.log("Invoice event received");

				promises.push(
					createEvent(record.dynamodb.NewImage, "INVOICE_CREATED")
				);
			} else if (
				record.dynamodb.NewImage.pk.S.startsWith("#transaction")
			) {
				// Invoice transaction event
				console.log("Invoice transaction event received");
			}
		} else if (record.eventName === "MODIFY") {
		} else if (record.eventName === "REMOVE") {
			if (record.dynamodb.OldImage.pk.S.startsWith("#transaction")) {
				// Invoice transaction event
				console.log("Invoice transaction event received");

				if (
					record.dynamodb.OldImage.transactionStatus ===
					"INVOICE_PROCESSED"
				) {
					console.log("Invoice processed");
				} else {
					console.log("Invoice import failed - timeout / error");

					const endpoint = record.dynamodb.OldImage.endpoint.S;
					const transactionId = record.dynamodb.OldImage.sk.S;
					const connectionId =
						record.dynamodb.OldImage.connectionId.S;

					const apigwManagementApi = new AWS.ApiGatewayManagementApi({
						apiVersion: "2018-11-29",
						endpoint,
					});

					await sendInvoiceStatus(
						apigwManagementApi,
						transactionId,
						connectionId,
						"TIMEOUT"
					);

					await disconnectClient(apigwManagementApi, connectionId);
				}
			}
		}
	});

	await Promise.all(promises);
};

/**
 * Create event
 */
function createEvent(invoiceEvent, eventType) {
	const timestamp = Date.now();
	const ttl = ~~(timestamp / 1000 + 60 * 60);
	const params = {
		TableName: eventsDdb,
		Item: {
			pk: `#invoice_${invoiceEvent.sk.S}`, // #invoice_ABC-123
			sk: `${eventType}#${timestamp}`, // INVOICE_CREATED#123
			ttl,
			username: invoiceEvent.pk.S.split("_")[1],
			createdAt: timestamp,
			eventType,
			info: {
				transactionId: invoiceEvent.transactionId.S,
				productId: invoiceEvent.productId.N,
			},
		},
	};
	try {
		return ddbClient.put(params).promise();
	} catch (err) {
		console.error(err);
	}
}

/**
 * Send Invoice Status
 */
function sendInvoiceStatus(
	apigwManagementApi,
	transactionId,
	connectionId,
	status
) {
	const postData = JSON.stringify({
		transactionId,
		status,
	});
	return apigwManagementApi
		.postToConnection({
			ConnectionId: connectionId,
			Data: postData,
		})
		.promise();
}

/**
 * Disconnect Client
 */
function disconnectClient(apigwManagementApi, connectionId) {
	return apigwManagementApi
		.deleteConnection({
			ConnectionId: connectionId,
		})
		.promise();
}
