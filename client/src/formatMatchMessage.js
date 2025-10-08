export function formatMatchMessage(originalScore = 0, enhancedScore = 0) {
  const likelihood =
    enhancedScore >= 80 ? 'High' : enhancedScore >= 50 ? 'Medium' : 'Low';
  if (enhancedScore > originalScore) {
    return `JD skill coverage improved from ${originalScore}% to ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
  }
  return `JD skill coverage remains at ${enhancedScore}%, indicating a ${likelihood} selection likelihood.`;
}
