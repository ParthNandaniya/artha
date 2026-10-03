"use client";

import { useState, useCallback } from "react";

interface SlideOverState {
  type: "document" | "task" | null;
  id: string | null;
}

export function useSlideOver() {
  const [state, setState] = useState<SlideOverState>({ type: null, id: null });

  const openDocument = useCallback((id: string) => {
    setState({ type: "document", id });
  }, []);

  const openTask = useCallback((id: string) => {
    setState({ type: "task", id });
  }, []);

  const close = useCallback(() => {
    setState({ type: null, id: null });
  }, []);

  return {
    isOpen: state.type !== null,
    type: state.type,
    id: state.id,
    openDocument,
    openTask,
    close,
  };
}
