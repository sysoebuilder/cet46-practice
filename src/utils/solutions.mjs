// Answer keys are content, never persisted in the user's response records.
export function answerReview(paper, sectionId, item, response) {
  if (item.kind === 'text') {
    const references = paper.solutions?.references?.[sectionId] || []
    return { status: 'reference', references }
  }
  const solution = paper.solutions?.items?.[item.key]
  const option = item.options.find(option => option.label === solution?.answer)
  if (!option) return { status: 'missing' }
  const attempted = item.options.some(option => option.label === response)
  return {
    status: !attempted ? 'unanswered' : response === solution.answer ? 'correct' : 'incorrect',
    answer: solution.answer,
    answerText: option.text,
    explanation: solution.explanation || '',
  }
}
