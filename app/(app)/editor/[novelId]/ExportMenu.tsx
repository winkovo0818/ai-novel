interface ExportMenuProps {
  novelId: string;
}

export function ExportMenu({ novelId }: ExportMenuProps) {
  return (
    <a
      href={`/novels/${novelId}/export`}
      className="p-2 rounded-lg transition-all text-text-muted hover:bg-secondary hover:text-text-primary"
      title="打开导出中心"
      aria-label="打开导出中心"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </a>
  );
}
