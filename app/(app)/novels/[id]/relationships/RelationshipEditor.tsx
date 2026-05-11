"use client";

import { useState } from "react";

import type { BibleDraft } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "../_components/useBibleEdit";
import { SaveBar } from "../_components/SaveBar";
import { RelationshipGraph } from "./RelationshipGraph";
import { CharacterRelationsCards } from "./CharacterRelationsCards";

interface RelationshipEditorProps {
  novelId: string;
  initialBible: BibleDraft;
}

export function RelationshipEditor({ novelId, initialBible }: RelationshipEditorProps) {
  const { bible, setBible, dirty, status, error, save } = useBibleEdit(novelId, initialBible);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const characters = bible.characters;

  function updateRelations(index: number, relations: string[]) {
    setBible({
      ...bible,
      characters: characters.map((c, i) => (i === index ? { ...c, relations } : c)),
    });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-32">
        <PageHeader
          title="角色关系图"
          description={`${characters.length} 位角色 · relations 直接编辑，保存后下次 AI 起草使用新设定`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: bible.meta.suggested_title, href: `/novels/${novelId}` },
            { label: "角色关系图" },
          ]}
        />

        <div className="mt-12 space-y-12">
          <RelationshipGraph
            characters={characters}
            hoveredName={hoveredName}
            onHover={setHoveredName}
          />

          <CharacterRelationsCards
            characters={characters}
            hoveredName={hoveredName}
            onHover={setHoveredName}
            onUpdateRelations={updateRelations}
          />

          <section className="card bg-white">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-4">
              说明 / NOTES
            </h2>
            <ul className="space-y-2 text-sm text-text-muted leading-relaxed list-disc pl-5">
              <li>
                每个角色卡片可直接编辑 <code className="bg-secondary/60 px-1.5 py-0.5 rounded text-[12px]">relations</code> 字段。当一条 relation 文案中出现其他角色的名字，就会在图中画一条有向边。
              </li>
              <li>
                编辑时实时显示匹配反馈：<span className="text-emerald-600">绿色提示</span>表示该 relation 将被识别成一条边；<span className="text-amber-600">黄色提示</span>表示未匹配任何角色名，仅作文字保留。
              </li>
              <li>
                「被提及」区列出其他角色提到了当前角色的 relations，是只读视图——要修改请去对应角色卡片编辑。
              </li>
              <li>
                改动保存后，下一次 AI 起草 / 审校 / state-diff 都会使用最新的角色设定。
              </li>
            </ul>
          </section>
        </div>
      </div>

      <SaveBar dirty={dirty} status={status} error={error} onSave={save} />
    </div>
  );
}
