build-ResumeForgeFunction:
	node scripts/build-lambda.mjs --outdir $(ARTIFACTS_DIR)

clean-ResumeForgeFunction:
	rm -rf $(ARTIFACTS_DIR)
