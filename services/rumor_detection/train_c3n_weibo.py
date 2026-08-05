#!/usr/bin/env python3
"""
C3N模型训练脚本 - 专门针对Weibo数据集
"""
import os
import sys
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
import pickle
import pandas as pd
from PIL import Image
from torchvision.transforms import Compose, Resize, CenterCrop, ToTensor, Normalize
import cn_clip.clip as clip
from tqdm import tqdm
import argparse
from C3N_models import C3N
from train_eval_helper import save_checkpoint, load_checkpoint, set_random_seed, LRScheduler, EarlyStoppingAcc
import re
import numpy as np
from sklearn.metrics import accuracy_score, classification_report

# 数据预处理函数
def clip_preprocess():
    """CLIP图像预处理函数"""
    return Compose([
        Resize(224, interpolation=3),
        CenterCrop(224),
        ToTensor(),
        Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
    ])

PREPROCESS = clip_preprocess()

def chinese_tokenize(text, context_length=200):
    """中文文本tokenize函数"""
    text = text.strip()
    if len(text) == 0:
        text = "空文本"
    tokens = clip.tokenize(text, context_length=context_length)
    if len(tokens.shape) == 1:
        tokens = tokens.unsqueeze(0)
    elif len(tokens.shape) > 2:
        tokens = tokens.squeeze(0)
    return tokens

def split_text_to_sentences(text):
    """将文本分割为句子"""
    sentences = re.split(r'[。！？!?\.!?]', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences

class WeiboRumorDataset(Dataset):
    """Weibo谣言检测数据集"""
    
    def __init__(self, data_dir, split='train', crop_num=6, st_num=31):
        self.data_dir = data_dir
        self.split = split
        self.crop_num = crop_num
        self.st_num = st_num
        
        # 加载ID数据
        id_file = os.path.join(data_dir, f'{split}_id.pickle')
        with open(id_file, 'rb') as f:
            self.data_ids = pickle.load(f)
        
        # 所有文本数据都在train文件中（包括验证集和测试集）
        rumor_file = os.path.join(data_dir, 'tweets', 'train_rumor.txt')
        nonrumor_file = os.path.join(data_dir, 'tweets', 'train_nonrumor.txt')
        
        # 读取文本并创建数据映射
        self.data_map = {}
        print(f"从训练文本文件加载数据...")
        self._load_text_data(rumor_file, label=1)
        self._load_text_data(nonrumor_file, label=0)
        
        # 图像目录
        self.rumor_img_dir = os.path.join(data_dir, 'rumor_images')
        self.nonrumor_img_dir = os.path.join(data_dir, 'nonrumor_images')
        
        print(f"加载{split}数据集: {len(self.data_ids)}条")
        print(f"文本映射总数: {len(self.data_map)}条")
        
    def _load_text_data(self, file_path, label):
        """加载文本数据"""
        if not os.path.exists(file_path):
            print(f"警告: 文件不存在 {file_path}")
            return
            
        with open(file_path, 'r', encoding='utf-8') as f:
            while True:
                # 读取ID行
                id_line = f.readline()
                if not id_line:
                    break
                post_id = id_line.strip().split('|')[0]
                
                # 读取图片URL行
                img_line = f.readline()
                
                # 读取文本内容行
                text_line = f.readline()
                
                if post_id and text_line:
                    self.data_map[post_id] = {
                        'text': text_line.strip(),
                        'label': label,
                        'images': img_line.strip().split('|') if img_line.strip() else []
                    }
    
    def __len__(self):
        return len(self.data_ids)
    
    def __getitem__(self, idx):
        post_id = list(self.data_ids.keys())[idx]
        
        # 获取数据
        item = self.data_map.get(post_id, {'text': '', 'label': 0, 'images': []})
        text = item['text']
        label = item['label']
        
        # 文本预处理
        text_input = chinese_tokenize(text)
        
        # 分割句子
        sentences = split_text_to_sentences(text)
        if len(sentences) > 30:
            sentences = sentences[:30]
        
        # 为每个句子创建token
        sentence_tokens = []
        for sentence in sentences:
            if sentence.strip():
                token = chinese_tokenize(sentence, context_length=20)
                sentence_tokens.append(token)
        
        # 填充句子tokens
        while len(sentence_tokens) < 30:
            empty_token = chinese_tokenize("", context_length=20)
            sentence_tokens.append(empty_token)
        
        n_word_input = torch.cat(sentence_tokens, dim=0)
        n_word_input = n_word_input.unsqueeze(0)
        
        # 图像预处理
        label_dir = self.rumor_img_dir if label == 1 else self.nonrumor_img_dir
        
        # 查找对应的图片文件
        img_files = [f for f in os.listdir(label_dir) if post_id in f or f.startswith(post_id)]
        
        if img_files:
            img_path = os.path.join(label_dir, img_files[0])
            try:
                img = Image.open(img_path).convert("RGB")
                crop_images = [PREPROCESS(img)] * 6
            except:
                crop_images = [torch.zeros(3, 224, 224)] * 6
        else:
            crop_images = [torch.zeros(3, 224, 224)] * 6
        
        crop_input = torch.stack(crop_images).unsqueeze(0)
        
        return {
            'text_input': text_input,
            'crop_input': crop_input,
            'n_word_input': n_word_input,
            'label': torch.tensor(label)
        }

def train_epoch(model, dataloader, optimizer, device, epoch):
    """训练一个epoch"""
    model.train()
    total_loss = 0
    all_preds = []
    all_labels = []
    
    pbar = tqdm(dataloader, desc=f'Epoch {epoch}')
    for batch in pbar:
        # 移动数据到设备
        text_input = batch['text_input'].squeeze(1).to(device)
        crop_input = batch['crop_input'].squeeze(1).to(device)
        n_word_input = batch['n_word_input'].squeeze(1).to(device)
        labels = batch['label'].to(device)
        
        # 准备数据
        data = {
            'text_input': text_input,
            'crop_input': crop_input,
            'n_word_input': n_word_input
        }
        
        # 前向传播
        optimizer.zero_grad()
        outputs = model(data)
        
        # 计算损失
        loss = nn.NLLLoss()(outputs, labels)
        
        # 反向传播
        loss.backward()
        optimizer.step()
        
        # 统计
        total_loss += loss.item()
        preds = outputs.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds)
        all_labels.extend(labels.cpu().numpy())
        
        # 更新进度条
        pbar.set_postfix({'loss': loss.item()})
    
    # 计算准确率
    accuracy = accuracy_score(all_labels, all_preds)
    avg_loss = total_loss / len(dataloader)
    
    return avg_loss, accuracy

