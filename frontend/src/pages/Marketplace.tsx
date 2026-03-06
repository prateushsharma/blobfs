import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDatasets, DatasetMeta } from '../api/datasets';

const LICENSE_COLORS: Record<string, string> = {
  commercial: 'text-cyan-400 border-cyan-400',
  research: 'text-amber-400 border-amber-400',
  open: 'text-green-400 border-green-400',
};

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatPrice(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return eth === 0 ? 'Free' : `${eth.toFixed(4)} ETH`;
}

export default function Marketplace() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [filtered, setFiltered] = useState<DatasetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');

  useEffect(() => {
    listDatasets()
      .then((data) => {
        setDatasets(data);
        setFiltered(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = [...datasets];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.contentType.toLowerCase().includes(q)
      );
    }

    if (licenseFilter !== 'all') {
      result = result.filter((d) => d.licenseType === licenseFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'price-asc') return Number(BigInt(a.priceWei) - BigInt(b.priceWei));
      return Number(BigInt(b.priceWei) - BigInt(a.priceWei));
    });

    setFiltered(result);
  }, [search, licenseFilter, sortBy, datasets]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-['Syne'] text-4xl font-bold mb-2">
            Dataset <span className="text-[#00ffcc]">Marketplace</span>
          </h1>
          <p className="text-zinc-400 font-['Space_Mono'] text-sm">
            {datasets.length} datasets published to Ethereum blobspace
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <input
            type="text"
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#00ffcc] flex-1 min-w-[200px] font-['Space_Mono']"
          />

          <select
            value={licenseFilter}
            onChange={(e) => setLicenseFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-sm text-white focus:outline-none focus:border-[#00ffcc] font-['Space_Mono']"
          >
            <option value="all">All Licenses</option>
            <option value="commercial">Commercial</option>
            <option value="research">Research</option>
            <option value="open">Open</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-700 rounded px-4 py-2 text-sm text-white focus:outline-none focus:border-[#00ffcc] font-['Space_Mono']"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
          </select>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center gap-3 text-zinc-400 font-['Space_Mono'] text-sm py-20 justify-center">
            <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
            Fetching datasets from blobspace...
          </div>
        )}

        {error && (
          <div className="border border-red-800 bg-red-900/20 rounded p-4 text-red-400 font-['Space_Mono'] text-sm mb-6">
            ⚠ {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 text-zinc-500 font-['Space_Mono'] text-sm">
            No datasets match your filters.
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((d) => (
            <Link
              key={d.id}
              to={`/dataset/${d.id}`}
              className="group block border border-zinc-800 rounded-lg p-6 bg-zinc-900/40 hover:border-[#00ffcc]/50 hover:bg-zinc-900/70 transition-all duration-200"
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`text-xs border rounded px-2 py-0.5 font-['Space_Mono'] uppercase tracking-wider ${
                    LICENSE_COLORS[d.licenseType] || 'text-zinc-400 border-zinc-600'
                  }`}
                >
                  {d.licenseType}
                </span>
                <span className="text-xs text-zinc-500 font-['Space_Mono']">
                  {formatSize(d.fileSize)}
                </span>
              </div>

              {/* Name */}
              <h3 className="font-['Syne'] text-lg font-semibold mb-2 group-hover:text-[#00ffcc] transition-colors line-clamp-2">
                {d.name}
              </h3>

              {/* Description */}
              <p className="text-zinc-400 text-sm mb-4 line-clamp-2 leading-relaxed">
                {d.description}
              </p>

              {/* Meta row */}
              <div className="flex items-center justify-between">
                <span className="font-['Space_Mono'] text-sm text-[#00ffcc] font-semibold">
                  {formatPrice(d.priceWei)}
                </span>
                <span className="text-xs text-zinc-600 font-['Space_Mono']">
                  {d.chunkCount} blob{d.chunkCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tx hash preview */}
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <p className="text-xs text-zinc-600 font-['Space_Mono'] truncate">
                  {d.manifestTxHash.slice(0, 20)}...{d.manifestTxHash.slice(-8)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}