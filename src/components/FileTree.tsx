'use client';

import React, { useState, useMemo } from 'react';
import { FileTreeNode } from '@/types/domain';
import {
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  File,
  ChevronDown,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPaths: Set<string>;
  onSelectionChange: (paths: Set<string>) => void;
}

function getAllFilePaths(node: FileTreeNode): string[] {
  if (node.type === 'file') return [node.path];
  return (node.children || []).flatMap(getAllFilePaths);
}

function filterNodes(nodes: FileTreeNode[], search: string): FileTreeNode[] {
  if (!search.trim()) return nodes;
  const lowerSearch = search.toLowerCase();

  return nodes
    .map(node => {
      if (node.type === 'file') {
        return node.name.toLowerCase().includes(lowerSearch) ? node : null;
      }
      const filteredChildren = filterNodes(node.children || [], search);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lowerSearch)) {
        return { ...node, children: filteredChildren };
      }
      return null;
    })
    .filter((n): n is FileTreeNode => n !== null);
}

export default function FileTree({ nodes, selectedPaths, onSelectionChange }: FileTreeProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Top level folders expanded by default
    const set = new Set<string>();
    nodes.forEach(n => {
      if (n.type === 'directory') set.add(n.path);
    });
    return set;
  });

  const filteredTree = useMemo(() => filterNodes(nodes, searchTerm), [nodes, searchTerm]);

  const allFilePaths = useMemo(() => {
    return nodes.flatMap(getAllFilePaths);
  }, [nodes]);

  const handleSelectAll = () => {
    onSelectionChange(new Set(allFilePaths));
  };

  const handleClearSelection = () => {
    onSelectionChange(new Set());
  };

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleNodeToggle = (node: FileTreeNode) => {
    const pathsInNode = getAllFilePaths(node);
    const allSelected = pathsInNode.every(p => selectedPaths.has(p));

    const next = new Set(selectedPaths);
    if (allSelected) {
      pathsInNode.forEach(p => next.delete(p));
    } else {
      pathsInNode.forEach(p => next.add(p));
    }
    onSelectionChange(next);
  };

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isDir = node.type === 'directory';
    const isExpanded = expandedPaths.has(node.path) || Boolean(searchTerm);

    if (isDir) {
      const childPaths = getAllFilePaths(node);
      const selectedChildCount = childPaths.filter(p => selectedPaths.has(p)).length;
      const isAllSelected = childPaths.length > 0 && selectedChildCount === childPaths.length;
      const isSomeSelected = selectedChildCount > 0 && !isAllSelected;

      return (
        <div key={node.path} className="select-none">
          <div
            className={`flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors group cursor-pointer text-xs`}
            style={{ paddingLeft: `${depth * 18 + 8}px` }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleExpand(node.path)}>
              <button className="text-slate-400 hover:text-white p-0.5">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="font-semibold text-slate-200 truncate">{node.name}</span>
            </div>

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] font-mono text-slate-500">
                {selectedChildCount}/{childPaths.length}
              </span>
              <button
                onClick={() => handleNodeToggle(node)}
                className="text-slate-400 hover:text-indigo-400 transition-colors p-0.5"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                ) : isSomeSelected ? (
                  <MinusSquare className="w-4 h-4 text-indigo-400/70" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>
          </div>

          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isSelected = selectedPaths.has(node.path);

    return (
      <div
        key={node.path}
        onClick={() => handleNodeToggle(node)}
        className={`flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer text-xs ${
          isSelected ? 'bg-indigo-950/40 text-indigo-200' : 'text-slate-300'
        }`}
        style={{ paddingLeft: `${depth * 18 + 24}px` }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileCode2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="truncate">{node.name}</span>
          {node.language && (
            <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700">
              {node.language}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {node.lineCount !== undefined && (
            <span className="text-[10px] font-mono text-slate-500">{node.lineCount} lines</span>
          )}
          <button className="text-slate-400 hover:text-indigo-400 transition-colors p-0.5">
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-indigo-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-xl">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search files to optimize..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
          <span className="font-mono text-indigo-300 font-medium">
            {selectedPaths.size} of {allFilePaths.length} selected
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors text-xs"
            >
              Select All
            </button>
            <button
              onClick={handleClearSelection}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Tree list */}
      <div className="max-h-[380px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 pr-1">
        {filteredTree.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">No matching files found.</div>
        ) : (
          filteredTree.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
