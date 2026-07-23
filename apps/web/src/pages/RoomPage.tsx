import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateNickname } from '@daggr/shared';
import { generateKeypair } from '@daggr/crypto';
import type { ChatMessage } from '@daggr/protocol';
import { useWebRTC, type ConnectionStatus } from '../hooks/useWebRTC';
import Chat from '../components/Chat';
import CountdownTimer from '../components/CountdownTimer';
import { getStoredNickname, setStoredNickname, setLastRoom, clearLastRoom } from '../utils/localStorage';
import { setSessionIdentity, getSessionNickname, getSessionPublicKey, clearSession } from '../utils/session';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState<string>('');
  const [publicKey, setPublicKey] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerNickname, setPeerNickname] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize identity on mount
  useEffect(() => {
    async function initIdentity() {
      // Try to restore from session first
      let nick = getSessionNickname();
      let pk = getSessionPublicKey();

      if (!nick || !pk) {
        // Generate new identity
        nick = getStoredNickname() || generateNickname();
        setStoredNickname(nick);
        const keypair = await generateKeypair();
        pk = keypair.publicKeyBase64;
        setSessionIdentity(nick, pk);
      }

      setNickname(nick);
      setPublicKey(pk);
    }

    initIdentity();
  }, []);

  // Handle incoming chat messages
  const handleMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Handle peer connected
  const handlePeerConnected = useCallback((nick: string, _pk: string) => {
    setPeerNickname(nick);
    setError(null);
  }, []);

  // Handle peer disconnected
  const handlePeerDisconnected = useCallback(() => {
    setPeerNickname(null);
    setError('Your peer has disconnected.');
  }, []);

  // Handle room expired
  const handleRoomExpired = useCallback(() => {
    setIsExpired(true);
    clearLastRoom();
    clearSession();
  }, []);

  // Handle errors
  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  // WebRTC hook
  const { status, expiresAt, sendMessage } = useWebRTC({
    roomId: roomId ?? '',
    nickname,
    publicKeyBase64: publicKey,
    onMessage: handleMessage,
    onPeerConnected: handlePeerConnected,
    onPeerDisconnected: handlePeerDisconnected,
    onRoomExpired: handleRoomExpired,
    onError: handleError,
  });

  // Copy room link to clipboard
  const handleCopyLink = () => {
    const link = `${window.location.origin}/r/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Handle local expiry timer (when countdown hits zero)
  const handleTimerExpired = useCallback(() => {
    if (!isExpired) {
      handleRoomExpired();
    }
  }, [isExpired, handleRoomExpired]);

  // If no roomId, redirect to landing
  if (!roomId) {
    navigate('/');
    return null;
  }

  // Status display
  const statusDisplay: Record<ConnectionStatus, { text: string; color: string }> = {
    connecting: { text: 'Connecting...', color: 'text-yellow-400' },
    waiting: { text: 'Waiting for someone to join...', color: 'text-yellow-400' },
    connected: { text: 'Connected', color: 'text-green-400' },
    disconnected: { text: 'Disconnected', color: 'text-red-400' },
    expired: { text: 'Room Expired', color: 'text-red-400' },
    error: { text: 'Connection Error', color: 'text-red-400' },
    full: { text: 'Room Full', color: 'text-red-400' },
  };

  const statusInfo = statusDisplay[status];

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title="Back to home"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-gray-200">
              {peerNickname ? `Chatting with ${peerNickname}` : 'Daggr'}
            </h1>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${statusInfo.color}`}>{statusInfo.text}</span>
              <span className="text-gray-600">·</span>
              <span className="text-xs text-gray-500">You: {nickname}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Countdown timer */}
          <CountdownTimer expiresAt={expiresAt} onExpired={handleTimerExpired} />

          {/* Copy link button */}
          <button
            onClick={handleCopyLink}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title="Copy room link"
          >
            {copied ? (
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Room ID display */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <code className="text-sm text-gray-400 font-mono">{roomId}</code>
        <span className="text-xs text-gray-600">
          {status === 'waiting' ? 'Share this link with someone to chat' : ''}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/20 border-b border-red-800 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200 ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Expired overlay */}
      {isExpired && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="text-6xl">⏰</div>
            <h2 className="text-xl font-semibold text-gray-300">Room Expired</h2>
            <p className="text-gray-500 text-sm">
              This room has self-destructed. All data has been cleared.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl px-6 py-2.5 transition-colors"
            >
              Create New Room
            </button>
          </div>
        </div>
      )}

      {/* Room full overlay */}
      {status === 'full' && !isExpired && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="text-6xl">🚫</div>
            <h2 className="text-xl font-semibold text-gray-300">Room Full</h2>
            <p className="text-gray-500 text-sm">
              This room already has 2 participants.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl px-6 py-2.5 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Chat area */}
      {!isExpired && status !== 'full' && (
        <div className="flex-1 flex flex-col min-h-0">
          <Chat
            messages={messages}
            myNickname={nickname}
            peerNickname={peerNickname}
            status={status}
            onSend={sendMessage}
          />
        </div>
      )}
    </div>
  );
}