import { createServiceHandler } from '../../microservices/createServiceHandler.js';
import { getServiceConfig } from '../../microservices/services.js';

const createEnhancementHttpHandler = (key) =>
  createServiceHandler(getServiceConfig(key));

export const enhancementImproveSummaryHttpHandler =
  createEnhancementHttpHandler('enhancementImproveSummary');

export const enhancementImproveSkillsHttpHandler =
  createEnhancementHttpHandler('enhancementImproveSkills');

export const enhancementImproveDesignationHttpHandler =
  createEnhancementHttpHandler('enhancementImproveDesignation');

export const enhancementImproveExperienceHttpHandler =
  createEnhancementHttpHandler('enhancementImproveExperience');

export const enhancementImproveCertificationsHttpHandler =
  createEnhancementHttpHandler('enhancementImproveCertifications');

export const enhancementImproveProjectsHttpHandler =
  createEnhancementHttpHandler('enhancementImproveProjects');

export const enhancementImproveHighlightsHttpHandler =
  createEnhancementHttpHandler('enhancementImproveHighlights');

export const enhancementImproveAtsHttpHandler =
  createEnhancementHttpHandler('enhancementImproveAts');

export const enhancementImproveAllHttpHandler =
  createEnhancementHttpHandler('enhancementImproveAll');

export default enhancementImproveSummaryHttpHandler;
