build-ClientAppFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-ClientAppFunction:
	rm -rf $(ARTIFACTS_DIR)

build-ResumeForgeFunction:
node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-ResumeForgeFunction:
	rm -rf $(ARTIFACTS_DIR)

build-JobEvaluationFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-JobEvaluationFunction:
	rm -rf $(ARTIFACTS_DIR)

build-ScoringFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-ScoringFunction:
	rm -rf $(ARTIFACTS_DIR)

build-EnhancementFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-EnhancementFunction:
	rm -rf $(ARTIFACTS_DIR)

build-DocumentGenerationFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-DocumentGenerationFunction:
	rm -rf $(ARTIFACTS_DIR)

build-DocumentGenerationWorkerFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-DocumentGenerationWorkerFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowScoreFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-WorkflowScoreFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowEnhancementSectionFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-WorkflowEnhancementSectionFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowCombineFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-WorkflowCombineFunction:
	rm -rf $(ARTIFACTS_DIR)

build-WorkflowGenerateFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-WorkflowGenerateFunction:
	rm -rf $(ARTIFACTS_DIR)

build-AuditingFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-AuditingFunction:
	rm -rf $(ARTIFACTS_DIR)
