import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { uploadDataset, publishDataset } from '../api/datasets';
import { getGasEstimate } from '../api/blobs';

type PublishStep =
  | 'idle'
  | 'estimating'
  | 'uploading'
  | 'publishing'
  | 'done'
  | 'error';

type LicenseType = 'commercial' | 'research' | 'open';

interface FormState {
  name: string;
  description: string;
  priceETH: string;
  licenseType: LicenseType;
}

interface UploadResult {
  manifestTxHash: string;
  chunkTxHashes: string[];
  fileHash: string;
  estimatedETH: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const LICENSE_OPTIONS: { value: LicenseType; label: string; desc: string }[] = [
  { value: 'commercial', label: 'Commercial', desc: 'Buyers may use for any commercial purpose' },
  { value: 'research', label: 'Research', desc: 'Non-commercial research and academic use only' },
  { value: 'open', label: 'Open', desc: 'Free to use, modify, and redistribute' },
];

export default function Publish() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    priceETH: '0.01',
    licenseType: 'commercial',
  });

  const [step, setStep] = useState<PublishStep>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [gasEstimate, setGasEstimate] = useState('');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Drag & Drop ───────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  function handleFileSelect(f: File) {
    setFile(f);
    setForm((prev) =>
      prev.name ? prev : { ...prev, name: f.name.replace(/\.[^/.]+$/, '') }
    );
    fetchGasEstimate();
  }

  async function fetchGasEstimate() {
    setStep('estimating');
    try {
      const gas = await getGasEstimate();
      setGasEstimate(gas.estimatedETHPerBlob);
    } catch {
      setGasEstimate('');
    } finally {
      setStep('idle');
    }
  }

  // ── Validation ────────────────────────────────────────────────

  function validate(): string | null {
    if (!file) return 'Select a file to upload.';
    if (!form.name.trim()) return 'Dataset name is required.';
    if (!form.description.trim()) return 'Description is required.';
    const price = parseFloat(form.priceETH);
    if (isNaN(price) || price < 0) return 'Invalid price.';
    if (!isConnected) return 'Connect your wallet first.';
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────

  async function handlePublish() {
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setErrorMsg('');

    try {
      setStep('uploading');
      setUploadProgress(0);

      const result = await uploadDataset(
  file!,
  {
    name: form.name.trim(),
    description: form.description.trim(),
    priceWei: BigInt(Math.round(parseFloat(form.priceETH) * 1e18)).toString(),
    licenseType: form.licenseType,
  },
  (pct) => setUploadProgress(pct)
);
      setUploadResult(result);

      setStep('publishing');

      const priceWei = BigInt(Math.round(parseFloat(form.priceETH) * 1e18)).toString();

      const { datasetId: did } = await publishDataset({
        datasetId: result.datasetId,
        manifestTxHash: result.manifestTxHash,
        priceWei,
        licenseType: form.licenseType,
        name: form.name.trim(),
        description: form.description.trim(),
      });

      setDatasetId(did);
      setStep('done');
    } catch (e: any) {
      setErrorMsg(e.message || 'Publish failed');
      setStep('error');
    }
  }

  function resetForm() {
    setFile(null);
    setForm({ name: '', description: '', priceETH: '0.01', licenseType: 'commercial' });
    setStep('idle');
    setUploadProgress(0);
    setUploadResult(null);
    setDatasetId('');
    setErrorMsg('');
    setGasEstimate('');
  }

  // ── Render: Success ───────────────────────────────────────────

  if (step === 'done' && uploadResult) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="border border-[#00ffcc]/40 rounded-lg p-8 bg-[#00ffcc]/5 text-center">
            <div className="w-14 h-14 rounded-full bg-[#00ffcc]/20 border border-[#00ffcc] flex items-center justify-center mx-auto mb-6">
              <span className="text-[#00ffcc] text-2xl">✓</span>
            </div>
            <h1 className="font-['Syne'] text-3xl font-bold mb-2">Dataset Published</h1>
            <p className="text-zinc-400 text-sm mb-8">
              Your dataset is live on Ethereum blobspace and listed in the marketplace.
            </p>

            <div className="text-left space-y-3 font-['Space_Mono'] text-xs mb-8">
              <ResultRow label="Dataset ID" value={datasetId} />
              <ResultRow label="Manifest TX" value={uploadResult.manifestTxHash} hash />
              <ResultRow label="File Hash" value={uploadResult.fileHash} />
              <ResultRow
                label="Chunks"
                value={`${uploadResult.chunkTxHashes.length} blob${
                  uploadResult.chunkTxHashes.length !== 1 ? 's' : ''
                } on Ethereum`}
              />
              <ResultRow label="Blob Gas Spent" value={`~${uploadResult.estimatedETH} ETH`} />
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate(`/dataset/${datasetId}`)}
                className="bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold px-6 py-3 rounded hover:bg-[#00ffcc]/90 transition-colors"
              >
                View Dataset
              </button>
              <button
                onClick={resetForm}
                className="border border-zinc-600 text-zinc-300 font-['Space_Mono'] text-sm px-6 py-3 rounded hover:border-zinc-400 transition-colors"
              >
                Publish Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Main Form ─────────────────────────────────────────

  const isProcessing = ['estimating', 'uploading', 'publishing'].includes(step);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-['Syne'] text-4xl font-bold mb-2">
            Publish <span className="text-[#00ffcc]">Dataset</span>
          </h1>
          <p className="text-zinc-400 font-['Space_Mono'] text-sm">
            Upload to Ethereum blobspace. Set your license. Earn ETH royalties.
          </p>
        </div>

        {!isConnected && (
          <div className="border border-amber-800 bg-amber-900/20 rounded p-4 text-amber-400 font-['Space_Mono'] text-sm mb-8">
            ⚠ Connect your wallet before publishing.
          </div>
        )}

        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-[#00ffcc] bg-[#00ffcc]/5'
                : file
                ? 'border-[#00ffcc]/40 bg-zinc-900/40'
                : 'border-zinc-700 bg-zinc-900/20 hover:border-zinc-500'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />

            {file ? (
              <div>
                <p className="font-['Syne'] text-xl font-semibold text-[#00ffcc] mb-1">
                  {file.name}
                </p>
                <p className="text-zinc-400 font-['Space_Mono'] text-sm">
                  {formatSize(file.size)} · {file.type || 'unknown type'}
                </p>
                {gasEstimate && (
                  <p className="text-zinc-500 font-['Space_Mono'] text-xs mt-2">
                    Est. blob gas: ~{gasEstimate} ETH/blob
                  </p>
                )}
                {!isProcessing && (
                  <p className="text-zinc-600 font-['Space_Mono'] text-xs mt-3">
                    Click to change file
                  </p>
                )}
              </div>
            ) : (
              <div>
                <div className="w-12 h-12 border border-zinc-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <span className="text-zinc-400 text-xl">↑</span>
                </div>
                <p className="font-['Syne'] text-lg font-semibold mb-1">
                  Drop your dataset here
                </p>
                <p className="text-zinc-500 font-['Space_Mono'] text-sm">
                  CSV, Parquet, ZIP, JSON, or any format · Max 120KB per chunk
                </p>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 gap-5">
            {/* Name */}
            <div>
              <label className="block font-['Space_Mono'] text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                Dataset Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                disabled={isProcessing}
                placeholder="e.g. ImageNet Subset 10k"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#00ffcc] font-['Space_Mono'] disabled:opacity-50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block font-['Space_Mono'] text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                disabled={isProcessing}
                placeholder="Describe your dataset, its contents, intended use, and provenance..."
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#00ffcc] font-['Space_Mono'] disabled:opacity-50 resize-none"
              />
            </div>

            {/* Price + License */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Price */}
              <div>
                <label className="block font-['Space_Mono'] text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                  License Price (ETH)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.priceETH}
                    onChange={(e) => setForm((p) => ({ ...p, priceETH: e.target.value }))}
                    disabled={isProcessing}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00ffcc] font-['Space_Mono'] disabled:opacity-50 pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-['Space_Mono'] text-xs">
                    ETH
                  </span>
                </div>
                <p className="text-zinc-600 font-['Space_Mono'] text-xs mt-1">
                  You receive {((parseFloat(form.priceETH) || 0) * 0.975).toFixed(4)} ETH after 2.5% fee
                </p>
              </div>

              {/* License Type */}
              <div>
                <label className="block font-['Space_Mono'] text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                  License Type
                </label>
                <div className="space-y-2">
                  {LICENSE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        form.licenseType === opt.value
                          ? 'border-[#00ffcc]/50 bg-[#00ffcc]/5'
                          : 'border-zinc-800 hover:border-zinc-600'
                      } ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="licenseType"
                        value={opt.value}
                        checked={form.licenseType === opt.value}
                        onChange={() => setForm((p) => ({ ...p, licenseType: opt.value }))}
                        className="mt-0.5 accent-[#00ffcc]"
                      />
                      <div>
                        <p className="font-['Space_Mono'] text-xs text-white">{opt.label}</p>
                        <p className="font-['Space_Mono'] text-xs text-zinc-500 mt-0.5">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {(errorMsg || step === 'error') && (
            <div className="border border-red-800 bg-red-900/20 rounded p-4 text-red-400 font-['Space_Mono'] text-sm">
              ⚠ {errorMsg}
            </div>
          )}

          {/* Progress: Uploading */}
          {step === 'uploading' && (
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between font-['Space_Mono'] text-xs">
                <span className="text-amber-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Chunking and writing to blobspace...
                </span>
                <span className="text-zinc-400">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-[#00ffcc] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-zinc-600 font-['Space_Mono'] text-xs">
                Each chunk is written as a separate blob transaction on Ethereum
              </p>
            </div>
          )}

          {/* Progress: Publishing */}
          {step === 'publishing' && (
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40">
              <p className="text-amber-400 font-['Space_Mono'] text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Writing manifest blob and registering on-chain...
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handlePublish}
            disabled={isProcessing || !isConnected}
            className="w-full bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold py-4 rounded hover:bg-[#00ffcc]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'uploading'
              ? `Uploading... ${uploadProgress}%`
              : step === 'publishing'
              ? 'Publishing on-chain...'
              : step === 'estimating'
              ? 'Estimating gas...'
              : 'Publish Dataset'}
          </button>

          <p className="text-zinc-600 font-['Space_Mono'] text-xs text-center">
            Publishing writes your dataset to Ethereum blobspace via BlobKit.
            Blob gas fees apply on top of the license price you set.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function ResultRow({
  label,
  value,
  hash = false,
}: {
  label: string;
  value: string;
  hash?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-500 shrink-0">{label}</span>
      {hash ? (
        <a
          href={`https://sepolia.etherscan.io/tx/${value}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#00ffcc] hover:underline truncate text-right"
          title={value}
        >
          {value.slice(0, 12)}...{value.slice(-8)}
        </a>
      ) : (
        <span className="text-zinc-300 text-right break-all">{value}</span>
      )}
    </div>
  );
}