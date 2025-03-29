// src/dependency.ts
import * as fsp from 'fs/promises';
import * as path from 'path';
import {parse} from '@babel/parser';
import _traverse from '@babel/traverse';
import {createMatchPath, type MatchPath} from 'tsconfig-paths';
import type {Options, DependencyGraph} from './types';
import {resolveTsConfig, resolveFileWithExtensions} from './utils';

// 处理 @babel/traverse 的默认导出问题
const traverse = (_traverse as any).default ?? _traverse;

/**
 * 获取单个文件的直接依赖项
 * @param absoluteFilePath 文件的绝对路径
 * @param options 配置选项
 * @param tsMatchPath (可选) tsconfig-paths 的匹配函数
 * @returns 依赖项的绝对路径数组
 * @throws 如果文件读取或解析失败
 */
async function getDirectDependencies(
    absoluteFilePath: string,
    options: Omit<Required<Options>, 'tsConfig'> & { tsConfig?: string }, // 修改 options 类型
    tsMatchPath?: MatchPath
): Promise<string[]> {
    const {fileExtensions, detectiveOptions, baseDir, excludeRegExp} = options;

    const ext = path.extname(absoluteFilePath).slice(1);
    // 提前检查扩展名，避免无效读取
    if (!fileExtensions.includes(ext)) {
        return [];
    }

    let content: string;
    try {
        content = await fsp.readFile(absoluteFilePath, 'utf8');
    } catch (error: any) {
        // 抛出包含文件名的错误
        throw new Error(`Failed to read file "${path.relative(baseDir, absoluteFilePath)}": ${error.message}`);
    }

    let ast: ReturnType<typeof parse>;
    try {
        ast = parse(content, {
            sourceType: 'module', // 假设所有文件都是模块
            plugins: [
                // 根据文件扩展名动态添加插件
                'jsx',
                ext === 'ts' || ext === 'tsx' ? 'typescript' : null,
                'decorators-legacy'
            ].filter(Boolean) as any[] // 过滤掉 null
            // 可以添加其他需要的 Babel 插件，例如 'decorators-legacy', 'classProperties' 等
        });
    } catch (error: any) {
        // 抛出包含文件名的解析错误
        throw new Error(`Failed to parse file "${path.relative(baseDir, absoluteFilePath)}": ${error.message}`);
    }

    const dependencies = new Set<string>();
    const currentDir = path.dirname(absoluteFilePath); // 当前文件所在目录

    try {
        traverse(ast, {
            // ES Module Imports: import ... from '...'
            ImportDeclaration({node}: any) {
                if (node.source && node.source.value) {
                    // 跳过 type imports (如果配置了)
                    if (detectiveOptions.ts?.skipTypeImports && node.importKind === 'type') return;
                    handleSource(node.source.value, dependencies);
                }
            },
            // ES Module Exports: export ... from '...'
            ExportNamedDeclaration({node}: any) {
                if (node.source && node.source.value) {
                    handleSource(node.source.value, dependencies);
                }
            },
            // ES Module Exports: export * from '...'
            ExportAllDeclaration({node}: any) {
                if (node.source && node.source.value) {
                    handleSource(node.source.value, dependencies);
                }
            },
            // CommonJS Requires & Dynamic Imports
            CallExpression({node}: any) {
                // require('...')
                if (
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === 'StringLiteral'
                ) {
                    handleSource(node.arguments[0].value, dependencies);
                }
                // import('...')
                else if (
                    node.callee.type === 'Import' && // Babel AST for dynamic import
                    node.arguments.length > 0 &&
                    node.arguments[0].type === 'StringLiteral'
                ) {
                    handleSource(node.arguments[0].value, dependencies);
                }
                // Potential require.resolve('...') - 通常不计入图谱，因为它不直接执行依赖
            }
        });
    } catch (traverseError: any) {
        // 捕获遍历过程中的错误
        console.warn(
            `Warning: Error traversing AST for "${path.relative(baseDir, absoluteFilePath)}": ${traverseError.message}`
        );
        //可以选择不抛出，让分析继续，但记录警告
    }

    // 将 Set 转换为数组并返回
    // 使用 Promise.all 等待所有异步解析完成
    const resolvedDependencies = await Promise.all(
        Array.from(dependencies).map((dep) => resolveDependencyPath(dep, currentDir, options, tsMatchPath))
    );

    // 过滤掉无法解析的路径 (null) 和根据 excludeRegExp 排除的路径
    return resolvedDependencies.filter((resolvedPath): resolvedPath is string => {
        if (!resolvedPath) return false;
        const relativePath = path.relative(baseDir, resolvedPath);
        return !excludeRegExp.some((regex) => regex.test(relativePath));
    });
}

