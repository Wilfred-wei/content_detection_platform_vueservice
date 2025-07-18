import torch
import torch.nn.functional as F
import numpy as np
import cv2
from PIL import Image
import os
import logging
from torchvision import transforms

logger = logging.getLogger(__name__)

class HeatmapGenerator:
    """热力图生成器"""
    
    def __init__(self, model):
        self.model = model
        self.hook_features = []
        self._register_hooks()
    
    def _register_hooks(self):
        """注册钩子函数来提取特征图"""
        def hook_fn(module, input, output):
            logger.info(f"Hook触发，特征图形状: {output.shape}")
            self.hook_features.append(output)
        
        # 检查模型结构并注册钩子
        try:
            if hasattr(self.model, 'model') and hasattr(self.model.model, 'layer2'):
                self.model.model.layer2.register_forward_hook(hook_fn)
                logger.info("成功注册钩子到 model.layer2")
            elif hasattr(self.model, 'layer2'):
                self.model.layer2.register_forward_hook(hook_fn)
                logger.info("成功注册钩子到 layer2")
            else:
                logger.warning("未找到合适的层来注册钩子")
        except Exception as e:
            logger.error(f"注册钩子失败: {e}")
    
    def generate(self, image_path: str, output_path: str) -> bool:
        """生成热力图"""
        logger.info(f"开始生成热力图: {image_path} -> {output_path}")
        
        try:
            # 检查是否有保存的energy patch
            if self.model.last_energy_patch is None or self.model.last_patch_info is None:
                logger.error("没有找到energy patch，无法生成热力图")
                return False
            
            # 使用保存的energy patch
            energy_patch = self.model.last_energy_patch
            patch_info = self.model.last_patch_info
            original_image = Image.open(image_path).convert('RGB')
            
            logger.info(f"使用Energy patch: 位置({patch_info['x']}, {patch_info['y']}), 尺寸({patch_info['width']}x{patch_info['height']})")
            
            # 预处理energy patch - 使用与模型相同的预处理
            transform = transforms.Compose([
                transforms.ToTensor(),      # 转换为张量
            ])
            input_tensor = transform(energy_patch).unsqueeze(0)
            
            if torch.cuda.is_available() and self.model.device == 'cuda':
                input_tensor = input_tensor.cuda()
            
            logger.info(f"输入张量形状: {input_tensor.shape}")
            
            # 清空之前的特征
            self.hook_features.clear()
            
            # 前向传播
            self.model.model.eval()
            with torch.no_grad():
                logger.info("开始前向传播...")
                outputs = self.model.model(input_tensor)
                logger.info(f"模型输出: {outputs.shape}")
                logger.info(f"提取到的特征数量: {len(self.hook_features)}")
            
            # 生成热力图
            if self.hook_features:
                feature_map = self.hook_features[-1]  # 使用最后一层特征
                logger.info(f"使用特征图形状: {feature_map.shape}")
                
                # 生成patch上的热力图
                patch_heatmap = self._generate_heatmap_from_features(feature_map, energy_patch.size)
                
                # 将patch热力图映射回原图
                full_heatmap = self._map_patch_to_full_image(patch_heatmap, patch_info, original_image.size)
                
                # 保存热力图
                success = self._save_heatmap(full_heatmap, original_image, output_path)
                if success:
                    logger.info(f"热力图生成成功: {output_path}")
                return success
            else:
                # 如果没有提取到特征，生成基础热力图
                logger.warning("未提取到特征，使用基础热力图")
                return self._generate_basic_heatmap(original_image, output_path)
                
        except Exception as e:
            logger.error(f"生成热力图失败: {e}")
            import traceback
            logger.error(f"详细错误: {traceback.format_exc()}")
            return False
    
    def _generate_heatmap_from_features(self, feature_map, original_size):
        """从特征图生成热力图"""
        # 取特征图的平均值
        if len(feature_map.shape) == 4:
            heatmap = torch.mean(feature_map, dim=1).squeeze()
        else:
            heatmap = feature_map.squeeze()
        
        # 转换为numpy
        if torch.cuda.is_available():
            heatmap = heatmap.cpu()
        heatmap = heatmap.numpy()
        
        # 归一化到0-255
        heatmap = np.maximum(heatmap, 0)
        heatmap = heatmap / np.max(heatmap) if np.max(heatmap) > 0 else heatmap
        heatmap = np.uint8(255 * heatmap)
        
        # 调整大小到原始图像尺寸
        heatmap = cv2.resize(heatmap, original_size)
        
        return heatmap
    
    def _generate_basic_heatmap(self, original_image, output_path):
        """生成基础热力图（当特征提取失败时）"""
        try:
            # 转换为numpy数组
            img_array = np.array(original_image)
            
            # 转换为灰度图
            if len(img_array.shape) == 3:
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            else:
                gray = img_array
            
            # 使用边缘检测生成基础热力图
            edges = cv2.Canny(gray, 50, 150)
            
            # 应用高斯模糊
            heatmap = cv2.GaussianBlur(edges, (15, 15), 0)
            
            # 保存热力图
            return self._save_heatmap(heatmap, original_image, output_path)
            
        except Exception as e:
            logger.error(f"生成基础热力图失败: {e}")
            return False
    
    def _save_heatmap(self, heatmap, original_image, output_path):
        """保存热力图"""
        try:
            logger.info(f"开始保存热力图到: {output_path}")
            
            # 确保输出目录存在
            output_dir = os.path.dirname(output_path)
            os.makedirs(output_dir, exist_ok=True)
            logger.info(f"输出目录: {output_dir}")
            
            # 应用颜色映射
            logger.info(f"热力图数据类型: {type(heatmap)}, 形状: {heatmap.shape if hasattr(heatmap, 'shape') else 'N/A'}")
            heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
            logger.info(f"颜色映射后形状: {heatmap_colored.shape}")
            
            # 转换原始图像为numpy数组
            original_array = np.array(original_image)
            logger.info(f"原始图像数组形状: {original_array.shape}")
            
            if len(original_array.shape) == 3 and original_array.shape[2] == 3:  # RGB
                original_bgr = cv2.cvtColor(original_array, cv2.COLOR_RGB2BGR)
            else:
                original_bgr = original_array
            
            # 调整热力图大小到原始图像大小
            if heatmap_colored.shape[:2] != original_bgr.shape[:2]:
                logger.info(f"调整热力图大小: {heatmap_colored.shape[:2]} -> {original_bgr.shape[:2]}")
                heatmap_colored = cv2.resize(heatmap_colored, 
                                           (original_bgr.shape[1], original_bgr.shape[0]))
            
            # 叠加热力图和原始图像
            logger.info("叠加热力图和原始图像...")
            overlay = cv2.addWeighted(original_bgr, 0.6, heatmap_colored, 0.4, 0)
            logger.info(f"叠加后图像形状: {overlay.shape}")
            
            # 保存结果
            logger.info(f"开始写入文件: {output_path}")
            result = cv2.imwrite(output_path, overlay)
            logger.info(f"cv2.imwrite返回值: {result}")
            
            # 验证文件是否真的保存成功
            if result and os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                logger.info(f"热力图保存成功: {output_path}, 文件大小: {file_size} bytes")
                return True
            else:
                logger.error(f"热力图保存失败: cv2.imwrite返回{result}, 文件存在:{os.path.exists(output_path)}")
                return False
            
        except Exception as e:
            logger.error(f"保存热力图失败: {e}")
            import traceback
            logger.error(f"详细错误: {traceback.format_exc()}")
            return False 
    
    def _map_patch_to_full_image(self, patch_heatmap, patch_info, original_size):
        """将patch热力图映射到完整图像"""
        logger.info(f"映射patch热力图到完整图像: patch_heatmap.shape={patch_heatmap.shape}, original_size={original_size}")
        
        # 创建全尺寸的热力图，初始为0
        full_heatmap = np.zeros((original_size[1], original_size[0]), dtype=np.uint8)
        
        # 获取patch在原图中的位置
        x, y = patch_info['x'], patch_info['y']
        w, h = patch_info['width'], patch_info['height']
        
        # 确保不超出边界
        x_end = min(x + w, original_size[0])
        y_end = min(y + h, original_size[1])
        patch_w = x_end - x
        patch_h = y_end - y
        
        # 调整patch热力图大小以匹配实际patch区域
        if patch_heatmap.shape != (patch_h, patch_w):
            patch_heatmap_resized = cv2.resize(patch_heatmap, (patch_w, patch_h))
        else:
            patch_heatmap_resized = patch_heatmap
        
        # 将patch热力图放置到完整图像的对应位置
        full_heatmap[y:y_end, x:x_end] = patch_heatmap_resized
        
        logger.info(f"热力图映射完成: 完整热力图形状={full_heatmap.shape}")
        return full_heatmap 