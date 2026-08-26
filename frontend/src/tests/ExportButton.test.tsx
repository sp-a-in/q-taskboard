import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportButton } from "@/components/ExportButton";
import type { ApiExportResult } from "@/types";

describe("<ExportButton />", () => {
  it("renders nothing when the current user cannot export", () => {
    const { container } = render(
      <ExportButton canExport={false} onExport={vi.fn()} isExporting={false} result={null} error={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("triggers the export when clicked", () => {
    const onExport = vi.fn();
    render(<ExportButton canExport={true} onExport={onExport} isExporting={false} result={null} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "export to airtable" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a busy label while exporting", () => {
    render(<ExportButton canExport={true} onExport={vi.fn()} isExporting={true} result={null} error={null} />);

    const button = screen.getByRole("button", { name: "exporting…" });
    expect(button).toBeDisabled();
  });

  it("displays the export summary on success", () => {
    const result: ApiExportResult = { total: 5, created: 3, updated: 2, failed: [] };
    render(<ExportButton canExport={true} onExport={vi.fn()} isExporting={false} result={result} error={null} />);

    expect(screen.getByTestId("export-summary").textContent).toContain("exported 5 tasks");
    expect(screen.getByTestId("export-summary").textContent).toContain("3 created");
    expect(screen.getByTestId("export-summary").textContent).toContain("2 updated");
  });

  it("lists per-task failures when some records fail permanently", () => {
    const result: ApiExportResult = {
      total: 3,
      created: 2,
      updated: 0,
      failed: [{ taskId: "task-abc", error: "Unknown field name" }],
    };
    render(<ExportButton canExport={true} onExport={vi.fn()} isExporting={false} result={result} error={null} />);

    expect(screen.getByTestId("export-summary").textContent).toContain("1 failed");
    expect(screen.getByText(/task-abc: Unknown field name/)).toBeInTheDocument();
  });

  it("shows an error message when the export request fails", () => {
    render(
      <ExportButton
        canExport={true}
        onExport={vi.fn()}
        isExporting={false}
        result={null}
        error="could not reach the airtable adapter"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("could not reach the airtable adapter");
  });
});