/**
 * 尝试解析单个依赖源字符串到绝对文件路径
 * @param source 原始依赖字符串 (e.g., './utils', '@alias/file', 'react')
 * @param currentDir 引入该依赖的文件所在的目录 (绝对路径)
 * @param options 配置选项
 * @param tsMatchPath (可选) tsconfig-paths 匹配函数
 * @returns 解析成功的绝对路径，或 null 如果无法解析或不应包含
 */
async function resolveDependencyPath(
    source: string,
    currentDir: string,
    options: Omit<Required<Options>, 'tsConfig'> & { tsConfig?: string },
    tsMatchPath?: MatchPath
): Promise<string | null> {
    const {includeNpm, fileExtensions} = options;

    // 1. 处理 npm 包 (如果 includeNpm 为 true 且不是相对/绝对路径)
    if (includeNpm && !source.startsWith('.') && !path.isAbsolute(source)) {
        // 对于 npm 包，我们通常只关心包名，不解析到具体文件
        // 如果需要解析到 node_modules 内的文件，需要更复杂的逻辑 (e.g., require.resolve)
        // 检查是否是 TS 路径别名，如果不是，则认为是 npm 包
        let isAlias = false;
        if (tsMatchPath) {
            const aliasPath = tsMatchPath(
                source,
                undefined,
                undefined,
                fileExtensions.map((ext) => `.${ext}`)
            );
            if (aliasPath) isAlias = true;
        }
        if (!isAlias) {
            return source; // 返回包名
        }
        // 如果是别名，则继续下面的解析逻辑
    } else if (!includeNpm && !source.startsWith('.') && !path.isAbsolute(source) && !tsMatchPath?.(source)) {
        // 如果不包含 npm 包，并且它看起来不是别名或相对/绝对路径，则忽略
        return null;
    }

    let resolvedPath: string | undefined;

    // 2. 处理 TS 路径别名
    if (tsMatchPath && !source.startsWith('.') && !path.isAbsolute(source)) {
        // 注意：tsMatchPath 返回的是相对于 baseUrl 的路径或绝对路径
        // 需要尝试所有可能的扩展名
        resolvedPath = tsMatchPath(
            source,
            undefined,
            undefined,
            fileExtensions.map((ext) => `.${ext}`)
        );
        // tsconfig-paths 可能不会自动添加扩展名，我们需要手动尝试
        if (resolvedPath) {
            resolvedPath = await resolveFileWithExtensions(resolvedPath, fileExtensions);
        }
        if (resolvedPath) {
            return resolvedPath; // 别名解析成功
        }
        // 如果别名解析失败，对于非 npm 场景，我们可能想停止？或者让它尝试相对路径？
        // 当前逻辑：如果别名解析失败，且非 npm，则返回 null
        if (!includeNpm) return null;
        // 如果包含 npm，但别名解析失败，可能是拼写错误或确实是 npm 包，前面已处理
    }

    // 3. 处理绝对路径 (以 / 开头) - 通常不推荐，但需处理
    if (path.isAbsolute(source)) {
        resolvedPath = await resolveFileWithExtensions(source, fileExtensions);
        return resolvedPath ?? null;
    }

    // 4. 处理相对路径 (以 . 开头)
    if (source.startsWith('.')) {
        const absoluteTarget = path.resolve(currentDir, source);
        resolvedPath = await resolveFileWithExtensions(absoluteTarget, fileExtensions);
        return resolvedPath ?? null;
    }

    // 如果 includeNpm=false，并且代码执行到这里（非别名、非相对、非绝对），则忽略
    if (!includeNpm) {
        return null;
    }

    // 对于 includeNpm=true 的情况，如果前面没有识别为包或别名，这里也返回 null
    // （理论上这种情况不应发生，除非是逻辑错误或非常规的源字符串）
    return null;
}

