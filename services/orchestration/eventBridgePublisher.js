import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { normaliseFanOutTypes } from '../enhancement/workflow.js';

const client = new EventBridgeClient({});
const busName = process.env.ORCHESTRATION_BUS_NAME || '';

function isEnabled() {
  return Boolean(busName);
}

export async function publishResumeWorkflowEvent(detail) {
  if (!isEnabled()) {
    return { skipped: true };
  }
  const safeDetail = detail && typeof detail === 'object' ? detail : {};
  const enhancementTypes = normaliseFanOutTypes(safeDetail.enhancementTypes);
  const enrichedDetail = {
    ...safeDetail,
    enhancementTypes,
    triggeredAt: new Date().toISOString(),
  };
  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: busName,
        Source: 'resumeForge.workflow',
        DetailType: 'ResumeFlowRequested',
        Detail: JSON.stringify(enrichedDetail),
      },
    ],
  });
  await client.send(command);
  return { success: true };
}

export default publishResumeWorkflowEvent;
