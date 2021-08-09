const AWS = require("aws-sdk");

const awsRegion = process.env.AWS_REGION;

AWS.config.update({
	region: awsRegion,
});

exports.handler = async function (event, context) {
	console.log(event);

	return {};
};
