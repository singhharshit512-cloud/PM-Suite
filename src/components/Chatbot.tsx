import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { MessageCircle, X, Send, Mic, Image as ImageIcon, Plus, Loader2, SquareSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { getCachedOrFetch, invalidateCache } from '../utils/cache';

const getBaseUrl = () => typeof window !== 'undefined' ? `${window.location.origin}/api/gemini-proxy` : 'http://localhost:3000/api/gemini-proxy';

const ai = new GoogleGenAI({ 
  apiKey: 'placeholder', 
  httpOptions: { baseUrl: getBaseUrl() } 
});

const tools = [{
  functionDeclarations: [
    {
      name: 'createTask',
      description: 'Create a new task',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          dueDate: { type: Type.STRING, description: 'ISO date string' }
        },
        required: ['title']
      }
    },
    {
      name: 'updateTask',
      description: 'Update an existing task status',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.STRING },
          status: { type: Type.STRING, description: 'open or closed' }
        },
        required: ['taskId', 'status']
      }
    },
    {
      name: 'createMeetingNote',
      description: 'Create a new meeting note',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title of the meeting note' },
          content: { type: Type.STRING, description: 'Content of the note (can be plain text or markdown/HTML)' }
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'updateMeetingNote',
      description: 'Update an existing meeting note',
      parameters: {
        type: Type.OBJECT,
        properties: {
          noteId: { type: Type.STRING },
          content: { type: Type.STRING, description: 'HTML content for the note' }
        },
        required: ['noteId', 'content']
      }
    },
    {
      name: 'deleteAllOpenTasks',
      description: 'Deletes all open tasks for the user',
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    },
    {
      name: 'deleteAllMeetingNotes',
      description: 'Deletes all meeting notes and their associated meetings for the user',
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    }
  ]
}];

