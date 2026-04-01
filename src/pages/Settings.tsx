import { useState, useEffect } from 'react';
import { Save, TestTube, Loader2, Shield, Bell, Cpu, Clock, CheckCircle, AlertCircle, Plus, Trash2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface CustomSite {
  name: string;
  url: string;
}

interface SettingsData {
  telegramBotToken: string;
  telegramChatId: string;
  togetherApiKey: string;
  defaultInterval: number;
  defaultRetailers: string[];
  customSites: CustomSite[];
}

const SETTINGS_KEY = 'sneakerg_settings';
const CUSTOM_SITES_KEY = 'sneakerg_custom_sites';

const ALL_RETAILERS = [
  'Nike SNKRS',
  'Foot Locker',
  'Finish Line',
  'Champs Sports',
  'GOAT',
  'StockX',
];

function extractSiteName(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let hostname = url.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    const firstPart = hostname.split('.')[0];
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  } catch {
    return urlStr;
  }
}

function loadSettings(): SettingsData {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const customSites = localStorage.getItem(CUSTOM_SITES_KEY);
    const base = stored ? JSON.parse(stored) : {};
    return {
      telegramBotToken: base.telegramBotToken || '',
      telegramChatId: base.telegramChatId || '',
      togetherApiKey: base.togetherApiKey || '',
      defaultInterval: base.defaultInterval || 30,
      defaultRetailers: base.defaultRetailers || ['Nike SNKRS'],
      customSites: customSites ? JSON.parse(customSites) : base.customSites || [],
    };
  } catch {
    return {
      telegramBotToken: '',
      telegramChatId: '',
      togetherApiKey: '',
      defaultInterval: 30,
      defaultRetailers: ['Nike SNKRS'],
      customSites: [],
    };
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>(loadSettings);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [customSiteUrl, setCustomSiteUrl] = useState('');

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function handleChange(field: keyof SettingsData, value: string | number | string[] | CustomSite[]) {
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

  function handleAddCustomSite() {
    const trimmed = customSiteUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    const name = extractSiteName(trimmed);
    const alreadyExists = settings.customSites.some((s) => s.url === trimmed);
    if (alreadyExists) {
      toast.error('This site is already added');
      return;
    }

    const newSites = [...settings.customSites, { name, url: trimmed }];
    setSettings((prev) => ({ ...prev, customSites: newSites }));
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(newSites));
    setCustomSiteUrl('');
    toast.success(`Added ${name}`);
  }

  function handleRemoveCustomSite(url: string) {
    const newSites = settings.customSites.filter((s) => s.url !== url);
    setSettings((prev) => ({ ...prev, customSites: newSites }));
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(newSites));
    toast.success('Site removed');
  }

  function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(settings.customSites));
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

      {/* Custom Search Sites */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 space-y-4">
        <h2 className="text-[#ffffff] font-semibold flex items-center gap-2">
          <Globe size={18} className="text-[#00ff87]" />
          Custom Search Sites
        </h2>
        <p className="text-[#888888] text-xs">
          Add custom retailer or reseller sites to include in your searches.
        </p>

        <div className="flex gap-2">
          <input
            type="url"
            value={customSiteUrl}
            onChange={(e) => setCustomSiteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomSite();
              }
            }}
            placeholder="https://www.example.com"
            className="flex-1 bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors"
          />
          <button
            onClick={handleAddCustomSite}
            className="bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-[#00ff87]/90 transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {settings.customSites.length > 0 && (
          <div className="space-y-2">
            {settings.customSites.map((site) => (
              <div
                key={site.url}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[#0a0a0a] border border-[#222222]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#ffffff]">{site.name}</p>
                  <p className="text-xs text-[#888888] truncate">{site.url}</p>
                </div>
                <button
                  onClick={() => handleRemoveCustomSite(site.url)}
                  className="text-[#888888] hover:text-[#ef4444] transition-colors flex-shrink-0 ml-3"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {settings.customSites.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[#888888] text-xs">No custom sites added yet.</p>
          </div>
        )}
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
