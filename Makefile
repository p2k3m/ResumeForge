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

build-AuditingFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-AuditingFunction:
	rm -rf $(ARTIFACTS_DIR)
