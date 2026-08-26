import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentList } from "@/components/CommentList";
import type { ApiComment } from "@/types";

const comments: ApiComment[] = [
  {
    id: "c_1",
    task_id: "t_1",
    body: "first comment",
    created_at: new Date("2026-01-01T10:00:00Z").toISOString(),
    author: { id: "u_1", name: "Meera Iyer", email: "meera@taskboard.dev" },
  },
  {
    id: "c_2",
    task_id: "t_1",
    body: "second comment",
    created_at: new Date("2026-01-01T11:00:00Z").toISOString(),
    author: { id: "u_2", name: "Arjun Rao", email: "arjun@taskboard.dev" },
  },
];

describe("<CommentList />", () => {
  it("renders comment authors and bodies", () => {
    render(<CommentList comments={comments} canPost={true} onSubmit={vi.fn()} />);
    expect(screen.getByText("first comment")).toBeInTheDocument();
    expect(screen.getByText("second comment")).toBeInTheDocument();
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("Arjun Rao")).toBeInTheDocument();
  });

  it("shows a message when there are no comments", () => {
    render(<CommentList comments={[]} canPost={true} onSubmit={vi.fn()} />);
    expect(screen.getByText("no comments yet")).toBeInTheDocument();
  });

  it("invokes onSubmit with the entered body when posting", () => {
    const onSubmit = vi.fn();
    render(<CommentList comments={comments} canPost={true} onSubmit={onSubmit} />);

    const textarea = screen.getByPlaceholderText("add a comment");
    fireEvent.change(textarea, { target: { value: "a new comment" } });
    fireEvent.click(screen.getByRole("button", { name: "post" }));

    expect(onSubmit).toHaveBeenCalledWith("a new comment");
  });

  it("does not render the posting control when canPost is false", () => {
    render(<CommentList comments={comments} canPost={false} onSubmit={vi.fn()} />);
    expect(screen.queryByPlaceholderText("add a comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "post" })).not.toBeInTheDocument();
  });
});
