import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RoomPage from './pages/RoomPage';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/r/:roomId" element={<RoomPage />} />
      </Routes>
    </div>
  );
}