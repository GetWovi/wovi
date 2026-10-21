"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Field";
import { Modal, Sheet } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";
import styles from "./design.module.css";

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);
  function run() {
    setLoading(true);
    setTimeout(() => setLoading(false), 2800);
  }
  return (
    <div className={styles.row}>
      <Button loading={loading} onClick={run} leading={<Icon name="play" />}>
        {loading ? "Writing hooks" : "Run Hook Writer"}
      </Button>
      <Button variant="secondary" loading={loading} onClick={run}>
        {loading ? "Scouting" : "Run Trend Scout"}
      </Button>
      <Button variant="ghost" loading={loading} onClick={run}>
        {loading ? "Working" : "Run in ghost"}
      </Button>
      <Button loading>Always loading</Button>
    </div>
  );
}

const PLATFORMS = ["Short video", "Carousel", "Thread", "Long form", "Stories", "Newsletter"];

export function ChipDemo() {
  const [selected, setSelected] = useState<string[]>(["Short video", "Carousel"]);
  const [removable, setRemovable] = useState(["Hooks", "Captions", "Repurposing"]);
  function toggle(p: string) {
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        {PLATFORMS.map((p) => (
          <Chip key={p} selected={selected.includes(p)} onClick={() => toggle(p)}>
            {p}
          </Chip>
        ))}
      </div>
      <div className={styles.row}>
        {removable.map((r) => (
          <Chip key={r} onRemove={() => setRemovable((list) => list.filter((x) => x !== r))}>
            {r}
          </Chip>
        ))}
        {removable.length < 3 && (
          <Button size="sm" variant="ghost" onClick={() => setRemovable(["Hooks", "Captions", "Repurposing"])}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

export function ToggleDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className={styles.stackLg}>
      <Toggle checked={a} onChange={setA} label="Match my voice" description="Agents read your saved voice notes before they write." />
      <Toggle checked={b} onChange={setB} label="Auto-run on new uploads" />
      <Toggle checked={true} onChange={() => {}} label="Locked on" disabled />
      <Toggle checked={false} onChange={() => {}} label="Small, off" size="sm" />
    </div>
  );
}

export function TabsDemo() {
  return (
    <div className={styles.stackLg}>
      <Tabs
        items={[
          { id: "hooks", label: "Hooks", count: 12, content: <p className="muted">Twelve hook options, ranked by how fast they get to the point.</p> },
          { id: "captions", label: "Captions", count: 4, content: <p className="muted">Four captions in your voice, one per platform.</p> },
          { id: "tags", label: "Hashtags", content: <p className="muted">A small set of tags that fit the post.</p> },
        ]}
      />
      <Tabs
        variant="line"
        items={[
          { id: "all", label: "All agents" },
          { id: "mine", label: "My agents" },
          { id: "saved", label: "Saved" },
        ]}
      />
    </div>
  );
}

export function OverlayDemo() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetRight, setSheetRight] = useState(false);
  return (
    <div className={styles.row}>
      <Button variant="secondary" onClick={() => setModal(true)}>
        Open modal
      </Button>
      <Button variant="ghost" onClick={() => setSheet(true)}>
        Open sheet
      </Button>
      <Button variant="ghost" onClick={() => setSheetRight(true)}>
        Open side sheet
      </Button>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Run Hook Writer?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModal(false)}>Run for 2 credits</Button>
          </>
        }
      >
        <p>Hook Writer will read your brief and return ten opening lines. You can run it again on the same brief for free within an hour.</p>
      </Modal>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Brief">
        <div className={styles.stack}>
          <Input label="Topic" placeholder="What is the post about?" defaultValue="Why my bakery stopped doing custom cakes" />
          <Input label="Format" defaultValue="Short video" />
          <Button block onClick={() => setSheet(false)}>
            Save brief
          </Button>
        </div>
      </Sheet>
      <Sheet open={sheetRight} onClose={() => setSheetRight(false)} title="Agent details" side="right">
        <div className={styles.stack}>
          <p>Caption Writer takes a clip description and a format and returns one caption in your voice, with a short and a long version.</p>
          <p>It never adds hashtags. Pair it with Hashtag Picker for that.</p>
        </div>
      </Sheet>
    </div>
  );
}

export function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className={styles.row}>
      <Button onClick={() => toast({ tone: "success", title: "Hook Writer finished", description: "10 hooks ready. 3 credits earned back from a review." })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ tone: "info", title: "Brief saved", description: "Agents will use it on the next run." })}>
        Info toast
      </Button>
      <Button variant="ghost" onClick={() => toast({ tone: "warning", title: "Low credits", description: "2 credits left. Top up before the next run." })}>
        Warning toast
      </Button>
    </div>
  );
}
