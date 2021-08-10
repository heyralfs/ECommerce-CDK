const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const awsRegion = process.env.AWS_REGION;
const eventsDdb = process.env.EVENTS_DDB;

AWS.config.update({
	region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {
	console.log(event);

	const promises = [];

	//event.Records.forEach(async (record) => {
	for (let index = 0; index < event.Records.length; index++) {
		const record = event.Records[index];
		console.log(record);

		//record.dynamodb.Keys.pk.S
		if (record.eventName === "INSERT") {
			console.log(`NewImage pk.s: ${record.dynamodb.NewImage.pk.S}`);
			if (record.dynamodb.NewImage.pk.S.startsWith("#transaction")) {
				//Invoice transaction event
				console.log(`Invoice transaction event received`);
			} else {
				//Invoice event
				console.log(`Invoice event received`);
				promises.push(
					createEvent(record.dynamodb.NewImage, "INVOICE_CREATED")
				);
			}
		} else if (record.eventName === "MODIFY") {
		} else if (record.eventName === "REMOVE") {
			if (record.dynamodb.OldImage.pk.S.startsWith("#transaction")) {
				//Invoice transaction event
				console.log(`Invoice transaction event received`);

				const endpoint = record.dynamodb.OldImage.endpoint.S;
				const transactionId = record.dynamodb.OldImage.sk.S;
				const connectionId = record.dynamodb.OldImage.connectionId.S;

				console.log(
					`Endpoint: ${endpoint} - TransactionId: ${transactionId} - ConnectionId: ${connectionId}`
				);
				const apigwManagementApi = new AWS.ApiGatewayManagementApi({
					apiVersion: "2018-11-29",
					endpoint: endpoint,
				});

				try {
					const getConnectionResult = await apigwManagementApi
						.getConnection({ ConnectionId: connectionId })
						.promise();
					console.log(getConnectionResult);

					if (
						record.dynamodb.OldImage.transactionStatus.S ===
						"INVOICE_PROCESSED"
					) {
						console.log("Invoice processed");
					} else {
						//TODO - Generate audit envent
						console.log("Invoice import failed - timeout / error");
						await sendInvoiceStatus(
							apigwManagementApi,
							transactionId,
							connectionId,
							"TIMEOUT"
						);

						await disconnectClient(
							apigwManagementApi,
							connectionId
						);
					}
				} catch (err) {
					console.log(err);
				}
			}
		}
	}

	await Promise.all(promises);

	return {};
};

function disconnectClient(apigwManagementApi, connectionId) {
	const params = {
		ConnectionId: connectionId,
	};
	return apigwManagementApi.deleteConnection(params).promise();
}

function sendInvoiceStatus(
	apigwManagementApi,
	transactionId,
	connectionId,
	status
) {
	const postData = JSON.stringify({
		transactionId: transactionId,
		status: status,
	});

	return apigwManagementApi
		.postToConnection({
			ConnectionId: connectionId,
			Data: postData,
		})
		.promise();
}

function createEvent(invoiceEvent, eventType) {
	const timestamp = Date.now();
	const ttl = ~~(timestamp / 1000 + 60 * 60);

	const params = {
		TableName: eventsDdb,
		Item: {
			pk: `#invoice_${invoiceEvent.sk.S}`, // #invoice_ABC-123
			sk: `${eventType}#${timestamp}`, // INVOICE_CREATED#123
			ttl: ttl,
			username: invoiceEvent.pk.S.split("_")[1],
			createdAt: timestamp,
			eventType: eventType,
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
