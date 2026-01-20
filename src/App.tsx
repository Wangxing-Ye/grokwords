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
  grokkedAt?: string
  toefl?: string
  ielts?: string
}

interface ReviewRecord {
  word: string
  day: number
  date: string
}

const levels = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Level 1 (Basic)' },
  { value: '2', label: 'Level 2 (Intermediate)' },
  { value: '3', label: 'Level 3 (Advanced)' },
  { value: 'toefl', label: 'TOEFL' },
  { value: 'ielts', label: 'IELTS' },
]

function App() {
  const [words, setWords] = useState<Word[]>([

  ])

  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [selectedGrokStatus, setSelectedGrokStatus] = useState<'all' | 'ungrokked' | 'grokked' | 'understood'>('all')
  const [isLevelsDropdownOpen, setIsLevelsDropdownOpen] = useState(false)
  const [isGrokStatusDropdownOpen, setIsGrokStatusDropdownOpen] = useState(false)
  const levelsDropdownRef = useRef<HTMLDivElement>(null)
  const grokStatusDropdownRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const itemsPerPage = 100
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmWordId, setConfirmWordId] = useState<number | null>(null)
  const [confirmWordName, setConfirmWordName] = useState<string>('')
  const [llmProvider, setLlmProvider] = useState('xai')
  const [apiKey, setApiKey] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState('english')
  const [loadingImageId, setLoadingImageId] = useState<number | null>(null)
  const [loadingGrokId, setLoadingGrokId] = useState<number | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [showImageModal, setShowImageModal] = useState(false)
  const [currentWordName, setCurrentWordName] = useState<string>('')
  const [currentWordId, setCurrentWordId] = useState<number | null>(null)
  const [showVoiceModal, setShowVoiceModal] = useState(false)
  const [currentVoiceWord, setCurrentVoiceWord] = useState<string>('')
  const [voiceWs, setVoiceWs] = useState<WebSocket | null>(null)
  const [isVoiceConnected, setIsVoiceConnected] = useState(false)
  const [voiceMessages, setVoiceMessages] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [showReviewList, setShowReviewList] = useState(false)
  const [selectedReviewDate, setSelectedReviewDate] = useState<string | null>(null)
  const [selectedReviewDay, setSelectedReviewDay] = useState<number | null>(null)
  const [revealedReviewIds, setRevealedReviewIds] = useState<Set<number>>(new Set())
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([])
  const [loadingExampleId, setLoadingExampleId] = useState<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<Float32Array[]>([])
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const isProcessingQueueRef = useRef<boolean>(false)
  const wordsLoadedRef = useRef<boolean>(false)
  const dbRef = useRef<IDBDatabase | null>(null)

  // Initialize IndexedDB
  const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (dbRef.current) {
        resolve(dbRef.current)
        return
      }

      const request = indexedDB.open('GrokWordsDB', 2)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        dbRef.current = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('words')) {
          const objectStore = db.createObjectStore('words', { keyPath: 'id' })
          objectStore.createIndex('word', 'word', { unique: false })
        }
        if (!db.objectStoreNames.contains('reviews')) {
          const reviewsStore = db.createObjectStore('reviews', { keyPath: 'word' })
          reviewsStore.createIndex('word', 'word', { unique: true })
          reviewsStore.createIndex('day', 'day', { unique: false })
          reviewsStore.createIndex('date', 'date', { unique: false })
        }
      }
    })
  }

  // Save word to IndexedDB
  const saveWordToDB = async (word: Word) => {
    try {
      const db = await initDB()
      const transaction = db.transaction(['words'], 'readwrite')
      const objectStore = transaction.objectStore('words')
      await objectStore.put(word)
    } catch (error) {
      console.error('Error saving word to IndexedDB:', error)
    }
  }

  // Save multiple words to IndexedDB
  const saveWordsToDB = async (wordsToSave: Word[]) => {
    try {
      const db = await initDB()
      const transaction = db.transaction(['words'], 'readwrite')
      const objectStore = transaction.objectStore('words')
      
      for (const word of wordsToSave) {
        await objectStore.put(word)
      }
    } catch (error) {
      console.error('Error saving words to IndexedDB:', error)
    }
  }

  // Save review to IndexedDB (dedup by word)
  const saveReviewToDB = async (word: string, day: number, date: string) => {
    try {
      const db = await initDB()
      const transaction = db.transaction(['reviews'], 'readwrite')
      const store = transaction.objectStore('reviews')
      const existingRequest = store.get(word)
      await new Promise<void>((resolve, reject) => {
        existingRequest.onsuccess = () => {
          const existing = existingRequest.result
          const record = existing
            ? { ...existing, day, date }
            : { word, day, date }
          const putRequest = store.put(record)
          putRequest.onsuccess = () => resolve()
          putRequest.onerror = () => reject(putRequest.error)
        }
        existingRequest.onerror = () => reject(existingRequest.error)
      })
      // Update in-memory state
      setReviewRecords(prev => {
        const filtered = prev.filter(r => r.word !== word)
        return [...filtered, { word, day, date }]
      })
    } catch (error) {
      console.error('Error saving review to IndexedDB:', error)
    }
  }

  // Load all words from IndexedDB
  const loadWordsFromDB = async (): Promise<Word[]> => {
    try {
      const db = await initDB()
      const transaction = db.transaction(['words'], 'readonly')
      const objectStore = transaction.objectStore('words')
      
      return new Promise((resolve, reject) => {
        const request = objectStore.getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error('Error loading words from IndexedDB:', error)
      return []
    }
  }

  const loadReviewsFromDB = async (): Promise<ReviewRecord[]> => {
    try {
      const db = await initDB()
      const transaction = db.transaction(['reviews'], 'readonly')
      const store = transaction.objectStore('reviews')
      return new Promise((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error('Error loading reviews from IndexedDB:', error)
      return []
    }
  }

  // Decode and play received base64 audio
  const playAudio = (base64: string) => {
    if (!audioContextRef.current) {
      console.error('Audio context not initialized')
      return
    }

    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      
      // Convert to Int16Array (little-endian PCM16)
      const int16 = new Int16Array(bytes.buffer.byteLength / 2)
      const dataView = new DataView(bytes.buffer)
      for (let i = 0; i < int16.length; i++) {
        int16[i] = dataView.getInt16(i * 2, true) // true = little-endian
      }
      
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0

      audioQueueRef.current.push(float32)
      if (!isProcessingQueueRef.current) processQueue()
    } catch (error) {
      console.error('Error decoding audio:', error)
    }
  }

  const processQueue = async () => {
    if (!audioContextRef.current) {
      console.error('Audio context not available for processing')
      isProcessingQueueRef.current = false
      return
    }

    if (audioQueueRef.current.length === 0) {
      isProcessingQueueRef.current = false
      return
    }

    try {
      // Resume audio context if suspended (required by browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('Audio context resumed')
      }

      const float32Data = audioQueueRef.current.shift()!
      if (float32Data.length === 0) {
        processQueue() // Skip empty chunks
        return
      }

      const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000)
      const channelData = buffer.getChannelData(0)
      channelData.set(float32Data)

      const source = audioContextRef.current.createBufferSource()
      source.buffer = buffer
      source.connect(audioContextRef.current.destination)
      source.start(0)
      isProcessingQueueRef.current = true
      source.onended = () => processQueue()
    } catch (error) {
      console.error('Error processing audio queue:', error)
      isProcessingQueueRef.current = false
    }
  }

  // Load word data from IndexedDB and CSV file on first page load
  useEffect(() => {
    if (wordsLoadedRef.current) return
    wordsLoadedRef.current = true

    const getLevelFromCEFR = (cefr: string): { level: number; levelLabel: string } => {
      const cefrUpper = cefr.toUpperCase()
      if (cefrUpper === 'A1' || cefrUpper === 'A2') {
        return { level: 1, levelLabel: '1 (Basic)' }
      } else if (cefrUpper === 'B1' || cefrUpper === 'B2') {
        return { level: 2, levelLabel: '2 (Intermediate)' }
      } else if (cefrUpper === 'C1' || cefrUpper === 'C2') {
        return { level: 3, levelLabel: '3 (Advanced)' }
      }
      // Default to level 1 if CEFR is not recognized
      return { level: 1, levelLabel: '1 (Basic)' }
    }

    const loadCSVWords = async () => {
      try {
        const response = await fetch('/words/ENGLISH_CERF_WORDS_EXTENDED.csv')
        if (!response.ok) {
          console.warn('Could not load ENGLISH_CERF_WORDS_EXTENDED.csv:', response.statusText)
          return []
        }
        const text = await response.text()
        const lines = text.split('\n').filter(line => line.trim().length > 0)
        
        // Skip header line
        const dataLines = lines.slice(1)
        
        return dataLines.map((line, index) => {
          const [headword, cefr, toefl = '', ielts = ''] = line.split(',').map(s => s.trim())
          
          // If headword has '/', use the first word
          const word = headword.includes('/') ? headword.split('/')[0] : headword
          
          // Get level from CEFR
          const { level, levelLabel } = getLevelFromCEFR(cefr)
          
          return {
            id: Date.now() + index + Math.random(), // Generate unique ID
            word: word.trim(),
            level: level,
            levelLabel: levelLabel,
            pos: '',
            phonetic: '',
            definition: '',
            example: '',
            revealed: false,
            grokkedAt: undefined,
            toefl: toefl || '',
            ielts: ielts || '',
          }
        })
      } catch (error) {
        console.error('Error loading ENGLISH_CERF_WORDS_EXTENDED.csv:', error)
        return []
      }
    }

    const loadAllData = async () => {
      // First, load words from IndexedDB (these have saved data)
      const dbWords = await loadWordsFromDB()
      
      // Then load words from CSV file
      const csvWords = await loadCSVWords()

      // Merge all words
      // Create a Map of existing words by word text (case-insensitive) for quick lookup
      const wordMap = new Map<string, Word>()
      
      // Add words from IndexedDB first (they have saved data)
      dbWords.forEach(w => {
        wordMap.set(w.word.toLowerCase(), w)
      })
      
      // Add words from CSV file, but don't overwrite if they exist in DB
      const newWordsToSave: Word[] = []
      
      csvWords.forEach(w => {
        const key = w.word.toLowerCase()
        if (!wordMap.has(key)) {
          // New word from CSV - add it and mark for saving
          wordMap.set(key, w)
          newWordsToSave.push(w)
        } else {
          // If word exists in DB, merge: keep DB data but update level if different
          const existing = wordMap.get(key)!
          if (w.level !== existing.level) {
            // Update level if the CSV has a different level
            const updated = { ...existing, level: w.level, levelLabel: w.levelLabel }
            wordMap.set(key, updated)
            newWordsToSave.push(updated)
          }
        }
      })
      
      // Convert map back to array and set words
      const allWords = Array.from(wordMap.values())
      setWords(allWords)
      
      // Save new words from CSV file to IndexedDB
      if (newWordsToSave.length > 0) {
        await saveWordsToDB(newWordsToSave)
        console.log(`Saved ${newWordsToSave.length} new words to IndexedDB`)
      }
    }

    loadAllData()
    ;(async () => {
      const reviews = await loadReviewsFromDB()
      setReviewRecords(reviews)
    })()
  }, [])

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
      if (
        grokStatusDropdownRef.current &&
        !grokStatusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsGrokStatusDropdownOpen(false)
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

  // Handle voice modal WebSocket connection
  useEffect(() => {
    if (showVoiceModal && !voiceWs) {
      const apiKey = localStorage.getItem('grokwords_apiKey') || ''
      if (!apiKey) {
        alert('Please set your xAI API key in Settings first.')
        setShowVoiceModal(false)
        return
      }

      // For browser WebSocket, we need to fetch an ephemeral token first
      // Browser WebSocket doesn't support custom headers
      const connectWebSocket = async () => {
        try {
          // setVoiceMessages((prev) => [...prev, 'Fetching authentication token...'])
          setVoiceMessages((prev) => [...prev, 'Connecting to Grok...'])
          
          // Fetch ephemeral token from xAI
          const tokenResponse = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              expires_after: { seconds: 300 }, // 5 minutes
            }),
          })

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('Failed to get ephemeral token:', errorText)
            // setVoiceMessages((prev) => [...prev, `Error: Failed to authenticate. ${errorText}`])
            setVoiceMessages((prev) => [...prev, `Failed to connect to Grok. ${errorText}`])
            return
          }

          const tokenData = await tokenResponse.json()
          console.log('Token data:', tokenData)
          const ephemeralToken = tokenData.value
          console.log('Ephemeral token:', ephemeralToken)

          if (!ephemeralToken) {
            // setVoiceMessages((prev) => [...prev, 'Error: No token received from server.'])
            setVoiceMessages((prev) => [...prev, 'Failed to connect to Grok. No ephemeral token received.'])
            return
          }

          // Connect to WebSocket using ephemeral token with subprotocols
          const ws = new WebSocket('wss://api.x.ai/v1/realtime', ['realtime', `xai-insecure-api-key.${ephemeralToken}`])

          ws.onopen = () => {
            console.log('Connected to voice server.')
            setIsVoiceConnected(true)
            // setVoiceMessages((prev) => [...prev, 'Connected to voice server.'])
            setVoiceMessages((prev) => [...prev, 'Connected to Grok. Click the microphone to start a conversation...'])

            // Configure the session
            const sessionConfig = {
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                instructions: `You are a helpful English vocabulary learning assistant. Help the user practice the word "${currentVoiceWord}".`,
                voice: 'ara',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: { model: 'whisper-1' },
                turn_detection: { type: 'server_vad' },
              },
            }
            ws.send(JSON.stringify(sessionConfig))

            // Initialize audio context for playback
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
              sampleRate: 24000,
            })
          }

          ws.onmessage = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data)
              console.log('Received:', msg.type)
              
              if (msg.type === 'response.output_audio.delta' && msg.delta) {
                // Decode and play received base64 audio
                playAudio(msg.delta)
              }

              if (msg.type === 'response.output_audio_transcript.delta' && msg.delta) {
                // Handle text responses
                setVoiceMessages((prev) => {
                  const lastMessage = prev[prev.length - 1]
                  if (lastMessage && lastMessage.startsWith('Grok: ')) {
                    return [...prev.slice(0, -1), `Grok: ${lastMessage.substring(6)}${msg.delta}`]
                  }
                  return [...prev, `Grok: ${msg.delta}`]
                })
              }

              if (msg.type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
                // Handle user transcript (what the user said)
                setVoiceMessages((prev) => {
                  const lastMessage = prev[prev.length - 1]
                  if (lastMessage && lastMessage.startsWith('You: ')) {
                    return [...prev.slice(0, -1), `You: ${lastMessage.substring(5)}${msg.transcript}`]
                  }
                  return [...prev, `You: ${msg.transcript}`]
                })
              }

              if (msg.type === 'response.done') {
                // Response complete - queue will continue processing
                console.log('Response done')
              }

              if (msg.type === 'error') {
                // setVoiceMessages((prev) => [...prev, `Error: ${msg.error?.message || 'Unknown error'}`])
                setVoiceMessages((prev) => [...prev, `Failed to connect to Grok. ${msg.error?.message || 'Unknown error'}`])
              }

              // Handle other events: conversation.item.created, etc.
            } catch (error) {
              console.error('Error parsing voice message:', error)
            }
          }

      ws.onerror = (error: Event) => {
        console.error('WebSocket error:', error)
        // setVoiceMessages((prev) => [...prev, 'Connection error occurred.'])
        setVoiceMessages((prev) => [...prev, 'Failed to connect to Grok. Connection error occurred.'])
      }

      ws.onclose = () => {
        console.log('Voice connection closed.')
        setIsVoiceConnected(false)
        setVoiceWs(null)
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
      }

          setVoiceWs(ws)
        } catch (error) {
          console.error('Error connecting to voice server:', error)
          // setVoiceMessages((prev) => [...prev, `Error: ${error instanceof Error ? error.message : 'Failed to connect'}`])
          setVoiceMessages((prev) => [...prev, `Failed to connect to Grok. ${error instanceof Error ? error.message : 'Failed to connect'}`])
        }
      }

      connectWebSocket()
    }

    return () => {
      if (voiceWs) {
        voiceWs.close()
        setVoiceWs(null)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop())
        microphoneStreamRef.current = null
      }
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect()
        audioProcessorRef.current = null
      }
      setIsRecording(false)
    }
  }, [showVoiceModal, currentVoiceWord])

  const handleStartVoiceInput = async () => {
    try {
      // Resume audio context if suspended (required for browser autoplay policy)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('Audio context resumed on user interaction')
      }

      if (microphoneStreamRef.current) {
        // Stop existing stream
        microphoneStreamRef.current.getTracks().forEach(track => track.stop())
        if (audioProcessorRef.current) {
          audioProcessorRef.current.disconnect()
        }
        microphoneStreamRef.current = null
        audioProcessorRef.current = null
        setIsRecording(false)
        setVoiceMessages((prev) => [...prev, 'Microphone is now off. Click again to start a conversation...'])
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      microphoneStreamRef.current = stream
      setIsRecording(true)

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        if (voiceWs && isVoiceConnected && voiceWs.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)
          // Convert Float32Array to PCM16
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
          }
          // Convert to base64
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
          const audioEvent = {
            type: 'input_audio_buffer.append',
            audio: base64,
          }
          voiceWs.send(JSON.stringify(audioEvent))
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
      audioProcessorRef.current = processor

      setVoiceMessages((prev) => [...prev, 'Microphone is now on. Please speak...'])
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

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

  const handleNoPOS = async (wordId: number) => {
    // Update the word's POS to '-' in IndexedDB
    setWords((prevWords) => {
      const updated = prevWords.map((w) =>
        w.id === wordId
          ? {
              ...w,
              pos: '-',
            }
          : w
      )
      const updatedWord = updated.find(w => w.id === wordId)
      
      // Save to IndexedDB
      if (updatedWord) {
        saveWordToDB(updatedWord)
      }
      
      return updated
    })
    
    setShowConfirmDialog(false)
    setConfirmWordId(null)
    setConfirmWordName('')
  }

  const handleGrokWord = async (wordId: number, word: string) => {
    const apiKey = localStorage.getItem('grokwords_apiKey') || ''
    const nativeLanguage = localStorage.getItem('grokwords_nativeLanguage') || 'english'

    if (!apiKey) {
      alert('Please set your xAI API key and native language in Settings first.')
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
        let reason = errorText
        try {
          const parsed = JSON.parse(errorText)
          if (parsed?.error) reason = parsed.error
        } catch {
          // Fallback to existing logic if not JSON
          const sentences = errorText.split('.').map(s => s.trim()).filter(Boolean)
          reason = sentences.length >= 2 ? sentences[1] : errorText
        }
        throw new Error(`Failed to fetch word info - ${reason}`)
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
                  grokkedAt: w.grokkedAt ?? new Date().toISOString(),
                }
              : w
          )
          const updatedWord = updated.find(w => w.id === wordId)
          console.log('Updated word:', updatedWord)
          
          // Save to IndexedDB
          if (updatedWord) {
            saveWordToDB(updatedWord)
          }
          
          return updated
        })

        // Automatically generate example after successful word info update
        setLoadingExampleId(wordId)
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
                  content: `Generate a simple example sentence using the word "${word}" as a ${pos} in English and its ${nativeLanguage} translation, Adj + Noun phrases, and Noun key words from the sentence. Format your response as: English sentence\n${nativeLanguage} translation\nAdj + Noun phrases\nNoun key words`,
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
              console.log('Example:', example)

              if ((example.startsWith('"') && example.endsWith('"')) || 
                  (example.startsWith("'") && example.endsWith("'"))) {
                example = example.slice(1, -1).trim()
              }

              // Replace double newlines with single newline
              if (example.includes('\n\n')) {
                example = example.replace(/\n\n/g, '\n')
              }

              // Strip any prefixed labels like "English sentence:" or "<nativeLanguage> translation:"
              example = example.replace(/English sentence:\s*/gi, '')
              const escapedNative = nativeLanguage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const nativeLabelRegex = new RegExp(`${escapedNative}\\s+translation:\\s*`, 'gi')
              example = example.replace(nativeLabelRegex, '')

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
                const updated = prevWords.map((w) =>
                  w.id === wordId ? { ...w, example: example } : w
                )
                const updatedWord = updated.find(w => w.id === wordId)
                
                // Save to IndexedDB
                if (updatedWord) {
                  saveWordToDB(updatedWord)
                }
                
                return updated
              })
            }
          }
        } catch (exampleError) {
          // Don't show error for example generation failure, just log it
          console.error('Error generating example:', exampleError)
        } finally {
          setLoadingExampleId(null)
        }
      } else {
        console.error('Unexpected response format:', content)
        alert('Unexpected response format from API')
      }
    } catch (error) {
      console.error('Error fetching word info:', error)
      alert(`${error}`)
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
    const phraseKeyWords = example.split('\n')[2]?.trim() || ''
    const nounKeyWords = example.split('\n')[3]?.trim() || ''

    const nounParts = nounKeyWords
    ? nounKeyWords.split(',').map(p => p.trim()).filter(Boolean)
    : []

    let keyWords = phraseKeyWords
    nounParts.forEach(n => {
      if (!phraseKeyWords.toLowerCase().includes(n.toLowerCase())) {
        keyWords = keyWords ? `${keyWords}, ${n}` : n
      }
    })

    // Strip helper prefixes if present
    keyWords = keyWords.replace(/^Adj \+ Noun phrases:\s*/i, '').replace(/^Noun key words:\s*/i, '')

    setLoadingImageId(wordId)

    try {
      //const prompt = `A colorful, playful English vocabulary learning card for the word "${word}", vertical layout, cheerful sky-blue background of ${nounKeyWords}. The word "${word}" appears in large bold letters with soft gradient fill and drop shadow, definition section with text "${englishDefinition}" below. A sample sentence section with text: "${englishExample}" below the definition section. Use readable, classroom-friendly typography with good spacing.`
      const prompt = `A vibrant and cute illustration-style English vocabulary flashcard in vertical orientation. Background of ${keyWords}. At the top center, the bold large English word '${word}' with soft gradient fill and drop shadow, highly legible. Below it, the definition section with text: "${englishDefinition}". Further below the definition section, the example sentence with text: "${englishExample}". All text is well-spaced with classroom-friendly typography.`
      console.log(prompt)

      const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-2-image-1212',
          prompt: prompt,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        const sentences = errorText.split('.').map(s => s.trim()).filter(Boolean)
        const reason = sentences.length >= 2 ? sentences[1] : errorText
        throw new Error(`Failed to generate image - ${reason}`)
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
        const updatedWord = updated.find(w => w.id === wordId)
        console.log('Updated words:', updatedWord)
        
        // Save to IndexedDB
        if (updatedWord) {
          saveWordToDB(updatedWord)
        }
        
        return updated
      })
    } catch (error) {
      console.error('Error generating image:', error)
      alert(`${error}`)
    } finally {
      setLoadingImageId(null)
    }
  }

  const filteredWords = words.filter((word) => {
    // Filter by level
    let levelMatch = false
    if (selectedLevel === 'all') {
      levelMatch = true
    } else if (selectedLevel === 'toefl') {
      levelMatch = (word.toefl || '').trim() === '1'
    } else if (selectedLevel === 'ielts') {
      levelMatch = (word.ielts || '').trim() === '1'
    } else {
      levelMatch = word.level.toString() === selectedLevel
    }

    // Grok status filter
    const grokStatusMatch =
      selectedGrokStatus === 'all'
        ? true
        : selectedGrokStatus === 'grokked'
        ? !!(word.definition && word.definition.trim())
        : selectedGrokStatus === 'understood'
        ? word.pos?.trim() === '-'
        : !(word.pos && word.pos.trim().length)

    // Filter by search query (words that start with the search text)
    const searchMatch =
      searchQuery === '' ||
      word.word.toLowerCase().startsWith(searchQuery.toLowerCase())

    const reviewDateMatch =
      !selectedReviewDate ||
      (word.grokkedAt && word.grokkedAt.slice(0, 10).replace(/-/g, '/') === selectedReviewDate)

    return levelMatch && grokStatusMatch && searchMatch && reviewDateMatch
  })

  const isReviewMode = !!selectedReviewDate

  // Reset review reveals when toggling review list off
  useEffect(() => {
    if (!showReviewList) {
      setSelectedReviewDate(null)
      setSelectedReviewDay(null)
      setRevealedReviewIds(new Set())
    }
  }, [showReviewList])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedLevel, selectedGrokStatus, searchQuery, selectedReviewDate])

  // Calculate pagination
  const totalPages = Math.ceil(filteredWords.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedWords = filteredWords.slice(startIndex, endIndex)

  const getLevelColor = (level: number) => {
    switch (level) {
      case 1:
        return 'level-basic'
      case 2:
        return 'level-medium'
      case 3:
        return 'level-advanced'
      default:
        return 'level-basic'
    }
  }

  const getLevelLabel = (level: number) => {
    switch (level) {
      case 1:
        return 'Basic'
      case 2:
        return 'Intermediate'
      case 3:
        return 'Advanced'
      default:
        return 'Basic'
    }
  }

  const getDaysSince = (dateStr: string): number | null => {
    const parsed = Date.parse(dateStr.replace(/\//g, '-'))
    if (Number.isNaN(parsed)) return null
    const diffMs = Date.now() - parsed
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  const renderReviewIcon = (daysSince: number | null, target: number) => {
    return daysSince === target
  }


  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <img
              src="/favicon.svg"
              alt="GrokWords logo"
              style={{ width: '48px', height: '48px', borderRadius: '8px' }}
            />
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
                'All'}
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
          <div className="dropdown-container" ref={grokStatusDropdownRef}>
            <button
              className="dropdown-button"
              onClick={() => setIsGrokStatusDropdownOpen(!isGrokStatusDropdownOpen)}
            >
              {selectedGrokStatus === 'all'
                ? 'All'
                : selectedGrokStatus === 'grokked'
                ? 'Grokked'
                : selectedGrokStatus === 'understood'
                ? 'Understood'
                : 'Ungrokked'}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: isGrokStatusDropdownOpen
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <path d="M3 4.5l3 3 3-3" strokeLinecap="round" />
              </svg>
            </button>
            {isGrokStatusDropdownOpen && (
              <div className="dropdown-menu">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'ungrokked', label: 'Ungrokked' },
                  { value: 'grokked', label: 'Grokked' },
                  { value: 'understood', label: 'Understood' },
                ].map((status) => (
                  <div
                    key={status.value}
                    className="dropdown-menu-item"
                    onClick={() => {
                      setSelectedGrokStatus(status.value as typeof selectedGrokStatus)
                      setIsGrokStatusDropdownOpen(false)
                    }}
                  >
                    {selectedGrokStatus === status.value && (
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
                    <span>{status.label}</span>
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
            title="Review & Remember"
            onClick={() => {
              setShowReviewList(prev => !prev)
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9 10h.01" />
              <path d="M15 10h.01" />
              <path d="M9 15a4 4 0 0 0 6 0" />
            </svg>
          </button>
          <button
            className="settings-button"
            onClick={() => setIsSettingsOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main-content">
        {showReviewList && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'linear-gradient(135deg, #fef9c3, #fde68a)', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.75rem', fontSize: '1.05rem', textAlign: 'center' }}>
              Golden Review Time Points by Ebbinghaus
            </div>
            {(() => {
              const grokkedWords = words.filter(w => w.definition && w.definition.trim().length > 0 && w.grokkedAt)
              const countsByDate = grokkedWords.reduce<Record<string, number>>((acc, w) => {
                const dateKey = w.grokkedAt!.slice(0, 10).replace(/-/g, '/')
                acc[dateKey] = (acc[dateKey] || 0) + 1
                return acc
              }, {})
              const sorted = Object.entries(countsByDate).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))

              if (sorted.length === 0) {
                return <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No grokked words yet.</div>
              }

              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([date, count]) => {
                      const daysSince = getDaysSince(date)
                      const handleSelectDate = (day: number) => {
                        const nextDate = selectedReviewDate === date ? null : date
                        setSelectedReviewDate(nextDate)
                        setSelectedReviewDay(nextDate ? day : null)
                        setRevealedReviewIds(new Set())
                      }
                      const renderIconFor = (target: number) => {
                        const isDue = renderReviewIcon(daysSince, target)
                        const reviewedCount = reviewRecords.filter(r => r.date === date && r.day === target).length
                        const isActive = selectedReviewDate === date && isDue
                        const allReviewed = reviewedCount === count
                        const baseStyle = {
                          textAlign: 'center' as const,
                          cursor: isDue ? 'pointer' : 'default',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          border: isDue ? '1px solid #d1d5db' : '1px solid transparent',
                          borderRadius: '4px',
                          backgroundColor: allReviewed ? '#10b981' : isActive ? '#3b82f6' : 'transparent',
                          color: allReviewed || isActive ? '#ffffff' : '#111827',
                          transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                        }
                        return (
                          <span
                            style={baseStyle}
                            onClick={isDue ? () => handleSelectDate(target) : undefined}
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            })()}
          </div>
        )}
        <table className="vocabulary-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Word</th>
              <th>Audio</th>
              <th>POS</th>
              <th>Phonetic</th>
              <th>Definition</th>
              <th>Example</th>
              <th>Image</th>
              <th>Dialogue</th>
              <th>X</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {paginatedWords.map((word) => {
              const isRevealed = revealedReviewIds.has(word.id)
              const hideFields = isReviewMode && !isRevealed
              const toggleReveal = () => {
                setRevealedReviewIds(prev => {
                  const next = new Set(prev)
                  if (next.has(word.id)) next.delete(word.id)
                  else next.add(word.id)
                  return next
                })

                const reviewDay = selectedReviewDay
                const reviewDate =
                  word.grokkedAt?.slice(0, 10).replace(/-/g, '/') || selectedReviewDate || ''
                if (!isRevealed && isReviewMode && reviewDay !== null && reviewDate) {
                  void saveReviewToDB(word.word, reviewDay, reviewDate)
                }
              }
              return (
                <tr key={word.id}>
                  <td>
                    <span className={`level-badge ${getLevelColor(word.level)}`}>
                      {getLevelLabel(word.level)}
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
                      hideFields ? (
                        <button
                          className="grok-button"
                          style={{ backgroundColor: isRevealed ? '#10b981' : '#3b82f6', width: 'auto', minWidth: '90px' }}
                          onClick={toggleReveal}
                        >
                          {isRevealed ? 'Hide' : 'Review'}
                        </button>
                      ) : (
                        <span className="pos-badge">{word.pos}</span>
                      )
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                        {loadingGrokId !== word.id && (
                          <button
                            className="grok-button"
                            title="Mark as understood"
                            onClick={() => {
                              setConfirmWordId(word.id)
                              setConfirmWordName(word.word)
                              setShowConfirmDialog(true)
                            }}
                            style={{ backgroundColor: 'transparent', color: '#10b981' }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M13.333 4L6 11.333 2.667 8" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{hideFields ? '' : word.phonetic}</td>
                  <td>
                    {!hideFields && word.definition && word.definition.trim() ? (
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
                    {hideFields ? (
                      ''
                    ) : loadingExampleId === word.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#6b7280' }}>
                        <svg
                          width="16"
                          height="16"
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
                      </div>
                    ) : word.example && word.example.trim() ? (
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
                    {!hideFields && word.example && word.example.trim() ? (
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
                              <path d="M3 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                              <circle cx="7" cy="7" r="1.5" />
                              <path d="M3 13l3-3 2 2 3-3 4 4" />
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
                        title="Open dialogue"
                        onClick={() => {
                          setCurrentVoiceWord(word.word)
                          setShowVoiceModal(true)
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
                          <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                          <path d="M12 19v3" />
                          <path d="M8 22h8" />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', width: '100%' }}>
        <div className="footer-text">
          Showing {startIndex + 1}-{Math.min(endIndex, filteredWords.length)} of {filteredWords.length} words (Page {currentPage} of {totalPages || 1})
        </div>
        {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: currentPage === 1 ? '#d1d5db' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
                &lt;&lt; Prev
            </button>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: currentPage === totalPages ? '#d1d5db' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
                Next &gt;&gt;
            </button>
          </div>
        )}
        </div>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.75rem', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'center' }}>
            <a
              href="https://github.com/Wangxing-Ye/grokwords"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280',
                textDecoration: 'none',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
            >
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ marginRight: '0.5rem' }}
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a
              href="https://x.com/wilsonye2025"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280',
                textDecoration: 'none',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
            >
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ marginRight: '0.5rem' }}
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
              textDecoration: 'none',
              transition: 'color 0.15s',
              fontSize: '0.85rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
          >
            Privacy Policy
          </a>
        </div>
      </footer>

      {showConfirmDialog && (
        <div className="modal-overlay" onClick={() => setShowConfirmDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>Confirm Understanding</h3>
              </div>
              <button
                className="modal-close-button"
                onClick={() => {
                  setShowConfirmDialog(false)
                  setConfirmWordId(null)
                  setConfirmWordName('')
                }}
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
              <div style={{ padding: '0.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.125rem', color: '#111827', marginBottom: '1.5rem' }}>
                  Do you really understand this word - <strong>{confirmWordName}</strong>?
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    className="grok-button"
                    onClick={() => {
                      if (confirmWordId !== null) {
                        handleNoPOS(confirmWordId)
                      }
                    }}
                    style={{ backgroundColor: '#10b981', minWidth: '100px', height: '125%' }}
                  >
                    Yes
                  </button>
                  <button
                    className="grok-button"
                    onClick={() => {
                      setShowConfirmDialog(false)
                      setConfirmWordId(null)
                      setConfirmWordName('')
                    }}
                    style={{ backgroundColor: '#6b7280', minWidth: '100px', height: '125%' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '720px', padding: '0 1.5rem 1.5rem' }}
          >
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
                      placeholder="xai..."
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
                      <option value="arabic">العربية (Arabic)</option>
                      <option value="bengali">বাংলা (Bengali)</option>
                      <option value="simplified-chinese">简体中文 (Simplified Chinese)</option>
                      <option value="traditional-chinese">繁體中文 (Traditional Chinese)</option>
                      <option value="french">Français (French)</option>
                      <option value="german">Deutsch (German)</option>
                      <option value="hindi">हिंदी (Hindi)</option>
                      <option value="indonesian">Bahasa Indonesia (Indonesian)</option>
                      <option value="italian">Italiano (Italian)</option>
                      <option value="japanese">日本語 (Japanese)</option>
                      <option value="korean">한국어 (Korean)</option>
                      <option value="malay">Bahasa Melayu (Malay)</option>
                      <option value="portuguese">Português (Portuguese)</option>
                      <option value="persian">فارسی (Persian / Iranian)</option>
                      <option value="russian">Русский (Russian)</option>
                      <option value="spanish">Español (Spanish)</option>
                      <option value="thai">ไทย (Thai)</option>
                      <option value="turkish">Türkçe (Turkish)</option>
                      <option value="vietnamese">Tiếng Việt (Vietnamese)</option>
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
                  if (nativeLanguage === 'english') {
                    alert('Please choose a native language other than English for translations.')
                    return
                  }
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
                      const confirmed = window.confirm('Do you really want to re-generate this image?')
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
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                      <circle cx="9" cy="9" r="1.75" />
                      <path d="m3 17 5.5-5.5 3.5 3.5L17 10l4 4" />
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
              <div style={{ marginTop: '0.1rem', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                Please download the image, it is available for only 24 hours.
              </div>
            </div>
          </div>
        </div>
      )}

      {showVoiceModal && (
        <div className="modal-overlay" onClick={() => setShowVoiceModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
              <div className="modal-header">
                <div className="modal-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                    <path d="M5.5 21c0-3.5 3-6.5 6.5-6.5S18.5 17.5 18.5 21" />
                    <path d="M9 6.5c0-1.38.9-2.5 2.5-2.5 1.6 0 2.5 1.12 2.5 2.5" />
                  </svg>
                  <h2>Dialogue Practice: {currentVoiceWord}</h2>
                </div>
                <button
                  className="modal-close-button"
                  onClick={() => {
                    if (voiceWs) {
                      voiceWs.close()
                      setVoiceWs(null)
                    }
                    if (microphoneStreamRef.current) {
                      microphoneStreamRef.current.getTracks().forEach(track => track.stop())
                      microphoneStreamRef.current = null
                    }
                    if (audioProcessorRef.current) {
                      audioProcessorRef.current.disconnect()
                      audioProcessorRef.current = null
                    }
                    setIsRecording(false)
                    setShowVoiceModal(false)
                    setVoiceMessages([])
                  }}
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
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  padding: '1rem', 
                  backgroundColor: '#f3f4f6', 
                  borderRadius: '8px',
                  minHeight: '200px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  marginBottom: '1rem'
                }}>
                  {voiceMessages.length === 0 ? (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                      {isVoiceConnected ? 'Connected. Click the microphone button to start speaking.' : 'Connecting...'}
                    </div>
                  ) : (
                    voiceMessages.map((msg, index) => (
                      <div key={index} style={{ marginBottom: '0.5rem', padding: '0.5rem' }}>
                        <div style={{ 
                          fontWeight: msg.startsWith('You:') ? '500' : '400',
                          color: msg.startsWith('You:') ? '#3b82f6' : '#111827'
                        }}>
                          {msg}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={handleStartVoiceInput}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: isRecording ? '#ef4444' : (isVoiceConnected ? '#3b82f6' : '#9ca3af'),
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isVoiceConnected ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  disabled={!isVoiceConnected}
                  title={isRecording ? 'Stop recording' : 'Start voice input'}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                Status: {isVoiceConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
