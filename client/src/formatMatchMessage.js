export function formatMatchMessage(originalScore = 0, enhancedScore = 0) {
  const likelihood =
    enhancedScore >= 80 ? 'High' : enhancedScore >= 50 ? 'Medium' : 'Low';
  if (enhancedScore > originalScore) {
    return `Your score improved from ${originalScore}% to ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
  }
  return `Your score remains at ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
}
