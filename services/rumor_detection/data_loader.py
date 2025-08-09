"""
数据加载器 - 从c3n/utils复制
"""
import torch
from torch.utils.data import Dataset
import numpy as np


class FakeNewsDataset(Dataset):
    """谣言检测数据集类"""
    
    def __init__(self, data_df, crop_num, st_num, dataset, n_words, crop_input, text_input):
        self.data_df = data_df
        self.crop_num = crop_num
        self.st_num = st_num
        self.dataset = dataset
        if dataset == 'weibo':
            self.n_words = n_words
            self.crop_input = crop_input
            self.text_input = text_input
        else:
            self.n_words = n_words
            self.crop_input = crop_input
            self.text_input = text_input

    def __len__(self):
        return self.data_df.shape[0]

    def __getitem__(self, idx):
        if torch.is_tensor(idx):
            idx = idx.tolist()      
        post_id = self.data_df['post_id'][idx]
        image_id = self.data_df['image_id'][idx]
        label = self.data_df['label'][idx]        
        label = torch.tensor(label)
        n_words = self.n_words[post_id]
        crop_input = self.crop_input[image_id]
        text_input = self.text_input[post_id]
        
        sample = {
            'post_id': post_id,
            'label': label,
            'crop_input': crop_input,
            'n_word_input': n_words,
            'text_input': text_input,
        }
        return sample


def create_dummy_dataset():
    """创建虚拟数据集用于测试"""
    # 创建虚拟数据
    data = {
        'post_id': ['test_001', 'test_002'],
        'image_id': ['img_001', 'img_002'],
        'original_post': ['测试文本1', '测试文本2'],
        'label': [0, 1]
    }
    
    # 创建虚拟特征
    n_words = {
        'test_001': torch.randint(0, 1000, (30, 20)),
        'test_002': torch.randint(0, 1000, (30, 20))
    }
    
    crop_input = {
        'img_001': torch.randn(6, 3, 224, 224),
        'img_002': torch.randn(6, 3, 224, 224)
    }
    
    text_input = {
        'test_001': torch.randint(0, 1000, (200,)),
        'test_002': torch.randint(0, 1000, (200,))
    }
    
    import pandas as pd
    df = pd.DataFrame(data)
    
    return FakeNewsDataset(df, 6, 31, 'weibo', n_words, crop_input, text_input)
