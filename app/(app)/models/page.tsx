"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState, EmptyState } from "@/components/ui/StatusStates";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ModelsTabs } from "./_components/ModelsTabs";

interface LlmModel {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  is_default: boolean;
  is_enabled: boolean;
}

const emptyForm = { name: "", provider: "deepseek", base_url: "https://api.deepseek.com/v1", api_key: "", model: "deepseek-chat", is_default: true };

export default function ModelsPage() {
  const confirm = useConfirm();
  const [models, setModels] = useState<LlmModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchModels();
  }, []);

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch("/api/llm-models");
      if (res.status === 401) {
        window.location.href = "/login";
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch(editingId ? `/api/llm-models/${editingId}` : "/api/llm-models", {
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

  function handleStartEdit(model: LlmModel) {
    setError("");
    setEditingId(model.id);
    setForm({
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

  async function handleToggleEnabled(model: LlmModel) {
    await fetch(`/api/llm-models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !model.is_enabled }),
    });
    fetchModels();
  }

  async function handleDelete(id: string) {
    const model = models.find((m) => m.id === id);
    const ok = await confirm({
      title: model ? `删除模型节点「${model.name}」？` : "删除此模型配置？",
      message: "删除后该节点立即下线，正在使用此模型的任务可能失败。此操作不可撤销。",
      confirmLabel: "删除节点",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/llm-models/${id}`, { method: "DELETE" });
    fetchModels();
  }

  if (forbidden) {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
        <div className="p-8 md:p-12 lg:p-16 max-w-3xl mx-auto min-h-full pb-24">
          <PageHeader
            title="模型基础设施"
            description="该模块仅对管理员开放。"
          />
          <div className="card bg-white mt-8 border-red-100 p-8 shadow-premium text-center">
             <div className="h-16 w-16 bg-red-100 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6">
                <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
             </div>
             <h3 className="text-xl font-bold text-text-primary mb-2">访问权限不足</h3>
             <p className="text-text-secondary max-w-sm mx-auto">
              当前账号没有访问 LLM 模型配置的权限。请联系系统管理员进行授权。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader 
          title="模型基础设施" 
          description="管理您的 AI 创作节点。支持 DeepSeek、OpenAI 及各类兼容 API 的模型接入，为您的文学创作提供动力。"
          actions={
            <button
              onClick={() => (showForm ? handleCancelForm() : setShowForm(true))}
              className={showForm ? "btn-secondary rounded-xl" : "btn-primary shadow-premium rounded-xl px-6"}
            >
              <div className="flex items-center gap-2">
                {showForm ? (
                  <>取消操作</>
                ) : (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    部署模型节点
                  </>
                )}
              </div>
            </button>
          }
        />

        <ModelsTabs />

        {showForm && (
          <div className="mt-12 animate-fade-in">
            <form onSubmit={handleSubmit} className="card bg-white border-primary/20 shadow-premium p-8 rounded-3xl">
              <div className="flex items-center gap-4 mb-10 border-b border-border-subtle pb-6">
                 <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                 </div>
                 <div className="flex flex-col">
                    <h3 className="text-xl font-bold text-text-primary">
                      {editingId ? "编辑节点配置" : "初始化新节点协议"}
                    </h3>
                    <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Node Configuration</span>
                 </div>
              </div>
              
              <div className="grid gap-8 md:grid-cols-2">
                <div className="grid gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">节点名称 / LABEL</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-base" placeholder="例如：DEEPSEEK_PRO_NODE" />
                </div>
                <div className="grid gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">模型 ID / IDENTIFIER</label>
                  <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-base" placeholder="deepseek-chat" />
                </div>
                <div className="grid gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">供应商 / PROVIDER</label>
                  <input required value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="input-base" placeholder="deepseek" />
                </div>
                <div className="grid gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">API 终端 / ENDPOINT</label>
                  <input required value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} className="input-base" placeholder="https://api.deepseek.com/v1" />
                </div>
                <div className="md:col-span-2 grid gap-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">访问令牌 / ACCESS_TOKEN</label>
                  <input required type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} className="input-base" placeholder="sk-••••••••••••••••••••••••" />
                </div>
                <div className="md:col-span-2 flex items-center gap-4 p-5 bg-secondary/50 rounded-2xl border border-border-subtle shadow-inner">
                  <input type="checkbox" id="is_default" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="h-5 w-5 border-border-strong rounded-lg text-primary focus:ring-primary/20" />
                  <div className="flex flex-col">
                    <label htmlFor="is_default" className="text-sm font-bold text-text-primary">设为系统全局默认节点</label>
                    <p className="text-[11px] text-text-muted mt-0.5">勾选后，所有新章节的 AI 任务将优先路由至此节点执行。</p>
                  </div>
                </div>
              </div>
              
              {error && (
                <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-slide-in">
                   <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                   <p className="text-[11px] font-bold text-red-700 uppercase tracking-widest">配置协议异常: {error}</p>
                </div>
              )}
              
              <div className="mt-10 pt-8 border-t border-border-subtle flex gap-4">
                <button type="submit" className="btn-primary px-10 py-3 rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition">
                  {editingId ? "应用配置更改" : "确认部署新节点"}
                </button>
                <button type="button" onClick={handleCancelForm} className="btn-secondary px-8 py-3 rounded-2xl">取消</button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-12">
          {loading ? (
            <div className="py-20">
              <LoadingState message="正在连接基础设施网络…" />
            </div>
          ) : models.length === 0 ? (
            <EmptyState 
              title="尚未部署 AI 节点" 
              description="为了开启智能协同创作，您需要至少配置一个兼容 OpenAI 或 DeepSeek 协议的模型节点。"
              icon={
                <div className="h-24 w-24 bg-white rounded-3xl flex items-center justify-center shadow-premium border border-border-subtle relative overflow-hidden group">
                  <div className="absolute inset-0 bg-primary/5 group-hover:scale-150 transition-transform duration-300" />
                  <svg aria-hidden="true" className="w-10 h-10 text-primary relative z-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              }
              action={
                <button onClick={() => setShowForm(true)} className="btn-primary h-12 px-12 text-sm shadow-xl shadow-text-primary/10 rounded-2xl">
                  立即部署首个节点
                </button>
              }
            />
          ) : (
            <div className="grid gap-6 animate-fade-in-up">
              {models.map((model) => (
                <div key={model.id} className="card bg-white p-8 rounded-3xl border border-border-subtle hover:border-primary/30 shadow-sm hover:shadow-premium transition duration-300 group flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`h-2.5 w-2.5 rounded-full ${model.is_enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-text-dim'} transition`} />
                      <h3 className="text-xl font-bold text-text-primary truncate group-hover:text-primary transition-colors">{model.name}</h3>
                      {model.is_default && (
                        <span className="px-2.5 py-1 bg-primary text-white text-[9px] font-bold rounded-lg shadow-sm uppercase tracking-widest ring-4 ring-primary/10">Default</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-y-3 gap-x-8 text-[11px] font-bold text-text-dim uppercase tracking-wider">
                      <span className="flex items-center gap-2.5 bg-secondary/50 px-3 py-1.5 rounded-xl border border-border-subtle shadow-inner">
                        <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        {model.provider} · {model.model}
                      </span>
                      <span className="flex items-center gap-2.5 truncate max-w-[320px] opacity-70">
                        <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {model.base_url}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-t md:border-t-0 pt-6 md:pt-0 border-border-subtle">
                    <button onClick={() => handleStartEdit(model)} className="btn-secondary !px-5 !py-2.5 text-[11px] rounded-xl hover:bg-white shadow-sm font-bold">
                      修改协议
                    </button>
                    <button
                      onClick={() => handleToggleEnabled(model)}
                      className={`px-5 py-2.5 text-[11px] font-bold rounded-xl border transition duration-300 shadow-sm ${
                        model.is_enabled 
                          ? "bg-white border-border-strong text-text-dim hover:bg-secondary hover:text-text-primary" 
                          : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {model.is_enabled ? "设为离线" : "恢复在线"}
                    </button>
                    <button onClick={() => handleDelete(model.id)} className="p-2.5 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-xl transition group/del">
                      <svg aria-hidden="true" className="w-5 h-5 group-hover/del:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
