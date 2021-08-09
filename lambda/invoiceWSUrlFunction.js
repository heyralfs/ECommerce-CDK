const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");
const uuid = require("uuid");

const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const invoicesDdb = process.env.INVOICES_DDB;
const bucketName = process.env.BUCKET_NAME;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT.substring(6); // removes "ws://"
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

const s3Client = new AWS.S3();
const ddbClient = new AWS.DynamoDB.DocumentClient();
const apigwManagementApi = new AWS.ApiGatewayManagementApi({
	apiVersion: "2018-11-29",
	endpoint: invoiceWsApiEndpoint,
});

exports.handler = async function (event, context) {
	console.log(event);

	const lambdaRequestId = context.awsRequestId;
	const connectionId = event.requestContext.connectionId;

	console.log(
		`ConnectionId: ${connectionId} | Lambda RequestId: ${lambdaRequestId}`
	);

	const key = uuid.v4();
	const expires = 300; // seconds

	const params = {
		Bucket: bucketName,
		Key: key,
		Expires: expires,
	};

	const signedUrl = await s3Client.getSignedUrlPromise("putObject", params);

	await createInvoiceTransaction(
		key,
		lambdaRequestId,
		expires,
		connectionId,
		invoiceWsApiEndpoint
	);

	const postData = JSON.stringify({
		url: signedUrl,
		expiresIn: expires,
		transactionId: key,
	});

	await apigwManagementApi
		.postToConnection({
			ConnectionId: connectionId,
			Data: postData,
		})
		.promise();

	return {};
};

/**
 * Create invoice transaction
 */
function createInvoiceTransaction(
	key,
	requestId,
	expiresIn,
	connectionId,
	invoiceWsApiEndpoint
) {
	const timestamp = Date.now();
	const ttl = ~~(timestamp / 1000 + 60 * 2); // 2min

	const params = {
		TableName: invoicesDdb,
		Item: {
			pk: "#transaction",
			sk: key,
			requestId,
			transactionStatus: "URL_GENERATED",
			timestamp,
			ttl,
			expiresIn,
			connectionId,
			endpoint: invoiceWsApiEndpoint,
		},
	};

	try {
		return ddbClient.put(params).promise();
	} catch (err) {
		console.error(err);
	}
}
