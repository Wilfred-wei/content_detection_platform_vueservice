import torch
import torch.nn as nn
from cn_clip.clip import load_from_name
import torch.nn.functional as F
import clip


class C3N(nn.Module):
    def __init__(self, args):
        super(C3N, self).__init__()
        self.device = args.device

        # 加载中文CLIP模型
        clip_model, _ = load_from_name('ViT-B-16', device=args.device,
                                       download_root='/sda/qiaojiao/pretrained_models/cn-clip/')
        self.clip_model = clip_model.float()

        # 冻结CLIP模型的参数
        for param in self.clip_model.parameters():
            param.requires_grad = False

        # 简化分类器
        self.classifier = nn.Sequential(
            nn.Linear(1024, 128),  # 输入维度应为512*2=1024
            nn.ReLU(),
            nn.Linear(128, 2)
        )

        # 添加缺失的属性以避免运行时错误
        self.is_weibo = True  # 假设始终使用中文模型
        self.finetune = False  # 不使用微调

    def forward(self, data):
        # 确保数据类型正确
        text_input = data['text_input'].long().to(self.device)
        crop_input = data['crop_input'].float().to(self.device)

        # 编码文本和图像
        batch_size = text_input.shape[0]

        # 文本编码：直接编码，不需要flatten
        # 如果text_input是[batch_size, context_length]，直接使用
        if len(text_input.shape) == 2:
            text_features = self.clip_model.encode_text(text_input)
        else:
            # 如果维度不对，尝试调整
            text_features = self.clip_model.encode_text(text_input.view(batch_size, -1))
        
        # 文本特征已经是[batch_size, 512]，不需要重塑
        text_mean = text_features

        # 图像编码：展平所有裁剪图像的输入
        image_features = self.clip_model.encode_image(crop_input.flatten(0, 1))
        # 重塑特征：[batch_size, num_crops, 512]
        image_features = image_features.view(batch_size, -1, 512)
        # 取平均作为图像特征
        image_mean = image_features.mean(dim=1)

        # 拼接文本和图像特征
        combined = torch.cat([text_mean, image_mean], dim=1)

        # 分类
        x = self.classifier(combined)
        logit = F.log_softmax(x, dim=-1)

        return logit