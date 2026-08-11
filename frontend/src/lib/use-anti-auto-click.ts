"use client";

/**
 * 异常点击检测（防自动化批量提交）。
 *
 * 人手点击有自然波动（间隔 300ms~1.5s 随机）；自动化点击间隔高度均匀且极短。
 * 命中任一规则 → 按钮锁死 30 秒（倒计时提示）。
 *
 * 阈值均为常量，可按实际使用调整。
 */
import { useRef, useState, useCallback } from "react";

const RAPID_INTERVAL_MS = 300;   // 单次点击间隔阈值（低于视为"快速"）
const RAPID_STREAK = 3;          // 连续快速点击次数阈值
const SHORT_WINDOW_MS = 5000;    // 短窗口（毫秒）
const SHORT_WINDOW_MAX = 8;      // 短窗口内点击上限
const LONG_WINDOW_MS = 30000;    // 长窗口（毫秒）
const LONG_WINDOW_MAX = 25;      // 长窗口内点击上限
export const LOCK_MS = 30000;    // 锁定时长

export function useAntiAutoClick() {
  const clicksRef = useRef<number[]>([]); // 滑动窗口时间戳
  const streakRef = useRef(0);            // 连续快速点击计数
  const lastClickRef = useRef(0);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [locked, setLocked] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const triggerLock = useCallback(() => {
    if (lockTimerRef.current) return; // 已在锁定中
    setLocked(true);
    setRemaining(Math.ceil(LOCK_MS / 1000));
    const startedAt = Date.now();
    lockTimerRef.current = setInterval(() => {
      const left = Math.ceil((LOCK_MS - (Date.now() - startedAt)) / 1000);
      if (left <= 0) {
        if (lockTimerRef.current) clearInterval(lockTimerRef.current);
        lockTimerRef.current = null;
        setLocked(false);
        setRemaining(0);
      } else {
        setRemaining(left);
      }
    }, 1000);
  }, []);

  /** 手动触发锁定（后端 429 限流响应时调用） */
  const forceLock = useCallback(() => {
    triggerLock();
  }, [triggerLock]);

  /** 点击守卫：通过检测才执行 fn，命中异常规则则锁定并拒绝 */
  const guardClick = useCallback(<T,>(fn: () => T): T | undefined => {
    if (locked) return undefined;
    const now = Date.now();

    // 规则 1：连续快速点击（间隔 < 300ms）
    if (lastClickRef.current && now - lastClickRef.current < RAPID_INTERVAL_MS) {
      streakRef.current += 1;
    } else {
      streakRef.current = 0;
    }
    lastClickRef.current = now;

    // 滑动窗口（保留长窗口内的点击）
    const w = clicksRef.current.filter((t) => now - t < LONG_WINDOW_MS);
    w.push(now);
    clicksRef.current = w;

    // 规则 2：短窗口高频
    const shortCount = w.filter((t) => now - t < SHORT_WINDOW_MS).length;
    // 规则 3：长窗口高频
    if (streakRef.current >= RAPID_STREAK || shortCount >= SHORT_WINDOW_MAX || w.length > LONG_WINDOW_MAX) {
      triggerLock();
      return undefined;
    }
    return fn();
  }, [locked, triggerLock]);

  return { locked, remaining, guardClick, forceLock };
}

/** 判断后端限流错误（429「提交过于频繁，请稍后再试」） */
export function isRateLimited(err: unknown): boolean {
  return err instanceof Error && err.message.includes("提交过于频繁");
}
