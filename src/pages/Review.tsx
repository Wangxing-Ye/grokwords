import React, { useMemo, useState } from 'react'
import type { Word } from '../types'

export interface ReviewRecord {
  word: string
  day: number
  date: string
  reward: number
}

interface ReviewProps {
  words: Word[]
  reviewRecords: ReviewRecord[]
  saveReviewToDB: (word: string, day: number, date: string) => Promise<void>
}

export default function Review({ words, reviewRecords, saveReviewToDB }: ReviewProps) {
  const [selectedReviewDate, setSelectedReviewDate] = useState<string | null>(null)
  const [selectedReviewDay, setSelectedReviewDay] = useState<number | null>(null)
  const [revealedReviewIds, setRevealedReviewIds] = useState<Set<number>>(new Set())

  const grokkedWords = useMemo(
    () => words.filter(w => w.definition && w.definition.trim().length > 0 && w.grokkedAt),
    [words]
  )

  const countsByDate = useMemo(() => {
    return grokkedWords.reduce<Record<string, number>>((acc, w) => {
      const dateKey = w.grokkedAt!.slice(0, 10).replace(/-/g, '/')
      acc[dateKey] = (acc[dateKey] || 0) + 1
      return acc
    }, {})
  }, [grokkedWords])

  const sortedDates = useMemo(
    () => Object.entries(countsByDate).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)),
    [countsByDate]
  )

  const selectedWords = useMemo(() => {
    if (!selectedReviewDate) return []
    return grokkedWords.filter(
      w => w.grokkedAt && w.grokkedAt.slice(0, 10).replace(/-/g, '/') === selectedReviewDate
    )
  }, [grokkedWords, selectedReviewDate])

  const handleSelectDate = (date: string, day: number, revealAll = false) => {
    const nextDate = selectedReviewDate === date && selectedReviewDay === day ? null : date
    setSelectedReviewDate(nextDate)
    setSelectedReviewDay(nextDate ? day : null)

    if (!nextDate) {
      setRevealedReviewIds(new Set())
      return
    }

    if (revealAll) {
      const wordsForDate = grokkedWords.filter(
        w => w.grokkedAt && w.grokkedAt.slice(0, 10).replace(/-/g, '/') === date
      )
      setRevealedReviewIds(new Set(wordsForDate.map(w => w.id)))
    } else {
      setRevealedReviewIds(new Set())
    }
  }

  return (
    <div className="main-content" style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'linear-gradient(135deg, #fef9c3, #fde68a)',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: '#111827',
            marginBottom: '0.75rem',
            fontSize: '1.05rem',
            textAlign: 'center',
          }}
        >
          Golden Review Time Points by Ebbinghaus
        </div>
        {sortedDates.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No grokked words yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <colgroup>
              {Array.from({ length: 9 }).map((_, idx) => (
                <col key={idx} style={{ width: `${100 / 9}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Date</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Grokked Words</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 0</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 1</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 3</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 7</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 15</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Day 30</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#374151' }}>Rewards ($GW)</th>
              </tr>
            </thead>
            <tbody>
              {sortedDates.map(([date, count]) => {
                const daysSince = (() => {
                  const parsed = Date.parse(date.replace(/\//g, '-'))
                  if (Number.isNaN(parsed)) return null
                  const diffMs = Date.now() - parsed
                  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
                })()

                const totalRewardForDate = reviewRecords
                  .filter(r => r.date === date)
                  .reduce((sum, r) => sum + (Number.isFinite(r.reward) ? r.reward : 0), 0)

                const renderIconFor = (target: number) => {
                  const isDue = daysSince === target
                  const reviewedCount = reviewRecords.filter(r => r.date === date && r.day === target).length
                  const allReviewed = reviewedCount === count
                  const isActive = selectedReviewDate === date && selectedReviewDay === target
                  const isClickable = isDue || allReviewed
                  const baseStyle = {
                    textAlign: 'center' as const,
                    cursor: isClickable ? 'pointer' : 'default',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    border: isClickable ? '1px solid #d1d5db' : '1px solid transparent',
                    borderRadius: '4px',
                    backgroundColor: allReviewed ? '#10b981' : isActive ? '#3b82f6' : 'transparent',
                    color: allReviewed || isActive ? '#ffffff' : '#111827',
                    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  }
                  return (
                    <span
                      key={target}
                      style={baseStyle}
                      onClick={
                        isClickable ? () => handleSelectDate(date, target, allReviewed && !isDue ? true : false) : undefined
                      }
                    />
                  )
                }

                return (
                  <tr key={date}>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#111827', fontWeight: 600 }}>{date}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', color: '#111827', fontWeight: 600, textAlign: 'center' }}>{count}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(0)}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(1)}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(3)}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(7)}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(15)}</td>
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center' }}>{renderIconFor(30)}</td>
                  <td style={{ padding: '6px 4px', borderBottom: '1px solid #ffffff', textAlign: 'center', fontWeight: 600, color: '#065f46' }}>
                    {totalRewardForDate}
                  </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedReviewDate && selectedReviewDay !== null && (
        <ReviewWordList
          words={selectedWords}
          selectedReviewDate={selectedReviewDate}
          selectedReviewDay={selectedReviewDay}
          revealedReviewIds={revealedReviewIds}
          setRevealedReviewIds={setRevealedReviewIds}
          saveReviewToDB={saveReviewToDB}
        />
      )}
    </div>
  )
}

function ReviewWordList({
  words,
  selectedReviewDate,
  selectedReviewDay,
  revealedReviewIds,
  setRevealedReviewIds,
  saveReviewToDB,
}: {
  words: Word[]
  selectedReviewDate: string
  selectedReviewDay: number
  revealedReviewIds: Set<number>
  setRevealedReviewIds: React.Dispatch<React.SetStateAction<Set<number>>>
  saveReviewToDB: (word: string, day: number, date: string) => Promise<void>
}) {
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)

  const playWordAudio = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.error('Unable to play audio for', text, err)
    }
  }

  const toggleReveal = async (word: Word) => {
    setRevealedReviewIds(prev => {
      const next = new Set(prev)
      if (next.has(word.id)) next.delete(word.id)
      else next.add(word.id)
      return next
    })

    const reviewDate = word.grokkedAt?.slice(0, 10).replace(/-/g, '/') || selectedReviewDate
    await saveReviewToDB(word.word, selectedReviewDay, reviewDate)
  }

  return (
    <>
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
        <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
          {selectedReviewDate} — Day {selectedReviewDay}
        </div>
        <table className="vocabulary-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Word</th>
              <th>Audio</th>
              <th>Review</th>
              <th>POS</th>
              <th>Phonetic</th>
              <th>Definition</th>
              <th>Example</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {words.map(word => {
              const isRevealed = revealedReviewIds.has(word.id)
              const hideFields = !isRevealed
              return (
                <tr key={word.id}>
                  <td>
                    <span className="word revealed">{word.word}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                  <button
                      className="audio-button"
                      onClick={() => playWordAudio(word.word)}
                      title={`Play pronunciation of ${word.word}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="#3b82f6"
                      >
                        <path d="M6 3.5v9l7-4.5-7-4.5z" />
                      </svg>
                    </button>
                  </td>
                  <td>
                    <button
                      className="grok-button"
                      style={{
                        backgroundColor: isRevealed ? '#10b981' : '#3b82f6',
                        width: 'auto',
                        minWidth: '90px',
                      }}
                      onClick={() => toggleReveal(word)}
                    >
                      {isRevealed ? 'Hide' : 'Review'}
                    </button>
                  </td>
                  <td>{hideFields ? '' : word.pos}</td>
                  <td>{hideFields ? '' : word.phonetic}</td>
                  <td>
                    {hideFields ? (
                      ''
                    ) : (
                      <div className="definition-content">
                        {(word.definition || '').split('\n').map((line, idx) => (
                          <div key={idx}>{line}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {hideFields ? (
                      ''
                    ) : word.example && word.example.trim() ? (
                      <div className="example-content">
                        {(word.example || '')
                          .split('\n')
                          .slice(0, 2)
                          .map((line, idx) => (
                            <div key={idx}>{line}</div>
                          ))}
                      </div>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {hideFields ? (
                      ''
                    ) : word.imageUrl ? (
                      <img
                        src={word.imageUrl}
                        alt={`Illustration for ${word.word}`}
                        className="word-image"
                        style={{ maxHeight: '64px', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setPreviewImage({ src: word.imageUrl!, alt: `Illustration for ${word.word}` })}
                      />
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '12px',
              borderRadius: '8px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              style={{ maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
            />
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button className="grok-button" onClick={() => setPreviewImage(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
