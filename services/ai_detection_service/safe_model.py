import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image
import numpy as np
import os
import logging
import random
from typing import Dict, Any, Tuple

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 尝试导入pytorch_wavelets
try:
    from pytorch_wavelets import DWTForward
    WAVELETS_AVAILABLE = True
    logger.info("pytorch_wavelets 可用")
except ImportError:
    WAVELETS_AVAILABLE = False
    logger.warning("pytorch_wavelets 不可用。安装: pip install pytorch_wavelets")


class EnergyBasedCrop:
    """基于小波能量图的智能裁剪"""
    
    def __init__(self, size=256, wave="bior1.3"):
        self.size = size
        self.wave = wave
        if WAVELETS_AVAILABLE:
            self.dwt = DWTForward(J=1, mode="symmetric", wave=wave)
        else:
            self.dwt = None
    
    def compute_energy_map(self, img_tensor):
        """计算小波能量图"""
        if not WAVELETS_AVAILABLE or self.dwt is None:
            # 降级方案：使用Sobel边缘检测
            return self._sobel_energy_map(img_tensor)
        
        # 确保输入有batch维度
        if len(img_tensor.shape) == 3:
            img_tensor = img_tensor.unsqueeze(0)
        
        try:
            # 应用DWT
            _, Yh = self.dwt(img_tensor)
            # 获取垂直系数并计算能量
            vert_coeffs = Yh[0][:, :, 2, :, :]
            energy = torch.sum(vert_coeffs**2, dim=1)
            return energy.squeeze(0)
        except Exception as e:
            logger.warning(f"DWT失败，使用Sobel备选方案: {e}")
            return self._sobel_energy_map(img_tensor)
    
    
    def find_best_crop(self, energy_map, target_size):
        """找到最佳裁剪位置"""
        h, w = energy_map.shape
        
        if target_size > h or target_size > w:
            raise ValueError(f"目标尺寸 {target_size} 大于图像尺寸 {h}x{w}")
        
        # 设置步长避免内存爆炸
        stride = max(target_size // 4, 16)
        
        max_energy = -1
        best_x, best_y = 0, 0
        
        # 滑动窗口寻找最大能量区域
        for y in range(0, h - target_size + 1, stride):
            for x in range(0, w - target_size + 1, stride):
                window_energy = energy_map[y:y+target_size, x:x+target_size].sum().item()
                if window_energy > max_energy:
                    max_energy = window_energy
                    best_x, best_y = x, y
        
        return best_x, best_y
    
    def __call__(self, img):
        """执行基于能量的裁剪"""
        # 转换为tensor
        img_tensor = transforms.ToTensor()(img)
        _, h, w = img_tensor.shape
        
        # 如果图像太小，先缩放
        if h < self.size or w < self.size:
            scale = self.size / min(h, w)
            new_h, new_w = int(h * scale) + 1, int(w * scale) + 1
            img = transforms.Resize((new_h, new_w))(img)
            img_tensor = transforms.ToTensor()(img)
        
        # 计算能量图
        energy_map = self.compute_energy_map(img_tensor)
        
        # 找到最佳裁剪位置
        x, y = self.find_best_crop(energy_map, self.size // 2)
        
        # 执行裁剪
        return transforms.functional.crop(img, y * 2, x * 2, self.size, self.size)


class BasicBlock(nn.Module):
    """ResNet基础块"""
    expansion = 1
    
    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super(BasicBlock, self).__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, kernel_size=3, stride=stride,
                               padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(planes, planes, kernel_size=3, stride=1,
                               padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)
        self.downsample = downsample
        self.stride = stride
    
    def forward(self, x):
        residual = x
        
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)
        
        out = self.conv2(out)
        out = self.bn2(out)
        
        if self.downsample is not None:
            residual = self.downsample(x)
        
        out += residual
        out = self.relu(out)
        
        return out


class Bottleneck(nn.Module):
    """ResNet瓶颈块"""
    expansion = 4
    
    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super(Bottleneck, self).__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, kernel_size=1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.conv2 = nn.Conv2d(planes, planes, kernel_size=3, stride=stride,
                               padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)
        self.conv3 = nn.Conv2d(planes, planes * 4, kernel_size=1, bias=False)
        self.bn3 = nn.BatchNorm2d(planes * 4)
        self.relu = nn.ReLU(inplace=True)
        self.downsample = downsample
        self.stride = stride
    
    def forward(self, x):
        residual = x
        
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)
        
        out = self.conv2(out)
        out = self.bn2(out)
        out = self.relu(out)
        
        out = self.conv3(out)
        out = self.bn3(out)
        
        if self.downsample is not None:
            residual = self.downsample(x)
        
        out += residual
        out = self.relu(out)
        
        return out


