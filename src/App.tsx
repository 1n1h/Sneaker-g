import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import AiChat from './components/AiChat';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import Search from './pages/Search';
import Identify from './pages/Identify';
import History from './pages/History';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <AiChat />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111111',
            color: '#ffffff',
            border: '1px solid #222222',
          },
          success: {
            iconTheme: { primary: '#00ff87', secondary: '#111111' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#111111' },
          },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/search" element={<Search />} />
          <Route path="/identify" element={<Identify />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