def validate(model, dataloader, device):
    """验证模型"""
    model.eval()
    total_loss = 0
    all_preds = []
    all_labels = []
    
    with torch.no_grad():
        for batch in tqdm(dataloader, desc='Validating'):
            # 移动数据到设备
            text_input = batch['text_input'].squeeze(1).to(device)
            crop_input = batch['crop_input'].squeeze(1).to(device)
            n_word_input = batch['n_word_input'].squeeze(1).to(device)
            labels = batch['label'].to(device)
            
            # 准备数据
            data = {
                'text_input': text_input,
                'crop_input': crop_input,
                'n_word_input': n_word_input
            }
            
            # 前向传播
            outputs = model(data)
            
            # 计算损失
            loss = nn.NLLLoss()(outputs, labels)
            
            # 统计
            total_loss += loss.item()
            preds = outputs.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())
    
    # 计算准确率
    accuracy = accuracy_score(all_labels, all_preds)
    avg_loss = total_loss / len(dataloader)
    
    # 打印分类报告
    print(f"\n分类报告:")
    print(classification_report(all_labels, all_preds, target_names=['非谣言', '谣言']))
    
    return avg_loss, accuracy

def main():
    parser = argparse.ArgumentParser(description='训练C3N模型')
    parser.add_argument('--data_dir', type=str, default='./weibo', help='数据目录')
    parser.add_argument('--batch_size', type=int, default=16, help='批次大小')
    parser.add_argument('--epochs', type=int, default=20, help='训练轮数')
    parser.add_argument('--lr', type=float, default=0.0001, help='学习率')
    parser.add_argument('--device', type=str, default='cuda', help='设备')
    parser.add_argument('--save_dir', type=str, default='./checkpoints', help='保存目录')
    parser.add_argument('--seed', type=int, default=42, help='随机种子')
    
    args = parser.parse_args()
    
    # 设置随机种子
    set_random_seed(args.seed)
    
    # 设置设备
    device = args.device if torch.cuda.is_available() else 'cpu'
    print(f"使用设备: {device}")
    
    # 创建保存目录
    os.makedirs(args.save_dir, exist_ok=True)
    
    # 创建模型
    class ModelArgs:
        def __init__(self, device):
            self.device = device
            self.dataset = 'weibo'
            self.conv_out = 64
            self.crop_num = 6
            self.st_num = 31
            self.dropout_p = 0.3
            self.layer_num = 8
            self.conv_kernel = [1, 2, 3]
            self.finetune = False
    
    model_args = ModelArgs(device)
    model = C3N(model_args).to(device)
    print("C3N模型创建完成")
    
    # 加载数据
    print("加载数据...")
    train_dataset = WeiboRumorDataset(args.data_dir, split='train')
    val_dataset = WeiboRumorDataset(args.data_dir, split='validate')
    
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2)
    
    # 优化器和学习率调度器
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = LRScheduler(optimizer, patience=3, min_lr=1e-6, factor=0.5)
    early_stopping = EarlyStoppingAcc(patience=8, min_delta=0.001)
    
    # 训练循环
    best_val_acc = 0
    print("开始训练...")
    
    for epoch in range(1, args.epochs + 1):
        # 训练
        train_loss, train_acc = train_epoch(model, train_loader, optimizer, device, epoch)
        
        # 验证
        val_loss, val_acc = validate(model, val_loader, device)
        
        # 学习率调度
        scheduler(val_loss)
        
        # 打印结果
        print(f"\nEpoch {epoch}/{args.epochs}")
        print(f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f}")
        print(f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}")
        
        # 保存最佳模型
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            save_path = os.path.join(args.save_dir, 'C3N_models.pt')
            save_checkpoint(save_path, model, val_loss)
            print(f"✓ 保存最佳模型 (验证准确率: {val_acc:.4f})")
        
        # 早停
        early_stopping(val_acc)
        if early_stopping.early_stop:
            print("早停触发，停止训练")
            break
    
    print(f"\n训练完成! 最佳验证准确率: {best_val_acc:.4f}")
    print(f"模型已保存到: {os.path.join(args.save_dir, 'C3N_models.pt')}")

if __name__ == "__main__":
    main()
