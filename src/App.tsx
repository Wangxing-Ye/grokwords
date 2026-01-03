import { useState, useRef, useEffect } from 'react'
import './App.css'

interface Word {
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
}

const levels = [
  { value: 'all', label: 'All Levels' },
  { value: '1', label: 'Level 1 (Basic)' },
  { value: '2', label: 'Level 2 (Medium)' },
  { value: '3', label: 'Level 3 (Advanced)' },
  { value: '4', label: 'Level 4 (Professional)' },
]

function App() {
  const [words, setWords] = useState<Word[]>([
    {
      id: 5,
      word: 'Construct',
      level: 1,
      levelLabel: '1 (Basic)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: false,
    },
    {
      id: 6,
      word: 'Diligent',
      level: 2,
      levelLabel: '2 (Medium)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: false,
    },
    {
      id: 1,
      word: 'Ephemeral',
      level: 3,
      levelLabel: '3 (Advanced)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: true,
    },
    {
      id: 7,
      word: 'Fortitude',
      level: 3,
      levelLabel: '3 (Advanced)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: false,
    },
    {
      id: 4,
      word: 'Mellifluous',
      level: 4,
      levelLabel: '4 (Professional)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: false,
    },
    {
      id: 8,
      word: 'Nuance',
      level: 3,
      levelLabel: '3 (Advanced)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: false,
    },
    {
      id: 2,
      word: 'Resilient',
      level: 2,
      levelLabel: '2 (Medium)',
      pos: '',
      phonetic: "",
      definition: '',
      example: '',
      revealed: true,
    },
  ])

  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [isLevelsDropdownOpen, setIsLevelsDropdownOpen] = useState(false)
  const levelsDropdownRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [llmProvider, setLlmProvider] = useState('xai')
  const [apiKey, setApiKey] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState('english')
  const [loadingImageId, setLoadingImageId] = useState<number | null>(null)
  const [loadingGrokId, setLoadingGrokId] = useState<number | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [showImageModal, setShowImageModal] = useState(false)
  const [currentWordName, setCurrentWordName] = useState<string>('')
  const [currentWordId, setCurrentWordId] = useState<number | null>(null)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('grokwords_apiKey')
    const savedNativeLanguage = localStorage.getItem('grokwords_nativeLanguage')
    
    if (savedApiKey) {
      setApiKey(savedApiKey)
    }
    if (savedNativeLanguage) {
      setNativeLanguage(savedNativeLanguage)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        levelsDropdownRef.current &&
        !levelsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLevelsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Update modal image when word's imageUrl changes
  useEffect(() => {
    if (currentWordId !== null && showImageModal) {
      const word = words.find((w) => w.id === currentWordId)
      if (word?.imageUrl) {
        setGeneratedImageUrl(word.imageUrl)
      }
    }
  }, [words, currentWordId, showImageModal])

  const handleLevelSelect = (value: string) => {
    setSelectedLevel(value)
    setIsLevelsDropdownOpen(false)
  }

  const handlePlayAudio = (word: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word)
      utterance.lang = 'en-US'
      utterance.rate = 0.9
      speechSynthesis.speak(utterance)
    }
  }

  const handleGrokWord = async (wordId: number, word: string) => {
    const apiKey = localStorage.getItem('grokwords_apiKey') || ''
    const nativeLanguage = localStorage.getItem('grokwords_nativeLanguage') || 'english'

    if (!apiKey) {
      alert('Please set your API key in Settings first.')
      return
    }

    setLoadingGrokId(wordId)

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI assistant.',
            },
            {
              role: 'user',
              content: `Please provide the part of speech, phonetic, and concise definition and ${nativeLanguage} translation of "${word}". If it has multiple parts of speech, then show one only.\nFormat your response as: part of speech, phonetic, concise definition, ${nativeLanguage} translation`,
            },
          ],
          model: 'grok-4-1-fast-reasoning',
          stream: false,
          temperature: 0,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`Failed to fetch word info: ${response.status}`)
      }

      const data = await response.json()
      console.log('API Response:', data)
      
      const content = data.choices?.[0]?.message?.content || ''
      console.log('Extracted content:', content)

      if (!content) {
        console.error('No content found in response')
        alert('No content returned from API')
        return
      }

      // Parse the response: "part of speech, phonetic, concise definition, native translation"
      const parts = content.split(',').map((p: string) => p.trim())
      
      if (parts.length >= 4) {
        const pos = parts[0]
        const phonetic = parts[1]
        const definition = parts[2]
        const nativeTranslation = parts[3]
        
        // Combine definition and native translation with newline
        const fullDefinition = `${definition}\n${nativeTranslation}`

        // Update the word's pos, phonetic, and definition
        setWords((prevWords) => {
          const updated = prevWords.map((w) =>
            w.id === wordId
              ? {
                  ...w,
                  pos: pos,
                  phonetic: phonetic,
                  definition: fullDefinition,
                }
              : w
          )
          console.log('Updated word:', updated.find(w => w.id === wordId))
          return updated
        })

        // Automatically generate example after successful word info update
        try {
          const exampleResponse = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful AI assistant.',
                },
                {
                  role: 'user',
                  content: `Generate a simple example sentence using the word "${word}" in English and its ${nativeLanguage} translation, Noun key words from the sentence. Format your response as: English sentence\n${nativeLanguage} translation\nNoun key words`,
                },
              ],
              model: 'grok-4-1-fast-reasoning',
              stream: false,
              temperature: 0,
            }),
          })

          if (exampleResponse.ok) {
            const exampleData = await exampleResponse.json()
            let example = exampleData.choices?.[0]?.message?.content || ''
            
            if (example) {
              // Remove quotes from both sides if present
              example = example.trim()
              if ((example.startsWith('"') && example.endsWith('"')) || 
                  (example.startsWith("'") && example.endsWith("'"))) {
                example = example.slice(1, -1).trim()
              }

              // If example doesn't include '\n', replace the period before the translation with '\n'
              if (!example.includes('\n')) {
                // Replace period + space that's followed by non-ASCII characters (translation) with period + newline + space
                example = example.replace(/\.\s+(?=[^\x00-\x7F])/g, '.\n')
                // If that didn't work, try replacing the last period + space
                if (!example.includes('\n')) {
                  const lastPeriodIndex = example.lastIndexOf('. ')
                  if (lastPeriodIndex !== -1) {
                    example = example.substring(0, lastPeriodIndex + 1) + '\n' + example.substring(lastPeriodIndex + 2)
                  }
                }
              }

              // Update the word's example
              setWords((prevWords) => {
                return prevWords.map((w) =>
                  w.id === wordId ? { ...w, example: example } : w
                )
              })
            }
          }
        } catch (exampleError) {
          // Don't show error for example generation failure, just log it
          console.error('Error generating example:', exampleError)
        }
      } else {
        console.error('Unexpected response format:', content)
        alert('Unexpected response format from API')
      }
    } catch (error) {
      console.error('Error fetching word info:', error)
      alert(`Failed to generate word info. Please check your API key and try again.`)
    } finally {
      setLoadingGrokId(null)
    }
  }

  const handleGenerateImage = async (wordId: number, example: string) => {
    const apiKey = localStorage.getItem('grokwords_apiKey') || ''
    const word = words.find((w) => w.id === wordId)?.word || ''
    const definition = words.find((w) => w.id === wordId)?.definition || ''

    if (!apiKey) {
      alert('Please set your API key in Settings first.')
      return
    }

    if (!example || !example.trim()) {
      alert('Please generate an example sentence first.')
      return
    }

    // Extract only English parts (before \n) from definition and example
    const englishDefinition = definition.split('\n')[0].trim()
    const englishExample = example.split('\n')[0].trim()
    const nounKeyWords = example.split('\n')[2].trim()

    setLoadingImageId(wordId)

    try {
      const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-2-image-1212',
          prompt: `A colorful, playful English vocabulary learning card for the word "${word}", vertical layout, cheerful sky-blue background. The word "${word}" appears in large bold letters with soft gradient fill and drop shadow, definition section with text "${englishDefinition}" below. A sample sentence section with text: "${englishExample}" below the definition section. Use readable, classroom-friendly typography with good spacing. Include ${nounKeyWords}, lighthearted, sparkly accents, paper plane flying across, and playful abstract shapes.`,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`Failed to generate image: ${response.status}`)
      }

      const data = await response.json()
      console.log('Image API Response:', data)
      
      const imageUrl = data.data?.[0]?.url || ''
      console.log('Generated image URL:', imageUrl)

      if (!imageUrl) {
        console.error('No image URL found in response')
        alert('No image URL returned from API')
        return
      }

      // Update the word's imageUrl
      setWords((prevWords) => {
        const updated = prevWords.map((w) =>
          w.id === wordId ? { ...w, imageUrl: imageUrl } : w
        )
        console.log('Updated words:', updated.find(w => w.id === wordId))
        return updated
      })
    } catch (error) {
      console.error('Error generating image:', error)
      alert(`Failed to generate image. Please check your API key and try again.`)
    } finally {
      setLoadingImageId(null)
    }
  }

  const filteredWords = words.filter((word) => {
    // Filter by level
    const levelMatch =
      selectedLevel === 'all' || word.level.toString() === selectedLevel

    // Filter by search query (words that start with the search text)
    const searchMatch =
      searchQuery === '' ||
      word.word.toLowerCase().startsWith(searchQuery.toLowerCase())

    return levelMatch && searchMatch
  })

  const getLevelColor = (level: number) => {
    switch (level) {
      case 1:
        return 'level-basic'
      case 2:
        return 'level-medium'
      case 3:
        return 'level-advanced'
      case 4:
        return 'level-pro'
      default:
        return 'level-basic'
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">G</div>
          </div>
          <div className="logo-text">
            <h1>GrokWords</h1>
            <p>Grok 10,000 English Words with xAI</p>
          </div>
        </div>
        <div className="header-right">
          <div className="dropdown-container" ref={levelsDropdownRef}>
            <button
              className="dropdown-button"
              onClick={() => setIsLevelsDropdownOpen(!isLevelsDropdownOpen)}
            >
              {levels.find((l) => l.value === selectedLevel)?.label ||
                'All Levels'}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: isLevelsDropdownOpen
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <path d="M3 4.5l3 3 3-3" strokeLinecap="round" />
              </svg>
            </button>
            {isLevelsDropdownOpen && (
              <div className="dropdown-menu">
                {levels.map((level) => (
                  <div
                    key={level.value}
                    className="dropdown-menu-item"
                    onClick={() => handleLevelSelect(level.value)}
                  >
                    {selectedLevel === level.value && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="checkmark-icon"
                      >
                        <path
                          d="M13.333 4L6 11.333 2.667 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    <span>{level.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="search-container">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M7.333 12.667A5.333 5.333 0 1 0 7.333 2a5.333 5.333 0 0 0 0 10.667ZM14 14l-2.9-2.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Filter words..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="settings-button"
            onClick={() => setIsSettingsOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="3" />
              <path d="M10 2v2M10 16v2M18 10h-2M4 10H2M16.5 3.5l-1.4 1.4M4.9 15.1l-1.4 1.4M16.5 16.5l-1.4-1.4M4.9 4.9l-1.4-1.4M15.1 4.9l1.4-1.4M5.5 15.1l1.4-1.4M15.1 15.1l1.4 1.4M5.5 4.9l1.4 1.4" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main-content">
        <table className="vocabulary-table">
          <thead>
            <tr>
              <th>LEVEL</th>
              <th>WORD</th>
              <th>AUDIO</th>
              <th>POS</th>
              <th>PHONETIC</th>
              <th>DEFINITION</th>
              <th>EXAMPLE</th>
              <th>IMAGE</th>
              <th>X</th>
              <th>SHARE</th>
            </tr>
          </thead>
          <tbody>
            {filteredWords.map((word) => {
              return (
                <tr key={word.id}>
                  <td>
                    <span className={`level-badge ${getLevelColor(word.level)}`}>
                      {word.levelLabel}
                    </span>
                  </td>
                  <td>
                    <span className="word revealed">
                      {word.word}
                    </span>
                  </td>
                  <td>
                    <button
                      className="audio-button"
                      onClick={() => handlePlayAudio(word.word)}
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
                    {word.pos && word.pos.trim() ? (
                      <span className="pos-badge">{word.pos}</span>
                    ) : (
                      <button
                        className="grok-button"
                        title="Generate POS, phonetic, and definition"
                        onClick={() => handleGrokWord(word.id, word.word)}
                        disabled={loadingGrokId === word.id}
                      >
                        {loadingGrokId === word.id ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 18 18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="spinning-icon"
                          >
                            <circle cx="9" cy="9" r="7" strokeDasharray="12" strokeDashoffset="3" />
                          </svg>
                        ) : (
                          'Grok'
                        )}
                      </button>
                    )}
                  </td>
                  <td>{word.phonetic}</td>
                  <td>
                    {word.definition && word.definition.trim() ? (
                      <div className="definition-content">
                        {word.definition.split('\n').map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </div>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {word.example && word.example.trim() ? (
                      <div className="example-content">
                        {word.example.split('\n').slice(0, 2).map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </div>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {word.example && word.example.trim() ? (
                      word.imageUrl ? (
                        <img
                          src={word.imageUrl}
                          alt={`Illustration for ${word.word}`}
                          className="word-image"
                          onClick={() => {
                            setGeneratedImageUrl(word.imageUrl || null)
                            setCurrentWordName(word.word)
                            setCurrentWordId(word.id)
                            setShowImageModal(true)
                          }}
                        />
                      ) : (
                        <button
                          className="image-button"
                          title="Generate image"
                          onClick={() => handleGenerateImage(word.id, word.example)}
                        >
                          {loadingImageId === word.id ? (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 18 18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="spinning-icon"
                            >
                              <circle cx="9" cy="9" r="7" strokeDasharray="12" strokeDashoffset="3" />
                            </svg>
                          ) : (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 18 18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="3" width="12" height="12" rx="2" />
                              <circle cx="7" cy="7" r="1.5" />
                              <path d="M3 11l4-4 3 3 5-5" />
                            </svg>
                          )}
                        </button>
                      )
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {word.example && word.example.trim() ? (
                      <button
                        className="x-button"
                        title="View X posts containing this word"
                        onClick={() => {
                          const searchUrl = `https://x.com/search?q=${encodeURIComponent(word.word)}&src=typed_query&f=live`
                          window.open(searchUrl, '_blank')
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          <line x1="9" y1="9" x2="15" y2="9" />
                          <line x1="9" y1="13" x2="15" y2="13" />
                        </svg>
                      </button>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {word.example && word.example.trim() ? (
                      <button
                        className="x-button"
                        title="Post to X"
                        onClick={() => {
                          // Exclude noun key words (3rd part) from example if it exists
                          const exampleText = word.example 
                            ? word.example.split('\n').slice(0, 2).join('\n')
                            : 'Example'
                          let text = `${word.word}\n\n${word.definition || 'Definition'}\n\n${exampleText}`
                          
                          // Add hashtag
                          text += `\n\n#GrokWords`
                          
                          const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
                          window.open(url, '_blank')
                          
                          // Also open the image in a new tab if it exists, so user can easily attach it
                          if (word.imageUrl) {
                            setTimeout(() => {
                              window.open(word.imageUrl, '_blank')
                            }, 500)
                          }
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </button>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </main>

      <footer className="footer">
        <div className="footer-text">
          Showing {filteredWords.length} of 10,000 words based on your filters.
        </div>
      </footer>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h2>Settings</h2>
              </div>
              <button
                className="modal-close-button"
                onClick={() => setIsSettingsOpen(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="settings-section">
                <div className="section-header">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="section-icon"
                  >
                    <rect x="4" y="3" width="8" height="8" rx="1" />
                    <circle cx="6.5" cy="6" r="0.8" />
                    <circle cx="9.5" cy="6" r="0.8" />
                    <rect x="6" y="9" width="4" height="1.5" rx="0.3" />
                    <path d="M6 2v1M10 2v1" />
                  </svg>
                  <h3>API CONFIGURATION</h3>
                </div>

                <div className="form-group">
                  <label>LLM Provider</label>
                  <div className="select-wrapper">
                    
                    <select
                      className="settings-select"
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                    >
                      <option value="xai">xAI</option>
                    </select>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="select-chevron"
                    >
                      <path d="M3 4.5l3 3 3-3" />
                    </svg>
                  </div>
                </div>

                <div className="form-group">
                  <div className="label-row">
                    <label>API Key</label>
                    <a
                      href="https://accounts.x.ai/sign-in?redirect=cloud-console"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="help-link"
                    >
                      Help
        </a>
      </div>
                  <div className="input-wrapper">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="input-icon"
                    >
                      <rect x="2" y="6" width="12" height="8" rx="1" />
                      <path d="M6 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
                      <circle cx="8" cy="10" r="1" />
                    </svg>
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <p className="input-hint">
                    Your key is stored locally in your browser.
        </p>
      </div>
              </div>

              <div className="settings-section">
                <div className="section-header">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="section-icon"
                  >
                    <circle cx="8" cy="8" r="6" />
                    <path d="M2 8h12M8 2a10 10 0 0 1 3 6M8 2a10 10 0 0 0-3 6M8 14a10 10 0 0 1-3-6M8 14a10 10 0 0 0 3-6" />
                  </svg>
                  <h3>PREFERENCES</h3>
                </div>

                <div className="form-group">
                  <label>Native Language</label>
                  <div className="select-wrapper">
                    <select
                      className="settings-select"
                      value={nativeLanguage}
                      onChange={(e) => setNativeLanguage(e.target.value)}
                    >
                      <option value="english">English (Default)</option>
                      <option value="chinese">中文 (Chinese)</option>
                      <option value="traditional-chinese">繁體中文 (Traditional Chinese)</option>
                      <option value="spanish">Español (Spanish)</option>
                      <option value="french">Français (French)</option>
                      <option value="japanese">日本語 (Japanese)</option>
                      <option value="korean">한국어 (Korean)</option>
                      <option value="turkish">Türkçe (Turkish)</option>
                      <option value="portuguese">Português (Portuguese)</option>
                      <option value="hindi">हिंदी (Hindi)</option>
                      <option value="russian">Русский (Russian)</option>
                      <option value="arabic">العربية (Arabic)</option>
                      <option value="indonesian">Bahasa Indonesia (Indonesian)</option>
                      <option value="malay">Bahasa Melayu (Malay)</option>
                      <option value="vietnamese">Tiếng Việt (Vietnamese)</option>
                      <option value="german">Deutsch (German)</option>
                    </select>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="select-chevron"
                    >
                      <path d="M3 4.5l3 3 3-3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="save-button"
                onClick={() => {
                  // Save API key and native language to localStorage
                  localStorage.setItem('grokwords_apiKey', apiKey)
                  localStorage.setItem('grokwords_nativeLanguage', nativeLanguage)
                  setIsSettingsOpen(false)
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageModal && generatedImageUrl && (
        <div className="modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentWordName || 'Generated Image'}</h2>
              <div className="modal-header-actions">
                <button
                  className="download-button"
                  onClick={async () => {
                    try {
                      // Fetch the image as a blob
                      const response = await fetch(generatedImageUrl || '', {
                        mode: 'cors',
                      })
                      
                      if (!response.ok) {
                        throw new Error('Failed to fetch image')
                      }
                      
                      const blob = await response.blob()
                      
                      // Create a download link
                      const url = window.URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `${currentWordName || 'image'}.jpg`
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      window.URL.revokeObjectURL(url)
                    } catch (error) {
                      console.error('Error downloading image:', error)
                      // Fallback: try using the image URL directly as download
                      try {
                        const link = document.createElement('a')
                        link.href = generatedImageUrl || ''
                        link.download = `${currentWordName || 'image'}.jpg`
                        link.target = '_blank'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      } catch (fallbackError) {
                        console.error('Fallback download also failed:', fallbackError)
                        // Last resort: open in new tab
                        window.open(generatedImageUrl, '_blank')
                      }
                    }
                  }}
                  title="Download image"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 3v11M10 14l-4-4M10 14l4-4" />
                    <path d="M3 17h14" />
                  </svg>
                </button>
                <button
                  className="regenerate-button"
                  onClick={async () => {
                    if (currentWordId !== null) {
                      const confirmed = window.confirm('Are you really want to re-generate an image?')
                      if (!confirmed) {
                        return
                      }
                      const word = words.find((w) => w.id === currentWordId)
                      if (word && word.example) {
                        await handleGenerateImage(currentWordId, word.example)
                      }
                    }
                  }}
                  title="Regenerate image"
                  disabled={currentWordId === null || loadingImageId === currentWordId}
                >
                  {loadingImageId === currentWordId ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 18 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="spinning-icon"
                    >
                      <circle cx="9" cy="9" r="7" strokeDasharray="12" strokeDashoffset="3" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 4v6h6M19 16v-6h-6M19 4l-7 7M1 16l7-7" />
                    </svg>
                  )}
                </button>
                <button
                  className="modal-close-button"
                  onClick={() => setShowImageModal(false)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 5L5 15M5 5l10 10" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="image-modal-body">
              <img src={generatedImageUrl} alt="Generated" className="generated-image" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
