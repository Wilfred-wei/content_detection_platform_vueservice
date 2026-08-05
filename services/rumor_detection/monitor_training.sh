#!/bin/bash
echo "=== C3N训练监控 ==="
echo "按Ctrl+C停止监控"
echo ""

while true; do
    clear
    echo "=== 训练状态 ($(date '+%H:%M:%S')) ==="
    echo ""
    
    # 检查进程
    if ps aux | grep -v grep | grep "train_c3n_weibo" > /dev/null; then
        echo "✓ 训练进程运行中"
        ps aux | grep "train_c3n_weibo" | grep -v grep | awk '{printf "  CPU: %s%%, 内存: %sMB, 运行时间: %s\n", $3, $6/1024, $10}'
    else
        echo "✗ 训练进程未运行"
        break
    fi
    
    echo ""
    echo "=== GPU使用情况 ==="
    nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader | grep "python" | head -4
    
    echo ""
    echo "=== 模型文件 ==="
    ls -lh checkpoints/ 2>/dev/null || echo "  暂无模型文件生成"
    
    echo ""
    echo "=== 最新日志 (最后10行) ==="
    if [ -s training.log ]; then
        tail -10 training.log
    else
        echo "  等待日志生成..."
    fi
    
    sleep 10
done