class SAFEResNet(nn.Module):
    """SAFE算法的ResNet架构"""
    
    def __init__(self, num_classes=2):
        super(SAFEResNet, self).__init__()
        
        # DWT预处理参数
        self.unfoldSize = 2
        self.unfoldIndex = 0
        
        self.inplanes = 64
        self.conv1 = nn.Conv2d(3, 64, kernel_size=3, stride=2, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.MaxPool2d(kernel_size=3, stride=2, padding=1)
        
        self.layer1 = self._make_layer(Bottleneck, 64, 2)
        self.layer2 = self._make_layer(Bottleneck, 128, 2, stride=2)
        
        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc1 = nn.Linear(512, num_classes)
        
        self._initialize_weights()
    
    def _make_layer(self, block, planes, blocks, stride=1):
        """构建ResNet层"""
        downsample = None
        if stride != 1 or self.inplanes != planes * block.expansion:
            downsample = nn.Sequential(
                nn.Conv2d(self.inplanes, planes * block.expansion, 
                         kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm2d(planes * block.expansion),
            )
        
        layers = []
        layers.append(block(self.inplanes, planes, stride, downsample))
        self.inplanes = planes * block.expansion
        for _ in range(1, blocks):
            layers.append(block(self.inplanes, planes))
        
        return nn.Sequential(*layers)
    
    def _initialize_weights(self):
        """初始化网络权重"""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
    
    def _preprocess_dwt(self, x, mode="symmetric", wave="bior1.3"):
        """DWT预处理"""
        if not WAVELETS_AVAILABLE:
            logger.warning("pytorch_wavelets不可用，跳过DWT预处理")
            return x
        
        try:
            dwt_transform = DWTForward(J=1, mode=mode, wave=wave).to(x.device)
            Yl, Yh = dwt_transform(x)
            # 返回垂直方向的高频系数
            result = Yh[0][:, :, 2, :, :]
            resized_result = transforms.Resize([x.shape[-2], x.shape[-1]])(result)
            logger.info(f"DWT预处理成功，输入形状: {x.shape}, 输出形状: {resized_result.shape}")
            return resized_result
        except Exception as e:
            logger.error(f"DWT预处理失败: {e}, 使用原始图像")
            return x
    
    def forward(self, x):
        """前向传播"""
        # DWT预处理
        x = self._preprocess_dwt(x)
        
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)
        
        x = self.layer1(x)
        x = self.layer2(x)
        
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.fc1(x)
        
        return x


class SAFEModel:
    """SAFE模型服务"""
    
    def __init__(self, model_path: str, device: str = 'cpu'):
        self.model_path = './20250509_204548-2.5allprocess'
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.model = None
        self.last_energy_patch = None  # 保存最后一次的energy patch
        self.last_patch_info = None    # 保存patch的位置信息
        logger.info(f"初始化SAFEModel - 模型路径: {self.model_path}, 设备: {self.device}")
        self._load_model()
    
    def _load_model(self):
        """加载模型"""
        try:
            logger.info("开始创建模型架构...")
            self.model = SAFEResNet(num_classes=2)
            
            # 添加安全全局变量，解决权重加载问题
            import argparse
            torch.serialization.add_safe_globals([argparse.Namespace])
            
            # 尝试加载预训练权重
            checkpoint_path = os.path.join(self.model_path, 'checkpoint-best.pth')
            logger.info(f"尝试加载权重文件: {checkpoint_path}")
            logger.info(f"权重文件是否存在: {os.path.exists(checkpoint_path)}")
            
            if os.path.exists(checkpoint_path):
                logger.info("开始加载权重...")
                checkpoint = torch.load(checkpoint_path, map_location=self.device)
                logger.info(f"权重文件加载成功，包含键: {list(checkpoint.keys())}")
                
                # 检查权重结构
                if isinstance(checkpoint, dict) and 'model' in checkpoint:
                    model_state = checkpoint['model']
                elif isinstance(checkpoint, dict):
                    model_state = checkpoint
                else:
                    model_state = checkpoint
                
                self.model.load_state_dict(model_state, strict=False)
                logger.info(f"模型权重加载成功: {checkpoint_path}")
            else:
                logger.warning(f"未找到预训练权重: {checkpoint_path}")
            
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"SAFE模型初始化成功，设备: {self.device}")
            
        except Exception as e:
            logger.error(f"模型加载失败: {e}")
            import traceback
            logger.error(f"详细错误信息: {traceback.format_exc()}")
            self.model = None
    
    def _extract_energy_patch(self, image_path: str):
        """提取基于能量的patch"""
        # 加载原始图像
        original_image = Image.open(image_path).convert('RGB')
        logger.info(f"原始图像尺寸: {original_image.size}")
        
        # 创建EnergyBasedCrop实例
        energy_crop = EnergyBasedCrop(size=256)
        
        # 计算能量图并找到最佳patch
        img_tensor = transforms.ToTensor()(original_image)
        energy_map = energy_crop.compute_energy_map(img_tensor)
        
        # 找到最佳裁剪位置
        best_x, best_y = energy_crop.find_best_crop(energy_map, 256 // 2)
        
        # 执行裁剪得到energy patch
        energy_patch = transforms.functional.crop(original_image, best_y * 2, best_x * 2, 256, 256)
        
        # 保存patch信息
        patch_info = {
            'x': best_x * 2,
            'y': best_y * 2, 
            'width': 256,
            'height': 256,
            'original_size': original_image.size
        }
        
        logger.info(f"Energy patch位置: x={patch_info['x']}, y={patch_info['y']}, size=256x256")
        
        return energy_patch, patch_info, original_image

    def predict(self, image_path: str) -> Dict[str, Any]:
        """预测图像是否为AI生成"""
        logger.info(f"开始预测图像: {image_path}")
        
        if self.model is None:
            logger.error("模型未加载，返回备选结果")
            return self._fallback_prediction(image_path)
        
        # 提取energy patch
        energy_patch, patch_info, original_image = self._extract_energy_patch(image_path)
        
        # 保存用于热力图生成
        self.last_energy_patch = energy_patch
        self.last_patch_info = patch_info
        
        # 保存调试图像
        debug_path = os.path.join(os.path.dirname(__file__), 'debug_energy_patch.jpg')
        energy_patch.save(debug_path)
        logger.info(f"Energy patch已保存: {debug_path}")
        
        # 预处理energy patch
        logger.info("开始图像预处理...")
        transform = transforms.Compose([
            transforms.ToTensor(),      # 转换为张量
        ])
        input_tensor = transform(energy_patch).unsqueeze(0).to(self.device)
        logger.info(f"预处理完成，张量形状: {input_tensor.shape}")
        
        # 预测
        logger.info("开始模型推理...")
        with torch.no_grad():
            outputs = self.model(input_tensor)
            logger.info(f"模型输出: {outputs}")
            
            probabilities = torch.softmax(outputs, dim=1)
            logger.info(f"概率分布: {probabilities}")
            
            confidence, predicted = torch.max(probabilities, 1)
            logger.info(f"预测类别: {predicted.item()}, 置信度: {confidence.item()}")
            
            # 0: real, 1: fake
            prediction = 'fake' if predicted.item() == 1 else 'real'
            confidence_score = confidence.item()
            
            result = {
                'prediction': prediction,
                'confidence': float(confidence_score),
                'probabilities': {
                    'real': float(probabilities[0][0]),
                    'fake': float(probabilities[0][1])
                },
                'patch_info': patch_info  # 添加patch信息
            }
            logger.info(f"预测结果: {result}")
            return result
    
    
    def generate_heatmap(self, image_path: str, output_path: str) -> Tuple[bool, np.ndarray]:
        """生成检测热力图并返回热力图数据"""
        if self.model is None:
            return False, None
        
        try:
            # 使用保存的energy patch
            if self.last_energy_patch is None:
                logger.error("没有energy patch，无法生成热力图")
                return False, None
                
            energy_patch = self.last_energy_patch
            transform = transforms.Compose([
                transforms.ToTensor(),
            ])
            input_tensor = transform(energy_patch).unsqueeze(0).to(self.device)
            
            # 使用类似Grad-CAM的方法生成热力图
            with torch.no_grad():
                # 获取模型的中间特征
                x = self.model._preprocess_dwt(input_tensor)
                x = self.model.conv1(x)
                x = self.model.bn1(x)
                x = self.model.relu(x)
                x = self.model.maxpool(x)
                x = self.model.layer1(x)
                feature_maps = self.model.layer2(x)
                
                # 计算特征重要性
                importance = torch.mean(feature_maps, dim=1, keepdim=True)
                heatmap = F.interpolate(importance, size=(256, 256), mode='bilinear', align_corners=False)
                heatmap = heatmap.squeeze().cpu().numpy()
                
                # 归一化到0-255
                heatmap = (heatmap - heatmap.min()) / (heatmap.max() - heatmap.min() + 1e-8)
                heatmap = (heatmap * 255).astype(np.uint8)
                
                # 应用颜色映射
                import cv2
                heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
                
                # 保存热力图
                cv2.imwrite(output_path, heatmap_colored)
                
                return True, heatmap
                
        except Exception as e:
            logger.error(f"热力图生成失败: {e}")
            return False, None
    