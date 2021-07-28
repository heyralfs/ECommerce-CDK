import * as codepipeline from "@aws-cdk/aws-codepipeline";
import * as codepipeline_actions from "@aws-cdk/aws-codepipeline-actions";
import * as cdk from "@aws-cdk/core";
import { CdkPipeline, SimpleSynthAction } from "@aws-cdk/pipelines";
import { ECommerceStage } from "./commerce-stage";

export class PipelineStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const sourceArtifact = new codepipeline.Artifact();
		const cloudAssemblyArtifact = new codepipeline.Artifact();

		const pipeline = new CdkPipeline(this, "Pipeline", {
			pipelineName: "ECommercePipeline",
			cloudAssemblyArtifact,

			sourceAction: new codepipeline_actions.GitHubSourceAction({
				actionName: "GitHub",
				output: sourceArtifact,
				oauthToken: cdk.SecretValue.secretsManager("github-token2"),
				owner: "heyralfs",
				repo: "ECommerce-CDK",
				branch: "master",
			}),

			synthAction: SimpleSynthAction.standardNpmSynth({
				sourceArtifact,
				cloudAssemblyArtifact,
				// installCommand: "npx nmp@7 install && ..." -- se npm -v > 7
				installCommand:
					"npx npm@6 install && npm install -g typescript && npm install -g aws-cdk",
				buildCommand: "npm run build",
				environment: {
					privileged: true, // permite execução de uma imagem de docker no momento de build
				},
			}),
		});

		/**
		 * Pipeline stages
		 */
		pipeline.addApplicationStage(
			new ECommerceStage(this, "Stage1", {
				// conta do deployment deste stage - não necessariamente igual da pipeline
				// pode-se ter os stages (dev, qa, prod, ...) em contas diferentes
				env: {
					account: "743908444175",
					region: "us-east-1",
				},
			})
		);
	}
}
