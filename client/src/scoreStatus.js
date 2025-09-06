export function getScoreStatus(score = 0) {
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Average'
  return 'Needs Improvement'
}
