import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, Loader2, Plus, Search, Image as ImageIcon, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { identifyImage, addToWatchlist } from '../lib/api';
import type { IdentifyResult, ReleaseInfo } from '../types';
import { useNavigate } from 'react-router-dom';

interface IdentifyResultWithRelease extends IdentifyResult {
  release?: ReleaseInfo;
}

export default function Identify() {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdentifyResultWithRelease | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setResult(null);
      setLoading(true);

      try {
        const data = await identifyImage(base64);
        setResult(data);
        toast.success('Shoe identified!');
      } catch {
        toast.error('Failed to identify shoe. Try a different image.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleAddToWatchlist() {
    if (!result) return;
    setAddingToWatchlist(true);
    try {
      await addToWatchlist({
        name: `${result.brand} ${result.model}`,
        url: '',
        retailer: 'Unknown',
        scrapeInterval: 30,
      });
      toast.success(`Added "${result.brand} ${result.model}" to watchlist`);
    } catch {
      toast.error('Failed to add to watchlist');
    } finally {
      setAddingToWatchlist(false);
    }
  }

  function handleSearchMore() {
    if (!result) return;
    navigate(`/search?q=${encodeURIComponent(`${result.brand} ${result.model}`)}`);
  }

  function handleReset() {
    setPreview(null);
    setResult(null);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const confidencePercent = result ? Math.round(result.confidence * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#ffffff]">Identify Shoe</h1>
        <p className="text-[#888888] text-sm mt-1">Upload an image to identify any sneaker using AI</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Zone */}
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors min-h-[300px] flex flex-col items-center justify-center ${
              dragging
                ? 'border-[#00ff87] bg-[#00ff87]/5'
                : 'border-[#222222] bg-[#111111] hover:border-[#888888]'
            }`}
          >
            {preview ? (
              <img
                src={preview}
                alt="Upload preview"
                className="max-h-[260px] max-w-full rounded-lg object-contain"
              />
            ) : (
              <>
                <div className="p-4 rounded-full bg-[#00ff87]/10 mb-4">
                  <Upload size={32} className="text-[#00ff87]" />
                </div>
                <p className="text-[#ffffff] font-medium mb-1">
                  Drag and drop an image here
                </p>
                <p className="text-[#888888] text-sm">or click to browse files</p>
                <p className="text-[#888888] text-xs mt-2">Supports JPG, PNG, WebP (max 10MB)</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-[#111111] border border-[#222222] text-[#ffffff] font-medium text-sm rounded-lg px-4 py-2.5 hover:border-[#888888] transition-colors flex items-center justify-center gap-2"
            >
              <Camera size={16} />
              Choose File
            </button>
            {preview && (
              <button
                onClick={handleReset}
                className="bg-[#111111] border border-[#222222] text-[#888888] font-medium text-sm rounded-lg px-4 py-2.5 hover:text-[#ffffff] hover:border-[#888888] transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <Loader2 size={40} className="animate-spin text-[#00ff87] mb-4" />
              <p className="text-[#ffffff] font-medium">Analyzing image...</p>
              <p className="text-[#888888] text-sm mt-1">Our AI is identifying the shoe</p>
            </div>
          ) : result ? (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[#ffffff]">Identification Result</h2>

              <div className="space-y-3">
                {[
                  { label: 'Brand', value: result.brand },
                  { label: 'Model', value: result.model },
                  { label: 'Colorway', value: result.colorway },
                  { label: 'Year', value: result.year },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-[#222222]">
                    <span className="text-[#888888] text-sm">{label}</span>
                    <span className="text-[#ffffff] text-sm font-medium">{value || 'Unknown'}</span>
                  </div>
                ))}

                <div className="flex items-center justify-between py-2 border-b border-[#222222]">
                  <span className="text-[#888888] text-sm">Confidence</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-[#0a0a0a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${confidencePercent}%`,
                          backgroundColor:
                            confidencePercent >= 80
                              ? '#00ff87'
                              : confidencePercent >= 50
                              ? '#eab308'
                              : '#ef4444',
                        }}
                      />
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        confidencePercent >= 80
                          ? 'text-[#00ff87]'
                          : confidencePercent >= 50
                          ? 'text-[#eab308]'
                          : 'text-[#ef4444]'
                      }`}
                    >
                      {confidencePercent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Release Info */}
              {result.release && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-semibold text-[#00ff87]">Release Information</h3>

                  {[
                    { label: 'Release Date', value: result.release.releaseDate },
                    { label: 'Retail Price', value: result.release.retailPrice },
                    { label: 'Est. Resale', value: result.release.estimatedResale },
                    { label: 'Colorway', value: result.release.colorway },
                  ].map(({ label, value }) =>
                    value ? (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-[#222222]">
                        <span className="text-[#888888] text-sm">{label}</span>
                        <span className="text-[#ffffff] text-sm font-medium">{value}</span>
                      </div>
                    ) : null
                  )}

                  {result.release.retailers && result.release.retailers.length > 0 && (
                    <div className="py-2 border-b border-[#222222]">
                      <span className="text-[#888888] text-sm block mb-1.5">Retailers</span>
                      <div className="flex flex-wrap gap-1.5">
                        {result.release.retailers.map((r) => (
                          <span
                            key={r}
                            className="text-xs px-2 py-1 rounded-md bg-[#222222] text-[#ffffff]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.release.sourceUrls && result.release.sourceUrls.length > 0 && (
                    <div className="py-2">
                      <span className="text-[#888888] text-sm block mb-1.5">Sources</span>
                      <div className="space-y-1">
                        {result.release.sourceUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-[#888888] hover:text-[#00ff87] transition-colors truncate"
                          >
                            <ExternalLink size={12} className="flex-shrink-0" />
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist}
                  className="flex-1 bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addingToWatchlist ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Add to Watchlist
                </button>
                <button
                  onClick={handleSearchMore}
                  className="flex-1 bg-[#0a0a0a] border border-[#222222] text-[#ffffff] font-semibold text-sm rounded-lg px-4 py-2.5 hover:border-[#888888] transition-colors flex items-center justify-center gap-2"
                >
                  <Search size={16} />
                  Search More Info
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <ImageIcon size={48} className="text-[#888888] mb-4" />
              <p className="text-[#ffffff] font-medium mb-1">No image uploaded</p>
              <p className="text-[#888888] text-sm text-center">
                Upload a photo of any sneaker and our AI will identify the brand, model, and more.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
