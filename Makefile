build-ClientAppFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function ClientAppFunction

clean-ClientAppFunction:
	rm -rf $(ARTIFACTS_DIR)

build-ResumeForgeFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function ResumeForgeFunction

clean-ResumeForgeFunction:
	rm -rf $(ARTIFACTS_DIR)

build-JobEvaluationFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function JobEvaluationFunction

clean-JobEvaluationFunction:
	rm -rf $(ARTIFACTS_DIR)

build-ScoringFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function ScoringFunction

clean-ScoringFunction:
	rm -rf $(ARTIFACTS_DIR)

build-EnhancementFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function EnhancementFunction

clean-EnhancementFunction:
	rm -rf $(ARTIFACTS_DIR)

build-DocumentGenerationFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function DocumentGenerationFunction

clean-DocumentGenerationFunction:
	rm -rf $(ARTIFACTS_DIR)

build-DocumentGenerationWorkerFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function DocumentGenerationWorkerFunction

clean-DocumentGenerationWorkerFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowScoreFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function WorkflowScoreFunction

clean-WorkflowScoreFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowEnhancementSectionFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function WorkflowEnhancementSectionFunction

clean-WorkflowEnhancementSectionFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowCombineFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function WorkflowCombineFunction

clean-WorkflowCombineFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowGenerateFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function WorkflowGenerateFunction

clean-WorkflowGenerateFunction:
	rm -rf $(ARTIFACTS_DIR)

build-AuditingFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR) --function AuditingFunction

clean-AuditingFunction:
	rm -rf $(ARTIFACTS_DIR)
