import { useState, useEffect } from 'react';
import { Save, TestTube, Loader2, Shield, Bell, Cpu, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface SettingsData {
  telegramBotToken: string;
  telegramChatId: string;
  togetherApiKey: string;
  defaultInterval: number;
  defaultRetailers: string[];
}

const SETTINGS_KEY = 'sneakerg_settings';

const ALL_RETAILERS = [
  'Nike SNKRS',
  'Foot Locker',
  'Finish Line',
  'Champs Sports',
  'GOAT',
  'StockX',
];

function loadSettings(): SettingsData {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {
    telegramBotToken: '',
    telegramChatId: '',
    togetherApiKey: '',
    defaultInterval: 30,
    defaultRetailers: ['Nike SNKRS'],
  };
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>(loadSettings);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingAI, setTestingAI] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function handleChange(field: keyof SettingsData, value: string | number | string[]) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  function toggleRetailer(retailer: string) {
    setSettings((prev) => {
      const current = prev.defaultRetailers;
      const next = current.includes(retailer)
        ? current.filter((r) => r !== retailer)
        : [...current, retailer];
      return { ...prev, defaultRetailers: next };
    });
  }

  function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestTelegram() {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      toast.error('Please enter Telegram Bot Token and Chat ID');
      return;
    }
    setTestingTelegram(true);
    try {
      await axios.post(
        `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`,
        {
          chat_id: settings.telegramChatId,
          text: '✅ Sneaker G connection test successful!',
        }
      );
      toast.success('Telegram test message sent!');
    } catch {
      toast.error('Telegram connection failed. Check your credentials.');
    } finally {
      setTestingTelegram(false);
    }
  }

  async function handleTestAI() {
    if (!settings.togetherApiKey) {
      toast.error('Please enter a Together AI API Key');
      return;
    }
    setTestingAI(true);
    try {
      await axios.get('https://api.together.xyz/v1/models', {
        headers: { Authorization: `Bearer ${settings.togetherApiKey}` },
      });
      toast.success('AI connection successful!');
    } catch {
      toast.error('AI connection failed. Check your API key.');
    } finally {
      setTestingAI(false);
    }
  }

  const isConfigured =
    settings.telegramBotToken && settings.telegramChatId && settings.togetherApiKey;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#ffffff]">Settings</h1>
        <p className="text-[#888888] text-sm mt-1">Configure your Sneaker G monitoring preferences</p>
      </div>

      {!isConfigured && (
        <div className="bg-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#ff6b35] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#ffffff] text-sm font-medium">Setup Required</p>
            <p className="text-[#888888] text-xs mt-0.5">
              Configure your Telegram and AI credentials below to enable notifications and shoe identification.
            </p>
          </div>
        </div>
      )}

      {isConfigured && (
        <div className="bg-[#00ff87]/10 border border-[#00ff87]/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-[#00ff87] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#ffffff] text-sm font-medium">All Configured</p>
            <p className="text-[#888888] text-xs mt-0.5">
              Your credentials are saved locally. Use the test buttons to verify they work.
            </p>
          </div>
        </div>
      )}

      {/* Telegram Settings */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 space-y-4">
        <h2 className="text-[#ffffff] font-semibold flex items-center gap-2">
          <Bell size={18} className="text-[#00ff87]" />
          Telegram Notifications
        </h2>

        <div>
          <label className="block text-xs text-[#888888] mb-1">Bot Token</label>
          <input
            type="password"
            value={settings.telegramBotToken}
            onChange={(e) => handleChange('telegramBotToken', e.target.value)}
            placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz..."
            className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors font-mono"
          />
        </div>

        <div>
          <label className="block text-xs text-[#888888] mb-1">Chat ID</label>
          <input
            type="password"
            value={settings.telegramChatId}
            onChange={(e) => handleChange('telegramChatId', e.target.value)}
            placeholder="Your Telegram Chat ID"
            className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors font-mono"
          />
        </div>

        <button
          onClick={handleTestTelegram}
          disabled={testingTelegram}
          className="bg-[#0a0a0a] border border-[#222222] text-[#ffffff] font-medium text-sm rounded-lg px-4 py-2.5 hover:border-[#888888] transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {testingTelegram ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <TestTube size={16} />
          )}
          Test Telegram Connection
        </button>
      </div>

      {/* AI Settings */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 space-y-4">
        <h2 className="text-[#ffffff] font-semibold flex items-center gap-2">
          <Cpu size={18} className="text-[#00ff87]" />
          Together AI
        </h2>

        <div>
          <label className="block text-xs text-[#888888] mb-1">API Key</label>
          <input
            type="password"
            value={settings.togetherApiKey}
            onChange={(e) => handleChange('togetherApiKey', e.target.value)}
            placeholder="Your Together AI API Key"
            className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors font-mono"
          />
        </div>

        <button
          onClick={handleTestAI}
          disabled={testingAI}
          className="bg-[#0a0a0a] border border-[#222222] text-[#ffffff] font-medium text-sm rounded-lg px-4 py-2.5 hover:border-[#888888] transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {testingAI ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
          Test AI Connection
        </button>
      </div>

      {/* Scraping Defaults */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 space-y-4">
        <h2 className="text-[#ffffff] font-semibold flex items-center gap-2">
          <Clock size={18} className="text-[#00ff87]" />
          Scraping Defaults
        </h2>

        <div>
          <label className="block text-xs text-[#888888] mb-1">Default Scrape Interval (minutes)</label>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.defaultInterval}
            onChange={(e) => handleChange('defaultInterval', Number(e.target.value))}
            className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] w-32 focus:outline-none focus:border-[#00ff87] transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-[#888888] mb-2">Default Retailers</label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_RETAILERS.map((retailer) => (
              <label
                key={retailer}
                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  settings.defaultRetailers.includes(retailer)
                    ? 'bg-[#00ff87]/10 border-[#00ff87]/30 text-[#ffffff]'
                    : 'bg-[#0a0a0a] border-[#222222] text-[#888888] hover:border-[#888888]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={settings.defaultRetailers.includes(retailer)}
                  onChange={() => toggleRetailer(retailer)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    settings.defaultRetailers.includes(retailer)
                      ? 'bg-[#00ff87] border-[#00ff87]'
                      : 'border-[#888888]'
                  }`}
                >
                  {settings.defaultRetailers.includes(retailer) && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm">{retailer}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Security note */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-4 flex items-start gap-3">
        <Shield size={16} className="text-[#888888] flex-shrink-0 mt-0.5" />
        <p className="text-[#888888] text-xs">
          Credentials are stored locally in your browser. For production use, configure these as environment variables on your server.
        </p>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-lg px-6 py-3 hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Save Settings
      </button>
    </div>
  );
}
