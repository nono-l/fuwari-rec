import { useEffect } from "react";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  clearFxLinkFromLocation,
  decodeFxPayload,
  readFxLinkFromLocation,
} from "@/lib/audio/fx-link";

/** Opens a shared preset once if the URL has #fx= or ?fx=. */
export function FxLinkBoot() {
  const applyFxSnapshot = useEditorStore((s) => s.applyFxSnapshot);
  useEffect(() => {
    const raw = readFxLinkFromLocation();
    if (!raw) return;
    let cancelled = false;
    void decodeFxPayload(raw)
      .then((list) => {
        if (cancelled || !list[0]) return;
        applyFxSnapshot(list[0]);
        useEditorStore.setState({
          statusMessage: `リンクのプリセット「${list[0].name}」を開きました`,
        });
        clearFxLinkFromLocation();
      })
      .catch(() => {
        useEditorStore.setState({
          statusMessage: "プリセットリンクを開けませんでした",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [applyFxSnapshot]);
  return null;
}
