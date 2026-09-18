import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadMyScenes, saveMyScenes } from "@/lib/audio/scenes-server";
import { useEditorStore } from "@/lib/store/editor-store";

export function SceneCloudBoot() {
  const { user, isPending } = useCurrentUserState();
  const list = useEditorStore((s) => s.sceneList);
  const bank = useEditorStore((s) => s.sceneBank);
  const apply = useEditorStore((s) => s.applySceneBundle);
  const setCloud = useEditorStore((s) => s.setSceneCloud);
  const ready = useRef(false);
  const skip = useRef(true);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (isPending) return;
    ready.current = false;
    skip.current = true;
    if (!uid) {
      setCloud("local");
      return;
    }
    let stop = false;
    setCloud("loading");
    void loadMyScenes()
      .then((remote) => {
        if (stop) return;
        if (remote?.list?.length) {
          apply(remote);
        } else {
          const s = useEditorStore.getState();
          return saveMyScenes({ data: { list: s.sceneList, bank: s.sceneBank } });
        }
      })
      .then(() => {
        if (stop) return;
        setCloud("ok");
        ready.current = true;
        window.setTimeout(() => {
          skip.current = false;
        }, 400);
      })
      .catch(() => {
        if (!stop) setCloud("error");
      });
    return () => {
      stop = true;
    };
  }, [uid, isPending, apply, setCloud]);

  useEffect(() => {
    if (!uid || !ready.current || skip.current) return;
    const t = window.setTimeout(() => {
      void saveMyScenes({ data: { list, bank } })
        .then(() => setCloud("ok"))
        .catch(() => setCloud("error"));
    }, 700);
    return () => window.clearTimeout(t);
  }, [uid, list, bank, setCloud]);

  return null;
}
