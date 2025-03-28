// src/utils.ts
import * as fsp from 'fs/promises';
import * as path from 'path';
import stripJsonComments from 'strip-json-comments';

/**
 * 递归解析 tsconfig.json 文件，支持 extends
 * @param tsConfigPath tsconfig.json 的绝对路径
 * @returns 合并后的配置对象
 * @throws 如果文件读取或 JSON 解析失败
 */
export async function resolveTsConfig(tsConfigPath: string): Promise<any> {
  let rawContent: string;
  try {
    rawContent = await fsp.readFile(tsConfigPath, 'utf8');
  } catch (error: any) {
    throw new Error(`Failed to read tsconfig file "${tsConfigPath}": ${error.message}`);
  }

  let config: any;
  try {
    config = JSON.parse(stripJsonComments(rawContent));
  } catch (error: any) {
    throw new Error(`Failed to parse tsconfig JSON "${tsConfigPath}": ${error.message}`);
  }

  // 如果没有 extends，直接返回当前配置
  if (!config.extends) {
    return config;
  }

  // 解析 extends 路径（相对于当前 tsconfig.json 的目录）
  const basePath = path.dirname(tsConfigPath);
  // 支持 node_modules 中的配置，但需注意路径解析
  const extendsPath = config.extends.startsWith('.')
    ? path.resolve(basePath, config.extends)
    : require.resolve(config.extends, { paths: [basePath] }); // 使用 require.resolve 处理非相对路径

  // 递归解析基配置文件
  const baseConfig = await resolveTsConfig(extendsPath);

  // 合并配置（基配置优先，当前配置覆盖）
  // 注意：深合并 compilerOptions.paths 等可能更健壮，但这里简化处理
  const mergedConfig = { ...baseConfig, ...config };

  // 特殊处理 compilerOptions（合并而非直接覆盖）
  if (baseConfig.compilerOptions || config.compilerOptions) {
    mergedConfig.compilerOptions = {
      ...(baseConfig.compilerOptions || {}),
      ...(config.compilerOptions || {}),
      // 深合并 paths (如果需要更精确的合并)
      paths: {
        ...(baseConfig.compilerOptions?.paths || {}),
        ...(config.compilerOptions?.paths || {}),
      }
    };
  }
    // 移除 extends 字段，避免重复处理
    delete mergedConfig.extends;


  return mergedConfig;
}

/**
 * 尝试异步解析文件路径，考虑多种扩展名
 * @param filePath 不带扩展名的基础路径
 * @param extensions 可能的扩展名数组 (e.g., ['.ts', '.js'])
 * @returns 成功解析的绝对路径，否则返回 undefined
 */
export async function resolveFileWithExtensions(filePath: string, extensions: string[]): Promise<string | undefined> {
    // 1. 尝试直接访问原始路径 (可能是目录或已包含扩展名)
    try {
        await fsp.access(filePath);
        const stats = await fsp.stat(filePath);
        if (stats.isFile()) {
            return filePath; // 文件存在，直接返回
        }
        if (stats.isDirectory()) {
            // 如果是目录，尝试解析 index 文件
            for (const ext of extensions) {
                const indexCandidate = path.join(filePath, `index${ext.startsWith('.') ? ext : '.' + ext}`);
                try {
                    await fsp.access(indexCandidate);
                    return indexCandidate;
                } catch {
                    // index 文件不存在，继续尝试下一个扩展名
                }
            }
        }
    } catch {
        // 原始路径不存在或无权限访问，继续尝试添加扩展名
    }

    // 2. 尝试添加扩展名
    for (const ext of extensions) {
        const candidate = `${filePath}${ext.startsWith('.') ? ext : '.' + ext}`;
        try {
            await fsp.access(candidate);
            // 确保它是一个文件
             const candidateStats = await fsp.stat(candidate);
             if (candidateStats.isFile()) {
                return candidate;
             }
        } catch {
            // 带扩展名的文件不存在，继续尝试下一个
        }
    }

    return undefined; // 所有尝试都失败
}
