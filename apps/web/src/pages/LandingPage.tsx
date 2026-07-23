import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateRoomId, generateNickname } from '@daggr/shared';
import { setStoredNickname, setLastRoom } from '../utils/localStorage';

export default function LandingPage() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Generate room ID
      const roomId = generateRoomId();

      // Generate or load nickname
      const nickname = generateNickname();
      setStoredNickname(nickname);

      // Store last room
      setLastRoom(roomId);

      // Navigate to room — RoomPage handles keypair generation
      navigate(`/r/${roomId}`);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      setIsCreating(false);
    }
  };

  const handleJoin = () => {
    const trimmed = joinId.trim();

    // Support full URLs like daggr.xyz/r/dg-LX92FQ or just dg-LX92FQ
    let roomId = trimmed;
    const urlMatch = trimmed.match(/\/r\/([a-zA-Z0-9-]+)/);
    if (urlMatch) {
      roomId = urlMatch[1];
    }

    if (!roomId || roomId.length < 4) {
      setError('Please enter a valid room ID or link.');
      return;
    }

    const nickname = generateNickname();
    setStoredNickname(nickname);
    setLastRoom(roomId);
    navigate(`/r/${roomId}`);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Tagline */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="text-brand-500">Daggr</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Ephemeral peer-to-peer chat.
            <br />
            <span className="text-gray-500 text-sm">
              No accounts. No database. No trace.
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-6 bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {/* Create Room */}
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold
                       rounded-xl py-3 px-6 transition-colors text-lg
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-gray-500 text-sm">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          {/* Join Room */}
          <div className="space-y-3">
            <input
              type="text"
              value={joinId}
              onChange={(e) => {
                setJoinId(e.target.value);
                setError(null);
              }}
              placeholder="Paste room ID or link..."
              className="w-full bg-gray-800 text-gray-100 rounded-xl px-4 py-3 text-sm
                         placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={!joinId.trim()}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-100 font-medium
                         rounded-xl py-3 px-6 transition-colors border border-gray-700
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs">
          Rooms self-destruct 30 minutes after creation.
        </p>
      </div>
    </div>
  );
}