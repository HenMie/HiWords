/**
 * 错误处理工具类
 * 提供统一的错误格式化和用户友好的错误消息
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
    /** 文件不存在 */
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    /** 权限不足 */
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    /** 文件格式错误 */
    PARSE_ERROR = 'PARSE_ERROR',
    /** 文件损坏 */
    CORRUPT_FILE = 'CORRUPT_FILE',
    /** 未知错误 */
    UNKNOWN = 'UNKNOWN',
}

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<ErrorType, string> = {
    [ErrorType.FILE_NOT_FOUND]: '文件不存在，请检查文件路径',
    [ErrorType.PERMISSION_DENIED]: '权限不足，请检查文件权限',
    [ErrorType.PARSE_ERROR]: '文件格式错误，请检查文件内容',
    [ErrorType.CORRUPT_FILE]: '文件已损坏，请尝试重新创建',
    [ErrorType.UNKNOWN]: '未知错误，请查看控制台获取详细信息',
};

/**
 * 从错误对象中识别错误类型
 * @param error 错误对象
 * @returns 错误类型
 */
export function identifyErrorType(error: unknown): ErrorType {
    if (!(error instanceof Error)) {
        return ErrorType.UNKNOWN;
    }

    const message = error.message.toLowerCase();

    if (message.includes('enoent') || message.includes('not found')) {
        return ErrorType.FILE_NOT_FOUND;
    }

    if (message.includes('eacces') || message.includes('permission')) {
        return ErrorType.PERMISSION_DENIED;
    }

    if (message.includes('parse') || message.includes('json')) {
        return ErrorType.PARSE_ERROR;
    }

    if (message.includes('corrupt')) {
        return ErrorType.CORRUPT_FILE;
    }

    return ErrorType.UNKNOWN;
}

/**
 * 格式化错误信息为用户友好的提示
 * @param error 错误对象
 * @param context 错误上下文描述
 * @returns 格式化后的用户友好错误消息
 */
export function formatUserFriendlyError(error: unknown, context: string): string {
    const errorType = identifyErrorType(error);
    const errorMessage = ERROR_MESSAGES[errorType];
    return `${context}：${errorMessage}`;
}

/**
 * 记录错误到控制台并返回用户友好消息
 * @param error 错误对象
 * @param context 错误上下文描述
 * @param logPrefix 日志前缀，默认为 '[HiWords]'
 * @returns 格式化后的用户友好错误消息
 */
export function logAndFormatError(
    error: unknown,
    context: string,
    logPrefix = '[HiWords]'
): string {
    const userFriendlyMessage = formatUserFriendlyError(error, context);
    console.error(`${logPrefix} ${context}:`, error);
    return userFriendlyMessage;
}

