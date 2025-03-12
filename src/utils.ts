import * as fsp from 'fs/promises';
import * as path from 'path';
import stripJsonComments from 'strip-json-comments';

export async function resolveTsConfig(tsConfigPath: string): Promise<any> {
    // 读取初始配置文件
    const rawContent = await fsp.readFile(tsConfigPath, 'utf8');
    const config = JSON.parse(stripJsonComments(rawContent));

    // 如果没有 extends，直接返回当前配置
    if (!config.extends) {
        return config;
    }

    // 解析 extends 路径（相对于当前 tsconfig.json 的目录）
    const basePath = path.dirname(tsConfigPath);
    const extendsPath = path.resolve(basePath, config.extends);

    // 递归解析基配置文件
    const baseConfig = await resolveTsConfig(extendsPath);

    // 合并配置（基配置优先，当前配置覆盖）
    const mergedConfig = { ...baseConfig, ...config };

    // 删除 extends 字段（可选）
    delete mergedConfig.extends;

    // 特殊处理 compilerOptions（合并而非直接覆盖）
    if (baseConfig.compilerOptions || config.compilerOptions) {
        mergedConfig.compilerOptions = {
            ...baseConfig.compilerOptions,
            ...config.compilerOptions
        };
    }

    return mergedConfig;
}