/**
 * 辅助函数，将源字符串添加到待解析集合中 (仅添加，解析在 resolveDependencyPath 中进行)
 */
function handleSource(source: string,dependencies: Set<string>) {
    if (source) {
        dependencies.add(source); // 直接添加原始 source 字符串
    }
}

/**
 * 构建项目的依赖关系图
 * @param startPath 入口文件或目录的绝对路径
 * @param options 配置选项
 * @returns 包含依赖图和文件列表的对象
 * @throws 如果起始路径无效或发生不可恢复的错误
 */
export async function buildDependencyGraph(
    startPath: string,
    options: Omit<Required<Options>, 'tsConfig'> & { tsConfig?: string }
): Promise<{graph: DependencyGraph; files: string[]}> {
    const dependencyGraph: DependencyGraph = {};
    const visited = new Set<string>(); // 存储已访问文件的绝对路径
    const allFiles = new Set<string>(); // 存储所有涉及文件的相对路径
    let tsMatchPath: MatchPath | undefined;

    // 预处理 TSConfig
    if (options.tsConfig) {
        try {
            const tsConfigContent = await resolveTsConfig(options.tsConfig);
            // baseUrl 应相对于 tsconfig.json 文件所在目录，但 createMatchPath 需要绝对路径
            const tsConfigDir = path.dirname(options.tsConfig);
            const baseUrl = path.resolve(tsConfigDir, tsConfigContent.compilerOptions?.baseUrl || '.');
            const paths = tsConfigContent.compilerOptions?.paths || {};
            tsMatchPath = createMatchPath(baseUrl, paths);
        } catch (error: any) {
            console.warn(
                `Warning: Failed to load or parse tsconfig.json at "${options.tsConfig}". Path alias resolution may be incomplete. Error: ${error.message}`
            );
            // 不中断执行，但路径别名可能无法解析
        }
    }

    // 递归遍历函数
    async function traverseDependencies(currentAbsolutePath: string) {
        // 检查是否已访问，防止循环依赖导致的无限递归
        if (visited.has(currentAbsolutePath)) {
            return;
        }
        visited.add(currentAbsolutePath);

        const currentRelativePath = path.relative(options.baseDir, currentAbsolutePath);
        allFiles.add(currentRelativePath); // 记录访问过的文件（相对路径）

        let directDependencies: string[] = [];
        try {
            // 获取当前文件的直接依赖（绝对路径）
            directDependencies = await getDirectDependencies(currentAbsolutePath, options, tsMatchPath);
        } catch (error: any) {
            // 如果获取单个文件依赖失败，记录错误并继续处理其他文件
            console.error(`Error processing file "${currentRelativePath}": ${error.message}`);
            dependencyGraph[currentRelativePath] = []; // 标记为空依赖列表
            return; // 不再递归此文件的依赖
        }

        // 将依赖转换为相对路径并存入图谱
        dependencyGraph[currentRelativePath] = directDependencies.map((depAbsPath) => {
            // 如果是 npm 包 (includeNpm=true 且非路径形式)，直接使用包名
            if (options.includeNpm && !depAbsPath.includes(path.sep) && !path.isAbsolute(depAbsPath)) {
                return depAbsPath;
            }
            return path.relative(options.baseDir, depAbsPath);
        });

        // 并行处理所有直接依赖项的递归遍历
        await Promise.all(
            directDependencies.map(async (depAbsPath) => {
                // 如果是 npm 包，则不递归
                if (options.includeNpm && !depAbsPath.includes(path.sep) && !path.isAbsolute(depAbsPath)) {
                    allFiles.add(depAbsPath); // 将 npm 包名也加入文件列表
                    return;
                }
                // 确保依赖也被加入 allFiles (即使它最终解析失败或被排除)
                const depRelPath = path.relative(options.baseDir, depAbsPath);
                // 注意：allFiles 在 getDirectDependencies 内部解析成功后，
                // 并且在 traverseDependencies 的开头已经添加了当前文件，
                // 所以这里不需要重复添加，除非是为了确保 npm 包名也被添加。
                // allFiles.add(depRelPath); // 这行可能重复，但无害

                // 过滤掉不应递归的路径（例如已被排除的）
                // 注意：排除逻辑已在 getDirectDependencies 中处理，这里理论上不需要再次检查
                // 但为了保险起见，可以加一道检查
                if (!options.excludeRegExp.some((regex) => regex.test(depRelPath))) {
                    await traverseDependencies(depAbsPath); // 递归调用
                }
            })
        );
    }

    // --- 处理入口点 ---
    let initialFiles: string[] = [];
    try {
        const stats = await fsp.stat(startPath);
        if (stats.isDirectory()) {
            // 如果是目录，递归读取所有符合扩展名的文件
            const dirents = await fsp.readdir(startPath, {withFileTypes: true, recursive: true}); // 使用 recursive (Node.js >= 18.17.0)
            for (const dirent of dirents) {
                // 确保 dirent.path 在 recursive 模式下可用，或者拼接 path.join(startPath, dirent.name)
                // 注意：recursive: true 返回的 name 可能包含子目录路径
                const filePath = path.join(dirent.path, dirent.name); // Node < 20 可能需要手动拼接
                // const filePath = path.resolve(dirent.path, dirent.name); // Node >= 20
                if (dirent.isFile() && options.fileExtensions.some((ext) => filePath.endsWith(`.${ext}`))) {
                    // 检查是否被排除
                    const relativeFilePath = path.relative(options.baseDir, filePath);
                    if (!options.excludeRegExp.some((regex) => regex.test(relativeFilePath))) {
                        initialFiles.push(filePath);
                    }
                }
            }
            if (initialFiles.length === 0) {
                console.warn(
                    `Warning: No files matching extensions [${options.fileExtensions.join(
                        ', '
                    )}] found in directory "${startPath}".`
                );
            }
        } else if (stats.isFile()) {
            // 如果是文件，检查扩展名和排除规则
            const relativeFilePath = path.relative(options.baseDir, startPath);
            if (!options.fileExtensions.some((ext) => startPath.endsWith(`.${ext}`))) {
                throw new Error(
                    `Entry file "${relativeFilePath}" does not match allowed extensions: [${options.fileExtensions.join(
                        ', '
                    )}]`
                );
            }
            if (options.excludeRegExp.some((regex) => regex.test(relativeFilePath))) {
                console.warn(`Warning: Entry file "${relativeFilePath}" is excluded by excludeRegExp rules.`);
            } else {
                initialFiles.push(startPath);
            }
        } else {
            throw new Error(`Invalid start path: "${startPath}" is neither a file nor a directory.`);
        }
    } catch (error: any) {
        throw new Error(`Failed to process start path "${startPath}": ${error.message}`);
    }

    // --- 开始遍历 ---
    // 对所有初始文件并行执行遍历
    await Promise.all(initialFiles.map((file) => traverseDependencies(file)));

    return {graph: dependencyGraph, files: Array.from(allFiles)};
}
