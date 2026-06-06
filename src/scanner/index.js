import { scanFileTree } from './file-tree.js';
import { detectStack } from './stack-detector.js';
import { analyzeModules } from './module-analyzer.js';
import { detectPatterns } from './pattern-detector.js';

export async function scanProject(cwd) {
  const fileData = scanFileTree(cwd);
  if (!fileData) return null;

  const stack = detectStack(cwd, fileData.configFiles);
  const modules = analyzeModules(fileData.files, fileData.tree, stack.framework);
  const patterns = detectPatterns(fileData.files, cwd, stack);

  return { fileData, stack, modules, patterns };
}

export async function scanChangedFiles(cwd, changedFiles) {
  const fileData = scanFileTree(cwd);
  if (!fileData) return null;

  const stack = detectStack(cwd, fileData.configFiles);
  const allModules = analyzeModules(fileData.files, fileData.tree, stack.framework);

  const affectedModules = allModules.filter((m) =>
    changedFiles.some((f) => f.startsWith(m.path + '/') || f === m.path)
  );

  return { stack, affectedModules, allModules };
}
