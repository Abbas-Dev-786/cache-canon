export const keys = {
  huntConfig:       (postId: string) => `hunt-${postId}-config`,
  huntRun:          (postId: string, userId: string) => `hunt-${postId}-run-${userId}`,
  huntStats:        (postId: string) => `hunt-${postId}-stats`,
  huntLeaderboard:  (postId: string) => `hunt-${postId}-leaderboard`,
  huntResult:       (postId: string, userId: string) => `hunt-${postId}-result-${userId}`,
  huntDraft:        (draftId: string, userId: string) => `hunt-draft-${draftId}-${userId}`,
  creatorStats:     (userId: string) => `creator-${userId}-stats`,
  dailyPost:        (date: string) => `daily-${date}-post`,
  dailyQueue:       () => `daily-queue`,
  dailyStreak:      (userId: string) => `daily-streak-${userId}`,
};
