import { useState, useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '@daggr/protocol';

interface ChatProps {
  messages: ChatMessageType[];
  myNickname: string;
  peerNickname: string | null;
  status: string;
  onSend: (text: string) => void;
}

export default function Chat({ messages, myNickname, peerNickname, status, onSend }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    // Refocus input after sending
    inputRef.current?.focus();
  };

  const isConnected = status === 'connected';
  const isWaiting = status === 'waiting';

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scrollbar">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            {isWaiting
              ? 'Waiting for someone to join...'
              : isConnected
                ? 'No messages yet. Say hello!'
                : 'Connecting...'}
          </div>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.senderNickname === myNickname;
          return (
            <div
              key={i}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  isMine
                    ? 'bg-brand-600 text-white rounded-br-md'
                    : 'bg-gray-800 text-gray-100 rounded-bl-md'
                }`}
              >
                {!isMine && peerNickname && (
                  <div className="text-xs text-brand-300 font-medium mb-1">
                    {peerNickname}
                  </div>
                )}
                <p className="text-sm leading-relaxed break-words">{msg.payload}</p>
                <div
                  className={`text-xs mt-1 ${
                    isMine ? 'text-brand-200' : 'text-gray-500'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected
                ? 'Type a message...'
                : isWaiting
                  ? 'Waiting for connection...'
                  : 'Connecting...'
            }
            disabled={!isConnected}
            maxLength={4096}
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-sm
                       placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-5 py-2.5
                       text-sm font-medium transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}