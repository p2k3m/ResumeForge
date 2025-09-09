export function getScoreStatus(score = 0) {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Average'
  return 'Poor'
}
