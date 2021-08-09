const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const invoicesDdb = process.env.INVOICES_DDB;
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
const s3Client = new AWS.S3();

exports.handler = async function (event, context) {
	const key = event.Records[0].s3.object.key;

	const invoiceTransactionResult = await getInvoiceTransaction(key);
	const invoiceTransaction = invoiceTransactionResult.Item;

	const params = {
		Key: key,
		Bucket: event.Records[0].s3.bucket.name,
	};

	const object = await s3Client.getObject(params).promise();
	const invoice = JSON.parse(object.Body.toString("utf-8"));

	let apigwManagementApi;

	if (invoiceTransaction) {
		apigwManagementApi = new AWS.ApiGatewayManagementApi({
			apiVersion: "2018-11-29",
			endpoint: invoiceTransaction.endpoint,
		});

		await Promise.all([
			updateInvoiceTransaction(key, "INVOICE_RECEIVED"),
			sendInvoiceStatus(
				apigwManagementApi,
				invoiceTransaction,
				"INVOICE_RECEIVED"
			),
		]);
	}

	if (invoice.invoiceNumber) {
		const createInvoicePromise = createInvoice(invoice, key);
		const deleteInvoicePromise = s3Client.deleteObject(params).promise();

		await Promise.all([createInvoicePromise, deleteInvoicePromise]);

		if (invoiceTransaction) {
			await Promise.all([
				updateInvoiceTransaction(key, "INVOICE_PROCESSED"),
				sendInvoiceStatus(
					apigwManagementApi,
					invoiceTransaction,
					"INVOICE_PROCESSED"
				),
			]);
		}
	} else {
		if (invoiceTransaction) {
			await Promise.all([
				updateInvoiceTransaction(key, "FAIL_NO_INVOICE_NUMBER"),
				sendInvoiceStatus(
					apigwManagementApi,
					invoiceTransaction,
					"FAIL_NO_INVOICE_NUMBER"
				),
			]);

			await disconnectClient(apigwManagementApi, invoiceTransaction);
		}
	}

	return {};
};

/**
 * Create invoice
 */
function createInvoice(invoice, key) {
	const params = {
		TableName: invoicesDdb,
		Item: {
			pk: `#invoice_${invoice.customerName}`,
			sk: invoice.invoiceNumber,
			totalValue: invoice.totalValue,
			productId: invoice.productId,
			quantity: invoice.quantity,
			transactionId: key,
			ttl: 0,
			createdAt: Date.now(),
		},
	};

	try {
		return ddbClient.put(params).promise();
	} catch (err) {
		console.error(err);
	}
}

/**
 * Get invoice transaction
 */
function getInvoiceTransaction(key) {
	const params = {
		TableName: invoicesDdb,
		Key: {
			pk: "#transaction",
			sk: key,
		},
	};
	try {
		return ddbClient.get(params).promise();
	} catch (err) {
		return err;
	}
}

/**
 * Update Invoice Transaction
 */
function updateInvoiceTransaction(key, status) {
	const params = {
		TableName: invoicesDdb,
		Key: {
			pk: "#transaction",
			sk: key,
		},
		UpdateExpression: "set transactionStatus = :s",
		ExpressionAttributeValues: {
			":s": status,
		},
	};
	try {
		return ddbClient.update(params).promise();
	} catch (err) {
		console.error(err);
	}
}

/**
 * Send Invoice Status
 */
function sendInvoiceStatus(apigwManagementApi, invoiceTransaction, status) {
	const postData = JSON.stringify({
		transactionId: invoiceTransaction.sk,
		status,
	});
	return apigwManagementApi
		.postToConnection({
			ConnectionId: invoiceTransaction.connectionId,
			Data: postData,
		})
		.promise();
}

/**
 * Disconnect Client
 */
function disconnectClient(apigwManagementApi, invoiceTransaction) {
	return apigwManagementApi
		.deleteConnection({
			ConnectionId: invoiceTransaction.connectionId,
		})
		.promise();
}