export function Chatbot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText]);

  const [syncFlag, setSyncFlag] = useState(0);

  // Load latest chat on mount
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchLatestChat = async () => {
      try {
        const { getCachedOrFetch } = await import('../utils/cache.ts');
        const chatsData = await getCachedOrFetch(`client:${user.uid}:chatbot:chats`, 259200, async () => {
          const q = query(collection(db, 'chats'), where('userId', '==', user.uid));
          const snap = await getDocs(q);
          return snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        });

        if (isMounted && chatsData.length > 0) {
          chatsData.sort((a, b) => {
            let aMillis = 0;
            let bMillis = 0;
            if (a.updatedAt) aMillis = a.updatedAt.toMillis ? a.updatedAt.toMillis() : (a.updatedAt.seconds ? a.updatedAt.seconds * 1000 : new Date(a.updatedAt).getTime());
            if (b.updatedAt) bMillis = b.updatedAt.toMillis ? b.updatedAt.toMillis() : (b.updatedAt.seconds ? b.updatedAt.seconds * 1000 : new Date(b.updatedAt).getTime());
            return bMillis - aMillis;
          });
          setChatId(chatsData[0].id);
        }
      } catch (error) {
        console.error("Error fetching chats:", error);
      }
    };
    fetchLatestChat();
    return () => { isMounted = false; };
  }, [user, syncFlag]);

  // Listen to messages for current chat
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let isMounted = true;
    const fetchMessages = async () => {
      try {
        const { getCachedOrFetch } = await import('../utils/cache.ts');
        const msgs = await getCachedOrFetch(`client:${user?.uid}:chatbot:messages:${chatId}`, 259200, async () => {
          const q = query(collection(db, `chats/${chatId}/messages`), orderBy('createdAt', 'asc'));
          const snap = await getDocs(q);
          return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        if (isMounted) setMessages(msgs);
      } catch (error) {
        console.error("Chatbot messages error:", error);
      }
    };
    fetchMessages();
    return () => { isMounted = false; };
  }, [chatId, user, syncFlag]);

  const handleNewChat = () => {
    setChatId(null);
    setMessages([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone access to use voice input.');
      } else {
        console.error('Speech recognition error', event.error);
        toast.error('Speech recognition failed.');
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const fetchContext = async (userId: string) => {
    const tasks = await getCachedOrFetch(`client:${userId}:tasks`, 60, async () => {
      const snap = await getDocs(query(collection(db, 'tasks'), where('userId', '==', userId)));
      return snap.docs.map(d => {
        const data = d.data();
        if (data.createdAt) data.createdAt = data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
        if (data.dueDate) data.dueDate = data.dueDate.toDate ? data.dueDate.toDate().toISOString() : data.dueDate;
        if (data.closedAt) data.closedAt = data.closedAt.toDate ? data.closedAt.toDate().toISOString() : data.closedAt;
        return { id: d.id, ...data };
      });
    });
    
    const meetings = await getCachedOrFetch(`client:${userId}:meetings`, 60, async () => {
      const snap = await getDocs(query(collection(db, 'meetings'), where('userId', '==', userId)));
      return snap.docs.map(d => {
        const data = d.data();
        if (data.createdAt) data.createdAt = data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
        if (data.date) data.date = data.date.toDate ? data.date.toDate().toISOString() : data.date;
        return { id: d.id, ...data };
      });
    });

    const rawNotes = await getCachedOrFetch(`client:${userId}:notes`, 60, async () => {
      const snap = await getDocs(query(collection(db, 'notes'), where('userId', '==', userId)));
      return snap.docs.map(d => {
        const data = d.data();
        if (data.createdAt) data.createdAt = data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
        if (data.updatedAt) data.updatedAt = data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt;
        return { id: d.id, ...data };
      });
    });

    const notes = rawNotes.map((data: any) => {
      const meeting = meetings.find(m => m.id === data.meetingId) as any;
      return {
        noteId: data.id,
        meetingId: data.meetingId,
        title: meeting?.title || 'Untitled',
        content: data.content
      };
    });

    return `
      Current Tasks:
      ${JSON.stringify(tasks)}
      
      Current Meeting Notes:
      ${JSON.stringify(notes)}
    `;
  };

  const handleSend = async () => {
    if (!input.trim() && !image) return;
    if (!user) return;
    
    const userText = input;
    const userImage = image;
    setInput('');
    setImage(null);
    setIsLoading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    let currentChat = chatId;
    if (!currentChat) {
      const chatRef = await addDoc(collection(db, 'chats'), {
        userId: user.uid,
        title: userText.substring(0, 30) + '...',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      currentChat = chatRef.id;
      setChatId(currentChat);
    } else {
      await updateDoc(doc(db, 'chats', currentChat), {
        updatedAt: serverTimestamp()
      });
    }

    // Save user message to Firestore
    await addDoc(collection(db, `chats/${currentChat}/messages`), {
      role: 'user',
      text: userText,
      image: userImage,
      createdAt: serverTimestamp()
    });

    try {
      const context = await fetchContext(user.uid);
      
      // Build history for Gemini
      const history = messages.map(m => {
        const parts = [];
        if (m.image) {
          parts.push({
            inlineData: {
              data: m.image.split(',')[1],
              mimeType: m.image.split(';')[0].split(':')[1]
            }
          });
        }
        if (m.text) {
          parts.push({ text: m.text });
        }
        return { role: m.role === 'user' ? 'user' : 'model', parts };
      });

      const newParts = [];
      if (userImage) {
        newParts.push({
          inlineData: {
            data: userImage.split(',')[1],
            mimeType: userImage.split(';')[0].split(':')[1]
          }
        });
      }
      if (userText) {
        newParts.push({ text: userText });
      }
      history.push({ role: 'user', parts: newParts });

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: history,
        config: {
          systemInstruction: `You are an AI assistant integrated into a productivity app. You can help manage tasks and meeting notes. CRITICAL INSTRUCTION: If the user asks to create BOTH a task and a meeting note, you MUST call BOTH the createTask and createMeetingNote tools in your response. Do not skip one. If the user uploads an image and asks to add it to a note, you can include the image base64 in the HTML content of the note using an <img> tag. Here is the user's current data context:\n${context}`,
          tools: tools,
        }
      });

      let fullText = '';
      let functionCalls: any[] = [];

      for await (const chunk of stream) {
        if (chunk.functionCalls) {
          functionCalls.push(...chunk.functionCalls);
        }
        if (chunk.text) {
          fullText += chunk.text;
          setStreamingText(fullText);
        }
      }

      if (functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of functionCalls) {
          const { name, args, id } = call;
          let result = {};
          try {
            if (name === 'createTask') {
              const docRef = await addDoc(collection(db, 'tasks'), {
                userId: user.uid,
                title: args?.title as string || 'Untitled Task',
                description: (args?.description as string) || '',
                dueDate: args?.dueDate ? Timestamp.fromDate(new Date(args.dueDate as string)) : null,
                status: 'open',
                createdAt: serverTimestamp()
              });
              await invalidateCache(`client:${user.uid}:tasks`);
              result = { success: true, taskId: docRef.id };
            } else if (name === 'updateTask') {
              await updateDoc(doc(db, 'tasks', args?.taskId as string), {
                status: args?.status as string,
                closedAt: args?.status === 'closed' ? serverTimestamp() : null
              });
              await invalidateCache(`client:${user.uid}:tasks`);
              result = { success: true };
            } else if (name === 'createMeetingNote') {
              const meetingRef = await addDoc(collection(db, 'meetings'), {
                userId: user.uid,
                title: args?.title as string || 'Untitled Meeting',
                date: serverTimestamp(),
                startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                endTime: new Date(Date.now() + 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                googleEventId: null,
                participants: [],
                isOffline: true,
                createdAt: serverTimestamp()
              });

              const docRef = await addDoc(collection(db, 'notes'), {
                userId: user.uid,
                meetingId: meetingRef.id,
                content: args?.content as string || '',
                actionItems: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              await invalidateCache(`client:${user.uid}:meetings`);
              await invalidateCache(`client:${user.uid}:notes`);
              result = { success: true, meetingId: meetingRef.id, noteId: docRef.id };
            } else if (name === 'updateMeetingNote') {
              await updateDoc(doc(db, 'notes', args?.noteId as string), {
                content: args?.content as string,
                updatedAt: serverTimestamp()
              });
              await invalidateCache(`client:${user.uid}:notes`);
              result = { success: true };
            } else if (name === 'deleteAllOpenTasks') {
              const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('status', '==', 'open'));
              const snapshot = await getDocs(q);
              const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'tasks', d.id)));
              await Promise.all(deletePromises);
              await invalidateCache(`client:${user.uid}:tasks`);
              result = { success: true, deletedCount: snapshot.size };
            } else if (name === 'deleteAllMeetingNotes') {
              const notesQ = query(collection(db, 'notes'), where('userId', '==', user.uid));
              const notesSnapshot = await getDocs(notesQ);
              const deleteNotesPromises = notesSnapshot.docs.map(d => deleteDoc(doc(db, 'notes', d.id)));
              await Promise.all(deleteNotesPromises);
              
              const meetingsQ = query(collection(db, 'meetings'), where('userId', '==', user.uid));
              const meetingsSnapshot = await getDocs(meetingsQ);
              const deleteMeetingsPromises = meetingsSnapshot.docs.map(d => deleteDoc(doc(db, 'meetings', d.id)));
              await Promise.all(deleteMeetingsPromises);
              
              await invalidateCache(`client:${user.uid}:meetings`);
              await invalidateCache(`client:${user.uid}:notes`);

              result = { success: true, deletedNotesCount: notesSnapshot.size, deletedMeetingsCount: meetingsSnapshot.size };
            }
          } catch (e: any) {
            result = { success: false, error: e.message };
          }
          
          functionResponses.push({
            functionResponse: {
              name,
              response: result,
              id
            }
          });
        }

        const modelParts: any[] = [];
        if (fullText) modelParts.push({ text: fullText });
        for (const call of functionCalls) {
          modelParts.push({ functionCall: call });
        }
        history.push({ role: 'model', parts: modelParts });
        history.push({ role: 'user', parts: functionResponses });
        
        setStreamingText('');
        let fullText2 = '';
        const stream2 = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: history,
          config: {
            systemInstruction: `You are an AI assistant integrated into a productivity app. You can help manage tasks and meeting notes. CRITICAL INSTRUCTION: If the user asks to create BOTH a task and a meeting note, you MUST call BOTH the createTask and createMeetingNote tools in your response. Do not skip one. If the user uploads an image and asks to add it to a note, you can include the image base64 in the HTML content of the note using an <img> tag. Here is the user's current data context:\n${context}`,
            tools: tools,
          }
        });

        for await (const chunk of stream2) {
          if (chunk.text) {
            fullText2 += chunk.text;
            setStreamingText(fullText2);
          }
        }
        
        setStreamingText('');
        await addDoc(collection(db, `chats/${currentChat}/messages`), {
          role: 'model',
          text: fullText2,
          createdAt: serverTimestamp()
        });
      } else {
        setStreamingText('');
        await addDoc(collection(db, `chats/${currentChat}/messages`), {
          role: 'model',
          text: fullText,
          createdAt: serverTimestamp()
        });
      }

    } catch (error) {
      console.error(error);
      toast.error('Failed to get response from Gemini');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* FAB */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-4 sm:right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-50 flex items-center justify-center animate-in fade-in zoom-in duration-200"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 h-[600px] max-h-[calc(100vh-3rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-200 origin-bottom-right">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-950">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Gemini Assistant</h3>
            </div>
            <div className="flex items-center space-x-1">
              <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 space-y-4">
                <MessageCircle className="h-12 w-12 opacity-20" />
                <p>How can I help you today?</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'}`}>
                  {msg.image && (
                    <img src={msg.image} alt="Uploaded" className="max-w-full rounded-lg mb-2" />
                  )}
                  {msg.text && (
                    msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
                    ) : (
                      <div className="prose dark:prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm">
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{streamingText}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {isLoading && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {image && (
              <div className="relative inline-block mb-2">
                <img src={image} alt="Preview" className="h-16 rounded-md border border-gray-200 dark:border-gray-700" />
                <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="shrink-0">
                <ImageIcon className="h-4 w-4 text-gray-500" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleVoiceInput} 
                className={`shrink-0 ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}
              >
                <Mic className="h-4 w-4" />
              </Button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    const cursorPosition = e.currentTarget.selectionStart;
                    const textBeforeCursor = input.substring(0, cursorPosition);
                    const lines = textBeforeCursor.split('\n');
                    const currentLine = lines[lines.length - 1];

                    const match = currentLine.match(/^(\d+)\.\s/);
                    if (match) {
                      e.preventDefault();
                      const nextNumber = parseInt(match[1], 10) + 1;
                      const textAfterCursor = input.substring(e.currentTarget.selectionEnd);
                      const insertText = `\n${nextNumber}. `;
                      setInput(textBeforeCursor + insertText + textAfterCursor);
                      setTimeout(() => {
                        if (textareaRef.current) {
                          textareaRef.current.selectionStart = cursorPosition + insertText.length;
                          textareaRef.current.selectionEnd = cursorPosition + insertText.length;
                          textareaRef.current.style.height = 'auto';
                          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
                        }
                      }, 0);
                    } else if (currentLine.match(/^- /)) {
                      e.preventDefault();
                      const textAfterCursor = input.substring(e.currentTarget.selectionEnd);
                      const insertText = `\n- `;
                      setInput(textBeforeCursor + insertText + textAfterCursor);
                      setTimeout(() => {
                        if (textareaRef.current) {
                          textareaRef.current.selectionStart = cursorPosition + insertText.length;
                          textareaRef.current.selectionEnd = cursorPosition + insertText.length;
                          textareaRef.current.style.height = 'auto';
                          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
                        }
                      }, 0);
                    }
                  }
                }}
                placeholder="Ask Gemini..."
                rows={1}
                className="flex-1 bg-gray-100 dark:bg-gray-800 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 rounded-2xl px-4 py-2 text-sm outline-none transition-all resize-none min-h-[40px] max-h-[120px]"
              />
              <Button 
                variant="default" 
                size="icon" 
                onClick={handleSend} 
                disabled={(!input.trim() && !image) || isLoading}
                className="shrink-0 rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
