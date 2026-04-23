import { useState, useRef, useEffect } from 'react';
import { Send, FileText, Clock, RotateCcw, FileEdit, Bot, User } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import Markdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';
import { fetchRecentDocs } from '../lib/drive';
import { formatDistanceToNow } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  docResults?: Array<{id: string, title: string, modified: string}>;
  previewDoc?: {id: string, title: string, snippet: string, modified: string};
}

export function Cowork() {
  const { user, clearToken, clearCalendarAccess, connectCalendar } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState<{id: string, title: string} | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0 && user) {
      const loadRecentDocs = async () => {
        try {
          const data = await fetchRecentDocs(user.uid);
          let docList = [];
          if (data && data.files) {
            docList = data.files.map((f: any) => ({
              id: f.id,
              title: f.name,
              modified: f.viewedByMeTime ? formatDistanceToNow(new Date(f.viewedByMeTime), { addSuffix: true }) : 'Unknown'
            }));
          }
          
          setMessages([
            {
              id: '1',
              role: 'assistant',
              content: "Hey! Here are your 5 most recently opened docs. Which one would you like to work on? You can also just tell me the name of any doc and I'll find it.",
              docResults: docList
            }
          ]);
        } catch (error: any) {
          console.error("Failed to load recent docs", error);
          if (error.message === 'UNAUTHORIZED') {
              setIsUnauthorized(true);
              clearToken();
              clearCalendarAccess();
              setMessages([
                {
                  id: '1',
                  role: 'assistant',
                  content: "Hey! Your Google Workspace connection is missing the latest scopes required to read and edit documents. Please click the button above to authorize full access.",
                  docResults: []
                }
              ]);
          } else {
             setMessages([
              {
                id: '1',
                role: 'assistant',
                content: "Hey! I couldn't load your recent docs right now, but you can tell me the name of any doc and I'll find it.",
                docResults: []
              }
            ]);
          }
        }
      };

      loadRecentDocs();
    }
  }, [messages.length, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent, content?: string) => {
    e?.preventDefault();
    const textToSend = content || input;
    if (!textToSend.trim() || isLoading) return;

    setInput('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const accessToken = localStorage.getItem('googleAccessToken');
      let refreshToken = null;
      if (user) {
        try {
          const { getCachedOrFetch } = await import('../utils/cache.ts');
          const userData = await getCachedOrFetch(`client:${user.uid}:userDoc`, 300, async () => {
             const userDoc = await getDoc(doc(db, 'users', user.uid));
             return userDoc.exists() ? userDoc.data() : null;
          });
          refreshToken = userData?.calendarRefreshToken;
        } catch(e) {}
      }

      const response = await fetch('/api/cowork/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.concat(userMsg).map(m => ({ 
             role: m.role, 
             content: m.content,
             docContext: m.docResults ? m.docResults : undefined
          })),
          activeDocId: activeDoc?.id,
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken,
          uid: user?.uid
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.setActiveDoc) {
        setActiveDoc(data.setActiveDoc);
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.content,
        docResults: data.docResults,
        previewDoc: data.previewDoc
      }]);

    } catch (error: any) {
      toast.error(error.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative bg-white dark:bg-gray-950">
      {/* Authorization Error Banner */}
      {isUnauthorized && (
        <div className="bg-orange-50 dark:bg-orange-900/30 border-b border-orange-200 dark:border-orange-900 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center text-orange-800 dark:text-orange-300">
            <Bot className="h-5 w-5 mr-3 text-orange-600 dark:text-orange-400" />
            <span className="font-medium mr-4">Cowork needs full Google Workspace permissions to generate documents.</span>
          </div>
          <Button 
            size="sm" 
            onClick={async () => {
               try {
                 await connectCalendar();
                 setIsUnauthorized(false);
                 toast.success("Permissions updated! Refreshing docs...");
                 setTimeout(() => window.location.reload(), 1000);
               } catch(e: any) {
                 toast.error(e.message || "Failed to connect");
               }
            }} 
            className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
          >
            Authorize Workspace
          </Button>
        </div>
      )}

      {/* Persistent Banner if Doc is active */}
      {activeDoc && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-900 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center text-blue-800 dark:text-blue-300">
            <FileEdit className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
            <span className="font-medium mr-4">Editing: {activeDoc.title}</span>
            <Button variant="outline" size="sm" onClick={() => setActiveDoc(null)} className="h-7 text-xs border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50">
              Change Doc
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50" onClick={() => handleSendMessage(undefined, "Restore to previous version")}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Restore to previous version
          </Button>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm px-5 py-3' : 'bg-gray-100 dark:bg-gray-900 rounded-2xl rounded-tl-sm px-5 py-3 text-gray-900 dark:text-gray-100'}`}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>

                {/* Document Results */}
                {msg.docResults && msg.docResults.length > 0 && (
                  <div className="mt-4 grid gap-2">
                    {msg.docResults.map(doc => (
                      <div 
                        key={doc.id}
                        onClick={() => handleSendMessage(undefined, `Let's work on ${doc.title}`)}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg flex items-center cursor-pointer hover:border-blue-300 transition-colors"
                      >
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded shrink-0 mr-3">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{doc.title}</h4>
                          <div className="flex items-center text-xs text-gray-500 mt-1">
                            <Clock className="h-3 w-3 mr-1" />
                            {doc.modified}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Preview Doc */}
                {msg.previewDoc && (
                  <div className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg">
                    <div className="flexitems-center mb-2">
                      <FileText className="h-5 w-5 text-blue-600 mr-2 inline" />
                      <span className="font-semibold">{msg.previewDoc.title}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-2">"{msg.previewDoc.snippet}"</p>
                    <div className="text-xs text-gray-500 mb-4">Last modified: {msg.previewDoc.modified}</div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSendMessage(undefined, "Yes, that's the one")} className="bg-blue-600 hover:bg-blue-700 text-white">Yes, use this</Button>
                      <Button size="sm" variant="outline" onClick={() => handleSendMessage(undefined, "No, search again")}>Search Again</Button>
                    </div>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
               <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl rounded-tl-sm px-5 py-4">
                 <div className="flex space-x-2">
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                 </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-gray-950 shrink-0 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSendMessage} className="relative flex items-end bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask Cowork to update docs or ask questions..."
              className="w-full max-h-32 min-h-[56px] py-4 pl-4 pr-12 bg-transparent border-0 focus:ring-0 resize-none text-gray-900 dark:text-gray-100"
              rows={1}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white h-10 w-10 shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
          <div className="text-center mt-2">
            <span className="text-xs text-gray-400">Cowork can make mistakes. Consider verifying important changes.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
