// src/index.ts
import * as path from 'path';
import * as fsp from 'fs/promises';
import {buildDependencyGraph} from './dependency';
import type {Options, DependencyGraph} from './types';

class DepSeekerResult {
    private _files: string[];
    private _dependencyGraph: DependencyGraph;

    constructor(files: string[], dependencyGraph: DependencyGraph) {
        // 存储相对路径
        this._files = files.sort(); // 排序使结果稳定
        this._dependencyGraph = dependencyGraph;
    }

    /**
     * 获取依赖关系图对象
     * Key: 文件路径 (相对于 baseDir)
     * Value: 该文件的依赖项路径数组 (相对于 baseDir)
     */
    obj(): DependencyGraph {
        return this._dependencyGraph;
    }

    /**
     * 获取项目中涉及的所有文件列表 (相对于 baseDir)
     */
    getFiles(): string[] {
        return this._files;
    }
}

/**
 * 分析项目文件依赖关系
 * @param filePath 入口文件或目录的绝对路径
 * @param options 配置选项 (可选)
 * @returns 返回一个包含依赖图和文件列表的 DepSeekerResult 实例
 * @throws 如果分析过程中发生严重错误
 */
export default async function depseeker(filePath: string, options: Options = {}): Promise<DepSeekerResult> {
    const absoluteFilePath = path.resolve(filePath);
    // 1. 合并默认选项和用户选项
    const mergedOptions: Options = {
        // 先用 Options 类型合并
        includeNpm: false,
        fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
        excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /build/, /coverage/, /\.test\.tsx?$/, /\.spec\.tsx?$/],
        detectiveOptions: {ts: {skipTypeImports: true}},
        baseDir: path.dirname(absoluteFilePath), // 初始默认 baseDir
        tsConfig: undefined, // 默认 tsConfig
        ...options // 用户选项覆盖默认值
    };
    // 2. 确定并解析最终的 baseDir
    let finalBaseDir = mergedOptions.baseDir; // 从合并后的选项开始
    try {
        const stats = await fsp.stat(absoluteFilePath);
        // 如果入口是目录且用户未指定 baseDir，则使用入口目录作为 baseDir
        if (stats.isDirectory() && !options.baseDir) {
            finalBaseDir = absoluteFilePath;
        }
    } catch (error: any) {
        // 如果 stat 失败，可能是路径无效，让后续 buildDependencyGraph 处理
        console.warn(
            `[depseeker] Warning: Could not stat entry path "${filePath}". Proceeding with default baseDir calculation. Error: ${error.message}`
        );
    }
    // 确保 baseDir 是绝对路径
    finalBaseDir = path.resolve(finalBaseDir || process.cwd()); // 如果 baseDir 解析为空，回退到当前工作目录
    // 3. 解析 tsConfig 路径 (如果存在)
    let absoluteTsConfigPath: string | undefined = undefined;
    if (mergedOptions.tsConfig) {
        // 此时 mergedOptions.tsConfig 必然是 string 类型
        absoluteTsConfigPath = path.resolve(finalBaseDir, mergedOptions.tsConfig);
    }
    // 4. 构建最终传递给核心逻辑的选项对象 (使用 Required<Options> 确保类型符合预期)
    //    注意：这里我们手动确保了 baseDir 是 string，tsConfig 是 string | undefined
    const finalOptions: Required<Options> = {
        includeNpm: mergedOptions.includeNpm ?? false, // 确保布尔值
        fileExtensions: mergedOptions.fileExtensions ?? ['js', 'jsx', 'ts', 'tsx'], // 确保数组
        excludeRegExp: mergedOptions.excludeRegExp ?? [], // 确保数组
        detectiveOptions: mergedOptions.detectiveOptions ?? {ts: {skipTypeImports: true}}, // 确保对象
        baseDir: finalBaseDir, // 已经是绝对 string
        tsConfig: absoluteTsConfigPath as string // 已经是绝对 string | undefined
    };
    // 5. 调用核心构建逻辑
    try {
        const {graph, files} = await buildDependencyGraph(absoluteFilePath, finalOptions);
        return new DepSeekerResult(files, graph);
    } catch (error: any) {
        console.error(`[depseeker] Error during dependency analysis starting from "${filePath}": ${error.message}`);
        throw error;
    }
}
export type {DepSeekerResult};
console.log('VS Code Extension Host Node.js version:', process.version)