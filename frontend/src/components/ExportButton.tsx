import type { ApiExportResult } from "@/types";

type Props = {
  canExport: boolean;
  onExport: () => void;
  isExporting: boolean;
  result: ApiExportResult | null;
  error: string | null;
};

export function ExportButton({ canExport, onExport, isExporting, result, error }: Props) {
  if (!canExport) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">airtable export</h2>
          <p className="text-xs text-muted mt-1">
            exports every task in this project; re-running updates existing records instead of duplicating them
          </p>
        </div>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {isExporting ? "exporting…" : "export to airtable"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 mt-3" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 text-sm">
          <p data-testid="export-summary">
            exported {result.total} task{result.total === 1 ? "" : "s"} — {result.created} created,{" "}
            {result.updated} updated
            {result.failed.length > 0 && `, ${result.failed.length} failed`}
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.failed.map((f) => (
                <li key={f.taskId} className="text-xs text-red-400">
                  {f.taskId}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
