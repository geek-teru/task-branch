import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AddIcon, DeleteIcon, EditIcon } from "./components/Icons";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Dialog } from "./components/ui/Dialog";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "./components/ui/DropdownMenu";
import { Input } from "./components/ui/Input";
import { Select } from "./components/ui/Select";
import { Textarea } from "./components/ui/Textarea";

function Preview() {
  const [confirm, setConfirm] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [log, setLog] = useState("");
  return (
    <div className="flex flex-col gap-6 p-6" style={{ maxWidth: 760 }}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<AddIcon />}>追加</Button>
        <Button icon={<EditIcon />}>変更</Button>
        <Button variant="ghost">ghost</Button>
        <Button variant="danger" icon={<DeleteIcon />}>削除</Button>
        <Button variant="primary" disabled>disabled</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary">sm primary</Button>
        <Button size="sm">sm default</Button>
        <Button size="sm" variant="ghost">sm ghost</Button>
        <Button size="sm" variant="danger">sm danger</Button>
      </div>
      <div className="flex items-center gap-2">
        <Input className="w-64" placeholder="検索" icon={<span>🔍</span>} />
        <Input className="flex-1" placeholder="タイトル" />
        <Select className="w-40" defaultValue="todo">
          <option value="todo">todo</option>
          <option value="in_progress">in_progress</option>
        </Select>
      </div>
      <Textarea rows={3} placeholder="説明" />
      <div className="flex items-center gap-2">
        <Badge>NANO</Badge>
        <Badge tone="brand">brand</Badge>
        <Badge tone="todo">todo</Badge>
        <Badge tone="in_progress">in_progress</Badge>
        <Badge tone="done">done</Badge>
        <Badge tone="closed">closed</Badge>
      </div>
      <div className="flex gap-3">
        <Card className="flex-1 p-4 text-sm">通常のカード</Card>
        <Card interactive className="flex-1 p-4 text-sm">interactive のカード</Card>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu trigger="プロジェクト ▾">
          <DropdownMenuItem onSelect={() => setLog("A")}>プロジェクト A</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLog("B")}>プロジェクト B</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger icon={<DeleteIcon />} onSelect={() => setLog("delete")}>削除</DropdownMenuItem>
        </DropdownMenu>
        <DropdownMenu trigger="⋮" variant="ghost" size="sm" label="メニュー" align="end">
          <DropdownMenuItem onSelect={() => setLog("edit")}>変更</DropdownMenuItem>
        </DropdownMenu>
        <Button onClick={() => setDialog(true)}>Dialog</Button>
        <Button onClick={() => setConfirm(true)}>ConfirmDialog</Button>
        <span id="log" className="text-sm text-fg-muted">{log}</span>
      </div>
      {dialog && (
        <Dialog
          title="ストーリーの追加"
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>キャンセル</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>追加する</Button>
            </>
          }
        >
          <Input placeholder="ストーリー名" />
        </Dialog>
      )}
      {confirm && (
        <ConfirmDialog
          message={"このコメントを削除しますか？\n2行目"}
          confirmLabel="削除する"
          onConfirm={() => {
            setLog("confirmed");
            setConfirm(false);
          }}
          onCancel={() => {
            setLog("cancelled");
            setConfirm(false);
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
