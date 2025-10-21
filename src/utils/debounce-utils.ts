/**
 * 防抖和节流工具函数
 */

/**
 * 防抖函数
 * 在一定时间内多次调用，只执行最后一次
 * 
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数和清理函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): {
    debouncedFn: (...args: Parameters<T>) => void;
    cancel: () => void;
} {
    let timeoutId: number | null = null;

    const debouncedFn = (...args: Parameters<T>) => {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(() => {
            func(...args);
            timeoutId = null;
        }, delay);
    };

    const cancel = () => {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return { debouncedFn, cancel };
}

/**
 * 节流函数
 * 在一定时间内最多执行一次
 * 
 * @param func 要节流的函数
 * @param delay 时间间隔（毫秒）
 * @returns 节流后的函数和重置函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): {
    throttledFn: (...args: Parameters<T>) => void;
    reset: () => void;
} {
    let lastCallTime = 0;
    let timeoutId: number | null = null;

    const throttledFn = (...args: Parameters<T>) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;

        if (timeSinceLastCall >= delay) {
            // 立即执行
            lastCallTime = now;
            func(...args);
        } else {
            // 延迟执行（trailing edge）
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            timeoutId = window.setTimeout(() => {
                lastCallTime = Date.now();
                func(...args);
                timeoutId = null;
            }, delay - timeSinceLastCall);
        }
    };

    const reset = () => {
        lastCallTime = 0;
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return { throttledFn, reset };
}

/**
 * 可管理的防抖器类
 * 提供更面向对象的防抖管理方式
 */
export class Debouncer {
    private timeoutId: number | null = null;

    constructor(
        private func: () => void,
        private delay: number
    ) {}

    /**
     * 触发防抖函数
     */
    trigger(): void {
        this.cancel();
        this.timeoutId = window.setTimeout(() => {
            this.func();
            this.timeoutId = null;
        }, this.delay);
    }

    /**
     * 取消待执行的函数
     */
    cancel(): void {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * 立即执行并取消防抖
     */
    flush(): void {
        this.cancel();
        this.func();
    }

    /**
     * 检查是否有待执行的函数
     */
    isPending(): boolean {
        return this.timeoutId !== null;
    }
}

/**
 * 可管理的节流器类
 */
export class Throttler {
    private lastCallTime = 0;
    private timeoutId: number | null = null;

    constructor(
        private func: () => void,
        private delay: number
    ) {}

    /**
     * 触发节流函数
     */
    trigger(): void {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall >= this.delay) {
            // 立即执行
            this.lastCallTime = now;
            this.func();
        } else {
            // 延迟执行
            if (this.timeoutId !== null) {
                window.clearTimeout(this.timeoutId);
            }
            this.timeoutId = window.setTimeout(() => {
                this.lastCallTime = Date.now();
                this.func();
                this.timeoutId = null;
            }, this.delay - timeSinceLastCall);
        }
    }

    /**
     * 重置节流器
     */
    reset(): void {
        this.lastCallTime = 0;
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }
}

