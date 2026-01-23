export interface Word {
  id: number
  word: string
  level: number
  levelLabel: string
  pos: string
  phonetic: string
  definition: string
  example: string
  revealed: boolean
  imageUrl?: string
  grokkedAt?: string
  toefl?: string
  ielts?: string
}

export interface ReviewRecord {
  word: string
  day: number
  date: string
  reward: number
}
