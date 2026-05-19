import { useEffect, useState, useCallback } from "react";
import { handleApiError } from "@/lib/http/handleApiError";

interface ModelBase {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  is_default: boolean;
  is_enabled: boolean;
}

export function useModelAdmin<T extends ModelBase>(
  apiBase: string,
  emptyForm: T,
  confirm: (opts: { title: string; message: string; confirmLabel: string; danger: boolean }) => Promise<boolean>,
) {
  const [models, setModels] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<T>(emptyForm);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (res.status === 401) {
        handleApiError(res);
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "加载失败");
      } else {
        setModels(json.data);
      }
    } catch {
      setError("无法连接到配置服务器");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch(editingId ? `${apiBase}/${editingId}` : apiBase, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message ?? "保存失败");
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchModels();
  }

  function handleStartEdit(model: T) {
    setError("");
    setEditingId(model.id);
    setForm({
      ...emptyForm,
      name: model.name,
      provider: model.provider,
      base_url: model.base_url,
      api_key: "",
      model: model.model,
      is_default: model.is_default,
    });
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleToggleEnabled(model: T) {
    await fetch(`${apiBase}/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !model.is_enabled }),
    });
    fetchModels();
  }

  async function handleDelete(id: string, label: string) {
    const ok = await confirm({
      title: `删除节点「${label}」？`,
      message: "删除后该节点立即下线，正在使用此模型的任务可能失败。此操作不可撤销。",
      confirmLabel: "删除节点",
      danger: true,
    });
    if (!ok) return;
    await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    fetchModels();
  }

  return {
    models, loading, error, forbidden,
    showForm, setShowForm,
    editingId,
    form, setForm,
    fetchModels, handleSubmit, handleStartEdit, handleCancelForm, handleToggleEnabled, handleDelete,
  };
}
